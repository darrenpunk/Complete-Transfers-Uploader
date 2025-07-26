import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Project, Logo, TemplateSize } from "@shared/schema";


import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Image, Plus, Palette, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import GarmentColorModal from "@/components/garment-color-modal";
import { manufacturerColors } from "@shared/garment-colors";
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
  onTemplateChange: (templateId: string) => void;
  onGarmentColorChange: (color: string) => void;
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
  onTemplateChange,
  onGarmentColorChange
}: ToolsSidebarProps) {
  const { toast } = useToast();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) 
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    );
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
      const response = await apiRequest(`/api/logos/${logoId}`, {
        method: 'DELETE',
      });
      
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
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Uploaded Logos</h3>
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
                    {index === 0 ? (
                      <div className="text-xs text-primary bg-blue-50 px-2 py-1 rounded">Active</div>
                    ) : (
                      <button className="text-xs text-gray-500 hover:text-primary">Select</button>
                    )}
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
                  uploadLogosMutation.mutate(files);
                  e.target.value = '';
                }
              }}
            />
            
            {/* Logo List with Delete Option */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Uploaded Logos</h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {logos.map((logo) => (
                  <div key={logo.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <div className="w-5 h-5 bg-gray-200 rounded flex items-center justify-center flex-shrink-0 text-xs">
                        {logo.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
                      </div>
                      <span className="truncate text-xs" title={logo.originalName}>
                        {logo.originalName}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteLogoMutation.mutate(logo.id)}
                      className="text-red-600 hover:text-red-700 h-6 w-6 p-0 flex-shrink-0"
                      disabled={deleteLogoMutation.isPending}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Selector */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Selector</h3>
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          <span className="mr-2">📐</span>
          Change Template Size
        </Button>
        <p className="text-xs text-gray-500 mt-2">
          Currently using template with different transfer sizes available
        </p>
      </div>

      {/* Pre-flight Check */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pre-flight Check</h3>
        <div className="text-sm text-gray-600">
          Select a logo in the properties panel to run pre-flight checks
        </div>
      </div>
    </div>
  );
}