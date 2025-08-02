import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import CompleteTransferLogo from "./complete-transfer-logo";
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  Copyright,
  Palette,
  Type,
  Layers
} from "lucide-react";
import { gildanColors, fruitOfTheLoomColors } from "@shared/garment-colors";

interface PDFPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  project: any;
  logos: any[];
  canvasElements: any[];
  template: any;
}

export default function PDFPreviewModal({
  open,
  onOpenChange,
  onApprove,
  project,
  logos,
  canvasElements,
  template
}: PDFPreviewModalProps) {
  const [designApproved, setDesignApproved] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  
  console.log('PDFPreviewModal render:', { open, project: project?.name });

  const canProceed = designApproved && rightsConfirmed;

  const handleApprove = () => {
    if (canProceed) {
      onApprove();
      onOpenChange(false);
      // Reset checkboxes for next time
      setDesignApproved(false);
      setRightsConfirmed(false);
    }
  };

  // Calculate preflight summary data
  const totalLogos = logos.length;
  const hasLowResLogos = logos.some(logo => {
    const colorInfo = logo.svgColors as any;
    // Check if it's a raster image with low resolution
    return colorInfo && colorInfo.resolution && colorInfo.resolution < 300 && colorInfo.type === 'raster';
  });
  const hasFonts = logos.some(logo => {
    const colorInfo = logo.svgColors as any;
    return colorInfo && colorInfo.fonts && colorInfo.fonts.length > 0;
  });
  const hasUnconvertedColors = logos.some(logo => {
    const colorInfo = logo.svgColors as any;
    // Check if colors are converted to CMYK (converted flag or mode is CMYK)
    return colorInfo && !colorInfo.converted && colorInfo.mode !== 'CMYK';
  });

  const preflightItems = [
    {
      icon: Layers,
      label: "Design Elements",
      value: `${totalLogos} logo${totalLogos !== 1 ? 's' : ''} uploaded`,
      status: totalLogos > 0 ? "success" : "warning"
    },
    {
      icon: Eye,
      label: "Image Quality", 
      value: hasLowResLogos ? "Low resolution detected" : "Vector graphics",
      status: hasLowResLogos ? "warning" : "success"
    },
    {
      icon: Type,
      label: "Typography",
      value: hasFonts ? "Fonts need outlining" : "Text properly outlined",
      status: hasFonts ? "warning" : "success"
    },
    {
      icon: Palette,
      label: "Color Space",
      value: (() => {
        // Use same logic as tools sidebar preflight check - include color overrides
        const hasCMYKLogos = logos.some(logo => {
          // Try both logo.svgColors and logo.svgColors.colors (different data structures)
          let svgColors = logo.svgColors as any;
          if (svgColors && svgColors.colors && Array.isArray(svgColors.colors)) {
            svgColors = svgColors.colors; // Extract colors array from analysis object
          }
          
          const isVector = logo.mimeType === 'image/svg+xml' || logo.originalMimeType === 'application/pdf';
          
          // Check if any canvas element using this logo has color overrides
          const logoElements = canvasElements.filter(el => el.logoId === logo.id);
          const hasColorOverrides = logoElements.some(el => 
            el.colorOverrides && Object.keys(el.colorOverrides).length > 0
          );
          
          if (isVector && Array.isArray(svgColors) && svgColors.length > 0) {
            // Show CMYK if explicitly converted OR has color overrides
            const hasConvertedColors = svgColors.some(color => color.converted);
            return hasConvertedColors || hasColorOverrides;
          } else if (!isVector && svgColors && typeof svgColors === 'object' && svgColors.type === 'raster') {
            // For raster images, check the mode or color overrides
            return svgColors.mode === 'CMYK' || hasColorOverrides;
          }
          return hasColorOverrides;
        });
        return hasCMYKLogos ? "CMYK ready" : "RGB colors detected";
      })(),
      status: (() => {
        // Use same logic as tools sidebar preflight check - include color overrides
        const hasCMYKLogos = logos.some(logo => {
          // Try both logo.svgColors and logo.svgColors.colors (different data structures)
          let svgColors = logo.svgColors as any;
          if (svgColors && svgColors.colors && Array.isArray(svgColors.colors)) {
            svgColors = svgColors.colors; // Extract colors array from analysis object
          }
          
          const isVector = logo.mimeType === 'image/svg+xml' || logo.originalMimeType === 'application/pdf';
          
          // Check if any canvas element using this logo has color overrides
          const logoElements = canvasElements.filter(el => el.logoId === logo.id);
          const hasColorOverrides = logoElements.some(el => 
            el.colorOverrides && Object.keys(el.colorOverrides).length > 0
          );
          
          if (isVector && Array.isArray(svgColors) && svgColors.length > 0) {
            const hasConvertedColors = svgColors.some(color => color.converted);
            return hasConvertedColors || hasColorOverrides;
          } else if (!isVector && svgColors && typeof svgColors === 'object' && svgColors.type === 'raster') {
            return svgColors.mode === 'CMYK' || hasColorOverrides;
          }
          return hasColorOverrides;
        });
        return hasCMYKLogos ? "success" : "warning";
      })()
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 justify-center">
            <Eye className="w-5 h-5" />
            PDF Preview & Approval
          </DialogTitle>
          <DialogDescription className="text-center">
            Review your design and confirm approval before generating the final PDF
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
          {/* PDF Preview Section */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-lg font-semibold mb-3">PDF Preview</h3>
            
            {/* Two pages side by side */}
            <div className="flex gap-4 flex-1">
              {/* Page 1 Preview */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 1 - Artwork Layout</h4>
                <div className="border rounded-lg bg-white p-3 flex-1 flex items-start justify-center relative overflow-hidden">
                  {/* Canvas preview background */}
                  <div 
                    className="mt-2 border-2 border-dashed border-gray-300 rounded"
                    style={{
                      aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                      width: '90%',
                      maxWidth: '280px'
                    }}
                  >
                    {/* Template background */}
                    <div className="w-full h-full bg-gray-50 relative">
                      {/* Render positioned logos */}
                      {canvasElements.map((element) => {
                        const logo = logos.find(l => l.id === element.logoId);
                        if (!logo) return null;
                        
                        return (
                          <div
                            key={element.id}
                            className="absolute"
                            style={{
                              left: `${(element.x / (template?.width || 297)) * 100}%`,
                              top: `${(element.y / (template?.height || 420)) * 100}%`,
                              width: `${(element.width / (template?.width || 297)) * 100}%`,
                              height: `${(element.height / (template?.height || 420)) * 100}%`,
                              transform: `rotate(${element.rotation || 0}deg)`,
                              opacity: element.opacity || 1,
                            }}
                          >
                            <img
                              src={`/uploads/${logo.filename}`}
                              alt={logo.originalName}
                              className="w-full h-full object-contain"
                              style={{ filter: 'brightness(0.98) contrast(1.02) saturate(0.95)' }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-white px-2 py-1 rounded">
                    {template?.name} ({template?.width}×{template?.height}mm)
                  </div>
                </div>
              </div>

              {/* Page 2 Preview */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 2 - Garment Background</h4>
                <div className="border rounded-lg bg-white p-3 flex-1 flex flex-col items-start justify-start relative overflow-hidden">
                  {/* Render page 2 exactly as PDF output */}
                  <div className="w-full h-full flex flex-col">
                    {/* Logos on garment backgrounds */}
                    <div className="flex-1 flex items-center justify-center">
                      {(() => {
                        // Get unique garment colors from canvas elements
                        const colorsUsed = new Map<string, string>();
                        
                        // Add default garment color if specified
                        if (project?.garmentColor) {
                          colorsUsed.set(project.garmentColor, project.garmentColor);
                        }
                        
                        // Add individual element colors
                        canvasElements.forEach(element => {
                          if (element.garmentColor) {
                            colorsUsed.set(element.garmentColor, element.garmentColor);
                          }
                        });
                        
                        // If there are individual garment colors, show them in a grid
                        const garmentColors = Array.from(colorsUsed.keys());
                        
                        if (garmentColors.length <= 1) {
                          // Single color - show full page preview
                          const bgColor = garmentColors[0] || project?.garmentColor || '#f5f5f5';
                          
                          return (
                            <div 
                              className="rounded-lg flex items-center justify-center"
                              style={{ 
                                backgroundColor: bgColor,
                                width: '90%',
                                maxWidth: '280px',
                                aspectRatio: template ? `${template.width}/${template.height}` : '297/420'
                              }}
                            >
                              {/* Template area with logos */}
                              <div className="relative" style={{
                                width: '90%',
                                height: '90%'
                              }}>
                                {canvasElements.map((element) => {
                                  const logo = logos.find(l => l.id === element.logoId);
                                  if (!logo) return null;
                                  
                                  return (
                                    <div
                                      key={element.id}
                                      className="absolute"
                                      style={{
                                        left: `${(element.x / (template?.width || 297)) * 100}%`,
                                        top: `${(element.y / (template?.height || 420)) * 100}%`,
                                        width: `${(element.width / (template?.width || 297)) * 100}%`,
                                        height: `${(element.height / (template?.height || 420)) * 100}%`,
                                        transform: `rotate(${element.rotation || 0}deg)`,
                                        opacity: element.opacity || 1,
                                      }}
                                    >
                                      <img
                                        src={`/uploads/${logo.filename}`}
                                        alt={logo.originalName}
                                        className="w-full h-full object-contain"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                        
                        // Multiple colors - show grid
                        return (
                          <div className="grid grid-cols-2 gap-3 w-full max-w-[280px]">
                            {garmentColors.map((garmentColor) => {
                              // Get elements for this garment color
                              const elementsForColor = canvasElements.filter(el => 
                                el.garmentColor === garmentColor || 
                                (!el.garmentColor && garmentColor === project?.garmentColor)
                              );
                              
                              return (
                                <div 
                                  key={garmentColor}
                                  className="rounded-lg flex items-center justify-center"
                                  style={{ 
                                    backgroundColor: garmentColor,
                                    aspectRatio: template ? `${template.width}/${template.height}` : '297/420'
                                  }}
                                >
                                  <div className="relative" style={{
                                    width: '90%',
                                    height: '90%'
                                  }}>
                                    {elementsForColor.map((element) => {
                                      const logo = logos.find(l => l.id === element.logoId);
                                      if (!logo) return null;
                                      
                                      return (
                                        <div
                                          key={element.id}
                                          className="absolute"
                                          style={{
                                            left: `${(element.x / (template?.width || 297)) * 100}%`,
                                            top: `${(element.y / (template?.height || 420)) * 100}%`,
                                            width: `${(element.width / (template?.width || 297)) * 100}%`,
                                            height: `${(element.height / (template?.height || 420)) * 100}%`,
                                            transform: `rotate(${element.rotation || 0}deg)`,
                                            opacity: element.opacity || 1,
                                          }}
                                        >
                                          <img
                                            src={`/uploads/${logo.filename}`}
                                            alt={logo.originalName}
                                            className="w-full h-full object-contain"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* Color labels at bottom - exactly like PDF */}
                    <div className="mt-auto pt-2">
                      <div className="flex items-center gap-3 flex-wrap px-4">
                        {(() => {
                          // Get unique colors to display with name and CMYK
                          const colorsToShow = new Map<string, { name: string; cmyk: string }>();
                          
                          // Helper function to convert hex to RGB
                          const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
                            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                            return result ? {
                              r: parseInt(result[1], 16),
                              g: parseInt(result[2], 16),
                              b: parseInt(result[3], 16)
                            } : null;
                          };
                          
                          // Helper function to get color info
                          const getColorInfo = (hexColor: string): { name: string; cmyk: string } => {
                            console.log('Preview - Looking for color info for hex:', hexColor);
                            
                            // First try exact match
                            const allColors = [
                              ...gildanColors.flatMap(group => group.colors),
                              ...fruitOfTheLoomColors.flatMap(group => group.colors)
                            ];
                            
                            for (const color of allColors) {
                              if (color.hex.toLowerCase() === hexColor.toLowerCase()) {
                                const cmyk = `(${color.cmyk.c}, ${color.cmyk.m}, ${color.cmyk.y}, ${color.cmyk.k})`;
                                console.log('Preview - Found exact match:', color.name, cmyk);
                                return { name: color.name, cmyk };
                              }
                            }
                            
                            // If no exact match, find closest color
                            let closestColor: any = null;
                            let closestDistance = Infinity;
                            
                            const targetRgb = hexToRgb(hexColor);
                            if (!targetRgb) {
                              console.log('Preview - Invalid hex color:', hexColor);
                              return { name: hexColor.toUpperCase(), cmyk: '' };
                            }
                            
                            for (const color of allColors) {
                              const colorRgb = hexToRgb(color.hex);
                              if (!colorRgb) continue;
                              
                              // Calculate color distance
                              const distance = Math.sqrt(
                                Math.pow(targetRgb.r - colorRgb.r, 2) +
                                Math.pow(targetRgb.g - colorRgb.g, 2) +
                                Math.pow(targetRgb.b - colorRgb.b, 2)
                              );
                              
                              if (distance < closestDistance) {
                                closestDistance = distance;
                                closestColor = color;
                              }
                            }
                            
                            if (closestColor && closestDistance < 100) {
                              const cmyk = `(${closestColor.cmyk.c}, ${closestColor.cmyk.m}, ${closestColor.cmyk.y}, ${closestColor.cmyk.k})`;
                              console.log('Preview - Found closest color:', closestColor.name, 'distance:', closestDistance.toFixed(2), cmyk);
                              return { name: closestColor.name, cmyk };
                            }
                            
                            console.log('Preview - No close match found, using hex');
                            return { name: hexColor.toUpperCase(), cmyk: '' };
                          };
                          
                          if (project?.garmentColor) {
                            const info = getColorInfo(project.garmentColor);
                            console.log('Preview - Default garment color:', project.garmentColor, 'Info:', info);
                            colorsToShow.set(project.garmentColor, info);
                          }
                          
                          canvasElements.forEach(element => {
                            if (element.garmentColor) {
                              const info = getColorInfo(element.garmentColor);
                              console.log('Preview - Element garment color:', element.garmentColor, 'Info:', info);
                              colorsToShow.set(element.garmentColor, info);
                            }
                          });
                          
                          return Array.from(colorsToShow.entries()).map(([color, info]) => (
                            <div key={color} className="flex items-center gap-1.5">
                              <div 
                                className="w-3 h-3 rounded-sm border border-gray-400"
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-xs" style={{ color: '#6D6D6D' }}>
                                {info.cmyk ? `${info.name} ${info.cmyk}` : info.name}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator orientation="vertical" />

          {/* Preflight Summary Sidebar */}
          <div className="w-80 space-y-4">
            <h3 className="text-lg font-semibold">Preflight Summary</h3>
            
            <div className="space-y-2">
              <div className="space-y-2">
                {preflightItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-2 p-2 rounded border">
                    <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.status === "success" ? (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Project Details */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Project Details</h4>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p><span className="font-medium">Template:</span> {template?.name}</p>
                <p><span className="font-medium">Size:</span> {template?.width}×{template?.height}mm</p>
                <p><span className="font-medium">Elements:</span> {canvasElements.length} positioned</p>
                <p><span className="font-medium">Project:</span> {project?.name || "Untitled Project"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Approval Checkboxes */}
        <div className="space-y-3 pt-3 border-t mt-auto">
          <div className="flex items-start space-x-3">
            <Checkbox 
              id="design-approval" 
              checked={designApproved}
              onCheckedChange={(checked) => setDesignApproved(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label 
                htmlFor="design-approval"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I approve this design layout and artwork positioning
              </Label>
              <p className="text-xs text-muted-foreground">
                Confirm that the design appears as intended and all elements are correctly positioned
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox 
              id="rights-confirmation" 
              checked={rightsConfirmed}
              onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label 
                htmlFor="rights-confirmation"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
              >
                <Copyright className="w-3 h-3" />
                I have the rights to use all images and artwork
              </Label>
              <p className="text-xs text-muted-foreground">
                I confirm that I own or have permission to use all uploaded images, logos, and artwork for commercial printing
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleApprove}
            disabled={!canProceed}
            className={!canProceed ? "opacity-50 cursor-not-allowed" : ""}
          >
            Approve & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}