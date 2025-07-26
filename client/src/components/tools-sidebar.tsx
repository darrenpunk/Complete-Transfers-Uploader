import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Project, Logo, TemplateSize } from "@shared/schema";


import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Image, Plus, Palette, ChevronDown, ChevronRight } from "lucide-react";
import CMYKColorModal from "@/components/cmyk-color-modal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { manufacturerColors } from "@shared/garment-colors";
import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";
import gildanLogoPath from "@assets/GILDAN_LOGO_blue_1753539382856.png";
import fruitOfTheLoomLogoPath from "@assets/Fruit_logo.svg_1753539605426.png";
import dtfIconPath from "@assets/DTF_1753540006979.png";

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
  { name: "Charcoal Grey", hex: "#353330", rgb: "53, 51, 48", cmyk: "66, 57, 54, 60", inkType: "Process" },
  { name: "Pastel Blue", hex: "#B9DBEA", rgb: "185, 219, 234", cmyk: "32, 0, 5, 0", inkType: "Process" },
  { name: "Sky Blue", hex: "#5998D4", rgb: "89, 152, 212", cmyk: "70, 15, 0, 0", inkType: "Process" },
  { name: "Navy", hex: "#201C3A", rgb: "32, 28, 58", cmyk: "100, 92, 36, 39", inkType: "Process" },
  { name: "Royal Blue", hex: "#221866", rgb: "34, 24, 102", cmyk: "100, 95, 5, 0", inkType: "Process" },
  { name: "Pastel Green", hex: "#B5D55E", rgb: "181, 213, 94", cmyk: "34, 0, 73, 0", inkType: "Process" },
  { name: "Lime Green", hex: "#90BF33", rgb: "144, 191, 51", cmyk: "50, 0, 99, 0", inkType: "Process" },
  { name: "Kelly Green", hex: "#3C8A35", rgb: "60, 138, 53", cmyk: "85, 10, 100, 0", inkType: "Process" },
  { name: "Pastel Pink", hex: "#E7BBD0", rgb: "231, 187, 208", cmyk: "0, 32, 3, 0", inkType: "Process" },
  { name: "Light Pink", hex: "#D287A2", rgb: "210, 135, 162", cmyk: "2, 53, 11, 0", inkType: "Process" },
  { name: "Fuchsia Pink", hex: "#C42469", rgb: "196, 36, 105", cmyk: "0, 94, 20, 0", inkType: "Process" },
  { name: "Red", hex: "#C02300", rgb: "192, 35, 0", cmyk: "0, 99, 97, 0", inkType: "Process" },
  { name: "Burgundy", hex: "#762009", rgb: "118, 32, 9", cmyk: "26, 100, 88, 27", inkType: "Process" },
  { name: "Purple", hex: "#4C0A6A", rgb: "76, 10, 106", cmyk: "75, 100, 0, 0", inkType: "Process" }
];

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
      const response = await fetch(`/api/logos/${logoId}`, {
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

      {/* Template Size Selection */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Template Size</h3>
        
        {/* Group templates by category with collapsible interface */}
        <div className="space-y-2">
          {Object.entries(
            templateSizes.reduce((groups, template) => {
              const group = template.group || 'Other';
              if (!groups[group]) groups[group] = [];
              groups[group].push(template);
              return groups;
            }, {} as Record<string, typeof templateSizes>)
          ).map(([groupName, templates]) => (
            <Collapsible 
              key={groupName}
              open={expandedGroups.includes(`template-${groupName}`)}
              onOpenChange={() => toggleGroup(`template-${groupName}`)}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left hover:bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                  {groupName === "DTF Transfer Sizes" && (
                    <img 
                      src={dtfIconPath} 
                      alt="DTF Transfer" 
                      className="h-12 w-12 object-contain"
                    />
                  )}
                  <span className="text-sm font-medium text-gray-800">{groupName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {templates.length} {groupName === "DTF Transfer Sizes" ? "sizes" : "templates"}
                  </span>
                  {expandedGroups.includes(`template-${groupName}`) 
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />
                  }
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                {/* Show first 4 templates in 2x2 grid if they're standard sizes */}
                {groupName === "Full Colour / Single Color Transfer Templates" && templates.length >= 4 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {templates.slice(0, 4).map((template) => (
                      <Button
                        key={template.id}
                        variant={project.templateSize === template.id ? "default" : "outline"}
                        className="h-auto p-3 flex flex-col"
                        onClick={() => onTemplateChange(template.id)}
                      >
                        <span className="font-medium">{template.name}</span>
                        <span className="text-xs opacity-70">{template.width}×{template.height}mm</span>
                      </Button>
                    ))}
                  </div>
                )}
                
                {/* Show remaining templates in single column */}
                <div className="grid grid-cols-1 gap-2">
                  {(groupName === "Full Colour / Single Color Transfer Templates" ? templates.slice(4) : templates).map((template) => (
                    <Button
                      key={template.id}
                      variant={project.templateSize === template.id ? "default" : "outline"}
                      className="h-auto p-3 justify-between"
                      onClick={() => onTemplateChange(template.id)}
                    >
                      <span className="font-medium">{template.label}</span>
                      <span className="text-xs opacity-70">({template.width}×{template.height}mm)</span>
                    </Button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>

      {/* Garment Color Selection */}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          Garment Color
          {!project.garmentColor && (
            <span className="text-red-500 text-sm font-normal">*Required</span>
          )}
        </h3>
        {!project.garmentColor && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">
              ⚠️ Please select a garment color to continue
            </p>
            <p className="text-xs text-red-600 mt-1">
              Choose from the professional colors below or create a custom CMYK color
            </p>
          </div>
        )}
        {/* Professional Colors */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          {quickColors.map((color) => (
            <TooltipProvider key={color.hex}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`w-10 h-10 rounded-full border-2 shadow-sm hover:scale-105 transition-transform ${
                      project.garmentColor === color.hex
                        ? "border-primary ring-2 ring-blue-200"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => onGarmentColorChange(color.hex)}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="text-sm">
                    <div className="font-semibold text-gray-900">{color.name}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      <div>HEX: <span className="font-mono">{color.hex}</span></div>
                      <div>RGB: <span className="font-mono">{color.rgb}</span></div>
                      <div>CMYK: <span className="font-mono">{color.cmyk}</span></div>
                      <div>Type: <span className="font-mono">{color.inkType}</span></div>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Manufacturer Colors */}
        <div className="space-y-2 mb-4">
          <h4 className="text-sm font-semibold text-gray-700">Manufacturer Colors</h4>
          {Object.entries(manufacturerColors).map(([manufacturerName, colorGroups]) => (
            <div key={manufacturerName} className="border border-gray-200 rounded-lg">
              <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-center">
                {manufacturerName === "Gildan" && (
                  <img 
                    src={gildanLogoPath} 
                    alt="Gildan" 
                    className="h-6 w-auto object-contain"
                  />
                )}
                {manufacturerName === "Fruit of the Loom" && (
                  <img 
                    src={fruitOfTheLoomLogoPath} 
                    alt="Fruit of the Loom" 
                    className="h-8 w-auto object-contain"
                  />
                )}
              </div>
              <div className="p-2 space-y-1">
                {colorGroups.map((group) => (
                  <Collapsible 
                    key={group.name}
                    open={expandedGroups.includes(`${manufacturerName}-${group.name}`)}
                    onOpenChange={() => toggleGroup(`${manufacturerName}-${group.name}`)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left hover:bg-gray-50 rounded text-sm">
                      <span className="font-medium text-gray-700">{group.name}</span>
                      <span className="text-xs text-gray-500">
                        {group.colors.length} colors
                      </span>
                      {expandedGroups.includes(`${manufacturerName}-${group.name}`) 
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />
                      }
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-2 pb-2">
                      <div className="grid grid-cols-6 gap-1">
                        {group.colors.map((color) => (
                          <TooltipProvider key={color.code}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <CMYKColorModal
                                    initialColor={color.hex}
                                    currentColor={project.garmentColor}
                                    onChange={(newColor) => onGarmentColorChange(newColor)}
                                    label={`${color.name} (${color.code})`}
                                    cmykValues={color.cmyk}
                                    trigger={
                                      <button
                                        className={`w-8 h-8 rounded-full border-2 shadow-sm hover:scale-105 transition-transform ${
                                          project.garmentColor === color.hex
                                            ? "border-primary ring-2 ring-blue-200"
                                            : "border-gray-300 hover:border-gray-400"
                                        }`}
                                        style={{ backgroundColor: color.hex }}
                                      />
                                    }
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="text-sm">
                                  <div className="font-semibold text-gray-900">{color.name}</div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    <div>Code: <span className="font-mono">{color.code}</span></div>
                                    <div>HEX: <span className="font-mono">{color.hex}</span></div>
                                    <div>CMYK: <span className="font-mono">C{color.cmyk.c} M{color.cmyk.m} Y{color.cmyk.y} K{color.cmyk.k}</span></div>
                                    {color.pantone && (
                                      <div>Pantone: <span className="font-mono">{color.pantone}</span></div>
                                    )}
                                    {color.pantoneTextile && (
                                      <div>Textile: <span className="font-mono">{color.pantoneTextile}</span></div>
                                    )}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-sm text-gray-600 mb-2">
          Selected: <span className={`font-medium ${!project.garmentColor ? 'text-red-500' : ''}`}>
            {project.garmentColor || 'None selected'}
          </span>
        </div>
        
        {/* Custom Color CMYK Picker */}
        <CMYKColorModal
          initialColor="#FFFFFF"
          currentColor={project.garmentColor}
          onChange={(newColor) => onGarmentColorChange(newColor)}
          label="Custom Garment Color"
          trigger={
            <button className="text-sm text-primary hover:text-blue-700 flex items-center gap-1">
              <Palette className="w-3 h-3" />
              + Custom Color
            </button>
          }
        />
      </div>
    </div>
  );
}
