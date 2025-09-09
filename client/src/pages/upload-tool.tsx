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
import PDFPreviewModal from "@/components/pdf-preview-modal";
import ProgressSteps from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import { Save, Eye, ArrowLeft, ArrowRight, Download, RotateCcw, HelpCircle, Palette, GraduationCap, FileText } from "lucide-react";
import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";
import { HelpModal } from "@/components/help-modal";
import { VectorizationServiceForm } from "@/components/vectorization-service-form";
import { OnboardingTutorial } from "@/components/onboarding-tutorial";
import { ArtworkRequirementsModal } from "@/components/artwork-requirements-modal";
import { RasterWarningModal } from "@/components/raster-warning-modal";
import { VectorizerModal } from "@/components/vectorizer-modal";

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
  const [selectedTemplateTypes, setSelectedTemplateTypes] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [showPDFPreviewModal, setShowPDFPreviewModal] = useState(false);
  const [showAppliqueBadgesModal, setShowAppliqueBadgesModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'pdf' | 'continue' | null>(null);
  const [pendingTemplateData, setPendingTemplateData] = useState<{ templateId: string; garmentColor: string; inkColor?: string } | null>(null);
  const [triggerAppliqueBadgesModal, setTriggerAppliqueBadgesModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showVectorizationForm, setShowVectorizationForm] = useState(false);
  const [showOnboardingTutorial, setShowOnboardingTutorial] = useState(false);
  const [showArtworkRequirementsModal, setShowArtworkRequirementsModal] = useState(false);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [showRasterWarning, setShowRasterWarning] = useState(false);
  const [pendingRasterFile, setPendingRasterFile] = useState<{ file: File; fileName: string; logoId?: string; url?: string } | null>(null);
  const [showVectorizer, setShowVectorizer] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
    mutationFn: async (projectData?: string | { name: string; quantity: number }) => {
      let name: string;
      let quantity: number = 1;
      
      if (typeof projectData === 'string') {
        name = projectData;
      } else if (projectData && typeof projectData === 'object') {
        name = projectData.name;
        quantity = projectData.quantity;
      } else {
        name = currentProject?.name || '';
      }
      
      if (!name || name.trim() === '' || name === 'Untitled Project') {
        throw new Error('Please provide a project name before generating PDF');
      }
      
      const url = `/api/projects/${currentProject?.id}/generate-pdf?colorSpace=cmyk`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to generate PDF');
      const blob = await response.blob();
      
      // Create filename with quantity
      const filename = `${name}_qty${quantity}_cmyk.pdf`;
      return { blob, filename };
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
  const handleProjectNameConfirm = async (projectData: { name: string; comments: string }) => {
    try {
      // Update project name if needed
      if (currentProject && currentProject.name !== projectData.name) {
        const updatedProject = await updateProjectMutation.mutateAsync({ name: projectData.name });
        setCurrentProject(updatedProject);
      }

      // Store the project data (comments) for future use with Odoo integration
      // For now, we'll log this data but it can be stored in project metadata later
      console.log('Project data for Odoo integration:', {
        name: projectData.name,
        comments: projectData.comments,
        quantity: 1 // Default quantity since it's now managed in template selection
      });

      // Execute the pending action
      if (pendingAction === 'pdf') {
        generatePDFMutation.mutate({ name: projectData.name, quantity: 1 });
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

  // Handle PDF preview approval
  const handlePDFPreviewApproval = () => {
    console.log('PDF preview approved, always showing project name modal for final confirmation');
    // Always show project naming modal for PDF generation to allow quantity selection and final confirmation
    setPendingAction('pdf');
    setShowProjectNameModal(true);
    setShowPDFPreviewModal(false); // Close the preview modal
  };

  // Handle Generate PDF button click
  const handleGeneratePDF = () => {
    console.log('Generate PDF clicked');
    // Always show PDF preview first
    setPendingAction('pdf');
    setShowPDFPreviewModal(true);
    console.log('PDF preview modal should now be shown:', true);
  };

  // Handle Continue button click  
  const handleNextStep = () => {
    if (currentStep >= 3 && needsProjectName(currentProject)) {
      setPendingAction('continue');
      setShowPDFPreviewModal(true);
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
  const handleProductSelect = (productId: string) => {
    // Find the product to get its group
    const productMap: { [key: string]: string } = {
      "full-colour-transfers": "Full Colour Transfers",
      "full-colour-metallic": "Full Colour Metallic", 
      "full-colour-hd": "Full Colour HD",
      "single-colour-transfers": "Single Colour Transfers",
      "dtf-transfers": "DTF - Digital Film Transfers",
      "uv-dtf": "UV DTF",
      "custom-badges": "Custom Badges",
      "applique-badges": "Applique Badges",
      "reflective-transfers": "Reflective Transfers",
      "zero-single-colour": "ZERO Single Colour Transfers",
      "sublimation-transfers": "Sublimation Transfers"
    };
    
    const selectedProductName = productMap[productId] || productId;
    setSelectedProductGroup(selectedProductName);
    setShowProductLauncher(false);
    setShowTemplateSelector(true);
  };

  // Handle template selection from modal
  const handleTemplateSelect = (templateId: string, copies: number = 1) => {
    const selectedTemplate = templateSizes.find(t => t.id === templateId);
    if (selectedTemplate) {
      console.log('Template selected:', { templateId, selectedTemplate, group: selectedTemplate.group });
      setShowTemplateSelector(false);
      setShowProductLauncher(false); // Close product launcher if open
      setHasInitialized(true); // Prevent reopening
      
      const isFullColourTemplate = selectedTemplate.group === "Screen Printed Transfers" && 
        !selectedTemplate.label?.includes("Single Colour") && !selectedTemplate.label?.includes("Zero");
      const isSingleColourTemplate = selectedTemplate.group === "Screen Printed Transfers" && 
        (selectedTemplate.label?.includes("Single Colour") || selectedTemplate.label?.includes("Zero"));
      const isCustomBadgesTemplate = selectedTemplate.group === "Digital Transfers" && 
        (selectedTemplate.label?.includes("Applique") || selectedTemplate.label?.includes("Woven"));
      
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



  // Update canvas element mutation
  const updateElementMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CanvasElement> }) => {
      const response = await apiRequest("PATCH", `/api/canvas-elements/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "canvas-elements"] });
    },
  });



  // Handle element alignment from ToolsSidebar (string-based)
  const handleAlignElement = (elementId: string, alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!currentProject || !canvasElements) return;
    
    const element = canvasElements.find(el => el.id === elementId);
    if (!element) return;
    
    const template = templateSizes.find(t => t.id === currentProject.templateSize);
    if (!template) return;
    
    const safetyMargin = 3; // 3mm safety margin
    const safetyMarginPx = safetyMargin / 0.35; // Convert to pixels
    
    let updates: { x?: number; y?: number } = {};
    
    switch (alignment) {
      case 'left':
        updates.x = safetyMarginPx;
        break;
      case 'center':
        const safeZoneWidth = template.pixelWidth - (2 * safetyMarginPx);
        updates.x = safetyMarginPx + (safeZoneWidth - element.width) / 2;
        break;
      case 'right':
        updates.x = template.pixelWidth - safetyMarginPx - element.width;
        break;
      case 'top':
        updates.y = safetyMarginPx;
        break;
      case 'middle':
        const safeZoneHeight = template.pixelHeight - (2 * safetyMarginPx);
        updates.y = safetyMarginPx + (safeZoneHeight - element.height) / 2;
        break;
      case 'bottom':
        updates.y = template.pixelHeight - safetyMarginPx - element.height;
        break;
    }
    
    updateElementMutation.mutate({
      id: elementId,
      updates
    });
  };

  // Handle element alignment from PropertiesPanel (coordinate-based)
  const handleAlignElementByCoordinates = (elementId: string, alignment: { x?: number; y?: number }) => {
    if (!currentProject) return;
    
    updateElementMutation.mutate({
      id: elementId,
      updates: alignment
    });
  };

  // Handle center all elements
  const handleCenterAllElements = () => {
    if (!currentProject || !canvasElements || canvasElements.length === 0) return;
    
    // Get current template dimensions
    const template = templateSizes?.find(t => t.id === currentProject.templateSize);
    if (!template) return;
    
    // Calculate bounding box of all elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    canvasElements.forEach(element => {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    });
    
    const groupWidth = maxX - minX;
    const groupHeight = maxY - minY;
    
    // Calculate offset to center the group within safe zone
    const safetyMargin = 3; // 3mm safety margin
    const templateWidth = template.width;
    const templateHeight = template.height;
    
    // DTF template-specific positioning
    const isDTFTemplate = template.id === 'dtf-large' || template.name === 'large_dtf';
    
    let targetCenterX, targetCenterY;
    
    if (isDTFTemplate) {
      // DTF: Center horizontally, position closer to top for better visibility
      const safeZoneWidth = templateWidth - (2 * safetyMargin);
      const safeZoneHeight = templateHeight - (2 * safetyMargin);
      
      targetCenterX = safetyMargin + (safeZoneWidth / 2);
      targetCenterY = safetyMargin + (safeZoneHeight / 4); // 25% from top of safe area
      
      console.log('🎯 DTF centering: horizontal center, positioned towards top');
    } else {
      // Standard templates: center both horizontally and vertically
      const safeZoneWidth = templateWidth - (2 * safetyMargin);
      const safeZoneHeight = templateHeight - (2 * safetyMargin);
      
      targetCenterX = safetyMargin + (safeZoneWidth / 2);
      targetCenterY = safetyMargin + (safeZoneHeight / 2);
      
      console.log('🎯 Standard template centering: full center');
    }
    
    const currentCenterX = minX + groupWidth / 2;
    const currentCenterY = minY + groupHeight / 2;
    
    const offsetX = targetCenterX - currentCenterX;
    const offsetY = targetCenterY - currentCenterY;
    
    // Apply offset to all elements
    canvasElements.forEach(element => {
      updateElementMutation.mutate({
        id: element.id,
        updates: {
          x: Math.round(element.x + offsetX),
          y: Math.round(element.y + offsetY)
        }
      });
    });
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

  // Raster warning modal handlers
  const handlePhotographicApprove = async () => {
    if (pendingRasterFile && pendingRasterFile.logoId) {
      // Mark the uploaded PDF as photographic
      try {
        await fetch(`/api/logos/${pendingRasterFile.logoId}/photographic`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPhotographic: true })
        });
        
        // Refresh logos to get updated data
        queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "logos"] });
        
        toast({
          title: "Success",
          description: "PDF marked as photographic content",
        });
      } catch (error) {
        console.error('Failed to mark logo as photographic:', error);
      }
    }
    setPendingRasterFile(null);
    setShowRasterWarning(false);
  };

  const handleVectorizeWithAI = async () => {
    console.log('handleVectorizeWithAI called with pendingRasterFile:', pendingRasterFile);
    
    if (pendingRasterFile) {
      // Check if we already have a valid PNG/JPEG file ready for vectorization
      if (pendingRasterFile.file && pendingRasterFile.file.size > 0 && pendingRasterFile.file.type.startsWith('image/')) {
        console.log('Already have PNG/JPEG file ready, opening vectorizer directly:', {
          fileName: pendingRasterFile.fileName,
          fileSize: pendingRasterFile.file.size,
          fileType: pendingRasterFile.file.type
        });
        setShowRasterWarning(false);  
        setShowVectorizer(true);
        return;
      }
      
      // Only try to extract if we don't have a valid image file yet
      if (pendingRasterFile.logoId) {
        console.log('Need to fetch raster image from PDF, logoId:', pendingRasterFile.logoId);
        try {
          // Add header to indicate this is for vectorization (should preserve quality)
          const response = await fetch(`/api/logos/${pendingRasterFile.logoId}/raster-image?forVectorization=true`, {
            headers: {
              'X-Vectorization-Request': 'true'
            }
          });
          console.log('Raster image fetch response:', response.status, response.ok);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to extract raster image:', errorText);
            throw new Error('Failed to extract raster image');
          }
          const blob = await response.blob();
          console.log('Received blob:', blob.size, blob.type);
          
          // Validate blob
          if (blob.size === 0) {
            throw new Error('Extracted image is empty');
          }
          
          const pngFileName = pendingRasterFile.fileName.replace('.pdf', '.png');
          const file = new File([blob], pngFileName, { type: blob.type || 'image/png' });
          console.log('Created file object:', {
            name: file.name,
            size: file.size,
            type: file.type
          });
          
          // Create a new pending file object with the extracted PNG
          const extractedPendingFile = {
            file: file,
            fileName: pngFileName,
            logoId: pendingRasterFile.logoId,
            url: URL.createObjectURL(file)
          };
          
          // Update state and open vectorizer with the extracted PNG
          setPendingRasterFile(extractedPendingFile);
          setShowRasterWarning(false);
          setShowVectorizer(true);
        } catch (error) {
          console.error('Failed to fetch PDF for vectorization:', error);
          toast({
            title: "Error",
            description: "Failed to prepare file for vectorization",
            variant: "destructive",
          });
        }
      } else {
        // Fallback - just open the vectorizer
        setShowRasterWarning(false);
        setShowVectorizer(true);
      }
    }
  };

  const handleVectorizeWithService = () => {
    if (pendingRasterFile) {
      // Open vectorization form for the PDF
      setShowVectorizationForm(true);
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleCloseRasterWarning = () => {
    setPendingRasterFile(null);
    setShowRasterWarning(false);
  };





  // Upload logos handler for canvas toolbar with progress tracking
  const handleFilesUpload = (files: File[]) => {
    console.log('handleFilesUpload called with files:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
    if (!currentProject) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    // Create XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    });
    
    // Handle completion
    xhr.addEventListener('load', () => {
      setIsUploading(false);
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const newLogos = JSON.parse(xhr.responseText);
          console.log('Upload completed, checking for PDFs with raster content:', newLogos);
          
          // Update logos cache directly
          queryClient.setQueryData(
            ["/api/projects", currentProject.id, "logos"],
            (oldLogos: any[] = []) => [...oldLogos, ...newLogos]
          );
          
          // Invalidate canvas elements to fetch new ones
          queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject.id, "canvas-elements"] });
          
          // Check if any uploaded logo is a PDF with raster only content OR a regular raster image OR extracted PNG from PDF
          const pdfWithRasterOnly = newLogos.find((logo: any) => logo.isPdfWithRasterOnly === true);
          const regularRasterFile = newLogos.find((logo: any) => 
            logo.filetype === 'image/jpeg' || 
            logo.filetype === 'image/jpg' || 
            logo.filetype === 'image/png' ||
            logo.mimeType === 'image/jpeg' ||
            logo.mimeType === 'image/png'
          );
          const extractedPngFromPdf = newLogos.find((logo: any) => 
            logo.originalName?.endsWith('.pdf') && 
            logo.mimeType === 'image/png' && 
            logo.filename?.includes('_raster-gs.png')
          );
          
          if (pdfWithRasterOnly) {
            console.log('PDF with raster content detected, will show raster warning');
            // Store the PDF info and show raster warning
            // The actual PNG extraction will happen when user clicks "Vectorize with AI"
            setPendingRasterFile({ 
              file: new File([], pdfWithRasterOnly.originalName), // Placeholder file
              fileName: pdfWithRasterOnly.originalName,
              logoId: pdfWithRasterOnly.id,
              url: pdfWithRasterOnly.url
            });
            setShowRasterWarning(true);
          } else if (extractedPngFromPdf) {
            console.log('Extracted PNG from PDF detected, will show raster warning:', extractedPngFromPdf.originalName);
            // Download the extracted PNG and show vectorization options
            (async () => {
              try {
                const response = await fetch(extractedPngFromPdf.url);
                if (response.ok) {
                  const blob = await response.blob();
                  const file = new File([blob], extractedPngFromPdf.originalName.replace('.pdf', '.png'), { type: 'image/png' });
                  console.log('Downloaded extracted PNG for vectorization:', file.name, file.size, file.type);
                  
                  // Show raster warning with the extracted PNG file
                  setPendingRasterFile({ 
                    file: file,
                    fileName: extractedPngFromPdf.originalName.replace('.pdf', '.png'),
                    logoId: extractedPngFromPdf.id,
                    url: extractedPngFromPdf.url
                  });
                  setShowRasterWarning(true);
                } else {
                  throw new Error('Failed to download extracted PNG file');
                }
              } catch (error) {
                console.error('Failed to prepare extracted PNG for vectorization:', error);
                toast({
                  title: "Success",
                  description: `${files.length} logo${files.length !== 1 ? 's' : ''} uploaded successfully!`,
                });
              }
            })();
          } else if (regularRasterFile) {
            console.log('Regular raster file detected:', regularRasterFile.originalName, regularRasterFile.filetype);
            // For regular raster files (JPEG/PNG), show vectorization options immediately
            // Download the file first to create a File object
            (async () => {
              try {
                const response = await fetch(regularRasterFile.url);
                if (response.ok) {
                  const blob = await response.blob();
                  const file = new File([blob], regularRasterFile.originalName, { type: regularRasterFile.filetype });
                  console.log('Downloaded raster file for vectorization:', file.name, file.size, file.type);
                  
                  // Show raster warning with the file
                  setPendingRasterFile({ 
                    file: file,
                    fileName: regularRasterFile.originalName,
                    logoId: regularRasterFile.id,
                    url: regularRasterFile.url
                  });
                  setShowRasterWarning(true);
                } else {
                  throw new Error('Failed to download raster file');
                }
              } catch (error) {
                console.error('Failed to prepare raster file for vectorization:', error);
                toast({
                  title: "Success",
                  description: `${files.length} logo${files.length !== 1 ? 's' : ''} uploaded successfully!`,
                });
              }
            })();
          } else {
            toast({
              title: "Success",
              description: `${files.length} logo${files.length !== 1 ? 's' : ''} uploaded successfully!`,
            });
          }
        } catch (error) {
          console.error('Upload response parsing error:', error);
          console.log('Response text:', xhr.responseText);
          toast({
            title: "Error",
            description: "Failed to process upload response.",
            variant: "destructive",
          });
        }
      } else {
        console.error('Upload failed with status:', xhr.status);
        console.log('Response text:', xhr.responseText);
        toast({
          title: "Error", 
          description: `Upload failed (${xhr.status}). Please try again.`,
          variant: "destructive",
        });
      }
    });
    
    // Handle errors
    xhr.addEventListener('error', () => {
      setIsUploading(false);
      console.error('XMLHttpRequest error event triggered');
      toast({
        title: "Error",
        description: "Upload failed. Please check your connection and try again.",
        variant: "destructive",
      });
    });
    
    // Handle timeout
    xhr.addEventListener('timeout', () => {
      setIsUploading(false);
      console.error('XMLHttpRequest timeout');
      toast({
        title: "Timeout",
        description: "Upload timed out. Please try again with smaller files.",
        variant: "destructive",
      });
    });
    
    // Send the request
    xhr.open('POST', `/api/projects/${currentProject.id}/logos`);
    xhr.timeout = 120000; // 2 minute timeout for large files
    xhr.send(formData);
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
          templates={templateSizes.filter(t => {
            if (!selectedProductGroup) return true;
            
            // Define exact template IDs for each product type matching actual storage data
            const productTemplates: { [key: string]: string[] } = {
              "Full Colour Transfers": ["template-A3", "template-A4", "template-A5", "template-A6", "template-transfer-size", "template-square", "template-badge", "template-small"],
              "Full Colour Metallic": ["metallic-A3", "metallic-A4", "metallic-A5", "metallic-A6", "metallic-transfer-size", "metallic-square", "metallic-badge", "metallic-small"],
              "Full Colour HD": ["hd-A3", "hd-A4"],
              "Single Colour Transfers": ["single-A3", "single-A4", "single-A5", "single-A6", "single-transfer-size", "single-square", "single-badge", "single-small"],
              "DTF - Digital Film Transfers": ["dtf-SRA3", "dtf-large"],
              "UV DTF": ["uvdtf-A3"],
              "Custom Badges": ["woven-A6", "woven-square", "woven-badge", "woven-small"],
              "Applique Badges": ["applique-A6", "applique-square", "applique-badge", "applique-small"],
              "Reflective Transfers": ["reflective-A3", "reflective-A4", "reflective-A5", "reflective-A6", "reflective-transfer-size", "reflective-square", "reflective-badge", "reflective-small"],
              "ZERO Single Colour Transfers": ["zero-A3", "zero-A4", "zero-A5", "zero-A6", "zero-transfer-size", "zero-square", "zero-badge", "zero-small"],
              "Sublimation Transfers": ["sublimation-A3", "sublimation-A4", "sublimation-mug"]
            };
            
            const allowedTemplates = productTemplates[selectedProductGroup] || [];
            return allowedTemplates.includes(t.id);
          })}
          onSelectTemplate={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
          onBack={() => {
            setShowTemplateSelector(false);
            setShowProductLauncher(true);
          }}
          selectedGroup={selectedProductGroup}
        />
        
        {/* Applique Badges Modal - Must be here since it appears before project creation */}
        <AppliqueBadgesModal
          open={showAppliqueBadgesModal}
          onOpenChange={setShowAppliqueBadgesModal}
          onConfirm={handleAppliqueBadgesFormConfirm}
          isLoading={createProjectMutation.isPending}
        />
      </div>
    );
  }

  const currentTemplate = templateSizes.find(t => t.id === currentProject.templateSize);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold text-foreground">Artwork Uploader & Gang Sheet Builder</div>
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
            <Button variant="outline" onClick={() => setShowOnboardingTutorial(true)}>
              <GraduationCap className="w-4 h-4 mr-2" />
              Tutorial
            </Button>
            <Button variant="outline" onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Vectorization Service button clicked, current state:', showVectorizationForm);
              setShowVectorizationForm(prev => {
                console.log('Setting showVectorizationForm from', prev, 'to true');
                return true;
              });
            }}>
              <Palette className="w-4 h-4 mr-2" />
              Vectorization Service
            </Button>
            <Button variant="outline" onClick={() => setShowArtworkRequirementsModal(true)}>
              <FileText className="w-4 h-4 mr-2" />
              Artwork Requirements
            </Button>
            <Button variant="outline" onClick={() => setShowHelpModal(true)}>
              <HelpCircle className="w-4 h-4 mr-2" />
              Help
            </Button>
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

      {/* Workflow Progress Bar with Logo */}
      <div className="bg-card border-b border-border px-6 py-3">
        <div className="flex items-center gap-8">
          <img 
            src={completeTransfersLogoPath} 
            alt="CompleteTransfers" 
            className="h-20 w-auto object-contain flex-shrink-0"
          />
          <div className="flex-1">
            <ProgressSteps currentStep={currentStep} layout="horizontal" />
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden" style={{ position: 'relative' }}>
        {/* Left Sidebar */}
        <div className="flex-shrink-0">
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
            onAlignElement={handleAlignElement}
            onCenterAllElements={handleCenterAllElements}
            onOpenVectorizationForm={() => {
              console.log('onOpenVectorizationForm called from ToolsSidebar');
              setShowVectorizationForm(true);
            }}
          />
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 min-w-0">
          <CanvasWorkspace
            project={currentProject}
            template={currentTemplate}
            logos={logos}
            canvasElements={canvasElements}
            selectedElement={selectedElement}
            onElementSelect={setSelectedElement}
            onLogoUpload={handleFilesUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            maintainAspectRatio={maintainAspectRatio}
          />
        </div>

        {/* Right Properties Panel */}
        <div className="flex-shrink-0" style={{ width: '320px' }}>
          <PropertiesPanel
            selectedElement={selectedElement}
            canvasElements={canvasElements}
            logos={logos}
            project={currentProject}
            templateSizes={templateSizes}
            onTemplateChange={handleTemplateChange}
            onAlignElement={handleAlignElementByCoordinates}
            onCenterAllElements={handleCenterAllElements}
            maintainAspectRatio={maintainAspectRatio}
            onMaintainAspectRatioChange={setMaintainAspectRatio}
          />
        </div>
      </div>

      {/* Bottom Action Bar - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4 z-10">
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
            <Button 
              variant="outline"
              onClick={handleGeneratePDF}
              disabled={generatePDFMutation.isPending}
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Generate PDF
            </Button>
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
        templates={templateSizes.filter(t => {
          if (!selectedProductGroup) return true;
          
          // Define exact template IDs for each product type matching actual storage data
          const productTemplates: { [key: string]: string[] } = {
            "Full Colour Transfers": ["template-A3", "template-A4", "template-A5", "template-A6", "template-transfer-size", "template-square", "template-badge", "template-small"],
            "Full Colour Metallic": ["metallic-A3", "metallic-A4", "metallic-A5", "metallic-A6", "metallic-transfer-size", "metallic-square", "metallic-badge", "metallic-small"],
            "Full Colour HD": ["hd-A3", "hd-A4"],
            "Single Colour Transfers": ["single-A3", "single-A4", "single-A5", "single-A6", "single-transfer-size", "single-square", "single-badge", "single-small"],
            "DTF - Digital Film Transfers": ["dtf-SRA3", "dtf-large"],
            "UV DTF": ["uvdtf-A3"],
            "Custom Badges": ["woven-A6", "woven-square", "woven-badge", "woven-small"],
            "Applique Badges": ["applique-A6", "applique-square", "applique-badge", "applique-small"],
            "Reflective Transfers": ["reflective-A3", "reflective-A4", "reflective-A5", "reflective-A6", "reflective-transfer-size", "reflective-square", "reflective-badge", "reflective-small"],
            "ZERO Single Colour Transfers": ["zero-A3", "zero-A4", "zero-A5", "zero-A6", "zero-transfer-size", "zero-square", "zero-badge", "zero-small"],
            "Sublimation Transfers": ["sublimation-A3", "sublimation-A4", "sublimation-mug"]
          };
          
          const allowedTemplates = productTemplates[selectedProductGroup] || [];
          return allowedTemplates.includes(t.id);
        })}
        onSelectTemplate={handleTemplateSelect}
        onClose={() => setShowTemplateSelector(false)}
        onBack={() => {
          setShowTemplateSelector(false);
          setShowProductLauncher(true);
          setHasInitialized(false); // Reset initialization to allow proper flow
        }}
        selectedGroup={selectedProductGroup}
      />

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        open={showPDFPreviewModal}
        onOpenChange={setShowPDFPreviewModal}
        onApprove={handlePDFPreviewApproval}
        project={currentProject}
        logos={logos}
        canvasElements={canvasElements}
        template={currentTemplate}
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
      

      {/* Help Modal */}
      <HelpModal
        open={showHelpModal}
        onOpenChange={setShowHelpModal}
      />

      <ArtworkRequirementsModal
        open={showArtworkRequirementsModal}
        onOpenChange={setShowArtworkRequirementsModal}
      />

      {/* Vectorization Service Form */}
      <VectorizationServiceForm
        open={showVectorizationForm}
        onOpenChange={setShowVectorizationForm}
      />

      {/* Onboarding Tutorial */}
      <OnboardingTutorial
        open={showOnboardingTutorial}
        onOpenChange={setShowOnboardingTutorial}
      />

      {/* Raster Warning Modal */}
      {pendingRasterFile && (
        <RasterWarningModal
          open={showRasterWarning}
          onClose={handleCloseRasterWarning}
          fileName={pendingRasterFile.fileName}
          onPhotographicApprove={handlePhotographicApprove}
          onVectorizeWithAI={handleVectorizeWithAI}
          onVectorizeWithService={handleVectorizeWithService}
        />
      )}

      {/* Vectorizer Modal */}
      {pendingRasterFile && pendingRasterFile.file && (
        <VectorizerModal
          open={showVectorizer}
          onClose={() => {
            setShowVectorizer(false);
            setPendingRasterFile(null);
          }}
          fileName={pendingRasterFile.file.name || pendingRasterFile.fileName}
          imageFile={pendingRasterFile.file}
          onVectorDownload={async (vectorSvg) => {
            console.log('Vector download handler called with SVG for replacement');
            
            if (!currentProject || !pendingRasterFile?.logoId) {
              console.error('Missing project or logoId for vector replacement');
              return;
            }

            try {
              // Create a blob from the SVG string
              const blob = new Blob([vectorSvg], { type: 'image/svg+xml' });
              const vectorFile = new File([blob], pendingRasterFile.fileName.replace(/\.(png|jpg|jpeg|pdf)$/i, '.svg'), { type: 'image/svg+xml' });
              
              // Upload the vectorized file to get a new logo record
              const formData = new FormData();
              formData.append('files', vectorFile);
              
              const response = await fetch(`/api/projects/${currentProject.id}/logos`, {
                method: 'POST',
                body: formData,
              });
              
              if (!response.ok) {
                throw new Error('Failed to upload vectorized file');
              }
              
              const newLogos = await response.json();
              console.log('Vectorized file uploaded successfully:', newLogos);
              
              if (newLogos.length > 0) {
                const newVectorLogo = newLogos[0];
                
                // Find canvas elements that reference the original logo
                const elementsToUpdate = canvasElements?.filter(el => el.logoId === pendingRasterFile.logoId) || [];
                console.log('Found canvas elements to update:', elementsToUpdate.length);
                
                // Update each canvas element to reference the new vectorized logo
                // Use the server-calculated dimensions from the logo upload response
                console.log('🎯 Using server-calculated dimensions for vectorized logo:', {
                  logoId: newVectorLogo.id,
                  displayWidth: newVectorLogo.displayWidth,
                  displayHeight: newVectorLogo.displayHeight
                });
                
                for (const element of elementsToUpdate) {
                  try {
                    // Use the server-calculated dimensions from the vectorized logo
                    // The server has already calculated the correct dimensions from the SVG
                    const logoWidth = newVectorLogo.displayWidth || element.width;
                    const logoHeight = newVectorLogo.displayHeight || element.height;
                    
                    console.log('🔄 Updating canvas element to use server dimensions:', {
                      elementId: element.id,
                      oldDimensions: { width: element.width, height: element.height },
                      newDimensions: { width: logoWidth, height: logoHeight },
                      logoId: newVectorLogo.id
                    });
                      
                    // Update the canvas element with new logo and server-calculated dimensions
                    await fetch(`/api/canvas-elements/${element.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        logoId: newVectorLogo.id,
                        width: logoWidth,
                        height: logoHeight
                      })
                    });
                    
                    console.log('✅ Updated canvas element:', element.id, 'with vectorized logo and server dimensions');
                  } catch (error) {
                    console.error('Failed to update canvas element:', element.id, error);
                  }
                }
                
                // Delete the original logo and its file
                try {
                  await fetch(`/api/logos/${pendingRasterFile.logoId}`, {
                    method: 'DELETE'
                  });
                  console.log('Deleted original logo:', pendingRasterFile.logoId);
                } catch (error) {
                  console.error('Failed to delete original logo:', error);
                }
                
                // Update query cache - remove old logo, add new one
                queryClient.setQueryData(
                  ["/api/projects", currentProject.id, "logos"],
                  (oldLogos: any[] = []) => [
                    ...oldLogos.filter(logo => logo.id !== pendingRasterFile.logoId),
                    newVectorLogo
                  ]
                );
                
                // Refresh canvas elements to reflect the changes
                queryClient.invalidateQueries({ 
                  queryKey: ["/api/projects", currentProject.id, "canvas-elements"] 
                });
                
                toast({
                  title: "Vector Replacement Complete",
                  description: "Original file replaced with vectorized version on canvas",
                });
              }
              
            } catch (error) {
              console.error('Vector replacement failed:', error);
              toast({
                title: "Vector Replacement Failed",
                description: "Failed to replace original with vectorized version",
                variant: "destructive",
              });
            } finally {
              // Close the vectorizer modal
              setShowVectorizer(false);
              setPendingRasterFile(null);
            }
          }}
        />
      )}

    </div>
  );
}
