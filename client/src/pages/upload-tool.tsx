import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Logo, CanvasElement, TemplateSize } from "@shared/schema";
import ToolsSidebar from "@/components/tools-sidebar";
import CanvasWorkspace from "@/components/canvas-workspace";
import PropertiesPanel from "@/components/properties-panel";
import TemplateSelectorModal from "@/components/template-selector-modal";
import ProgressSteps from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import { Save, Eye, ArrowLeft, ArrowRight, Download } from "lucide-react";
import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";

export default function UploadTool() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedElement, setSelectedElement] = useState<CanvasElement | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  // Fetch template sizes
  const { data: templateSizes = [] } = useQuery<TemplateSize[]>({
    queryKey: ["/api/template-sizes"],
  });

  // Fetch project if ID provided
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", id],
    enabled: !!id,
  });

  // Fetch logos for current project
  const { data: logos = [] } = useQuery<Logo[]>({
    queryKey: ["/api/projects", currentProject?.id, "logos"],
    enabled: !!currentProject?.id,
  });

  // Fetch canvas elements for current project
  const { data: canvasElements = [] } = useQuery<CanvasElement[]>({
    queryKey: ["/api/projects", currentProject?.id, "canvas-elements"],
    enabled: !!currentProject?.id,
  });

  // Create new project
  const createProjectMutation = useMutation({
    mutationFn: async (projectData: { name: string; templateSize: string; garmentColor: string }) => {
      const response = await apiRequest("POST", "/api/projects", projectData);
      return response.json();
    },
    onSuccess: (newProject) => {
      setCurrentProject(newProject);
      navigate(`/project/${newProject.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project created",
        description: "Your new project has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update project
  const updateProjectMutation = useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      if (!currentProject?.id) throw new Error("No project selected");
      const response = await apiRequest("PATCH", `/api/projects/${currentProject.id}`, updates);
      return response.json();
    },
    onSuccess: (updatedProject) => {
      setCurrentProject(updatedProject);
      // Update the query cache directly instead of invalidating
      queryClient.setQueryData(["/api/projects", currentProject?.id], updatedProject);
    },
  });

  // Generate PDF with vector preservation
  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${currentProject?.id}/generate-pdf`);
      if (!response.ok) throw new Error('Failed to generate PDF');
      const blob = await response.blob();
      return { blob, filename: `${currentProject?.name}.pdf` };
    },
    onSuccess: ({ blob, filename }) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "PDF Generated",
        description: "Production PDF downloaded with preserved vector graphics",
      });
    },
    onError: (error) => {
      toast({
        title: "PDF Generation Failed",
        description: "Unable to generate PDF. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
  }, [project]);

  useEffect(() => {
    if (!id && templateSizes.length > 0 && !currentProject) {
      // Show template selector modal on launch for new projects
      console.log('Showing template selector modal', { id, templateSizesLength: templateSizes.length, currentProject });
      setShowTemplateSelector(true);
    }
  }, [id, templateSizes, currentProject]);

  // Handle template selection from modal
  const handleTemplateSelect = (templateId: string) => {
    const selectedTemplate = templateSizes.find(t => t.id === templateId);
    if (selectedTemplate) {
      // Only require garment color for Full Colour Transfer Sizes
      const isFullColourTemplate = selectedTemplate.group === "Full Colour Transfer Sizes";
      createProjectMutation.mutate({
        name: `Project ${new Date().toLocaleDateString()}`,
        templateSize: templateId,
        garmentColor: isFullColourTemplate ? "" : "#FFFFFF"
      });
    }
  };

  useEffect(() => {
    // Determine current step based on project status and data
    if (currentProject) {
      if (logos.length === 0) {
        setCurrentStep(1);
      } else {
        setCurrentStep(2);
      }
    }
  }, [currentProject, logos.length]);

  const handleTemplateChange = (templateId: string) => {
    if (currentProject) {
      const selectedTemplate = templateSizes.find(t => t.id === templateId);
      const isFullColourTemplate = selectedTemplate?.group === "Full Colour Transfer Sizes";
      
      // If switching to a non-Full Colour template, set a default white color
      // If switching to Full Colour template, keep existing color or clear it
      const updates: Partial<Project> = { templateSize: templateId };
      
      if (!isFullColourTemplate && !currentProject.garmentColor) {
        updates.garmentColor = "#FFFFFF";
      } else if (isFullColourTemplate && currentProject.garmentColor === "#FFFFFF") {
        updates.garmentColor = ""; // Clear default color to force selection for Full Colour
      }
      
      updateProjectMutation.mutate(updates);
    }
  };

  const handleGarmentColorChange = (color: string) => {
    if (currentProject) {
      updateProjectMutation.mutate({ garmentColor: color });
    }
  };

  const handleNextStep = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Upload logos handler for canvas toolbar
  const handleFilesUpload = (files: File[]) => {
    if (!currentProject) return;
    
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    fetch(`/api/projects/${currentProject.id}/logos`, {
      method: 'POST',
      body: formData,
    })
      .then(response => {
        if (!response.ok) throw new Error('Upload failed');
        return response.json();
      })
      .then((newLogos) => {
        // Update logos cache directly
        queryClient.setQueryData(
          ["/api/projects", currentProject.id, "logos"],
          (oldLogos: any[] = []) => [...oldLogos, ...newLogos]
        );
        
        // Invalidate canvas elements to fetch new ones
        queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject.id, "canvas-elements"] });
        
        toast({
          title: "Success",
          description: "Logos uploaded successfully!",
        });
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to upload logos. Please try again.",
          variant: "destructive",
        });
      });
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Setting up your workspace...</p>
        </div>
        
        {/* Template Selector Modal */}
        <TemplateSelectorModal
          open={showTemplateSelector}
          templates={templateSizes}
          onSelectTemplate={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
        />
      </div>
    );
  }

  const currentTemplate = templateSizes.find(t => t.id === currentProject.templateSize);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img 
              src={completeTransfersLogoPath} 
              alt="CompleteTransfers" 
              className="h-8 w-auto object-contain"
            />
            <div className="text-muted-foreground">|</div>
            <div className="text-lg font-medium text-foreground">Web-to-Print Upload Tool</div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span>Step {currentStep} of 5:</span>
              <span className="font-medium text-foreground">
                {currentStep === 1 && "Upload Logos"}
                {currentStep === 2 && "Design Layout"}
                {currentStep === 3 && "Pre-flight Check"}
                {currentStep === 4 && "Generate PDF"}
                {currentStep === 5 && "Attach to Order"}
              </span>
            </div>
            <Button>
              <Save className="w-4 h-4 mr-2" />
              Save Progress
            </Button>
          </div>
        </div>
      </header>

      {/* Workflow Progress Bar */}
      <div className="bg-card border-b border-border px-6 py-3">
        <ProgressSteps currentStep={currentStep} layout="horizontal" />
      </div>

      {/* Main Workspace */}
      <div className="flex h-[calc(100vh-140px)]">
        {/* Left Sidebar */}
        <ToolsSidebar
          currentStep={currentStep}
          project={currentProject}
          logos={logos}
          templateSizes={templateSizes}
          onTemplateChange={handleTemplateChange}
          onGarmentColorChange={handleGarmentColorChange}
        />

        {/* Main Canvas Area */}
        <CanvasWorkspace
          project={currentProject}
          template={currentTemplate}
          logos={logos}
          canvasElements={canvasElements}
          selectedElement={selectedElement}
          onElementSelect={setSelectedElement}
          onLogoUpload={handleFilesUpload}
        />

        {/* Right Properties Panel */}
        <PropertiesPanel
          selectedElement={selectedElement}
          canvasElements={canvasElements}
          logos={logos}
        />
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-background border-t border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={handlePrevStep} disabled={currentStep === 1}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {currentStep === 2 ? "Back to Upload" : "Back"}
            </Button>
            <div className="text-sm text-muted-foreground">
              Auto-saved <span className="font-medium">2 minutes ago</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            {currentStep >= 3 && (
              <Button 
                variant="outline"
                onClick={() => generatePDFMutation.mutate()}
                disabled={generatePDFMutation.isPending}
              >
                <Download className="w-4 h-4 mr-2" />
                {generatePDFMutation.isPending ? "Generating..." : "Download Vector PDF"}
              </Button>
            )}
            <Button onClick={handleNextStep} disabled={currentStep === 5}>
              {currentStep === 2 ? "Continue to Pre-flight Check" : "Continue"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* Template Selector Modal */}
      <TemplateSelectorModal
        open={showTemplateSelector}
        templates={templateSizes}
        onSelectTemplate={handleTemplateSelect}
        onClose={() => setShowTemplateSelector(false)}
      />
    </div>
  );
}
