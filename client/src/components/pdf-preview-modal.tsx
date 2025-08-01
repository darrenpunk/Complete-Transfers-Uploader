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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
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
        
        <div className="flex gap-6 h-[70vh]">
          {/* PDF Preview Section */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">PDF Preview</h3>
            
            {/* Two pages side by side */}
            <div className="flex gap-4 flex-1">
              {/* Page 1 Preview */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 1 - Artwork Layout</h4>
                <div className="border rounded-lg bg-white p-4 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Canvas preview background */}
                  <div 
                    className="absolute inset-4 border-2 border-dashed border-gray-300 rounded"
                    style={{
                      aspectRatio: template ? `${template.width}/${template.height}` : '297/420'
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
                <div className="border rounded-lg p-2 flex-1 overflow-auto">
                  {/* Check if we have individual logo garment colors or use project default */}
                  {(() => {
                    // Get unique garment colors from canvas elements
                    const elementColors = canvasElements
                      .map(element => element.garmentColor)
                      .filter(color => color && color !== 'default');
                    
                    const uniqueColors = Array.from(new Set(elementColors));
                    
                    // If no individual colors, use project default
                    if (uniqueColors.length === 0) {
                      return (
                        <div className="w-full h-full flex items-center justify-center relative"
                             style={{ backgroundColor: project?.garmentColor || '#f5f5f5' }}>
                          <div 
                            className="border-2 border-dashed border-gray-400 rounded opacity-60"
                            style={{
                              aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                              width: '80%',
                              maxWidth: '300px'
                            }}
                          >
                            <div className="w-full h-full relative">
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
                                      opacity: (element.opacity || 1) * 0.8,
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
                        </div>
                      );
                    }
                    
                    // Show grid of different garment colors
                    return (
                      <div className="grid grid-cols-2 gap-2 h-full">
                        {uniqueColors.map((garmentColor, index) => {
                          // Get elements for this garment color
                          const elementsForColor = canvasElements.filter(el => el.garmentColor === garmentColor);
                          
                          return (
                            <div 
                              key={`${garmentColor}-${index}`}
                              className="border rounded p-2 flex items-center justify-center relative"
                              style={{ backgroundColor: garmentColor }}
                            >
                              <div 
                                className="border border-dashed border-gray-400/60 rounded opacity-70"
                                style={{
                                  aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                                  width: '90%',
                                  maxWidth: '120px'
                                }}
                              >
                                <div className="w-full h-full relative">
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
                                          opacity: (element.opacity || 1) * 0.8,
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
                              
                              {/* Color label */}
                              <div className="absolute bottom-1 right-1 text-xs text-white bg-black/60 px-1 py-0.5 rounded text-center">
                                <div 
                                  className="w-2 h-2 rounded border border-white mx-auto mb-0.5"
                                  style={{ backgroundColor: garmentColor }}
                                />
                                <div className="text-[9px] leading-tight">
                                  {elementsForColor.length} logo{elementsForColor.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          <Separator orientation="vertical" />

          {/* Preflight Summary Sidebar */}
          <div className="w-80 space-y-4">
            <h3 className="text-lg font-semibold">Preflight Summary</h3>
            
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {preflightItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg border">
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
            </ScrollArea>

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
        <div className="space-y-4 pt-4 border-t">
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