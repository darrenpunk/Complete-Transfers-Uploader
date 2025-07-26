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

interface ToolsSidebarProps {
  currentStep: number;
  project: Project;
  logos: Logo[];
  templateSizes: TemplateSize[];
  onTemplateChange: (templateId: string) => void;
  onGarmentColorChange: (color: string) => void;
}

const garmentColors = [
  "#FFFFFF", "#000000", "#DC2626", "#2563EB", "#059669", "#D97706",
  "#7C3AED", "#DB2777", "#65A30D", "#0891B2", "#4338CA", "#6B7280"
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
        
        {/* Group templates by category */}
        {Object.entries(
          templateSizes.reduce((groups, template) => {
            const group = template.group || 'Other';
            if (!groups[group]) groups[group] = [];
            groups[group].push(template);
            return groups;
          }, {} as Record<string, typeof templateSizes>)
        ).map(([groupName, templates]) => (
          <div key={groupName} className="mb-6 last:mb-0">
            <h4 className="text-base font-bold text-gray-800 mb-3">{groupName}</h4>
            
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
          </div>
        ))}
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
              Choose from the color swatches below or create a custom CMYK color
            </p>
          </div>
        )}
        {/* Quick Colors */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          {garmentColors.map((color) => (
            <TooltipProvider key={color}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`w-10 h-10 rounded-full border-2 shadow-sm hover:scale-105 transition-transform ${
                      project.garmentColor === color
                        ? "border-primary ring-2 ring-blue-200"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => onGarmentColorChange(color)}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="text-sm">
                    <div className="font-semibold">Quick Color</div>
                    <div className="text-xs font-mono">{color}</div>
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
              <div className="p-3 bg-gray-50 border-b border-gray-200">
                <h5 className="text-sm font-medium text-gray-800">{manufacturerName}</h5>
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
