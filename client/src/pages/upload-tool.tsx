import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Logo, CanvasElement, TemplateSize, GarmentColorItem } from "@shared/schema";
import ToolsSidebar from "@/components/tools-sidebar";
import CanvasWorkspace from "@/components/canvas-workspace";
import PropertiesPanel from "@/components/properties-panel";
import TemplateSelectorModal from "@/components/template-selector-modal";
import ProductLauncherModal from "@/components/product-launcher-modal";
import InkColorModal, { getColorName as getInkColorName } from "@/components/ink-color-modal";
import { getGarmentColorName } from "@/components/garment-color-modal";
import ProjectNameModal from "@/components/project-name-modal";
import AppliqueBadgesModal from "@/components/applique-badges-modal";
import PDFPreviewModal from "@/components/pdf-preview-modal";
import AddToCartModal from "@/components/add-to-cart-modal";
import ProgressSteps from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Save, Download, RotateCcw, HelpCircle, Palette, GraduationCap, FileText, AlertCircle, Upload, ShoppingCart, Maximize2, Minimize2 } from "lucide-react";
import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";
import { HelpModal } from "@/components/help-modal";
import { VectorizationServiceForm } from "@/components/vectorization-service-form";
import { OnboardingTutorial } from "@/components/onboarding-tutorial";
import { ArtworkRequirementsModal } from "@/components/artwork-requirements-modal";
import { RasterWarningModal } from "@/components/raster-warning-modal";
import { ExternalFileLinkModal } from "@/components/external-file-link-modal";
import { DropboxUploadModal } from "@/components/dropbox-upload-modal";
import { UploadGuidanceModal } from "@/components/upload-guidance-modal";

