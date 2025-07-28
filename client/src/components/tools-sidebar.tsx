import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Project, Logo, TemplateSize, CanvasElement } from "@shared/schema";


import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Image, Plus, Palette, ChevronDown, ChevronRight, Shirt, Layers, Settings, CheckCircle2 } from "lucide-react";
import { RasterWarningModal } from "./raster-warning-modal";
import { VectorizerModal } from "./vectorizer-modal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import GarmentColorModal from "@/components/garment-color-modal";
import InkColorModal from "@/components/ink-color-modal";
import TemplateSelectorModal from "@/components/template-selector-modal";
import { manufacturerColors } from "@shared/garment-colors";
import TShirtSwatch from "@/components/ui/tshirt-swatch";
import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";
import gildanLogoPath from "@assets/GILDAN_LOGO_blue_1753539382856.png";
import fruitOfTheLoomLogoPath from "@assets/Fruit_logo.svg_1753539605426.png";
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";
import uvdtfIconPath from "@assets/UVDTF page2_1753544185426.png";
import wovenBadgeIconPath from "@assets/image (2)_1753544203744.png";

interface ToolsSidebarProps {
  currentStep: number;
  project: Project;
  logos: Logo[];
  templateSizes: TemplateSize[];
  canvasElements: CanvasElement[];
  selectedElement: CanvasElement | null;
  onTemplateChange: (templateId: string) => void;
  onGarmentColorChange: (color: string) => void;
  onInkColorChange: (color: string) => void;
}

// Professional color palette with complete specifications
const quickColors = [
  { name: "White", hex: "#FFFFFF", rgb: "255, 255, 255", cmyk: "0, 0, 0, 0", inkType: "Process" },
  { name: "Black", hex: "#171816", rgb: "23, 24, 22", cmyk: "0, 0, 0, 100", inkType: "Process" },
  { name: "Natural Cotton", hex: "#D9D2AB", rgb: "217, 210, 171", cmyk: "11, 15, 32, 0", inkType: "Spot" },
  { name: "Pastel Yellow", hex: "#F3F590", rgb: "243, 245, 144", cmyk: "4, 2, 50, 0", inkType: "Process" },
  { name: "Yellow", hex: "#F0F42A", rgb: "240, 244, 42", cmyk: "5, 0, 90, 0", inkType: "Process" },
  { name: "Hi Viz", hex: "#D2E31D", rgb: "210, 227, 29", cmyk: "20, 0, 100, 0", inkType: "Spot" },
  { name: "Hi Viz Orange", hex: "#D98F17", rgb: "217, 143, 23", cmyk: "0, 51, 93, 0", inkType: "Spot" },
  { name: "HiViz Green", hex: "#388032", rgb: "56, 128, 50", cmyk: "86, 16, 100, 3", inkType: "Process" },
  { name: "HIViz Pink", hex: "#BF0072", rgb: "191, 0, 114", cmyk: "2, 97, 4, 0", inkType: "Process" },
  { name: "Sports Grey", hex: "#767878", rgb: "118, 120, 120", cmyk: "0, 0, 0, 63", inkType: "Process" },
  { name: "Light Grey Marl", hex: "#919393", rgb: "145, 147, 147", cmyk: "0, 0, 0, 50", inkType: "Process" },
  { name: "Ash Grey", hex: "#A6A9A2", rgb: "166, 169, 162", cmyk: "32, 24, 26, 5", inkType: "Process" },
  { name: "Light Grey", hex: "#BCBFBB", rgb: "188, 191, 187", cmyk: "25, 18, 20, 2", inkType: "Process" },
  { name: "Charcoal", hex: "#505050", rgb: "80, 80, 80", cmyk: "0, 0, 0, 69", inkType: "Process" },
  { name: "Navy", hex: "#0F2942", rgb: "15, 41, 66", cmyk: "100, 78, 18, 11", inkType: "Process" },
  { name: "Oxford Navy", hex: "#1A2F4A", rgb: "26, 47, 74", cmyk: "95, 73, 20, 8", inkType: "Process" },
  { name: "Royal Blue", hex: "#2157A6", rgb: "33, 87, 166", cmyk: "92, 59, 0, 0", inkType: "Process" },
  { name: "French Navy", hex: "#2C4364", rgb: "44, 67, 100", cmyk: "95, 69, 25, 12", inkType: "Process" },
  { name: "Sky Blue", hex: "#7ED3F7", rgb: "126, 211, 247", cmyk: "49, 0, 0, 0", inkType: "Process" },
  { name: "Orange", hex: "#D4580A", rgb: "212, 88, 10", cmyk: "0, 77, 97, 0", inkType: "Process" },
  { name: "Kelly Green", hex: "#3C8A35", rgb: "60, 138, 53", cmyk: "79, 19, 100, 4", inkType: "Process" },
  { name: "Irish Green", hex: "#009639", rgb: "0, 150, 57", cmyk: "85, 0, 100, 0", inkType: "Process" },
  { name: "Forest Green", hex: "#1B5A20", rgb: "27, 90, 32", cmyk: "85, 28, 100, 15", inkType: "Process" },
  { name: "Bottle Green", hex: "#264935", rgb: "38, 73, 53", cmyk: "82, 45, 73, 28", inkType: "Process" },
  { name: "Light Pink", hex: "#D287A2", rgb: "210, 135, 162", cmyk: "2, 53, 11, 0", inkType: "Process" },
  { name: "Fuchsia Pink", hex: "#C42469", rgb: "196, 36, 105", cmyk: "0, 94, 20, 0", inkType: "Process" },
  { name: "Red", hex: "#C02300", rgb: "192, 35, 0", cmyk: "0, 99, 97, 0", inkType: "Process" },
  { name: "Burgundy", hex: "#762009", rgb: "118, 32, 9", cmyk: "26, 100, 88, 27", inkType: "Process" },
  { name: "Purple", hex: "#4C0A6A", rgb: "76, 10, 106", cmyk: "75, 100, 0, 0", inkType: "Process" }
];

