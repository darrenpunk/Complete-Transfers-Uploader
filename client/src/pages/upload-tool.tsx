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
import ProductLauncherModal from "@/components/product-launcher-modal";
import InkColorModal from "@/components/ink-color-modal";
import ProjectNameModal from "@/components/project-name-modal";
import AppliqueBadgesModal from "@/components/applique-badges-modal";
import ProgressSteps from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import { Save, Eye, ArrowLeft, ArrowRight, Download, RotateCcw } from "lucide-react";
import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";

export default function UploadTool() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedElement, setSelectedElement] = useState<CanvasElement | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showProductLauncher, setShowProductLauncher] = useState(false);
  const [selectedProductGroup, setSelectedProductGroup] = useState<string>("");
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [showAppliqueBadgesModal, setShowAppliqueBadgesModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'pdf' | 'continue' | null>(null);
  const [pendingTemplateData, setPendingTemplateData] = useState<{ templateId: string; garmentColor: string; inkColor?: string } | null>(null);
  const [triggerAppliqueBadgesModal, setTriggerAppliqueBadgesModal] = useState(false);

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
    mutationFn: async (projectData: { name: string; templateSize: string; garmentColor: string; inkColor?: string; appliqueBadgesForm?: any }) => {
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

  // Generate CMYK PDF with vector preservation
  const generatePDFMutation = useMutation({
    mutationFn: async (projectName?: string) => {
      const name = projectName || currentProject?.name;
      if (!name || name.trim() === '' || name === 'Untitled Project') {
        throw new Error('Please provide a project name before generating PDF');
      }
      const url = `/api/projects/${currentProject?.id}/generate-pdf?colorSpace=cmyk`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to generate PDF');
      const blob = await response.blob();
      return { blob, filename: `${name}_cmyk.pdf` };
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
        title: "CMYK PDF Generated",
        description: "Professional CMYK PDF downloaded with preserved vector graphics",
      });
    },
    onError: (error) => {
      toast({
        title: "PDF Generation Failed",
        description: error.message || "Unable to generate PDF. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle project naming confirmation
  const handleProjectNameConfirm = async (projectName: string) => {
    try {
      // Update project name if needed
      if (currentProject && currentProject.name !== projectName) {
        const updatedProject = await updateProjectMutation.mutateAsync({ name: projectName });
        setCurrentProject(updatedProject);
      }

      // Execute the pending action
      if (pendingAction === 'pdf') {
        generatePDFMutation.mutate(projectName);
      } else if (pendingAction === 'continue') {
        setCurrentStep(prev => Math.min(prev + 1, 5));
      }
      
      setPendingAction(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update project name. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Check if project needs naming before action
  const needsProjectName = (currentProject?: Project | null) => {
    return !currentProject?.name || 
           currentProject.name.trim() === '' || 
           currentProject.name === 'Untitled Project';
  };

  // Handle Generate PDF button click
  const handleGeneratePDF = () => {
    if (needsProjectName(currentProject)) {
      setPendingAction('pdf');
      setShowProjectNameModal(true);
    } else {
      generatePDFMutation.mutate(currentProject?.name);
    }
  };

  // Handle Continue button click  
  const handleNextStep = () => {
    if (currentStep >= 3 && needsProjectName(currentProject)) {
      setPendingAction('continue');
      setShowProjectNameModal(true);
    } else {
      setCurrentStep(prev => Math.min(prev + 1, 5));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
  }, [project]);

  useEffect(() => {
    if (!id && templateSizes.length > 0 && !currentProject && !hasInitialized) {
      // Show product launcher modal on launch for new projects (only once)
      console.log('Showing product launcher modal', { templateSizesLength: templateSizes.length, currentProject });
      setShowProductLauncher(true);
      setHasInitialized(true);
    }
  }, [id, templateSizes, currentProject, hasInitialized]);

  // Handle product selection from launcher modal
  const handleProductSelect = (group: string) => {
    setSelectedProductGroup(group);
    setShowProductLauncher(false);
    setShowTemplateSelector(true);
  };

  // Handle template selection from modal
  const handleTemplateSelect = (templateId: string) => {
    const selectedTemplate = templateSizes.find(t => t.id === templateId);
    if (selectedTemplate) {
      console.log('Template selected:', { templateId, selectedTemplate, group: selectedTemplate.group });
      setShowTemplateSelector(false);
      setHasInitialized(true); // Prevent reopening
      
      const isFullColourTemplate = selectedTemplate.group === "Full Colour Transfers";
      const isSingleColourTemplate = selectedTemplate.group === "Single Colour Transfers";
      const isCustomBadgesTemplate = selectedTemplate.group === "Custom Badges" || selectedTemplate.group === "Applique Badges";
      
      console.log('Template checks:', { isFullColourTemplate, isSingleColourTemplate, isCustomBadgesTemplate, actualGroup: selectedTemplate.group });
      
      // If Custom Badges or Applique Badges template, show the applique badges modal first
      if (isCustomBadgesTemplate) {
        console.log('Custom/Applique Badges template detected, triggering form modal');
        setPendingTemplateData({
          templateId,
          garmentColor: "#FFFFFF"
        });
        console.log('Directly showing applique badges modal');
        
        // Use setTimeout to prevent React batching issues
        setTimeout(() => {
          setShowAppliqueBadgesModal(true);
        }, 10);
      } else {
        console.log('Non-Custom Badges template, creating project directly');
        // Create project directly for other template types
        createProjectMutation.mutate({
          name: "Untitled Project",
          templateSize: templateId,
          garmentColor: isFullColourTemplate ? "" : "#FFFFFF",
          inkColor: isSingleColourTemplate ? "" : undefined
        });
      }
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

  // Handle applique badges modal trigger
  useEffect(() => {
    if (triggerAppliqueBadgesModal) {
      console.log('useEffect: Triggering applique badges modal');
      setShowAppliqueBadgesModal(true);
      setTriggerAppliqueBadgesModal(false);
      
      // Force log the state after setting
      setTimeout(() => {
        console.log('Post-useEffect state check:', { showAppliqueBadgesModal });
      }, 50);
    }
  }, [triggerAppliqueBadgesModal]);

  // Debug: Log state changes
  useEffect(() => {
    console.log('showAppliqueBadgesModal state changed to:', showAppliqueBadgesModal);
    if (showAppliqueBadgesModal) {
      console.log('Modal should be visible now!');
      // Check if component is unmounting/remounting
      console.log('Current project:', currentProject?.id);
      console.log('Current step:', currentStep);
      console.log('Has initialized:', hasInitialized);
    }
  }, [showAppliqueBadgesModal]);

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

  const handleInkColorChange = (color: string) => {
    if (currentProject) {
      updateProjectMutation.mutate({ inkColor: color });
    }
  };

  // Handle applique badges form submission
  const handleAppliqueBadgesFormConfirm = (formData: any) => {
    if (pendingTemplateData) {
      createProjectMutation.mutate({
        name: "Untitled Project",
        templateSize: pendingTemplateData.templateId,
        garmentColor: pendingTemplateData.garmentColor,
        inkColor: pendingTemplateData.inkColor,
        appliqueBadgesForm: formData
      });
      setPendingTemplateData(null);
    }
    setShowAppliqueBadgesModal(false);
  };

  // Start over handler - creates a new project
  const handleStartOver = () => {
    // Reset state
    setCurrentProject(null);
    setSelectedElement(null);
    setCurrentStep(1);
    setHasInitialized(false);
    setSelectedProductGroup("");
    
    // Navigate to home to start fresh
    navigate("/");
    
    toast({
      title: "Starting over",
      description: "Creating a new order...",
    });
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
        
        {/* Product Launcher Modal */}
        <ProductLauncherModal
          open={showProductLauncher}
          onClose={() => setShowProductLauncher(false)}
          onSelectProduct={handleProductSelect}
        />
        
        {/* Template Selector Modal */}
        <TemplateSelectorModal
          open={showTemplateSelector}
          templates={templateSizes.filter(t => !selectedProductGroup || t.group === selectedProductGroup)}
          onSelectTemplate={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
          selectedGroup={selectedProductGroup}
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
            <Button variant="outline" onClick={handleStartOver}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Start Over
            </Button>
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
          canvasElements={canvasElements}
          selectedElement={selectedElement}
          onTemplateChange={handleTemplateChange}
          onGarmentColorChange={handleGarmentColorChange}
          onInkColorChange={handleInkColorChange}
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
          project={currentProject}
          templateSizes={templateSizes}
          onTemplateChange={handleTemplateChange}
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
                onClick={handleGeneratePDF}
                disabled={generatePDFMutation.isPending}
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Generate PDF
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

      {/* Project Name Modal */}
      <ProjectNameModal
        open={showProjectNameModal}
        onOpenChange={setShowProjectNameModal}
        currentName={currentProject?.name || ""}
        onConfirm={handleProjectNameConfirm}
        isGeneratingPDF={generatePDFMutation.isPending}
        title={pendingAction === 'pdf' ? "Name Your Project for PDF" : "Name Your Project"}
        description={
          pendingAction === 'pdf' 
            ? "Please provide a name for your project. This will be used for the PDF filename."
            : "Please provide a name for your project before continuing."
        }
      />

      {/* Applique Badges Modal */}
      {console.log('About to render AppliqueBadgesModal with state:', { 
        showAppliqueBadgesModal, 
        triggerAppliqueBadgesModal,
        pendingTemplateData,
        windowHash: window.location.hash
      })}
      
      {/* Debug: Force render a simple modal to test the exact issue */}
      {showAppliqueBadgesModal && (
        <div className="fixed inset-0 z-[99999] bg-red-500/90 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg border-8 border-yellow-400">
            <h1 className="text-3xl font-bold text-black mb-4">🚨 APPLIQUE BADGES FORM 🚨</h1>
            <p className="text-black mb-4">This proves the state management is working!</p>
            <p className="text-black mb-4">State: {String(showAppliqueBadgesModal)}</p>
            <button 
              onClick={() => setShowAppliqueBadgesModal(false)}
              className="bg-red-500 text-white px-4 py-2 rounded font-bold"
            >
              CLOSE MODAL
            </button>
          </div>
        </div>
      )}
      
      {/* Temporarily comment out the actual component to test */}
      {/* <AppliqueBadgesModal
        open={showAppliqueBadgesModal}
        onOpenChange={setShowAppliqueBadgesModal}
        onConfirm={handleAppliqueBadgesFormConfirm}
        isLoading={createProjectMutation.isPending}
      /> */}
    </div>
  );
}
