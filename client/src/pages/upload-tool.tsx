import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Logo, CanvasElement, TemplateSize } from "@shared/schema";
import ToolsSidebar from "@/components/tools-sidebar";
import CanvasWorkspace from "@/components/canvas-workspace";
import PropertiesPanel from "@/components/properties-panel";
import ProgressSteps from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import { Save, Eye, ArrowLeft, ArrowRight } from "lucide-react";

export default function UploadTool() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedElement, setSelectedElement] = useState<CanvasElement | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

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
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id] });
    },
  });

  useEffect(() => {
    if (project) {
      setCurrentProject(project);
      // Determine current step based on project status and data
      if (logos.length === 0) {
        setCurrentStep(1);
      } else if (canvasElements.length === 0) {
        setCurrentStep(2);
      } else {
        setCurrentStep(2);
      }
    } else if (!id) {
      // Create a new project if no ID provided
      const defaultTemplate = templateSizes.find(t => t.name === "A4");
      if (defaultTemplate && !currentProject) {
        createProjectMutation.mutate({
          name: `Project ${new Date().toLocaleDateString()}`,
          templateSize: defaultTemplate.id,
          garmentColor: "#FFFFFF"
        });
      }
    }
  }, [project, id, templateSizes, logos.length, canvasElements.length]);

  const handleTemplateChange = (templateId: string) => {
    if (currentProject) {
      updateProjectMutation.mutate({ templateSize: templateId });
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

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  const currentTemplate = templateSizes.find(t => t.id === currentProject.templateSize);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-2xl font-bold text-primary">CompleteTransfers</div>
            <div className="text-gray-400">|</div>
            <div className="text-lg font-medium text-gray-700">Web-to-Print Upload Tool</div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>Step {currentStep} of 5:</span>
              <span className="font-medium">
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

      {/* Main Workspace */}
      <div className="flex h-[calc(100vh-80px)]">
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
        />

        {/* Right Properties Panel */}
        <PropertiesPanel
          selectedElement={selectedElement}
          canvasElements={canvasElements}
          logos={logos}
        />
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={handlePrevStep} disabled={currentStep === 1}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {currentStep === 2 ? "Back to Upload" : "Back"}
            </Button>
            <div className="text-sm text-gray-600">
              Auto-saved <span className="font-medium">2 minutes ago</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleNextStep} disabled={currentStep === 5}>
              {currentStep === 2 ? "Continue to Pre-flight Check" : "Continue"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