// Function to get color name from hex value
function getColorName(hex: string): string {
  // Check quick colors first
  const quickColor = quickColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  if (quickColor) {
    return quickColor.name;
  }

  // Check manufacturer colors
  for (const [manufacturerName, colorGroups] of Object.entries(manufacturerColors)) {
    for (const group of colorGroups) {
      const manufacturerColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
      if (manufacturerColor) {
        return `${manufacturerColor.name} (${manufacturerColor.code})`;
      }
    }
  }

  // If no match found, return hex as fallback
  return hex;
}

export default function ToolsSidebar({
  currentStep,
  project,
  logos,
  templateSizes,
  canvasElements,
  selectedElement,
  onTemplateChange,
  onGarmentColorChange,
  onInkColorChange
}: ToolsSidebarProps) {
  const { toast } = useToast();
  const [logosCollapsed, setLogosCollapsed] = useState(false);
  const [productSelectorCollapsed, setProductSelectorCollapsed] = useState(false);
  const [preflightCollapsed, setPreflightCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [convertingLogo, setConvertingLogo] = useState<string | null>(null);
  const [showTemplateSelectorModal, setShowTemplateSelectorModal] = useState(false);
  const [pendingRasterFile, setPendingRasterFile] = useState<{ file: File; fileName: string } | null>(null);
  const [showRasterWarning, setShowRasterWarning] = useState(false);
  const [showVectorizer, setShowVectorizer] = useState(false);
  
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) 
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    );
  };

  // Helper function to detect raster files
  const isRasterFile = (file: File): boolean => {
    return file.type === 'image/png' || file.type === 'image/jpeg';
  };

  // Handle raster file uploads
  const handleFilesSelected = (files: File[]) => {
    const rasterFiles = files.filter(isRasterFile);
    const vectorFiles = files.filter(file => !isRasterFile(file));
    
    // Process vector files immediately
    if (vectorFiles.length > 0) {
      uploadLogosMutation.mutate(vectorFiles);
    }
    
    // Handle raster files one by one with warning modal
    if (rasterFiles.length > 0) {
      const firstRasterFile = rasterFiles[0];
      setPendingRasterFile({ file: firstRasterFile, fileName: firstRasterFile.name });
      setShowRasterWarning(true);
    }
  };

  // Raster warning modal handlers
  const handlePhotographicApprove = () => {
    if (pendingRasterFile) {
      uploadLogosMutation.mutate([pendingRasterFile.file]);
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleVectorizeWithAI = () => {
    if (pendingRasterFile) {
      setShowRasterWarning(false);
      setShowVectorizer(true);
    }
  };

  const handleVectorizeWithService = () => {
    if (pendingRasterFile) {
      // Create vectorization placeholder - this would add a charge to the order
      // For now, we'll just show a toast message
      toast({
        title: "Vectorization Service Requested",
        description: "A vectorization charge has been added to your order. You can upload your logo after service completion.",
      });
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleVectorDownload = (vectorSvg: string) => {
    if (pendingRasterFile) {
      // Convert SVG string to File object
      const svgBlob = new Blob([vectorSvg], { type: 'image/svg+xml' });
      const svgFile = new File([svgBlob], pendingRasterFile.fileName.replace(/\.(png|jpg|jpeg)$/i, '.svg') || 'vectorized.svg', {
        type: 'image/svg+xml'
      });
      
      uploadLogosMutation.mutate([svgFile]);
      setPendingRasterFile(null);
      setShowVectorizer(false);
    }
  };

  const handleCloseRasterWarning = () => {
    setPendingRasterFile(null);
    setShowRasterWarning(false);
  };

  const handleCloseVectorizer = () => {
    setPendingRasterFile(null);
    setShowVectorizer(false);
  };

  // RGB to CMYK conversion handler
  const handleRGBtoCMYKConversion = async (logoId: string) => {
    setConvertingLogo(logoId);
    try {
      const response = await fetch(`/api/logos/${logoId}/convert-to-cmyk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Conversion failed");
      }
      
      // Refresh logos and canvas elements to get updated data
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "logos"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "canvas-elements"] });
      
      // Force refetch to ensure fresh data
      await queryClient.refetchQueries({ queryKey: ["/api/projects", project.id, "logos"] });
      
      toast({
        title: "Success",
        description: "Image converted to CMYK successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to convert image to CMYK",
        variant: "destructive",
      });
    } finally {
      setConvertingLogo(null);
    }
  };

  // Handle font outlining
  const handleFontOutlining = async (logoId: string) => {
    setConvertingLogo(logoId);
    try {
      const response = await apiRequest('POST', `/api/logos/${logoId}/outline-fonts`);
      
      if (response.ok) {
        // Invalidate logos query to refresh the font analysis
        queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "logos"] });
        
        toast({
          title: "Success",
          description: "Fonts outlined successfully! Text is now vector paths.",
        });
      } else {
        throw new Error('Font outlining failed');
      }
    } catch (error) {
      console.error('Font outlining error:', error);
      toast({
        title: "Error",
        description: "Failed to outline fonts. Please try again.",
        variant: "destructive",
      });
    } finally {
      setConvertingLogo(null);
    }
  };

  const uploadLogosMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      
      const response = await fetch(`/api/projects/${project.id}/logos`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (newLogos) => {
      // Update logos cache directly
      queryClient.setQueryData(
        ["/api/projects", project.id, "logos"],
        (oldLogos: any[] = []) => [...oldLogos, ...newLogos]
      );
      
      // Only invalidate canvas elements to fetch new ones
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "canvas-elements"] });
      
      toast({
        title: "Success",
        description: "Logos uploaded successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload logos. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete logo mutation
  const deleteLogoMutation = useMutation({
    mutationFn: async (logoId: string) => {
      const response = await apiRequest('DELETE', `/api/logos/${logoId}`);
      
      if (!response.ok) {
        throw new Error('Delete failed');
      }
      
      return logoId;
    },
    onSuccess: (deletedLogoId) => {
      // Update logos cache
      queryClient.setQueryData(
        ["/api/projects", project.id, "logos"],
        (oldLogos: any[] = []) => oldLogos.filter(logo => logo.id !== deletedLogoId)
      );
      
      // Invalidate canvas elements to remove any elements using this logo
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "canvas-elements"] });
      
      toast({
        title: "Success",
        description: "Logo deleted successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete logo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const currentTemplate = templateSizes.find(t => t.id === project.templateSize);

  return (
    <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
      {/* Uploaded Logos */}
      {logos.length > 0 && (
        <Collapsible open={!logosCollapsed} onOpenChange={(open) => setLogosCollapsed(!open)}>
          <div className="border-b border-gray-200">
            <CollapsibleTrigger asChild>
              <div className="p-6 cursor-pointer flex items-center justify-between hover:bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Uploaded Logos ({logos.length})
                </h3>
                {logosCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-6 pb-6">
          <div className="space-y-3">
            {logos.map((logo, index) => (
              <Card key={logo.id} className={index === 0 ? "border-2 border-primary" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gray-50 border border-gray-200 rounded flex items-center justify-center">
                        <Image className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{logo.originalName}</div>
                        <div className="text-xs text-gray-500">
                          {logo.width && logo.height ? `${logo.width}×${logo.height}` : "Vector"} • {logo.mimeType.split('/')[1].toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {index === 0 ? (
                        <div className="text-xs text-primary bg-blue-50 px-2 py-1 rounded">Active</div>
                      ) : (
                        <button className="text-xs text-gray-500 hover:text-primary">Select</button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteLogoMutation.mutate(logo.id)}
                        className="text-red-600 hover:text-red-700 h-6 w-6 p-0"
                        disabled={deleteLogoMutation.isPending}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="mt-4 space-y-3">
            <Button 
              variant="outline" 
              className="w-full border-dashed"
              disabled={!project.garmentColor}
              onClick={() => {
                if (!project.garmentColor) {
                  toast({
                    title: "Garment Color Required",
                    description: "Please select a garment color before uploading logos.",
                    variant: "destructive",
                  });
                  return;
                }
                document.getElementById('more-logos-input')?.click();
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add More Logos
            </Button>
            <input
              id="more-logos-input"
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.svg,.pdf"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  handleFilesSelected(files);
                  e.target.value = '';
                }
              }}
            />

              </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
      {/* Garment Color Selection - Only for Full Colour Transfer Sizes */}
      {(() => {
        const selectedTemplate = templateSizes.find(template => template.id === project.templateSize);
        const isFullColourTemplate = selectedTemplate?.group === "Full Colour Transfers";
        return isFullColourTemplate ? (
          <Collapsible open={!productSelectorCollapsed} onOpenChange={(open) => setProductSelectorCollapsed(!open)}>
            <div className="border-b border-gray-200">
              <CollapsibleTrigger asChild>
                <div className="p-6 cursor-pointer flex items-center justify-between hover:bg-gray-50">
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-[#922168]">
                    <Shirt className="w-5 h-5" />
                    Main Garment Colour
                    {!project.garmentColor && (
                      <span className="text-red-500 text-sm font-normal">*Required</span>
                    )}
                  </h3>
                  {productSelectorCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-6 pb-6">
                  {!project.garmentColor && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700 font-medium">
                        ⚠️ Please select a garment color to continue
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        Click the button below to open the color selection window
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Current Selection Display */}
                    {project.garmentColor && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <TShirtSwatch
                          color={project.garmentColor}
                          size="md"
                          selected={false}
                        />
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">Selected Color</div>
                          <div className="text-gray-600">{getColorName(project.garmentColor)}</div>
                        </div>
                      </div>
                    )}

                    {/* Garment Color Modal Trigger */}
                    <GarmentColorModal
                      currentColor={project.garmentColor || ""}
                      onColorChange={onGarmentColorChange}
                      autoOpen={!project.garmentColor}
                      trigger={
                        <Button 
                          variant={project.garmentColor ? "outline" : "default"} 
                          className="w-full"
                        >
                          <Palette className="w-4 h-4 mr-2" />
                          {project.garmentColor ? "Change Garment Color" : "Select Garment Color"}
                        </Button>
                      }
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null;
      })()}

      {/* Ink Color Selection - Only for Single Colour Transfers */}
      {(() => {
        const selectedTemplate = templateSizes.find(template => template.id === project.templateSize);
        const isSingleColourTemplate = selectedTemplate?.group === "Single Colour Transfers";
        return isSingleColourTemplate ? (
          <Collapsible open={!productSelectorCollapsed} onOpenChange={(open) => setProductSelectorCollapsed(!open)}>
            <div className="border-b border-gray-200">
              <CollapsibleTrigger asChild>
                <div className="p-6 cursor-pointer flex items-center justify-between hover:bg-gray-50">
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-[#922168]">
                    <Palette className="w-5 h-5" />
                    Ink Colour
                    {!project.inkColor && (
                      <span className="text-red-500 text-sm font-normal">*Required</span>
                    )}
                  </h3>
                  {productSelectorCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-6 pb-6">
                  {!project.inkColor && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700 font-medium">
                        ⚠️ Please select an ink color to continue
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        Your artwork will be recolored to match your ink selection
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Current Selection Display */}
                    {project.inkColor && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <TShirtSwatch
                          color={project.inkColor}
                          size="md"
                          selected={false}
                        />
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">Selected Ink</div>
                          <div className="text-gray-600">{getColorName(project.inkColor)}</div>
                        </div>
                      </div>
                    )}

                    {/* Ink Color Modal Trigger */}
                    <InkColorModal
                      currentColor={project.inkColor || ""}
                      onColorChange={onInkColorChange}
                      autoOpen={!project.inkColor}
                      trigger={
                        <Button 
                          variant={project.inkColor ? "outline" : "default"} 
                          className="w-full"
                        >
                          <Palette className="w-4 h-4 mr-2" />
                          {project.inkColor ? "Change Ink Color" : "Select Ink Color"}
                        </Button>
                      }
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null;
      })()}

      {/* Garment Color Selection - Also for Single Colour Transfer templates */}
      {(() => {
        const selectedTemplate = templateSizes.find(template => template.id === project.templateSize);
        const isSingleColourTemplate = selectedTemplate?.group === "Single Colour Transfers";
        return isSingleColourTemplate ? (
          <Collapsible open={!productSelectorCollapsed} onOpenChange={(open) => setProductSelectorCollapsed(!open)}>
            <div className="border-b border-gray-200">
              <CollapsibleTrigger asChild>
                <div className="p-6 cursor-pointer flex items-center justify-between hover:bg-gray-50">
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-[#922168]">
                    <Shirt className="w-5 h-5" />
                    Garment Colour Preview
                  </h3>
                  {productSelectorCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-6 pb-6">
                  <div className="space-y-3">
                    {/* Current Selection Display */}
                    {project.garmentColor && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <TShirtSwatch
                          color={project.garmentColor}
                          size="md"
                          selected={false}
                        />
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">Preview Color</div>
                          <div className="text-gray-600">{getColorName(project.garmentColor)}</div>
                        </div>
                      </div>
                    )}

                    {!project.garmentColor && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-700 font-medium">
                          ℹ️ Optional garment color preview
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          See how your artwork looks on different garment colors
                        </p>
                      </div>
                    )}

                    {/* Garment Color Modal Trigger */}
                    <GarmentColorModal
                      currentColor={project.garmentColor || ""}
                      onColorChange={onGarmentColorChange}
                      trigger={
                        <Button 
                          variant={project.garmentColor ? "outline" : "secondary"} 
                          className="w-full"
                        >
                          <Palette className="w-4 h-4 mr-2" />
                          {project.garmentColor ? "Change Preview Color" : "Select Preview Color"}
                        </Button>
                      }
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null;
      })()}

      {/* Pre-flight Check */}
      <Collapsible open={!logosCollapsed} onOpenChange={(open) => setLogosCollapsed(!open)}>
        <div className="border-b border-gray-200">
          <CollapsibleTrigger asChild>
            <div className="p-6 cursor-pointer flex items-center justify-between hover:bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Pre-flight Check
              </h3>
              {logosCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-6 pb-6">
        {(() => {
          if (!selectedElement) {
            return (
              <div className="text-center text-gray-500 py-4">
                <div className="w-8 h-8 mx-auto mb-2 text-gray-400">⚠️</div>
                <p className="text-sm">Select a logo to run pre-flight checks</p>
              </div>
            );
          }

          // Get logo for selected element
          const logo = logos.find(l => l.id === selectedElement.logoId);
          const checks = [];
          
          // File Resolution Check - skip for vector files
          if (logo) {
            const isVector = logo.mimeType === 'image/svg+xml' || logo.originalMimeType === 'application/pdf';
            
            if (isVector) {
              checks.push({
                name: "Print Resolution",
                status: "pass",
                value: "Vector (Resolution Independent)"
              });
            } else {
              const scaleX = selectedElement.width / (logo.width || 1);
              const scaleY = selectedElement.height / (logo.height || 1);
              const effectiveResolution = Math.min(logo.width || 0, logo.height || 0) / Math.max(scaleX, scaleY);
              const hasGoodResolution = effectiveResolution >= 150;
              
              checks.push({
                name: "Print Resolution",
                status: hasGoodResolution ? "pass" : "warning",
                value: hasGoodResolution ? `${Math.round(effectiveResolution)} DPI` : "Low DPI"
              });
            }
            
            // File Format Check  
            checks.push({
              name: "File Format",
              status: isVector ? "pass" : "warning",
              value: isVector ? "Vector" : "Raster"
            });
            
            // Color Mode Check - Enhanced for different file types
            const svgColors = logo.svgColors as any;
            const isRasterImage = logo.mimeType?.startsWith('image/') && !logo.mimeType.includes('svg');
            
            let colorStatus = "pass";
            let colorValue = "Unknown";
            
            if (isVector && Array.isArray(svgColors) && svgColors.length > 0) {
              // Vector files with detected SVG colors - show format and count
              // Color detection logic
              
              // Only show CMYK if explicitly converted (has converted flag)
              const hasConvertedColors = svgColors.some(color => color.converted);
              
              if (hasConvertedColors) {
                colorValue = `CMYK Vector`;
                colorStatus = "pass";
              } else {
                // Default to RGB for unconverted files (even if they have auto-generated CMYK values)
                colorValue = `RGB Vector`;
                colorStatus = "warning";
              }
            } else if (isVector) {
              // Vector files without detected colors (might be single color or grayscale)
              colorValue = "Vector (Monochrome)";
            } else if (isRasterImage && svgColors && typeof svgColors === 'object' && svgColors.type === 'raster') {
              // Raster images with extracted color information
              const mode = svgColors.mode || 'RGB';
              const uniqueColors = svgColors.uniqueColors || 0;
              colorValue = `${mode} (${uniqueColors} colors)`;
              colorStatus = mode === 'CMYK' ? "pass" : (mode === 'RGB' ? "warning" : "warning");
            } else if (isRasterImage) {
              // Raster images without detailed color info (fallback)
              colorValue = "Raster Image";
              colorStatus = "pass";
            } else {
              colorValue = "Unknown Format";
              colorStatus = "warning";
            }
            
            checks.push({
              name: "Edit Colours",
              status: colorStatus,
              value: colorValue
            });
          }
          
          // Position Check
          const isWithinBounds = selectedElement.x >= 0 && selectedElement.y >= 0 && 
                                selectedElement.x + selectedElement.width <= 297 && 
                                selectedElement.y + selectedElement.height <= 420;
          checks.push({
            name: "Position",
            status: isWithinBounds ? "pass" : "warning",
            value: isWithinBounds ? "In Bounds" : "Check Position"
          });
          
          // Size Check
          const hasReasonableSize = selectedElement.width >= 5 && selectedElement.height >= 5 &&
                                   selectedElement.width <= 280 && selectedElement.height <= 400;
          checks.push({
            name: "Print Size",
            status: hasReasonableSize ? "pass" : "warning",
            value: `${Math.round(selectedElement.width)}×${Math.round(selectedElement.height)}mm`
          });

          // Font Check
          if (logo) {
            const svgFonts = logo.svgFonts as any;
            if (svgFonts && Array.isArray(svgFonts) && svgFonts.length > 0) {
              const hasOutlinedFonts = (logo as any).fontsOutlined === true;
              const hasAlreadyOutlinedGlyphs = svgFonts.some(font => font.elementType === 'outlined-glyphs');
              const hasGlyphReferences = svgFonts.some(font => font.elementType === 'glyph-references');
              const hasLiveText = svgFonts.some(font => font.elementType === 'text' || font.elementType === 'tspan');
              
              let status = "pass";
              let value = "Fonts Outlined";
              
              if (hasAlreadyOutlinedGlyphs && !hasGlyphReferences && !hasLiveText) {
                // PDF already contains outlined text (glyph paths with no references)
                status = "pass";
                value = "Already Outlined (Vector Paths)";
              } else if (hasOutlinedFonts) {
                // Fonts have been manually outlined by our system
                status = "pass";
                value = "Fonts Outlined";
              } else if (hasGlyphReferences || hasLiveText) {
                // Live text elements that need outlining
                const needsOutliningCount = svgFonts.filter(font => 
                  font.elementType === 'glyph-references' || 
                  font.elementType === 'text' || 
                  font.elementType === 'tspan'
                ).length;
                status = "warning";
                value = `${needsOutliningCount} font(s) need outlining`;
              }
              
              checks.push({
                name: "Typography",
                status,
                value
              });
            }
          }

          const logoSvgColors = logo?.svgColors as any;
          const isRGBImage = logo && logoSvgColors && typeof logoSvgColors === 'object' && 
                             logoSvgColors.type === 'raster' && logoSvgColors.mode === 'RGB';
          
          // Check if vector has RGB colors that need conversion
          const isRGBVector = logo && Array.isArray(logoSvgColors) && !logoSvgColors.some(color => color.converted);

          return (
            <div className="space-y-3">
              {checks.map((check) => (
                <div key={check.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{check.name}</span>
                    <div className="flex items-center">
                      {check.status === "pass" ? (
                        <div className="w-4 h-4 text-green-500 mr-1">✓</div>
                      ) : (
                        <div className="w-4 h-4 text-yellow-500 mr-1">⚠️</div>
                      )}
                      <span className={`text-xs px-2 py-1 rounded ${
                        check.status === "pass" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {check.value}
                      </span>
                    </div>
                  </div>
                  
                  {/* RGB to CMYK Conversion Option */}
                  {check.name === "Edit Colours" && (isRGBImage || isRGBVector) && (
                    <div className="ml-4 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => handleRGBtoCMYKConversion(logo.id)}
                        disabled={convertingLogo === logo.id}
                      >
                        {convertingLogo === logo.id ? "Converting..." : "Convert to CMYK"}
                      </Button>
                    </div>
                  )}
                  
                  {/* Font Outlining Option */}
                  {check.name === "Typography" && check.status === "warning" && (
                    <div className="ml-4 mt-2 space-y-2">
                      <div className="text-xs text-gray-600">
                        Live text elements detected. Outlining fonts ensures compatibility across all printing systems.
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => logo && handleFontOutlining(logo.id)}
                        disabled={convertingLogo === (logo?.id)}
                      >
                        {convertingLogo === (logo?.id) ? "Outlining..." : "Outline Fonts"}
                      </Button>
                    </div>
                  )}
                  
                  {/* Already Outlined Info */}
                  {check.name === "Typography" && check.value === "Already Outlined (Vector Paths)" && (
                    <div className="ml-4 mt-2">
                      <div className="text-xs text-gray-600">
                        ✓ Text has been converted to vector paths in the original file. No outlining needed.
                      </div>
                    </div>
                  )}
                  

                </div>
              ))}
            </div>
          );
        })()}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      {/* Product Selector */}
      <Collapsible open={!productSelectorCollapsed} onOpenChange={(open) => setProductSelectorCollapsed(!open)}>
        <div className="border-b border-gray-200">
          <CollapsibleTrigger asChild>
            <div className="p-6 cursor-pointer flex items-center justify-between hover:bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Product Selector
              </h3>
              {productSelectorCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-6 pb-6">
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Current Template</div>
                      <div className="text-xs text-gray-600">
                        {(() => {
                          const currentTemplate = templateSizes.find(t => t.id === project.templateSize);
                          return currentTemplate ? currentTemplate.label : 'No template selected';
                        })()}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTemplateSelectorModal(true)}
                    >
                      Change
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Select the appropriate template size for your transfer type and project requirements.
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      {/* Template Selector Modal */}
      <TemplateSelectorModal
        open={showTemplateSelectorModal}
        templates={templateSizes}
        onSelectTemplate={onTemplateChange}
        onClose={() => setShowTemplateSelectorModal(false)}
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
      {pendingRasterFile && (
        <VectorizerModal
          open={showVectorizer}
          onClose={handleCloseVectorizer}
          fileName={pendingRasterFile.fileName}
          imageFile={pendingRasterFile.file}
          onVectorDownload={handleVectorDownload}
        />
      )}
    </div>
  );
}