export default function UploadTool() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedElements, setSelectedElements] = useState<CanvasElement[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showProductLauncher, setShowProductLauncher] = useState(false);
  const [selectedProductGroup, setSelectedProductGroup] = useState<string>("");
  const [selectedTemplateTypes, setSelectedTemplateTypes] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [showPDFPreviewModal, setShowPDFPreviewModal] = useState(false);
  const [showAppliqueBadgesModal, setShowAppliqueBadgesModal] = useState(false);
  const [showAddToCartModal, setShowAddToCartModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'pdf' | 'continue' | 'cart' | null>(null);
  const [pendingTemplateData, setPendingTemplateData] = useState<{ templateId: string; garmentColor: string; inkColor?: string; quantity?: number } | null>(null);
  const [triggerAppliqueBadgesModal, setTriggerAppliqueBadgesModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showVectorizationForm, setShowVectorizationForm] = useState(false);
  const [showOnboardingTutorial, setShowOnboardingTutorial] = useState(false);
  const [showArtworkRequirementsModal, setShowArtworkRequirementsModal] = useState(false);
  const [showExternalFileLinkModal, setShowExternalFileLinkModal] = useState(false);
  const [showDropboxUploadModal, setShowDropboxUploadModal] = useState(false);
  const [showUploadGuidanceModal, setShowUploadGuidanceModal] = useState(false);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [showRasterWarning, setShowRasterWarning] = useState(false);
  const [pendingRasterFile, setPendingRasterFile] = useState<{ file: File; fileName: string; logoId?: string; url?: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [complexityError, setComplexityError] = useState<{
    message: string;
    details: string;
    estimatedPaths: number;
    estimatedElements: number;
    originalFileSizeMB?: string;
    convertedFileSizeMB?: string;
    originalFileName?: string;
  } | null>(null);
  const [partnerEmail, setPartnerEmail] = useState<string | null>(null);
  const [showPassThroughModal, setShowPassThroughModal] = useState(false);
  const [pendingPassThroughLogo, setPendingPassThroughLogo] = useState<{ logoId: string; pageCount: number; fileName: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen toggle handler - opens new tab when in iframe, uses Fullscreen API otherwise
  const toggleFullscreen = () => {
    const isInIframe = window.self !== window.top;
    
    if (isInIframe) {
      // In iframe: open app in a new browser tab with partner email and Odoo URL preserved
      const url = new URL(window.location.href);
      
      // Pass partner email if we have it (for cart assignment)
      if (partnerEmail) {
        url.searchParams.set('email', partnerEmail);
      }
      
      // Pass the Odoo origin so the new tab knows which server to use
      if (document.referrer) {
        try {
          const referrerOrigin = new URL(document.referrer).origin;
          url.searchParams.set('odoo', referrerOrigin);
        } catch (e) {
          console.error('Failed to parse referrer:', e);
        }
      }
      
      window.open(url.toString(), '_blank');
      return;
    }
    
    // Standalone: use Fullscreen API
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((err) => {
        console.error('Exit fullscreen error:', err);
      });
    }
  };

  // Listen for fullscreen changes (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Track Odoo URL from URL params (for standalone mode opened from iframe)
  const [odooUrlFromParams, setOdooUrlFromParams] = useState<string | null>(null);

  // Check URL params for email and odoo URL (when opened from fullscreen button in iframe)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const emailFromUrl = urlParams.get('email');
    const odooFromUrl = urlParams.get('odoo');
    
    if (emailFromUrl) {
      console.log('✅ Partner email from URL params:', emailFromUrl);
      setPartnerEmail(emailFromUrl);
    }
    if (odooFromUrl) {
      console.log('✅ Odoo URL from URL params:', odooFromUrl);
      setOdooUrlFromParams(odooFromUrl);
    }
  }, []);

  // Detect if in iframe and get logged-in user's email from parent Odoo window
  useEffect(() => {
    const isInIframe = window !== window.parent;
    if (isInIframe) {
      console.log('🔍 App running in iframe - requesting user data from parent window');
      
      // Listen for user data from parent window
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'odoo-user-data' && event.data.email) {
          console.log('✅ Received user email from Odoo:', event.data.email);
          setPartnerEmail(event.data.email);
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Request user data from parent
      window.parent.postMessage({ type: 'request-user-data' }, '*');
      
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);

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
    mutationFn: async (projectData: { name: string; templateSize: string; garmentColor: string; inkColor?: string; appliqueBadgesForm?: any; quantity?: number }) => {
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
      
      // Open PDF in new window - bypasses iframe download restrictions
      const url = `/api/projects/${currentProject?.id}/generate-pdf?colorSpace=cmyk`;
      const filename = `${name}_qty${quantity}_cmyk.pdf`;
      
      console.log('🔽 Opening PDF in new window:', filename);
      window.open(url, '_blank');
      
      return { filename };
    },
    onSuccess: ({ filename }) => {
      console.log('✅ PDF download initiated:', filename);
      
      toast({
        title: "CMYK PDF Generated",
        description: "PDF opened in new tab. Save it to download.",
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

  // Add to Cart - Uses iframe postMessage (working approach) or API fallback
  const addToCartMutation = useMutation({
    mutationFn: async (action?: 'new-project' | 'view-cart') => {
      if (!currentProject?.id) throw new Error("No project selected");
      
      // Use Replit backend proxy to avoid CORS issues
      // The backend will forward the request to Odoo
      const url = `/api/projects/${currentProject.id}/add-to-cart`;
      
      console.log('🛒 Adding to Odoo cart via backend proxy:', url);
      
      // Generate PDF and convert to base64
      console.log('📄 Generating PDF for Odoo attachment...');
      let pdfBase64: string | undefined;
      try {
        const pdfUrl = `/api/projects/${currentProject.id}/generate-pdf?colorSpace=cmyk`;
        const pdfResponse = await fetch(pdfUrl);
        if (pdfResponse.ok) {
          const pdfBlob = await pdfResponse.blob();
          const reader = new FileReader();
          pdfBase64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1]; // Remove data:application/pdf;base64, prefix
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
          });
          console.log('✅ PDF generated and converted to base64');
        } else {
          console.warn('⚠️ PDF generation failed, continuing without PDF');
        }
      } catch (error) {
        console.error('❌ Failed to generate PDF:', error);
        // Continue without PDF
      }
      
      // Check if running in iframe
      const isInIframe = window.self !== window.top;
      
      // Determine Odoo base URL dynamically:
      // 1. First check URL params (set when opened from fullscreen button in iframe)
      // 2. Then check parent window referrer (when running in iframe)
      // 3. Fall back to environment variable
      let dynamicOdooUrl = import.meta.env.VITE_ODOO_URL || 'https://support-atharva-serigraf-16-stage-0410-23999211.dev.odoo.com';
      
      if (odooUrlFromParams) {
        dynamicOdooUrl = odooUrlFromParams;
        console.log('🌐 Using Odoo URL from URL params:', dynamicOdooUrl);
      } else if (isInIframe && document.referrer) {
        try {
          const referrerUrl = new URL(document.referrer);
          dynamicOdooUrl = referrerUrl.origin;
          console.log('🌐 Using parent window origin for Odoo:', dynamicOdooUrl);
        } catch (e) {
          console.warn('Could not parse referrer URL, using fallback:', e);
        }
      }
      
      // Send full project data to Odoo so it can create/update the project in its database
      const projectData = {
        name: currentProject.name,
        templateSize: currentProject.templateSize,
        garmentColor: currentProject.garmentColor,
        garmentColorName: currentProject.garmentColor, // Use color hex as fallback for name
        garmentColors: currentProject.garmentColors || [],
        inkColor: currentProject.inkColor || '',
        inkColorName: currentProject.inkColor || '', // Use color hex as fallback for name
        quantity: currentProject.quantity,
        totalQuantity: currentProject.quantity, // Use regular quantity as fallback
        comments: currentProject.comments || '', // Send user comments from modal
        partnerEmail: partnerEmail || undefined, // Send partner email if available (for iframe session workaround)
        pdfBase64: pdfBase64, // Send PDF if generated
        odooBaseUrl: dynamicOdooUrl, // Send Odoo URL so backend knows which server to call
      };
      
      console.log('📦 Sending project data to Odoo:', { ...projectData, pdfBase64: pdfBase64 ? `<${pdfBase64.length} chars>` : undefined });
      console.log('🎯 TEMPLATE SIZE FOR ADD-TO-CART:', currentProject.templateSize);
      console.log('🎯 IS SINGLE COLOUR:', currentProject.templateSize?.includes('single') || currentProject.inkColor);
      if (partnerEmail) {
        console.log('✅ Including partner email for cart assignment:', partnerEmail);
      }
      
      console.log(`🔗 Running in ${isInIframe ? 'iframe' : 'standalone'} mode - calling backend proxy`);
      
      // BOTH MODES: Use Replit backend proxy to add to cart
      // The backend proxy forwards the request to Odoo, avoiding CORS issues
      // This approach works reliably in both iframe and standalone modes
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(projectData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cart error: ${errorText}`);
      }
      
      const data = await response.json();
      return { data, action };
    },
    onSuccess: (result) => {
      const { data, action } = result as { data: any; action: 'new-project' | 'view-cart' | undefined };
      console.log('✅ Added to cart successfully:', data);
      
      if (action === 'new-project') {
        // Start new project - clear current project and reload
        toast({
          title: "Added to Cart",
          description: "Starting a new project...",
        });
        
        setTimeout(() => {
          // Clear project state before reloading
          setCurrentProject(null);
          setPendingAction(null);
          setCurrentStep(1);
          window.location.href = '/';
        }, 1000);
      } else if (action === 'view-cart') {
        // Redirect to Odoo cart
        toast({
          title: "Added to Cart",
          description: "Redirecting to your cart...",
        });
        
        setTimeout(() => {
          const isInIframe = window.self !== window.top;
          
          // Use parent origin when in iframe, fallback to env var
          let odooBaseUrl = import.meta.env.VITE_ODOO_URL || 'https://support-atharva-serigraf-16-stage-0410-23999211.dev.odoo.com';
          if (isInIframe && document.referrer) {
            try {
              const referrerUrl = new URL(document.referrer);
              odooBaseUrl = referrerUrl.origin;
              console.log('🔗 Using parent origin for cart URL:', odooBaseUrl);
            } catch (e) {
              console.warn('Could not parse referrer URL, using fallback:', e);
            }
          }
          const cartUrl = `${odooBaseUrl}/shop/cart`;
          
          // Extract cart details for session claiming
          const orderId = data?.website_sale_order;
          const accessToken = data?.access_token;
          
          if (isInIframe) {
            // Send cart details to parent window so it can claim the cart
            // This syncs the browser session with the cart updated via API
            console.log('🔗 Sending claim-cart message to parent:', { orderId, accessToken, cartUrl });
            window.parent.postMessage({
              type: 'claim-cart',
              orderId: orderId,
              accessToken: accessToken,
              cartUrl: cartUrl
            }, '*');
            
            // Fallback: direct navigation after a longer delay
            // This gives the parent time to claim the cart first
            setTimeout(() => {
              console.log('🔗 Fallback: direct parent navigation to:', cartUrl);
              window.parent.location.href = cartUrl;
            }, 1500);
          } else {
            window.location.href = cartUrl;
          }
        }, 1000);
      }
      
      setShowAddToCartModal(false);
    },
    onError: (error) => {
      toast({
        title: "Add to Cart Failed",
        description: error.message || "Unable to add to cart. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle project naming confirmation
  const handleProjectNameConfirm = async (projectData: { 
    name: string; 
    comments: string;
    garmentColors?: GarmentColorItem[];
    totalQuantity?: number;
  }) => {
    try {
      // Prepare updates object
      const updates: any = {};
      
      // Update project name if needed
      if (currentProject && currentProject.name !== projectData.name) {
        updates.name = projectData.name;
      }
      
      // CRITICAL: Always include comments in updates so they're saved before add-to-cart
      // This ensures currentProject.comments has the user's input when addToCartMutation runs
      if (projectData.comments !== undefined) {
        updates.comments = projectData.comments;
      }
      
      // Store garment colors if provided
      if (projectData.garmentColors && projectData.garmentColors.length > 0) {
        updates.garmentColors = projectData.garmentColors;
        
        // Update total quantity if provided
        if (projectData.totalQuantity) {
          updates.quantity = projectData.totalQuantity;
        }
      }
      
      // Apply updates if any (always update if we have comments or name)
      if (Object.keys(updates).length > 0 && currentProject) {
        const updatedProject = await updateProjectMutation.mutateAsync(updates);
        setCurrentProject(updatedProject);
      }

      // Store the project data for Odoo integration
      console.log('Project data for Odoo integration:', {
        name: projectData.name,
        comments: projectData.comments,
        garmentColors: projectData.garmentColors,
        totalQuantity: projectData.totalQuantity || currentProject?.quantity || 1
      });

      // Close the project name modal
      setShowProjectNameModal(false);

      // Execute the pending action
      console.log('🎬 Executing pending action:', pendingAction);
      if (pendingAction === 'pdf') {
        // Generate PDF immediately - pass project data directly
        console.log('📄 Calling generatePDFMutation.mutate() with:', {
          name: projectData.name,
          quantity: projectData.totalQuantity || currentProject?.quantity || 1
        });
        generatePDFMutation.mutate({
          name: projectData.name,
          quantity: projectData.totalQuantity || currentProject?.quantity || 1
        });
      } else if (pendingAction === 'continue') {
        // Show add to cart modal for continue workflow
        setShowAddToCartModal(true);
      } else if (pendingAction === 'cart') {
        // Show add to cart modal after project naming
        setShowAddToCartModal(true);
      }
      
      setPendingAction(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update project data. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle add to cart action from modal
  const handleAddToCartAction = (action: 'new-project' | 'view-cart') => {
    addToCartMutation.mutate(action);
  };

  // Check if project needs naming before action
  const needsProjectName = (currentProject?: Project | null) => {
    return !currentProject?.name || 
           currentProject.name.trim() === '' || 
           currentProject.name === 'Untitled Project';
  };

  // Handle PDF preview approval
  const handlePDFPreviewApproval = () => {
    console.log('PDF preview approved, showing project name modal. Current pendingAction:', pendingAction);
    // Show project naming modal and preserve the pending action (either 'pdf' or 'continue')
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
    if (currentStep === 2) {
      // When on step 2 (Design), show PDF preview modal for pre-flight check
      setPendingAction('continue');
      setShowPDFPreviewModal(true);
    } else if (currentStep >= 3 && needsProjectName(currentProject)) {
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
      
      // Clear upload guidance flag for new project
      sessionStorage.removeItem('hasSeenUploadGuidance');
      
      const isFullColourTemplate = selectedTemplate.group === "Screen Printed Transfers" && 
        !selectedTemplate.label?.includes("Single Colour") && !selectedTemplate.label?.includes("Zero");
      const isSingleColourTemplate = selectedTemplate.group === "Screen Printed Transfers" && 
        (selectedTemplate.label?.includes("Single Colour") || selectedTemplate.label?.includes("Zero"));
      const isCustomBadgesTemplate = selectedTemplate.group === "Digital Transfers" && 
        (selectedTemplate.label?.includes("Applique") || selectedTemplate.label?.includes("Woven"));
      const isDTFTemplate = selectedTemplate.group === "Digital Transfers" && selectedTemplate.label?.includes("DTF");
      
      console.log('Template checks:', { isFullColourTemplate, isSingleColourTemplate, isCustomBadgesTemplate, isDTFTemplate, actualGroup: selectedTemplate.group });
      
      // If Custom Badges or Applique Badges template, show the applique badges modal first
      if (isCustomBadgesTemplate) {
        console.log('Custom/Applique Badges template detected, triggering form modal');
        setPendingTemplateData({
          templateId,
          garmentColor: "#FFFFFF",
          inkColor: undefined,
          quantity: copies
        });
        console.log('Directly showing applique badges modal');
        
        // Use setTimeout to prevent React batching issues
        setTimeout(() => {
          setShowAppliqueBadgesModal(true);
        }, 10);
      } else {
        console.log('Non-Custom Badges template, creating project directly');
        // Create project directly for other template types
        // DTF and Single Colour templates use gray (#929292), Full Colour needs selection, others use white
        const defaultGarmentColor = isFullColourTemplate ? "" : ((isDTFTemplate || isSingleColourTemplate) ? "#929292" : "#FFFFFF");
        createProjectMutation.mutate({
          name: "Untitled Project",
          templateSize: templateId,
          garmentColor: defaultGarmentColor,
          inkColor: isSingleColourTemplate ? "" : undefined,
          quantity: copies
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

  // Track previous garment/ink color to detect when they're first set
  // Use empty string as sentinel to detect "not yet initialized" vs "was empty"
  const [prevGarmentColor, setPrevGarmentColor] = useState<string | null>(null);
  const [prevInkColor, setPrevInkColor] = useState<string | null>(null);
  const [uploadGuidanceTriggered, setUploadGuidanceTriggered] = useState(false);

  // Show upload guidance modal after garment or ink color is selected (FIRST TIME ONLY)
  // This should only trigger once when transitioning from empty to having a color
  useEffect(() => {
    if (currentProject && logos.length === 0 && hasInitialized && !uploadGuidanceTriggered) {
      const currentTemplate = templateSizes.find(t => t.id === currentProject.templateSize);
      const isFullColourTemplate = currentTemplate?.group === "Screen Printed Transfers" && 
        !currentTemplate?.label?.includes("Single Colour") && !currentTemplate?.label?.includes("Zero");
      const isSingleColourTemplate = currentTemplate?.group === "Screen Printed Transfers" && 
        (currentTemplate?.label?.includes("Single Colour") || currentTemplate?.label?.includes("Zero"));
      
      // Initialize prev values if this is first run (prevGarmentColor === null means not initialized)
      if (prevGarmentColor === null) {
        setPrevGarmentColor(currentProject.garmentColor || "");
        setPrevInkColor(currentProject.inkColor || "");
        return; // Wait for next render with initialized values
      }
      
      // Check if garment color was just set (for Full Colour templates)
      // Only trigger if transitioning from empty ("") to having a color
      if (isFullColourTemplate && currentProject.garmentColor && prevGarmentColor === "") {
        setPrevGarmentColor(currentProject.garmentColor);
        setUploadGuidanceTriggered(true);
        const hasSeenGuidance = sessionStorage.getItem('hasSeenUploadGuidance');
        if (!hasSeenGuidance) {
          setShowUploadGuidanceModal(true);
          sessionStorage.setItem('hasSeenUploadGuidance', 'true');
        }
      }
      
      // Check if ink color was just set (for Single Colour templates)
      else if (isSingleColourTemplate && currentProject.inkColor && prevInkColor === "") {
        setPrevInkColor(currentProject.inkColor);
        setUploadGuidanceTriggered(true);
        const hasSeenGuidance = sessionStorage.getItem('hasSeenUploadGuidance');
        if (!hasSeenGuidance) {
          setShowUploadGuidanceModal(true);
          sessionStorage.setItem('hasSeenUploadGuidance', 'true');
        }
      }
      
      // For other templates (DTF, etc.) that don't need color selection, show immediately
      else if (!isFullColourTemplate && !isSingleColourTemplate && currentProject) {
        setUploadGuidanceTriggered(true);
        const hasSeenGuidance = sessionStorage.getItem('hasSeenUploadGuidance');
        if (!hasSeenGuidance) {
          setShowUploadGuidanceModal(true);
          sessionStorage.setItem('hasSeenUploadGuidance', 'true');
        }
      }
      
      // Always update prev values to track changes (but don't re-trigger modal)
      if (prevGarmentColor !== currentProject.garmentColor) {
        setPrevGarmentColor(currentProject.garmentColor || "");
      }
      if (prevInkColor !== currentProject.inkColor) {
        setPrevInkColor(currentProject.inkColor || "");
      }
    }
  }, [currentProject?.garmentColor, currentProject?.inkColor, logos.length, hasInitialized, templateSizes, prevGarmentColor, prevInkColor, uploadGuidanceTriggered]);

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

  const handleInkColorChange = async (color: string) => {
    if (currentProject) {
      // Update project ink color
      updateProjectMutation.mutate({ inkColor: color });
      
      // Update all canvas elements with color overrides for single-color templates
      if (canvasElements && canvasElements.length > 0) {
        for (const element of canvasElements) {
          // Find the logo for this element
          const logo = logos?.find(l => l.id === element.logoId);
          if (logo) {
            // For single-color templates, just set the inkColor override directly
            const colorOverrides = {
              inkColor: color,
              appliedAt: new Date().toISOString()
            };
            
            // Update the element with color overrides
            await apiRequest("PATCH", `/api/canvas-elements/${element.id}`, {
              colorOverrides
            });
          }
        }
        
        // Invalidate queries to trigger re-render
        queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "canvas-elements"] });
      }
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
    
    const safetyMarginMm = 3; // 3mm safety margin (red boundaries)
    
    // Center-based coordinate system - (0,0) is at center of template
    const templateHalfWidth = template.width / 2;
    const templateHalfHeight = template.height / 2;
    const elementHalfWidth = element.width / 2;
    const elementHalfHeight = element.height / 2;
    
    let updates: { x?: number; y?: number } = {};
    
    switch (alignment) {
      case 'left':
        // Align to left red boundary (safety margin from left edge)
        updates.x = -templateHalfWidth + safetyMarginMm + elementHalfWidth;
        break;
      case 'center':
        // Center horizontally (x = 0 in center-based coordinates)
        updates.x = 0;
        break;
      case 'right':
        // Align to right red boundary (safety margin from right edge)
        updates.x = templateHalfWidth - safetyMarginMm - elementHalfWidth;
        break;
      case 'top':
        // Align to top red boundary (safety margin from top edge)
        updates.y = -templateHalfHeight + safetyMarginMm + elementHalfHeight;
        break;
      case 'middle':
        // Center vertically (y = 0 in center-based coordinates)
        updates.y = 0;
        break;
      case 'bottom':
        // Align to bottom red boundary (safety margin from bottom edge)
        updates.y = templateHalfHeight - safetyMarginMm - elementHalfHeight;
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
        appliqueBadgesForm: formData,
        quantity: pendingTemplateData.quantity || 1
      });
      setPendingTemplateData(null);
    }
    setShowAppliqueBadgesModal(false);
  };

  // Start over handler - creates a new project
  const handleStartOver = () => {
    // Reset state
    setCurrentProject(null);
    setSelectedElements([]);
    setCurrentStep(1);
    setHasInitialized(false);
    setSelectedProductGroup("");
    setPrevGarmentColor(null);
    setPrevInkColor(null);
    setUploadGuidanceTriggered(false);
    
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

  const handleVectorizeWithService = () => {
    if (pendingRasterFile) {
      // Open vectorization form for the PDF
      setShowVectorizationForm(true);
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleExternalFileLink = async (data: { fileUrl: string; service: string; fileName: string; notes?: string }) => {
    if (!currentProject) return;

    try {
      const response = await apiRequest('POST', `/api/projects/${currentProject.id}/logos/external-link`, data);
      
      // Invalidate queries to refresh the canvas
      await queryClient.invalidateQueries({ queryKey: ['/api/projects', currentProject.id, 'logos'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/projects', currentProject.id, 'canvas-elements'] });
      
      toast({
        title: "External File Added",
        description: `Placeholder added for ${data.fileName}. File will be downloaded from ${data.service} during production.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add external file link",
        variant: "destructive",
      });
    }
  };

  const handleDropboxUpload = async (data: { fileName: string; description?: string }): Promise<{ uploadUrl: string } | void> => {
    if (!currentProject) return;

    try {
      const response = await apiRequest('POST', `/api/projects/${currentProject.id}/logos/dropbox-upload`, data);
      const result = await response.json();
      
      // Invalidate queries to refresh the canvas
      await queryClient.invalidateQueries({ queryKey: ['/api/projects', currentProject.id, 'logos'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/projects', currentProject.id, 'canvas-elements'] });
      
      toast({
        title: "Dropbox Upload Link Created",
        description: `Placeholder added for ${data.fileName}. Click the upload link to add your file.`,
      });
      
      return { uploadUrl: result.uploadUrl };
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create Dropbox upload link",
        variant: "destructive",
      });
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
            // Check for multi-page PDFs that might have garment color pages
            const multiPagePdf = newLogos.find((logo: any) => logo.hasGarmentPages === true && logo.pageCount > 1);
            if (multiPagePdf && currentProject && !(currentProject as any).useOriginalGarmentPages) {
              console.log('Multi-page PDF detected:', multiPagePdf.originalName, 'with', multiPagePdf.pageCount, 'pages');
              // Show pass-through modal to ask user what to do
              setPendingPassThroughLogo({
                logoId: multiPagePdf.id,
                pageCount: multiPagePdf.pageCount,
                fileName: multiPagePdf.originalName
              });
              setShowPassThroughModal(true);
            } else {
              toast({
                title: "Success",
                description: `${files.length} logo${files.length !== 1 ? 's' : ''} uploaded successfully!`,
              });
            }
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
      } else if (xhr.status === 413) {
        // Handle 413 errors: either file_too_complex OR file size limit from reverse proxy
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          if (errorResponse.error === 'file_too_complex') {
            setComplexityError({
              message: errorResponse.message,
              details: errorResponse.details,
              estimatedPaths: errorResponse.estimatedPaths,
              estimatedElements: errorResponse.estimatedElements,
              originalFileSizeMB: errorResponse.originalFileSizeMB,
              convertedFileSizeMB: errorResponse.convertedFileSizeMB,
              originalFileName: errorResponse.originalFileName
            });
          } else {
            toast({
              title: "Error", 
              description: errorResponse.message || "Upload failed. Please try again.",
              variant: "destructive",
            });
          }
        } catch (e) {
          // If parsing fails, this is likely a reverse proxy 413 (Payload Too Large)
          toast({
            title: "File Too Large", 
            description: "Your file exceeds the upload size limit. For large files, please use the 'Upload via Dropbox' option instead.",
            variant: "destructive",
            duration: 8000, // Show longer for important message
          });
          console.error('413 Payload Too Large - File exceeds server upload limit');
          console.error('Suggest using Dropbox File Request for large files');
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
          onOpenVectorizationForm={() => setShowVectorizationForm(true)}
        />
        
        {/* Template Selector Modal */}
        <TemplateSelectorModal
          open={showTemplateSelector}
          templates={templateSizes.filter(t => {
            if (!selectedProductGroup) return true;
            
            // Define exact template IDs for each product type matching actual storage data
            const productTemplates: { [key: string]: string[] } = {
              "Full Colour Transfers": ["template-A3", "template-A4", "template-A5", "template-A6", "template-transfer-size", "template-square", "template-badge", "template-small", "template-295x300"],
              "Full Colour Metallic": ["metallic-A3", "metallic-A4", "metallic-A5", "metallic-A6", "metallic-transfer-size", "metallic-square", "metallic-badge", "metallic-small", "metallic-295x300"],
              "Full Colour HD": ["hd-A3", "hd-A4", "hd-295x300"],
              "Single Colour Transfers": ["single-A3", "single-A4", "single-A5", "single-A6", "single-transfer-size", "single-square", "single-badge", "single-small", "single-295x300"],
              "DTF - Digital Film Transfers": ["dtf-SRA3", "dtf-large"],
              "UV DTF": ["uvdtf-A3"],
              "Custom Badges": ["woven-A6", "woven-square", "woven-badge", "woven-small"],
              "Applique Badges": ["applique-A6", "applique-square", "applique-badge", "applique-small"],
              "Reflective Transfers": ["reflective-A3", "reflective-A4", "reflective-A5", "reflective-A6", "reflective-transfer-size", "reflective-square", "reflective-badge", "reflective-small"],
              "ZERO Single Colour Transfers": ["zero-A3", "zero-A4", "zero-A5", "zero-A6", "zero-transfer-size", "zero-square", "zero-badge", "zero-small"],
              "Sublimation Transfers": ["sublimation-A2-fabric", "sublimation-A3-fabric", "sublimation-A4-fabric", "sublimation-A3", "sublimation-A4", "sublimation-mug"]
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
          partnerEmail={partnerEmail}
        />
        
        {/* Applique Badges Modal - Must be here since it appears before project creation */}
        <AppliqueBadgesModal
          open={showAppliqueBadgesModal}
          onOpenChange={setShowAppliqueBadgesModal}
          onConfirm={handleAppliqueBadgesFormConfirm}
          isLoading={createProjectMutation.isPending}
        />
        
        {/* Vectorization Service Form - Must be here since it can be accessed before project creation */}
        <VectorizationServiceForm
          open={showVectorizationForm}
          onOpenChange={setShowVectorizationForm}
          partnerEmail={partnerEmail}
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
                {currentStep === 4 && "Add to Cart"}
                {currentStep === 5 && "Attach to Order"}
              </span>
            </div>
            <Button variant="outline" onClick={() => setShowOnboardingTutorial(true)}>
              <GraduationCap className="w-4 h-4 mr-2" />
              Tutorial
            </Button>
            <Button variant="outline" onClick={() => setShowVectorizationForm(true)}>
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
            <Button variant="outline" onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
            selectedElement={selectedElements.length > 0 ? selectedElements[0] : null}
            onTemplateChange={handleTemplateChange}
            onGarmentColorChange={handleGarmentColorChange}
            onInkColorChange={handleInkColorChange}
            onAlignElement={handleAlignElement}
            onCenterAllElements={handleCenterAllElements}
            onOpenVectorizationForm={() => setShowVectorizationForm(true)}
          />
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 min-w-0">
          <CanvasWorkspace
            project={currentProject}
            template={currentTemplate}
            logos={logos}
            canvasElements={canvasElements}
            selectedElements={selectedElements}
            onElementsSelect={setSelectedElements}
            onLogoUpload={handleFilesUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            maintainAspectRatio={maintainAspectRatio}
            onContinue={handleNextStep}
            currentStep={currentStep}
          />
        </div>

        {/* Right Properties Panel */}
        <div className="flex-shrink-0" style={{ width: '320px' }}>
          <PropertiesPanel
            selectedElement={selectedElements.length > 0 ? selectedElements[0] : null}
            selectedElements={selectedElements}
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
            <div className="text-sm text-muted-foreground">
              Auto-saved <span className="font-medium">2 minutes ago</span>
            </div>
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
            "Full Colour Transfers": ["template-A3", "template-A4", "template-A5", "template-A6", "template-transfer-size", "template-square", "template-badge", "template-small", "template-295x300"],
            "Full Colour Metallic": ["metallic-A3", "metallic-A4", "metallic-A5", "metallic-A6", "metallic-transfer-size", "metallic-square", "metallic-badge", "metallic-small", "metallic-295x300"],
            "Full Colour HD": ["hd-A3", "hd-A4", "hd-295x300"],
            "Single Colour Transfers": ["single-A3", "single-A4", "single-A5", "single-A6", "single-transfer-size", "single-square", "single-badge", "single-small", "single-295x300"],
            "DTF - Digital Film Transfers": ["dtf-SRA3", "dtf-large"],
            "UV DTF": ["uvdtf-A3"],
            "Custom Badges": ["woven-A6", "woven-square", "woven-badge", "woven-small"],
            "Applique Badges": ["applique-A6", "applique-square", "applique-badge", "applique-small"],
            "Reflective Transfers": ["reflective-A3", "reflective-A4", "reflective-A5", "reflective-A6", "reflective-transfer-size", "reflective-square", "reflective-badge", "reflective-small"],
            "ZERO Single Colour Transfers": ["zero-A3", "zero-A4", "zero-A5", "zero-A6", "zero-transfer-size", "zero-square", "zero-badge", "zero-small"],
            "Sublimation Transfers": ["sublimation-A2-fabric", "sublimation-A3-fabric", "sublimation-A4-fabric", "sublimation-A3", "sublimation-A4", "sublimation-mug"]
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
        partnerEmail={partnerEmail}
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
        template={currentTemplate}
        title={pendingAction === 'pdf' ? "Name Your Project for PDF" : "Name Your Project"}
        description={
          pendingAction === 'pdf' 
            ? "Please provide a name for your project. This will be used for the PDF filename."
            : "Please provide a name for your project before continuing."
        }
        garmentColor={currentProject?.garmentColor || undefined}
        garmentColorName={currentProject?.garmentColor ? getGarmentColorName(currentProject.garmentColor) : undefined}
        inkColor={currentProject?.inkColor || undefined}
        inkColorName={currentProject?.inkColor ? getInkColorName(currentProject.inkColor) : undefined}
        originalQuantity={currentProject?.quantity || 10}
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
        partnerEmail={partnerEmail}
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
          onVectorizeWithService={handleVectorizeWithService}
        />
      )}

      {/* External File Link Modal */}
      <ExternalFileLinkModal
        open={showExternalFileLinkModal}
        onOpenChange={setShowExternalFileLinkModal}
        onSubmit={handleExternalFileLink}
      />

      {/* Dropbox Upload Modal */}
      <DropboxUploadModal
        open={showDropboxUploadModal}
        onOpenChange={setShowDropboxUploadModal}
        onSubmit={handleDropboxUpload}
      />

      {/* Upload Guidance Modal */}
      <UploadGuidanceModal
        open={showUploadGuidanceModal}
        onOpenChange={setShowUploadGuidanceModal}
        onViewArtworkRequirements={() => setShowArtworkRequirementsModal(true)}
        onStartUploading={() => {
          setShowUploadGuidanceModal(false);
          fileInputRef.current?.click();
        }}
      />

      {/* Add to Cart Modal */}
      <AddToCartModal
        open={showAddToCartModal}
        onOpenChange={setShowAddToCartModal}
        projectName={currentProject?.name || 'Untitled Project'}
        onAddToCart={handleAddToCartAction}
        onDownloadPDF={() => {
          if (currentProject) {
            generatePDFMutation.mutate({
              name: currentProject.name,
              quantity: currentProject.quantity,
            });
          }
        }}
        isAddingToCart={addToCartMutation.isPending}
        isGeneratingPDF={generatePDFMutation.isPending}
      />

      {/* Pass-Through Mode Modal for Multi-Page PDFs */}
      {pendingPassThroughLogo && (
        <Dialog open={showPassThroughModal} onOpenChange={(open) => {
          if (!open) {
            setShowPassThroughModal(false);
            setPendingPassThroughLogo(null);
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Multi-Page PDF Detected
              </DialogTitle>
              <DialogDescription>
                Your uploaded PDF "{pendingPassThroughLogo.fileName}" has {pendingPassThroughLogo.pageCount} pages.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Does this PDF already contain garment color preview pages (pages 2 and beyond)?
              </p>
              
              <div className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => {
                    // Enable pass-through mode
                    updateProjectMutation.mutate({ useOriginalGarmentPages: true } as any, {
                      onSuccess: () => {
                        toast({
                          title: "Pass-Through Mode Enabled",
                          description: "Your original garment color pages will be preserved in the final PDF.",
                        });
                        setShowPassThroughModal(false);
                        setPendingPassThroughLogo(null);
                      }
                    });
                  }}
                  data-testid="button-use-original-pages"
                >
                  <FileText className="h-4 w-4 mr-2 text-blue-500" />
                  Yes, use my original pages
                </Button>
                
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => {
                    // Disable pass-through mode (generate new garment pages)
                    updateProjectMutation.mutate({ useOriginalGarmentPages: false } as any, {
                      onSuccess: () => {
                        toast({
                          title: "Standard Mode",
                          description: "New garment color pages will be generated for you.",
                        });
                        setShowPassThroughModal(false);
                        setPendingPassThroughLogo(null);
                      }
                    });
                  }}
                  data-testid="button-generate-new-pages"
                >
                  <Palette className="h-4 w-4 mr-2 text-green-500" />
                  No, generate new garment pages for me
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Note: Only page 1 of your PDF will be used on the design canvas. Your choice affects the final output PDF only.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Hidden file input for upload guidance modal */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.svg,.png,.jpg,.jpeg"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            handleFilesUpload(files);
          }
          // Reset input so same file can be selected again
          e.target.value = '';
        }}
      />

      {/* File Too Complex Dialog */}
      {complexityError && (
        <Dialog open={!!complexityError} onOpenChange={(open) => !open && setComplexityError(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                Artwork Too Complex
              </DialogTitle>
              <DialogDescription>
                {complexityError.message}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <p className="text-sm text-orange-800 dark:text-orange-200 font-medium mb-2">
                  {complexityError.details}
                </p>
                <div className="text-xs text-orange-700 dark:text-orange-300 space-y-1">
                  {complexityError.originalFileName && complexityError.originalFileSizeMB && (
                    <p>
                      <strong>Original file:</strong> {complexityError.originalFileName} ({complexityError.originalFileSizeMB}MB)
                    </p>
                  )}
                  <p>
                    <strong>Complexity:</strong> {complexityError.estimatedPaths.toLocaleString()} vector paths, {complexityError.estimatedElements.toLocaleString()} total elements
                  </p>
                  {complexityError.convertedFileSizeMB && complexityError.convertedFileSizeMB !== complexityError.originalFileSizeMB && (
                    <p className="text-xs opacity-75">
                      (Converted to {complexityError.convertedFileSizeMB}MB SVG for processing)
                    </p>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">What you can do:</h4>
                <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                  <li>Upload via Dropbox - we'll generate a secure upload link (recommended)</li>
                  <li>Simplify your artwork in your design software (reduce paths, flatten layers)</li>
                  <li>Export as a high-resolution PNG (300 DPI) instead</li>
                </ul>
              </div>
            </div>
            
            <div className="flex gap-2 justify-end mt-4">
              <Button
                variant="outline"
                onClick={() => setComplexityError(null)}
                data-testid="button-dismiss-complexity-error"
              >
                Got It
              </Button>
              <Button
                onClick={() => {
                  setComplexityError(null);
                  setShowDropboxUploadModal(true);
                }}
                data-testid="button-upload-via-dropbox"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload via Dropbox
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
