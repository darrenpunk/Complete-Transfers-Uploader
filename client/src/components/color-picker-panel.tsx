import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Palette, RotateCcw } from "lucide-react";
import CMYKColorModal from "./cmyk-color-modal";
import type { CanvasElement, Logo } from "@shared/schema";

interface SVGColorInfo {
  id: string;
  originalColor: string;
  cmykColor?: string;
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
  const shouldShow = svgColors && svgColors.length > 0 && logo.mimeType === 'image/svg+xml';

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

  if (!shouldShow) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Logo Colors
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Color Grid - Same style as garment colors */}
        <div className="grid grid-cols-6 gap-2">
          {svgColors.map((colorInfo, index) => {
            const currentColor = getDisplayColor(colorInfo.originalColor);
            const rgbPercent = parseRGBPercentage(colorInfo.originalColor);
            let displayColor = colorInfo.originalColor;
            
            // Convert RGB percentage to hex for display
            if (rgbPercent) {
              displayColor = `#${rgbPercent.r.toString(16).padStart(2, '0')}${rgbPercent.g.toString(16).padStart(2, '0')}${rgbPercent.b.toString(16).padStart(2, '0')}`;
            }
            
            return (
              <CMYKColorModal
                key={`${colorInfo.originalColor}-${index}`}
                initialColor={colorInfo.originalColor}
                currentColor={getDisplayColor(colorInfo.originalColor)}
                onChange={(newColor) => handleColorChange(colorInfo.originalColor, newColor)}
                label={`Color ${index + 1}`}
                trigger={
                  <button
                    className={`w-10 h-10 rounded-full border-2 shadow-sm transition-all hover:scale-105 ${
                      colorOverrides[colorInfo.originalColor]
                        ? "border-primary ring-2 ring-blue-200"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: displayColor }}
                    title={`${colorInfo.elementType} color - Click to edit with CMYK`}
                  />
                }
              />
            );
          })}
        </div>
        
        {/* Color Information */}
        <div className="space-y-2">
          <div className="text-xs text-gray-600">
            {svgColors.length} color{svgColors.length !== 1 ? 's' : ''} detected in logo
          </div>
          {svgColors.map((color, index) => (
            <div key={index} className="text-xs text-gray-500 font-mono">
              {color.cmykColor || color.originalColor}
            </div>
          ))}
          {Object.keys(colorOverrides).length > 0 && (
            <div className="text-xs text-blue-600">
              {Object.keys(colorOverrides).length} color{Object.keys(colorOverrides).length !== 1 ? 's' : ''} modified
            </div>
          )}
        </div>

        
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