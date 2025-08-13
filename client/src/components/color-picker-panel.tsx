import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Palette, RotateCcw, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import CMYKColorModal from "./cmyk-color-modal";
import { RGBWarningModal } from "./rgb-warning-modal";
import type { CanvasElement, Logo, Project, TemplateSize } from "@shared/schema";

interface SVGColorInfo {
  id: string;
  originalColor: string;
  originalFormat?: string;
  cmykColor?: string;
  pantoneMatch?: string;
  pantoneDistance?: number;
  elementType: string;
  attribute: string;
  selector: string;
  isCMYK?: boolean;
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

// Parse standard RGB format rgb(255, 255, 255)
function parseRGBStandard(rgbString: string): { r: number; g: number; b: number } | null {
  const match = rgbString.match(/rgb\((\d+),?\s*(\d+),?\s*(\d+)\)/);
  if (!match) return null;

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  return { r, g, b };
}

// Parse CMYK format CMYK(0, 0, 0, 100)
function parseCMYKStandard(cmykString: string): CMYKColor | null {
  const match = cmykString.match(/CMYK\((\d+),?\s*(\d+),?\s*(\d+),?\s*(\d+)\)/);
  if (!match) return null;

  return {
    c: parseInt(match[1]),
    m: parseInt(match[2]),
    y: parseInt(match[3]),
    k: parseInt(match[4])
  };
}

// Parse RGB percentage format rgb(100%, 100%, 100%)
function parseRGBPercentageStandard(rgbString: string): { r: number; g: number; b: number } | null {
  const match = rgbString.match(/rgb\((\d+(?:\.\d+)?)%,?\s*(\d+(?:\.\d+)?)%,?\s*(\d+(?:\.\d+)?)%\)/);
  if (!match) return null;

  const r = Math.round((parseFloat(match[1]) / 100) * 255);
  const g = Math.round((parseFloat(match[2]) / 100) * 255);
  const b = Math.round((parseFloat(match[3]) / 100) * 255);

  return { r, g, b };
}

// Parse CMYK from the cmykColor string in the analysis (which uses Adobe conversion)
function parseCMYKString(cmykString: string): CMYKColor | null {
  const match = cmykString.match(/C:(\d+) M:(\d+) Y:(\d+) K:(\d+)/);
  if (!match) return null;
  
  return {
    c: parseInt(match[1]),
    m: parseInt(match[2]),
    y: parseInt(match[3]),
    k: parseInt(match[4])
  };
}

function getCMYKFromColorInfo(colorInfo: SVGColorInfo): CMYKColor | null {
  // Use the pre-calculated CMYK from the server-side Adobe conversion
  if (colorInfo.cmykColor) {
    return parseCMYKString(colorInfo.cmykColor);
  }
  
  // Fallback for percentage or standard RGB parsing if needed
  let rgb = parseRGBPercentage(colorInfo.originalFormat || colorInfo.originalColor);
  if (!rgb) {
    rgb = parseRGBStandard(colorInfo.originalFormat || colorInfo.originalColor);
  }
  if (!rgb) return null;
  
  // This is a basic fallback - should not be used for vector files
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

// Convert CMYK to RGB for preview display
function cmykToRGB(cmyk: CMYKColor): { r: number; g: number; b: number } {
  const c = cmyk.c / 100;
  const m = cmyk.m / 100;
  const y = cmyk.y / 100;
  const k = cmyk.k / 100;
  
  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));
  
  return { r, g, b };
}

interface ColorPickerPanelProps {
  selectedElement: CanvasElement;
  logo: Logo;
}

