import { useState, useCallback, useRef, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CanvasElement, Logo, Project, TemplateSize } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Image, Eye, EyeOff, Lock, Unlock, CheckCircle, AlertTriangle, Copy, Grid, ChevronDown, ChevronRight, Settings, Layers, Move, Package } from "lucide-react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical
} from "lucide-react";
import ColorPickerPanel from "./color-picker-panel";
import CMYKColorModal from "./cmyk-color-modal";
import GarmentColorModal from "./garment-color-modal";
import ImpositionModal from "./imposition-modal";
import TemplateSelectorModal from "./template-selector-modal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { manufacturerColors } from "@shared/garment-colors";
import { Palette } from "lucide-react";
import TShirtSwatch from "@/components/ui/tshirt-swatch";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Professional color palette
const quickColors = [
  { name: "White", hex: "#FFFFFF", rgb: "255, 255, 255", cmyk: "0, 0, 0, 0", inkType: "Process" },
  { name: "Black", hex: "#171816", rgb: "23, 24, 22", cmyk: "0, 0, 0, 100", inkType: "Process" },
  { name: "Navy", hex: "#201C3A", rgb: "32, 28, 58", cmyk: "100, 92, 36, 39", inkType: "Process" },
  { name: "Royal Blue", hex: "#221866", rgb: "34, 24, 102", cmyk: "100, 95, 5, 0", inkType: "Process" },
  { name: "Kelly Green", hex: "#3C8A35", rgb: "60, 138, 53", cmyk: "85, 10, 100, 0", inkType: "Process" },
  { name: "Red", hex: "#C02300", rgb: "192, 35, 0", cmyk: "0, 99, 97, 0", inkType: "Process" },
  { name: "Yellow", hex: "#F0F42A", rgb: "240, 244, 42", cmyk: "5, 0, 90, 0", inkType: "Process" },
  { name: "Purple", hex: "#4C0A6A", rgb: "76, 10, 106", cmyk: "75, 100, 0, 0", inkType: "Process" },
  { name: "Hi Viz", hex: "#D2E31D", rgb: "210, 227, 29", cmyk: "20, 0, 100, 0", inkType: "Spot" },
  { name: "Hi Viz Orange", hex: "#D98F17", rgb: "217, 143, 23", cmyk: "0, 51, 93, 0", inkType: "Spot" }
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

  // Convert hex to RGB for color analysis
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      };
    }
    return null;
  };

  // Generate descriptive color name for unmatched colors
  const rgb = hexToRgb(hex);
  if (rgb) {
    const { r, g, b } = rgb;
    
    // Determine the dominant color family
    if (r > g && r > b) {
      if (g > 100 && b < 50) return `Orange`;
      if (g < 100 && b < 100) return `Red`;
      if (g > 150 && b > 150) return `Pink`;
    } else if (g > r && g > b) {
      if (r < 100 && b < 100) return `Green`;
      if (r > 150 && b < 100) return `Yellow`;
    } else if (b > r && b > g) {
      if (r < 100 && g < 100) return `Blue`;
      if (r > 150 && g > 150) return `Purple`;
    } else if (r === g && g === b) {
      if (r < 50) return `Black`;
      if (r > 200) return `White`;
      return `Gray`;
    }
  }

  // If no pattern found, return hex code
  return hex;
}

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  canvasElements: CanvasElement[];
  logos: Logo[];
  project: Project;
  templateSizes: TemplateSize[];
  onTemplateChange: (templateId: string) => void;
  onAlignElement?: (elementId: string, alignment: { x?: number; y?: number }) => void;
  onCenterAllElements?: () => void;
}

