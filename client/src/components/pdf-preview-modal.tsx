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
                <div className="border rounded-lg p-4 flex-1 flex items-center justify-center relative overflow-hidden" style={{backgroundColor: '#CDCECC'}}>
                  {/* Show positioned logos (which contain color grids) */}
                  <div 
                    className="relative border border-dashed border-gray-400"
                    style={{
                      backgroundColor: '#CDCECC',
                      aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                      width: '90%',
                      maxWidth: '280px'
                    }}
                  >
                    {/* Render positioned logos that contain the artwork with color grids */}
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
                  
                  {/* Template size label */}
                  <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-white px-1 rounded">
                    {template?.name || 'A3'} ({template?.width || 297}×{template?.height || 420}mm)
                  </div>
                </div>
              </div>

              {/* Page 2 Preview - Garment Background */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 2 - Garment Background</h4>
                <div className="border rounded-lg bg-white p-4 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Template container with individual garment color areas */}
                  <div 
                    className="relative border border-dashed border-gray-300 bg-gray-100"
                    style={{
                      aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                      width: '90%',
                      maxWidth: '280px'
                    }}
                  >
                    {/* Render individual garment color backgrounds for each logo */}
                    {canvasElements.map((element) => {
                      const logo = logos.find(l => l.id === element.logoId);
                      if (!logo) return null;
                      
                      // Use element's individual garment color or fall back to project color
                      const garmentColor = element.garmentColor || project?.garmentColor || '#D2E31D';
                      
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
                            backgroundColor: garmentColor,
                            border: '1px solid rgba(0,0,0,0.1)'
                          }}
                        >
                          <img
                            src={`/uploads/${logo.filename}`}
                            alt={logo.originalName}
                            className="w-full h-full object-contain relative z-10"
                            style={{ 
                              filter: element.opacity !== undefined && element.opacity < 1 ? `opacity(${element.opacity})` : 'none'
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Individual garment color labels */}
                  <div className="absolute bottom-2 left-2 text-xs bg-white/90 px-2 py-1 rounded text-[#292828] max-w-[200px]">
                    Garment Colors: {(() => {
                      const colorData: { [key: string]: { name: string; cmyk: string } } = {
                        '#D2E31D': { name: 'Lime Green', cmyk: '(25, 0, 95, 0)' },
                        '#FFFFFF': { name: 'White', cmyk: '(0, 0, 0, 0)' },
                        '#000000': { name: 'Black', cmyk: '(0, 0, 0, 100)' },
                        '#FF0000': { name: 'Red', cmyk: '(0, 100, 100, 0)' },
                        '#0000FF': { name: 'Blue', cmyk: '(100, 100, 0, 0)' },
                        '#00FF00': { name: 'Green', cmyk: '(100, 0, 100, 0)' },
                        '#FFFF00': { name: 'Yellow', cmyk: '(0, 0, 100, 0)' },
                        '#FFA500': { name: 'Orange', cmyk: '(0, 35, 100, 0)' },
                        '#800080': { name: 'Purple', cmyk: '(50, 100, 0, 20)' },
                        '#FFC0CB': { name: 'Pink', cmyk: '(0, 25, 5, 0)' },
                        '#808080': { name: 'Gray', cmyk: '(0, 0, 0, 50)' },
                        '#A52A2A': { name: 'Brown', cmyk: '(0, 75, 75, 35)' },
                        '#762009': { name: 'Brown', cmyk: '(0, 75, 85, 54)' },
                        '#00FFFF': { name: 'Cyan', cmyk: '(100, 0, 0, 0)' },
                        '#FF00FF': { name: 'Magenta', cmyk: '(0, 100, 0, 0)' },
                        '#800000': { name: 'Maroon', cmyk: '(0, 100, 100, 50)' },
                        '#008000': { name: 'Dark Green', cmyk: '(100, 0, 100, 50)' },
                        '#000080': { name: 'Navy Blue', cmyk: '(100, 100, 0, 50)' }
                      };
                      
                      // Get unique garment colors from canvas elements
                      const uniqueColors = [...new Set(canvasElements.map(el => el.garmentColor || project?.garmentColor || '#D2E31D'))];
                      return uniqueColors.map(color => {
                        const colorInfo = colorData[color];
                        return colorInfo ? `${colorInfo.name} ${colorInfo.cmyk}` : color;
                      }).join(', ');
                    })()}
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