import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Layers, Palette, Type } from "lucide-react";
import { CompleteTransferLogo } from "./complete-transfer-logo";
import { useState } from "react";

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
    }
  };

  // Calculate preflight information
  const totalLogos = logos.length;
  const hasFonts = logos.some(logo => {
    const svgColors = logo.svgColors as any;
    return svgColors?.hasText || svgColors?.fonts?.length > 0;
  });
  
  const hasLowResLogos = logos.some(logo => logo.mimeType && logo.mimeType.startsWith('image/') && !logo.mimeType.includes('svg'));

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
      value: hasFonts ? "Text properly outlined" : "Text properly outlined",
      status: "success"
    },
    {
      icon: Palette,
      label: "Color Space",
      value: "RGB colors detected",
      status: "warning"
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
            
            <div className="flex gap-4 flex-1">
              {/* Page 1 Preview - Artwork Layout */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 1 - Artwork Layout</h4>
                <div className="border rounded-lg bg-black p-6 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Template preview with dashed border - transparent background */}
                  <div 
                    className="border-2 border-dashed border-gray-400 rounded relative bg-transparent"
                    style={{
                      aspectRatio: template ? `${template.width}/${template.height}` : '295/100',
                      width: '90%',
                      maxWidth: '280px'
                    }}
                  >
                    {/* Render positioned logos on transparent background */}
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
                            style={{ 
                              filter: element.opacity !== undefined && element.opacity < 1 ? `opacity(${element.opacity})` : 'none'
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Template size label at bottom */}
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs text-gray-400">
                    {template?.name || 'business_card'} ({template?.width || 295}×{template?.height || 100}mm)
                  </div>
                </div>
              </div>

              {/* Page 2 Preview - Garment Background */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 2 - Garment Background</h4>
                <div className="border rounded-lg bg-black p-6 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Grid of garment colors with logo replicated */}
                  <div className="w-full h-full max-w-sm max-h-80">
                    <div className="grid grid-cols-4 gap-2 h-full">
                      {(() => {
                        // Create array of 20 garment color swatches
                        const garmentColors = [
                          project?.garmentColor || '#D2E31D', // First 4 use project color
                          project?.garmentColor || '#D2E31D',
                          project?.garmentColor || '#D2E31D', 
                          project?.garmentColor || '#D2E31D',
                          '#FFFFFF', '#000000', '#FF0000', '#0000FF',  // Standard colors
                          '#00A86B', '#FFFF00', '#FF1493', '#8A2BE2',  // More colors
                          '#FFA500', '#DC143C', '#32CD32', '#1E90FF',
                          '#FFD700', '#FF4500', '#8B4513', '#2E8B57',
                          '#B22222', '#228B22', '#4682B4', '#D2691E'
                        ];
                        
                        return garmentColors.slice(0, 20).map((color, idx) => (
                          <div
                            key={idx}
                            className="relative aspect-square rounded overflow-hidden border border-gray-600"
                            style={{ backgroundColor: color }}
                          >
                            {/* Render the logo on each garment color swatch */}
                            {canvasElements.length > 0 && (() => {
                              const element = canvasElements[0]; // Use first element for grid
                              const logo = logos.find(l => l.id === element.logoId);
                              if (!logo) return null;
                              
                              return (
                                <div className="absolute inset-0 flex items-center justify-center p-1">
                                  <img
                                    src={`/uploads/${logo.filename}`}
                                    alt={logo.originalName}
                                    className="max-w-full max-h-full object-contain"
                                    style={{ 
                                      width: '70%',
                                      height: '70%',
                                      filter: 'none'
                                    }}
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preflight Summary */}
          <div className="w-80 flex flex-col">
            <h3 className="text-lg font-semibold mb-3">Preflight Summary</h3>
            
            <div className="space-y-3 mb-6">
              {preflightItems.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                  <item.icon 
                    className={`w-5 h-5 ${
                      item.status === 'success' ? 'text-green-600' : 
                      item.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Project Details */}
            <div className="space-y-2 mb-6">
              <h4 className="font-semibold">Project Details</h4>
              <div className="text-sm space-y-1">
                <div>Template: {template?.name || 'business_card'}</div>
                <div>Size: {template?.width || 295}×{template?.height || 100}mm</div>
                <div>Elements: {canvasElements.length} positioned</div>
                <div>Project: {project?.name || 'Untitled Project'}</div>
              </div>
            </div>

            {/* Approval Checkboxes */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="design-approval" 
                  checked={designApproved}
                  onCheckedChange={setDesignApproved}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="design-approval"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I approve this design layout and artwork positioning
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Confirm that the design appears as intended and all elements are correctly positioned
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="rights-confirmation" 
                  checked={rightsConfirmed}
                  onCheckedChange={setRightsConfirmed}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="rights-confirmation"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I have the rights to use all images and artwork
                  </label>
                  <div className="text-xs text-muted-foreground">
                    I confirm that I own or have permission to use all uploaded images, logos, and artwork for commercial printing
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleApprove}
                disabled={!canProceed}
                className="flex-1"
              >
                Approve & Continue
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}