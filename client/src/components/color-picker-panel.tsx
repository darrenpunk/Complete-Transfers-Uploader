import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Palette, RotateCcw } from "lucide-react";
import CMYKColorPicker from "./cmyk-color-picker";
import type { CanvasElement, Logo } from "@shared/schema";

interface SVGColorInfo {
  id: string;
  originalColor: string;
  elementType: string;
  attribute: string;
  selector: string;
}

interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

// Color conversion utilities
function parseRGBPercentage(rgbString: string): { r: number; g: number; b: number } | null {
  const match = rgbString.match(/rgb\(([0-9.]+)%,\s*([0-9.]+)%,\s*([0-9.]+)%\)/);
  if (!match) return null;

  const r = Math.round((parseFloat(match[1]) / 100) * 255);
  const g = Math.round((parseFloat(match[2]) / 100) * 255);
  const b = Math.round((parseFloat(match[3]) / 100) * 255);

  return { r, g, b };
}

function rgbToCmyk(rgb: { r: number; g: number; b: number }): CMYKColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const k = 1 - Math.max(r, Math.max(g, b));
  const c = k === 1 ? 0 : (1 - r - k) / (1 - k);
  const m = k === 1 ? 0 : (1 - g - k) / (1 - k);
  const y = k === 1 ? 0 : (1 - b - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

function getCMYKFromRGBPercentage(rgbString: string): CMYKColor | null {
  const rgb = parseRGBPercentage(rgbString);
  if (!rgb) return null;
  return rgbToCmyk(rgb);
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
        {svgColors.map((colorInfo) => {
          const cmykColor = getCMYKFromRGBPercentage(colorInfo.originalColor);
          
          return (
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
                {cmykColor && (
                  <Badge variant="secondary" className="text-xs mt-1">
                    C{cmykColor.c} M{cmykColor.m} Y{cmykColor.y} K{cmykColor.k}
                  </Badge>
                )}
              </div>
            <div className="flex-1">
              <CMYKColorPicker
                initialColor={colorInfo.originalColor}
                onChange={(newColor) => handleColorChange(colorInfo.originalColor, newColor)}
                label={`${colorInfo.elementType} (${colorInfo.attribute})`}
              />
              </div>
            </div>
          );
        })}
        
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