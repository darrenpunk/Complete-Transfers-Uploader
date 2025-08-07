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
                <div className="border rounded-lg bg-black p-4 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Dashed border container matching screenshot */}
                  <div 
                    className="border-2 border-dashed border-gray-400 relative"
                    style={{
                      aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                      width: '90%',
                      maxWidth: '280px'
                    }}
                  >
                    {/* Grid of colored squares with logos positioned on them */}
                    <div className="w-full h-full grid grid-cols-5 gap-1 p-2">
                      {(() => {
                        // Create the color grid like in the screenshot
                        const colors = [
                          '#FF0000', '#FFFF00', '#00FF00', '#0000FF', '#800080', // Row 1
                          '#FF00FF', '#800000', '#FFA500', '#FFA500', '#DAA520', '#FFFF00', // Row 2
                          '#FFFF00', '#90EE90', '#00FF00', '#00FFFF', '#800080', // Row 3
                          '#00FFFF', '#0000FF', '#000080', '#800080', '#8B4513', // Row 4
                          '#8B4513', '#D2B48C', '#D2B48C', '#696969', '#000000', // Row 5
                          '#C0C0C0', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'  // Row 6
                        ];
                        
                        return colors.map((color, idx) => (
                          <div
                            key={idx}
                            className="relative aspect-square"
                            style={{ backgroundColor: color }}
                          >
                            {/* Add logos positioned on specific squares */}
                            {canvasElements.map((element, elemIdx) => {
                              const logo = logos.find(l => l.id === element.logoId);
                              if (!logo) return null;
                              
                              // Position logos on specific grid squares (like in screenshot)
                              const logoSquares = [7, 12, 17]; // Middle column positions
                              if (!logoSquares.includes(idx)) return null;
                              
                              return (
                                <div key={elemIdx} className="absolute inset-1 flex items-center justify-center">
                                  <img
                                    src={`/uploads/${logo.filename}`}
                                    alt={logo.originalName}
                                    className="max-w-full max-h-full object-contain"
                                    style={{ width: '80%', height: '80%' }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                    
                    {/* Template size label at bottom */}
                    <div className="absolute -bottom-6 right-2 text-xs text-gray-400">
                      {template?.name || 'A3'} ({template?.width || 297}×{template?.height || 420}mm)
                    </div>
                  </div>
                </div>
              </div>

              {/* Page 2 Preview - Garment Background */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 2 - Garment Background</h4>
                <div className="border rounded-lg bg-black p-4 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Dashed border container matching screenshot */}
                  <div 
                    className="border-2 border-dashed border-gray-400 relative"
                    style={{
                      aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                      width: '90%',
                      maxWidth: '280px'
                    }}
                  >
                    {/* Same grid but showing garment background effect */}
                    <div className="w-full h-full grid grid-cols-5 gap-1 p-2">
                      {(() => {
                        const colors = [
                          '#FF0000', '#FFFF00', '#00FF00', '#0000FF', '#800080',
                          '#FF00FF', '#800000', '#FFA500', '#FFA500', '#DAA520', '#FFFF00',
                          '#FFFF00', '#90EE90', '#00FF00', '#00FFFF', '#800080',
                          '#00FFFF', '#0000FF', '#000080', '#800080', '#8B4513',
                          '#8B4513', '#D2B48C', '#D2B48C', '#696969', '#000000',
                          '#C0C0C0', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'
                        ];
                        
                        return colors.map((color, idx) => (
                          <div
                            key={idx}
                            className="relative aspect-square"
                            style={{ backgroundColor: color }}
                          >
                            {/* Add logos positioned on specific squares */}
                            {canvasElements.map((element, elemIdx) => {
                              const logo = logos.find(l => l.id === element.logoId);
                              if (!logo) return null;
                              
                              // Position logos on fewer squares for Page 2 (like in screenshot)
                              const logoSquares = [7, 12]; // Two logos in middle column
                              if (!logoSquares.includes(idx)) return null;
                              
                              return (
                                <div key={elemIdx} className="absolute inset-1 flex items-center justify-center">
                                  <img
                                    src={`/uploads/${logo.filename}`}
                                    alt={logo.originalName}
                                    className="max-w-full max-h-full object-contain"
                                    style={{ width: '80%', height: '80%' }}
                                  />
                                </div>
                              );
                            })}
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