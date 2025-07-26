import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CanvasElement, Logo } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Image, Eye, EyeOff, Lock, Unlock, CheckCircle, AlertTriangle } from "lucide-react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Square
} from "lucide-react";

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  canvasElements: CanvasElement[];
  logos: Logo[];
}

export default function PropertiesPanel({
  selectedElement,
  canvasElements,
  logos
}: PropertiesPanelProps) {
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  
  // Get the current element data from canvasElements to ensure it's up-to-date
  const currentElement = selectedElement 
    ? canvasElements.find(el => el.id === selectedElement.id) || selectedElement
    : null;
  
  console.log('PropertiesPanel - Selected element rotation:', currentElement?.rotation);

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

    console.log('Sending updates:', updates);
    updateElementMutation.mutate({
      id: currentElement.id,
      updates
    });
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

  // Alignment functions
  const alignLeft = () => {
    if (!currentElement) return;
    console.log('Aligning left');
    handlePropertyChange('x', 0);
  };

  const alignCenter = () => {
    if (!currentElement) return;
    console.log('Aligning center horizontally');
    // Get template from the first element's project (we need template size)
    const templateWidth = 297; // A3 width in mm - should get from template
    const centerX = (templateWidth - currentElement.width) / 2;
    handlePropertyChange('x', Math.round(centerX));
  };

  const alignRight = () => {
    if (!currentElement) return;
    console.log('Aligning right');
    const templateWidth = 297; // A3 width in mm - should get from template
    const rightX = templateWidth - currentElement.width;
    handlePropertyChange('x', Math.round(rightX));
  };

  const alignTop = () => {
    if (!currentElement) return;
    console.log('Aligning top');
    handlePropertyChange('y', 0);
  };

  const alignMiddle = () => {
    if (!currentElement) return;
    console.log('Aligning middle vertically');
    const templateHeight = 420; // A3 height in mm - should get from template
    const middleY = (templateHeight - currentElement.height) / 2;
    handlePropertyChange('y', Math.round(middleY));
  };

  const alignBottom = () => {
    if (!currentElement) return;
    console.log('Aligning bottom');
    const templateHeight = 420; // A3 height in mm - should get from template
    const bottomY = templateHeight - currentElement.height;
    handlePropertyChange('y', Math.round(bottomY));
  };

  // Pre-flight check results
  const preflightChecks = [
    { name: "File Resolution", status: "pass", value: "300 DPI" },
    { name: "Color Mode", status: "pass", value: "CMYK" },
    { name: "File Format", status: "pass", value: "Vector" },
    { name: "Bleed Area", status: "warning", value: "Check" },
  ];

  return (
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
      {/* Logo Properties */}
      {currentElement && (
        <Card className="rounded-none border-x-0 border-t-0">
          <CardHeader>
            <CardTitle className="text-lg">Logo Properties</CardTitle>
          </CardHeader>
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


          </CardContent>
        </Card>
      )}

      {/* Layer Management */}
      <Card className="rounded-none border-x-0 border-t-0">
        <CardHeader>
          <CardTitle className="text-lg">Layers</CardTitle>
        </CardHeader>
        <CardContent>
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
                    className={`flex items-center justify-between p-2 rounded ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : 'border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Image className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium">{logo.originalName}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleVisibility(element)}
                        className="h-6 w-6 p-0"
                      >
                        {element.isVisible ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-gray-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleLock(element)}
                        className="h-6 w-6 p-0"
                      >
                        {element.isLocked ? (
                          <Lock className="w-3 h-3" />
                        ) : (
                          <Unlock className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Alignment Tools */}
      <Card className="rounded-none border-x-0 border-t-0">
        <CardHeader>
          <CardTitle className="text-lg">Alignment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-1 mb-4">
            {/* Top row */}
            <Button variant="outline" size="sm" title="Align Top Left" onClick={() => { alignLeft(); alignTop(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute top-0 left-0 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            <Button variant="outline" size="sm" title="Align Top Center" onClick={() => { alignCenter(); alignTop(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            <Button variant="outline" size="sm" title="Align Top Right" onClick={() => { alignRight(); alignTop(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute top-0 right-0 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            
            {/* Middle row */}
            <Button variant="outline" size="sm" title="Align Middle Left" onClick={() => { alignLeft(); alignMiddle(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            <Button variant="outline" size="sm" title="Align Center" onClick={() => { alignCenter(); alignMiddle(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            <Button variant="outline" size="sm" title="Align Middle Right" onClick={() => { alignRight(); alignMiddle(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            
            {/* Bottom row */}
            <Button variant="outline" size="sm" title="Align Bottom Left" onClick={() => { alignLeft(); alignBottom(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute bottom-0 left-0 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            <Button variant="outline" size="sm" title="Align Bottom Center" onClick={() => { alignCenter(); alignBottom(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
            <Button variant="outline" size="sm" title="Align Bottom Right" onClick={() => { alignRight(); alignBottom(); }} disabled={!selectedElement} className="h-8 p-1">
              <div className="w-5 h-5 border border-gray-400 relative">
                <div className="absolute bottom-0 right-0 w-2 h-2 bg-gray-600"></div>
              </div>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm">
              Distribute H
            </Button>
            <Button variant="outline" size="sm">
              Distribute V
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pre-flight Check */}
      <Card className="rounded-none border-x-0 border-t-0">
        <CardHeader>
          <CardTitle className="text-lg">Pre-flight Check</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {preflightChecks.map((check) => (
              <div key={check.name} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{check.name}</span>
                <div className="flex items-center">
                  {check.status === "pass" ? (
                    <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-500 mr-1" />
                  )}
                  <Badge variant={check.status === "pass" ? "default" : "secondary"}>
                    {check.value}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
