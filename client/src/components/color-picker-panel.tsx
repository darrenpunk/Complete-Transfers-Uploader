import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette, RotateCcw } from "lucide-react";
import type { CanvasElement, Logo } from "@shared/schema";

interface SVGColorInfo {
  id: string;
  originalColor: string;
  elementType: string;
  attribute: string;
  selector: string;
}

interface ColorPickerPanelProps {
  selectedElement: CanvasElement;
  logo: Logo;
}

export default function ColorPickerPanel({ selectedElement, logo }: ColorPickerPanelProps) {
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(
    (selectedElement.colorOverrides as Record<string, string>) || {}
  );

  // Only show for SVG logos with detected colors
  const svgColors = logo.svgColors as SVGColorInfo[] | null;
  if (!svgColors || svgColors.length === 0 || logo.mimeType !== 'image/svg+xml') {
    return null;
  }

  const updateColorsMutation = useMutation({
    mutationFn: async (colors: Record<string, string>) => {
      const response = await apiRequest("POST", `/api/canvas-elements/${selectedElement.id}/update-colors`, {
        colorOverrides: colors
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate canvas elements to refresh the display
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", selectedElement.projectId, "canvas-elements"] 
      });
    },
    onError: (error) => {
      console.error("Failed to update colors:", error);
    }
  });

  const handleColorChange = (originalColor: string, newColor: string) => {
    const updatedOverrides = {
      ...colorOverrides,
      [originalColor]: newColor
    };
    setColorOverrides(updatedOverrides);
  };

  const handleApplyColors = () => {
    updateColorsMutation.mutate(colorOverrides);
  };

  const handleResetColors = () => {
    setColorOverrides({});
    updateColorsMutation.mutate({});
  };

  const getDisplayColor = (originalColor: string) => {
    return colorOverrides[originalColor] || originalColor;
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="w-4 h-4" />
          SVG Colors
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {svgColors.map((colorInfo) => (
          <div key={colorInfo.id} className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">
                {colorInfo.elementType} ({colorInfo.attribute})
              </div>
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: colorInfo.originalColor }}
                  title={`Original: ${colorInfo.originalColor}`}
                />
                <div className="text-xs font-mono text-muted-foreground">
                  {colorInfo.originalColor}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={getDisplayColor(colorInfo.originalColor)}
                onChange={(e) => handleColorChange(colorInfo.originalColor, e.target.value)}
                className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                title="Choose new color"
              />
              <div 
                className="w-6 h-6 rounded border border-gray-300"
                style={{ backgroundColor: getDisplayColor(colorInfo.originalColor) }}
                title={`Current: ${getDisplayColor(colorInfo.originalColor)}`}
              />
            </div>
          </div>
        ))}
        
        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            onClick={handleApplyColors}
            disabled={updateColorsMutation.isPending}
            className="flex-1"
          >
            {updateColorsMutation.isPending ? "Applying..." : "Apply Colors"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetColors}
            disabled={updateColorsMutation.isPending}
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}