export default function ColorPickerPanel({ selectedElement, logo }: ColorPickerPanelProps) {
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(
    (selectedElement.colorOverrides as Record<string, string>) || {}
  );
  // Use a global state or localStorage to persist RGB warnings across component re-renders
  const [shownRGBWarningLogos, setShownRGBWarningLogos] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('shownRGBWarningLogos');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // Fetch project and template information to check if this is a single colour template
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", selectedElement.projectId],
    enabled: !!selectedElement.projectId
  });

  const { data: templateSizes } = useQuery<TemplateSize[]>({
    queryKey: ["/api/template-sizes"]
  });

  // Check if this is a single colour template
  const isSingleColourTemplate = templateSizes && project 
    ? templateSizes.find(t => t.id === project.templateSize)?.group === "Screen Printed Transfers" && 
      templateSizes.find(t => t.id === project.templateSize)?.label?.includes("Single Colour")
    : false;

  // Only show for SVG logos with detected colors
  const svgAnalysis = logo.svgColors as { colors?: SVGColorInfo[]; strokeWidths?: number[]; hasText?: boolean } | SVGColorInfo[] | null;
  
  // Handle both new analysis format and legacy array format
  let svgColors: SVGColorInfo[] = [];
  if (svgAnalysis) {
    if (Array.isArray(svgAnalysis)) {
      // Legacy format - direct array of color info
      svgColors = svgAnalysis;
    } else if (svgAnalysis.colors && Array.isArray(svgAnalysis.colors)) {
      // New format - colors are in the colors property
      svgColors = svgAnalysis.colors;
    }
  }
  
  const shouldShow = svgColors && svgColors.length > 0 && logo.mimeType === 'image/svg+xml';
  
  console.log('ColorPickerPanel Debug:', {
    logoId: logo.id,
    svgAnalysis: svgAnalysis,
    svgColors: svgColors,
    shouldShow: shouldShow,
    mimeType: logo.mimeType
  });

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
    console.log('Color change requested:', { originalColor, newColor });
    const updatedOverrides = {
      ...colorOverrides,
      [originalColor]: newColor
    };
    setColorOverrides(updatedOverrides);
    console.log('Updated color overrides:', updatedOverrides);
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

  // Check if any colors are RGB (not CMYK)
  // For vectorized files, all colors should be marked as isCMYK: true
  // For single colour templates, disable RGB warnings since auto-recoloring handles it
  // For photographic raster files, disable RGB warnings since they're meant to be photographic
  const hasRGBColors = !isSingleColourTemplate && !(logo as any).isPhotographic && svgColors.some(color => {
    // If explicitly marked as CMYK, it's not RGB
    if (color.isCMYK) return false;
    
    // If has CMYK color data, it's not RGB
    if (color.cmykColor?.includes('C:')) return false;
    
    // If originalColor starts with CMYK(), it's vectorized and not RGB
    if (color.originalColor?.startsWith('CMYK(')) return false;
    
    // White colors (transparency) should not trigger RGB warning
    if (color.originalColor === 'rgb(255, 255, 255)' || color.originalColor === '#ffffff') return false;
    
    // Otherwise, it's RGB
    return true;
  });

  // Check if we've already shown the warning for this logo file (not element ID)
  // This ensures duplicated/impositioned logos don't trigger multiple warnings
  const logoFilename = logo.originalFilename || logo.filename;
  const hasShownWarningForThisLogo = shownRGBWarningLogos.has(logoFilename);

  console.log('RGB Warning Check:', {
    logoId: logo.id,
    logoFilename,
    svgColorsCount: svgColors.length,
    isSingleColourTemplate,
    hasRGBColors,
    hasShownWarningForThisLogo,
    shownRGBWarningLogos: Array.from(shownRGBWarningLogos),
    colorDetails: svgColors.map(c => ({
      originalColor: c.originalColor,
      isCMYK: c.isCMYK,
      hasCMYKData: !!c.cmykColor?.includes('C:'),
      startsWithCMYK: c.originalColor?.startsWith('CMYK(')
    }))
  });

  return (
    <>
      <RGBWarningModal 
        hasRGBColors={hasRGBColors && !hasShownWarningForThisLogo} 
        onClose={() => {
          const newSet = new Set([...Array.from(shownRGBWarningLogos), logoFilename]);
          setShownRGBWarningLogos(newSet);
          // Persist to localStorage
          localStorage.setItem('shownRGBWarningLogos', JSON.stringify(Array.from(newSet)));
        }} 
      />
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
            const hasOverride = !!colorOverrides[colorInfo.originalColor];
            const currentColor = hasOverride ? colorOverrides[colorInfo.originalColor] : colorInfo.originalColor;
            const rgbPercent = parseRGBPercentage(colorInfo.originalColor);
            const isCMYK = colorInfo.isCMYK || (colorInfo.cmykColor && colorInfo.cmykColor.includes('C:'));
            
            // For CMYK colors, show the original CMYK values instead of RGB conversion
            let originalDisplayColor = colorInfo.originalColor;
            
            // Create a hex color for CSS display (for the color swatch)
            let hexForDisplay = originalDisplayColor;
            
            // Convert the actual color to hex for the visual swatch
            if (rgbPercent) {
              hexForDisplay = `#${rgbPercent.r.toString(16).padStart(2, '0')}${rgbPercent.g.toString(16).padStart(2, '0')}${rgbPercent.b.toString(16).padStart(2, '0')}`;
            } else {
              // Try parsing standard RGB format rgb(255, 255, 255)
              const rgbStandard = parseRGBStandard(colorInfo.originalColor);
              if (rgbStandard) {
                hexForDisplay = `#${rgbStandard.r.toString(16).padStart(2, '0')}${rgbStandard.g.toString(16).padStart(2, '0')}${rgbStandard.b.toString(16).padStart(2, '0')}`;
              } else {
                // Try parsing originalFormat if it's RGB percentage format
                const rgbPercentStandard = parseRGBPercentageStandard(colorInfo.originalFormat || '');
                if (rgbPercentStandard) {
                  hexForDisplay = `#${rgbPercentStandard.r.toString(16).padStart(2, '0')}${rgbPercentStandard.g.toString(16).padStart(2, '0')}${rgbPercentStandard.b.toString(16).padStart(2, '0')}`;
                } else if (colorInfo.originalColor.startsWith('CMYK(')) {
                  // Handle CMYK colors by converting to hex
                  const cmykStandard = parseCMYKStandard(colorInfo.originalColor);
                  if (cmykStandard) {
                    const previewRGB = cmykToRGB(cmykStandard);
                    hexForDisplay = `#${previewRGB.r.toString(16).padStart(2, '0')}${previewRGB.g.toString(16).padStart(2, '0')}${previewRGB.b.toString(16).padStart(2, '0')}`;
                  } else {
                    // Fallback to getCMYKFromColorInfo
                    const adobeCMYKForDisplay = getCMYKFromColorInfo(colorInfo);
                    if (adobeCMYKForDisplay) {
                      const previewRGB = cmykToRGB(adobeCMYKForDisplay);
                      hexForDisplay = `#${previewRGB.r.toString(16).padStart(2, '0')}${previewRGB.g.toString(16).padStart(2, '0')}${previewRGB.b.toString(16).padStart(2, '0')}`;
                    }
                  }
                } else if (colorInfo.originalColor.startsWith('#')) {
                  hexForDisplay = colorInfo.originalColor;
                }
              }
            }
            
            // For CMYK colors, show the original CMYK values as the display text
            if (isCMYK && colorInfo.cmykColor) {
              originalDisplayColor = colorInfo.cmykColor; // Show CMYK format like "C:0 M:15 Y:96 K:5"
            }
            
            // Final fallback: ensure hex color is available for CSS display
            if (!hexForDisplay.startsWith('#')) {
              console.log(`🎨 Color conversion failed for: ${colorInfo.originalColor}, originalFormat: ${colorInfo.originalFormat}`);
              
              // If it's still not hex, try to use the original format as a fallback
              if (colorInfo.originalFormat && colorInfo.originalFormat.startsWith('#')) {
                hexForDisplay = colorInfo.originalFormat;
              } else {
                // Try one more time with direct RGB parsing
                const directRgb = colorInfo.originalColor.match(/rgb\((\d+),?\s*(\d+),?\s*(\d+)\)/);
                if (directRgb) {
                  const r = parseInt(directRgb[1]);
                  const g = parseInt(directRgb[2]);
                  const b = parseInt(directRgb[3]);
                  hexForDisplay = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                  console.log(`🎨 Direct RGB conversion: rgb(${r},${g},${b}) → ${hexForDisplay}`);
                } else {
                  // Last resort: default to black for any remaining non-hex colors
                  console.log(`🎨 FALLBACK TO BLACK: Could not parse color: ${colorInfo.originalColor}`);
                  hexForDisplay = '#000000';
                }
              }
            }
            
            // Get the correct Adobe CMYK values
            const adobeCMYK = getCMYKFromColorInfo(colorInfo);
            
            // Use override color if exists, otherwise use converted display color
            const displayColor = hasOverride ? currentColor : originalDisplayColor;
            
            return (
              <CMYKColorModal
                key={`${colorInfo.originalColor}-${index}`}
                initialColor={originalDisplayColor}
                currentColor={currentColor}
                onChange={(newColor) => handleColorChange(colorInfo.originalColor, newColor)}
                label={`Color ${index + 1}`}
                cmykValues={adobeCMYK || undefined}
                trigger={
                  <button
                    className={`w-10 h-10 rounded-full border-2 shadow-sm transition-all hover:scale-105 ${
                      hasOverride
                        ? "border-primary ring-2 ring-blue-200"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: hexForDisplay }}
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
          {svgColors.map((color, index) => {
            const isCMYK = color.isCMYK || (color.cmykColor && color.cmykColor.includes('C:'));
            
            return (
              <div key={index} className="space-y-1">
                <div className="text-xs text-gray-500 font-mono">
                  {isCMYK ? (
                    // Show CMYK values if already CMYK
                    color.cmykColor || color.originalColor
                  ) : (
                    // Show RGB values for RGB colors
                    color.originalColor
                  )}
                </div>


              </div>
            );
          })}
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
    </>
  );
}