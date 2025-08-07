import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Layers, Palette, Type, Download } from "lucide-react";
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
      value: hasFonts ? "Fonts need outlining" : "Text properly outlined",
      status: hasFonts ? "warning" : "success"
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
        
        <div className="flex gap-6 flex-1 min-h-0 overflow-hidden relative">
          {/* PDF Preview Mockup - Two Pages Side by Side */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-lg font-semibold mb-3">PDF Preview</h3>
            
            <div className="flex gap-4 flex-1">
              {/* Page 1 Preview - Artwork Layout */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 1 - Artwork Layout</h4>
                <div className="border rounded-lg bg-black p-3 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Template preview with dashed border */}
                  <div 
                    className="border-2 border-dashed border-gray-400 rounded relative"
                    style={{
                      aspectRatio: template ? `${template.width}/${template.height}` : '297/420',
                      width: '90%',
                      maxWidth: '280px',
                      backgroundColor: 'transparent'
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
                    
                    {/* Template size label */}
                    <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-400">
                      {template?.name || 'business_card'} ({template?.width || 295}×{template?.height || 100}mm)
                    </div>
                  </div>
                </div>
              </div>

              {/* Page 2 Preview - Garment Background */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 2 - Garment Background</h4>
                <div className="border rounded-lg bg-black p-3 flex-1 flex items-center justify-center relative overflow-hidden">
                  {/* Grid of garment colors with logo */}
                  <div className="w-full h-full max-w-sm max-h-80">
                    <div className="grid grid-cols-4 gap-2 h-full">
                      {(() => {
                        // Create 20 color variants for the grid display
                        const garmentColors = [
                          '#FFFFFF', '#000000', '#FF0000', '#0000FF',
                          '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF',
                          '#808080', '#800000', '#008000', '#000080',
                          '#808000', '#800080', '#008080', '#C0C0C0',
                          '#FFA500', '#FFC0CB', '#A52A2A', '#90EE90'
                        ];
                        
                        // Use the project's garment color for some slots, otherwise use variants
                        const defaultColor = project?.garmentColor || '#D2E31D';
                        const finalColors = garmentColors.map((color, idx) => 
                          idx < 4 ? defaultColor : color
                        );
                        
                        return finalColors.map((color, idx) => (
                          <div
                            key={idx}
                            className="relative aspect-square rounded overflow-hidden"
                            style={{ backgroundColor: color }}
                          >
                            {/* Render the logo on each garment color */}
                            {canvasElements.map((element) => {
                              const logo = logos.find(l => l.id === element.logoId);
                              if (!logo) return null;
                              
                              return (
                                <div
                                  key={`${idx}-${element.id}`}
                                  className="absolute inset-0 flex items-center justify-center p-1"
                                >
                                  <img
                                    src={`/uploads/${logo.filename}`}
                                    alt={logo.originalName}
                                    className="max-w-full max-h-full object-contain"
                                    style={{ 
                                      width: '80%',
                                      height: '80%',
                                      filter: element.opacity !== undefined && element.opacity < 1 ? `opacity(${element.opacity})` : 'none'
                                    }}
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

          {/* Download PDF Button */}
          <div className="absolute top-4 right-4">
            <Button
              onClick={() => {
                if (project) {
                  window.open(`/api/projects/${project.id}/generate-pdf?t=${Date.now()}`, '_blank');
                }
              }}
              className="flex items-center gap-2"
              variant="outline"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
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
                <div>Template: {template?.name || 'A3'}</div>
                <div>Size: {template?.width || 297}×{template?.height || 420}mm</div>
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
                  <p className="text-xs text-muted-foreground">
                    Confirm that the design appears as intended and all elements are correctly positioned
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    I confirm that I own or have permission to use all uploaded images, logos, and artwork for commercial printing
                  </p>
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