export default function PropertiesPanel({
  selectedElement,
  canvasElements,
  logos,
  project,
  templateSizes,
  onTemplateChange,
  onAlignElement,
  onCenterAllElements
}: PropertiesPanelProps) {
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [showCMYKModal, setShowCMYKModal] = useState(false);
  const [showImpositionModal, setShowImpositionModal] = useState(false);
  const [showTemplateSelectorModal, setShowTemplateSelectorModal] = useState(false);
  

  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);
  const [alignmentToolsCollapsed, setAlignmentToolsCollapsed] = useState(false);


  const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(false);
  const [preflightPanelCollapsed, setPreflightPanelCollapsed] = useState(false);
  
  // Get the current element data from canvasElements to ensure it's up-to-date
  const currentElement = selectedElement 
    ? canvasElements.find(el => el.id === selectedElement.id) || selectedElement
    : null;

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      const response = await apiRequest("PATCH", `/api/projects/${project.id}`, updates);
      return response.json();
    },
    onSuccess: (updatedProject) => {
      // Update the project name in the parent component
      queryClient.setQueryData(["/api/projects", project.id], updatedProject);
    },
  });
  
  console.log('PropertiesPanel - Selected element rotation:', currentElement?.rotation);



  // Alignment handlers
  const handleAlign = (alignment: 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right') => {
    if (!currentElement || !onAlignElement) return;
    
    // Template dimensions (A3 in mm)
    const templateWidth = 297;
    const templateHeight = 420;
    
    let x = currentElement.x;
    let y = currentElement.y;
    
    switch (alignment) {
      case 'top-left':
        x = 0;
        y = 0;
        break;
      case 'top-center':
        x = (templateWidth - currentElement.width) / 2;
        y = 0;
        break;
      case 'top-right':
        x = templateWidth - currentElement.width;
        y = 0;
        break;
      case 'middle-left':
        x = 0;
        y = (templateHeight - currentElement.height) / 2;
        break;
      case 'center':
        x = (templateWidth - currentElement.width) / 2;
        y = (templateHeight - currentElement.height) / 2;
        break;
      case 'middle-right':
        x = templateWidth - currentElement.width;
        y = (templateHeight - currentElement.height) / 2;
        break;
      case 'bottom-left':
        x = 0;
        y = templateHeight - currentElement.height;
        break;
      case 'bottom-center':
        x = (templateWidth - currentElement.width) / 2;
        y = templateHeight - currentElement.height;
        break;
      case 'bottom-right':
        x = templateWidth - currentElement.width;
        y = templateHeight - currentElement.height;
        break;
    }
    
    onAlignElement(currentElement.id, { x: Math.round(x), y: Math.round(y) });
  };

  // Update canvas element mutation
  const updateElementMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CanvasElement> }) => {
      const response = await apiRequest("PATCH", `/api/canvas-elements/${id}`, updates);
      return response.json();
    },
    onSuccess: (updatedElement) => {
      // Force invalidation to ensure UI updates
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
      });
    },
  });

  // Duplicate logo mutation
  const duplicateLogoMutation = useMutation({
    mutationFn: async (elementId: string) => {
      const response = await apiRequest("POST", `/api/canvas-elements/${elementId}/duplicate`);
      return response.json();
    },
    onSuccess: (duplicatedElement) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
      });
    },
  });

  // Handle garment color change for individual logos
  const handleGarmentColorChange = (color: string) => {
    if (currentElement) {
      updateElementMutation.mutate({
        id: currentElement.id,
        updates: { garmentColor: color }
      });
    }
  };





  const handlePropertyChange = (property: keyof CanvasElement, value: any) => {
    if (!currentElement) return;

    console.log('Property change:', property, 'from', currentElement[property], 'to', value);

    // Convert string inputs to numbers for numeric properties
    let processedValue = value;
    if (property === 'x' || property === 'y' || property === 'width' || property === 'height' || property === 'rotation') {
      processedValue = parseFloat(value);
      if (isNaN(processedValue)) {
        console.log('Invalid number input, ignoring');
        return;
      }
    }

    // Handle null values for garment color
    if (property === 'garmentColor' && value === null) {
      processedValue = null;
    }

    // Add constraints to prevent unreasonable values
    if (property === 'width' && (processedValue < 1 || processedValue > 297)) {
      console.log('Width out of range, clamping');
      processedValue = Math.max(1, Math.min(297, processedValue));
    }
    if (property === 'height' && (processedValue < 1 || processedValue > 420)) {
      console.log('Height out of range, clamping');
      processedValue = Math.max(1, Math.min(420, processedValue));
    }
    if (property === 'rotation') {
      // Normalize rotation to 0-360 range
      processedValue = ((processedValue % 360) + 360) % 360;
    }

    let updates: Partial<CanvasElement> = { [property]: processedValue };

    // Handle aspect ratio maintenance for width/height changes
    if (maintainAspectRatio && (property === 'width' || property === 'height')) {
      const aspectRatio = currentElement.width / currentElement.height;
      if (property === 'width') {
        updates.height = Math.round(processedValue / aspectRatio);
      } else {
        updates.width = Math.round(processedValue * aspectRatio);
      }
    }

    const sendUpdate = () => {
      console.log('Sending updates:', updates);
      updateElementMutation.mutate({
        id: currentElement.id,
        updates
      });
    };

    sendUpdate();
  };

  const toggleVisibility = (element: CanvasElement) => {
    updateElementMutation.mutate({
      id: element.id,
      updates: { isVisible: !element.isVisible }
    });
  };

  const toggleLock = (element: CanvasElement) => {
    updateElementMutation.mutate({
      id: element.id,
      updates: { isLocked: !element.isLocked }
    });
  };



  // Dynamic pre-flight check results based on current project data
  const preflightChecks = useMemo(() => {
    if (!currentElement) return [];
    
    const logo = logos.find(l => l.id === currentElement.logoId);
    const checks = [];
    
    // File Resolution Check - skip for vector files as they're resolution-independent
    if (logo) {
      const isVector = logo.mimeType === 'image/svg+xml' || logo.originalMimeType === 'application/pdf';
      
      if (isVector) {
        checks.push({
          name: "Print Resolution",
          status: "pass",
          value: "Vector (Resolution Independent)"
        });
      } else {
        // Calculate effective resolution for raster files only
        const scaleX = currentElement.width / (logo.width || 1);
        const scaleY = currentElement.height / (logo.height || 1);
        const effectiveResolution = Math.min(logo.width || 0, logo.height || 0) / Math.max(scaleX, scaleY);
        const hasGoodResolution = effectiveResolution >= 150; // 150 DPI minimum for print
        
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
      
      // Color Mode Check
      const svgColors = logo.svgColors as string[] | undefined;
      const hasColors = svgColors && Array.isArray(svgColors) && svgColors.length > 0;
      checks.push({
        name: "Color Analysis",
        status: hasColors ? "pass" : "warning",
        value: hasColors ? `${svgColors.length} Colors` : "No Colors"
      });
    }
    
    // Position Check - ensure logo is within template bounds (use reasonable defaults for common sizes)
    const templateWidth = 420; // Use A3 landscape as reasonable default
    const templateHeight = 420; // Use A3 height as reasonable default
    const isWithinBounds = currentElement.x >= 0 && currentElement.y >= 0 && 
                          currentElement.x + currentElement.width <= templateWidth && 
                          currentElement.y + currentElement.height <= templateHeight;
    checks.push({
      name: "Position",
      status: isWithinBounds ? "pass" : "warning",
      value: isWithinBounds ? "In Bounds" : "Check Position"
    });
    
    // Size Check - reasonable print size (adjusted for larger templates like A3)
    const maxWidth = Math.min(templateWidth * 0.95, 500); // Allow up to 95% of template width or 500mm max
    const maxHeight = Math.min(templateHeight * 0.95, 500); // Allow up to 95% of template height or 500mm max
    const hasReasonableSize = currentElement.width >= 5 && currentElement.height >= 5 &&
                             currentElement.width <= maxWidth && currentElement.height <= maxHeight;
    checks.push({
      name: "Print Size",
      status: hasReasonableSize ? "pass" : "warning",
      value: `${Math.round(currentElement.width)}×${Math.round(currentElement.height)}mm`
    });
    
    return checks;
  }, [currentElement, logos]);

  return (
    <TooltipProvider>
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">

      {/* Product Selector Button at top of properties panel */}
      <div className="p-6 border-b border-gray-200">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={() => setShowTemplateSelectorModal(true)}
              className="w-full"
            >
              <Package className="w-4 h-4 mr-2" />
              Product Selector
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Change your design to a different product type (DTF, UV DTF, Single Colour, etc.)</p>
          </TooltipContent>
        </Tooltip>
        <p className="text-xs text-gray-500 mt-2">
          Choose a different product template for your design
        </p>
      </div>

      {/* Logo Properties */}
      {currentElement && (
        <Card className="rounded-none border-x-0 border-t-0">
          <CardHeader className="cursor-pointer" onClick={() => setPropertiesPanelCollapsed(!propertiesPanelCollapsed)}>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Logo Properties
              </span>
              {propertiesPanelCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </CardTitle>
          </CardHeader>
          {!propertiesPanelCollapsed && (
            <CardContent className="space-y-4">
            {/* Position */}
            <div>
              <Label className="text-sm font-medium">Position</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <Label className="text-xs text-gray-500">X (mm)</Label>
                  <Input
                    type="number"
                    value={currentElement.x}
                    onChange={(e) => handlePropertyChange('x', e.target.value)}
                    className="text-sm"
                    step="1"
                    min="0"
                    max="297"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Y (mm)</Label>
                  <Input
                    type="number"
                    value={currentElement.y}
                    onChange={(e) => handlePropertyChange('y', e.target.value)}
                    className="text-sm"
                    step="1" 
                    min="0"
                    max="420"
                  />
                </div>
              </div>
            </div>

            {/* Size */}
            <div>
              <Label className="text-sm font-medium">Size</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <Label className="text-xs text-gray-500">Width (mm)</Label>
                  <Input
                    type="number"
                    value={currentElement.width}
                    onChange={(e) => handlePropertyChange('width', e.target.value)}
                    className="text-sm"
                    step="1"
                    min="1"
                    max="297"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Height (mm)</Label>
                  <Input
                    type="number"
                    value={currentElement.height}
                    onChange={(e) => handlePropertyChange('height', e.target.value)}
                    className="text-sm" 
                    step="1"
                    min="1"
                    max="420"
                  />
                </div>
              </div>
              <div className="flex items-center mt-2">
                <Checkbox
                  id="maintain-aspect"
                  checked={maintainAspectRatio}
                  onCheckedChange={(checked) => setMaintainAspectRatio(checked === true)}
                />
                <Label htmlFor="maintain-aspect" className="ml-2 text-sm">
                  Maintain aspect ratio
                </Label>
              </div>
            </div>

            {/* Rotation */}
            <div>
              <Label className="text-sm font-medium">Rotation</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Slider
                  value={[currentElement.rotation || 0]}
                  onValueChange={([value]) => handlePropertyChange('rotation', value)}
                  min={0}
                  max={360}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={currentElement.rotation || 0}
                  onChange={(e) => handlePropertyChange('rotation', e.target.value)}
                  min={0}
                  max={360}
                  step="1"
                  className="w-16 text-sm"
                />
                <span className="text-sm text-gray-500">°</span>
              </div>
            </div>

            {/* Individual Logo Garment Color */}
            <div>
              <Label className="text-sm font-medium">Logo Garment Color</Label>
              <div className="space-y-3 mt-2">
                {/* Current Selection Display */}
                {currentElement.garmentColor && (
                  <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <TShirtSwatch
                      color={currentElement.garmentColor}
                      size="sm"
                      selected={false}
                    />
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">Selected Color</div>
                      <div className="text-gray-600">{getColorName(currentElement.garmentColor)}</div>
                    </div>
                  </div>
                )}

                {/* Garment Color Modal Trigger */}
                <GarmentColorModal
                  currentColor={currentElement.garmentColor || ""}
                  onColorChange={handleGarmentColorChange}
                  trigger={
                    <Button 
                      variant={currentElement.garmentColor ? "outline" : "default"} 
                      className="w-full"
                      size="sm"
                    >
                      <Palette className="w-4 h-4 mr-2" />
                      {currentElement.garmentColor ? "Change Garment Color" : "Select Garment Color"}
                    </Button>
                  }
                />

                {!currentElement.garmentColor && (
                  <p className="text-xs text-gray-500">
                    Apply a different garment colour to this specific logo
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div>
              <Label className="text-sm font-medium">Actions</Label>
              <div className="space-y-2 mt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => duplicateLogoMutation.mutate(currentElement.id)}
                      disabled={duplicateLogoMutation.isPending}
                      className="w-full"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {duplicateLogoMutation.isPending ? "Duplicating..." : "Duplicate Logo"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Create a copy of this logo that you can position independently</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowImpositionModal(true)}
                      className="w-full"
                    >
                      <Grid className="w-4 h-4 mr-2" />
                      Imposition Tool
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Create multiple copies of this logo in a grid layout</p>
                  </TooltipContent>
                </Tooltip>
                
                <p className="text-xs text-gray-500 mt-1">
                  Duplicate or replicate logos for multi-placement designs
                </p>
              </div>
            </div>
          </CardContent>
          )}
        </Card>
      )}

      {/* SVG Color Picker Panel */}
      {currentElement && (() => {
        const logo = logos.find(l => l.id === currentElement.logoId);
        if (!logo) return null;
        
        return (
          <Card className="rounded-none border-x-0 border-t-0">
            <CardHeader className="cursor-pointer" onClick={() => setPreflightPanelCollapsed(!preflightPanelCollapsed)}>
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Color Analysis
                </span>
                {preflightPanelCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </CardTitle>
            </CardHeader>
            {!preflightPanelCollapsed && (
              <CardContent>
                <ColorPickerPanel selectedElement={currentElement} logo={logo} />
              </CardContent>
            )}
          </Card>
        );
      })()}





      {/* Layer Management */}
      <Card className="rounded-none border-x-0 border-t-0">
        <CardHeader className="cursor-pointer" onClick={() => setLayersPanelCollapsed(!layersPanelCollapsed)}>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Layers ({canvasElements.length})
            </span>
            {layersPanelCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </CardTitle>
        </CardHeader>
        {!layersPanelCollapsed && (
          <CardContent>
            {canvasElements.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No elements on canvas
              </div>
            ) : (
              <div className="space-y-2">
                {canvasElements
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((element) => {
                    const logo = logos.find(l => l.id === element.logoId);
                    if (!logo) return null;

                    const isSelected = currentElement?.id === element.id;

                    return (
                      <div
                        key={element.id}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                          isSelected ? 'bg-blue-50 border border-blue-200' : 'border border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          // This would need to be passed as a prop to select an element
                          console.log('Select element:', element.id);
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          <Image className="w-4 h-4 text-gray-600" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium truncate max-w-[120px]">
                              {logo.originalName}
                            </span>
                            <span className="text-xs text-gray-500">
                              {Math.round(element.width)}×{Math.round(element.height)}mm
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleVisibility(element);
                                }}
                                className="h-6 w-6 p-0"
                              >
                                {element.isVisible ? (
                                  <Eye className="w-3 h-3" />
                                ) : (
                                  <EyeOff className="w-3 h-3 text-gray-400" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{element.isVisible ? "Hide logo" : "Show logo"}</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLock(element);
                                }}
                                className="h-6 w-6 p-0"
                              >
                                {element.isLocked ? (
                                  <Lock className="w-3 h-3" />
                                ) : (
                                  <Unlock className="w-3 h-3" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{element.isLocked ? "Unlock logo (allow editing)" : "Lock logo (prevent changes)"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Alignment Tools Section */}
      <Card className="rounded-none border-x-0 border-t-0">
        <CardHeader className="cursor-pointer" onClick={() => setAlignmentToolsCollapsed(!alignmentToolsCollapsed)}>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Move className="w-5 h-5" />
              Alignment Tools
            </span>
            {alignmentToolsCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </CardTitle>
        </CardHeader>
        {!alignmentToolsCollapsed && (
          <CardContent>
            {/* Alignment Grid */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Alignment</Label>
              <div className="grid grid-cols-3 gap-1 mb-4">
                {/* Top row */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Top Left" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('top-left')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-0 left-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Top Center" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('top-center')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Top Right" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('top-right')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                
                {/* Middle row */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Middle Left" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('middle-left')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Center" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('center')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Middle Right" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('middle-right')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                
                {/* Bottom row */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Bottom Left" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('bottom-left')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute bottom-0 left-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Bottom Center" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('bottom-center')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Bottom Right" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('bottom-right')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
              </div>
              
              {/* Quick Actions */}
              <div className="space-y-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={canvasElements.length === 0}
                      onClick={() => {
                        canvasElements.forEach(element => {
                          const x = (297 - element.width) / 2; // A3 center
                          const y = (420 - element.height) / 2;
                          if (onAlignElement) {
                            onAlignElement(element.id, { x: Math.round(x), y: Math.round(y) });
                          }
                        });
                      }}
                      className="w-full"
                    >
                      Center All Elements
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Center all logos on the canvas at once</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </CardContent>
        )}
      </Card>



      {/* CMYK Color Modal */}
      <CMYKColorModal
        initialColor={currentElement?.garmentColor || "#FFFFFF"}
        onChange={(color: string) => {
          handlePropertyChange('garmentColor', color);
          setShowCMYKModal(false);
        }}
        label="Select Garment Color"
        currentColor={currentElement?.garmentColor || "#FFFFFF"}
      />

      {/* Imposition Modal */}
      {currentElement && (
        <ImpositionModal
          open={showImpositionModal}
          onOpenChange={setShowImpositionModal}
          selectedElement={currentElement}
          template={templateSizes.find(t => t.id === project.templateSize)!}
        />
      )}

      {/* Template Selector Modal */}
      <TemplateSelectorModal
        open={showTemplateSelectorModal}
        templates={templateSizes}
        onSelectTemplate={(templateId) => {
          onTemplateChange(templateId);
          setShowTemplateSelectorModal(false);
        }}
        onClose={() => setShowTemplateSelectorModal(false)}
      />


    </div>
    </TooltipProvider>
  );
}
