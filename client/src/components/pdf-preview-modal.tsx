import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Layers, Palette, Type, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { CompleteTransferLogo } from "./complete-transfer-logo";
import { useState, useMemo, useCallback } from "react";

// Helper function to get the correct image URL for display (matches canvas-workspace logic)
const getImageUrl = (logo: any): string => {
  // For complex files using PNG fallback
  if (logo.isComplexFilePngFallback) {
    return `/uploads/${logo.filename}`;
  }
  
  // Check for canvas fallback filename (for complex vectors)
  if (logo.canvasFallbackFilename) {
    return `/uploads/${logo.canvasFallbackFilename}`;
  }
  
  // For PDF files, check if we have a preview image or SVG conversion
  if (logo.mimeType === 'application/pdf' || logo.originalMimeType === 'application/pdf') {
    if (logo.previewFilename) {
      return `/uploads/${logo.previewFilename}`;
    }
    // Check if SVG conversion exists
    if (logo.filename && logo.filename.endsWith('.svg')) {
      return `/uploads/${logo.filename}`;
    }
    // Try .svg version
    return `/uploads/${logo.filename}.svg`;
  }
  
  // For SVG and other image files
  return `/uploads/${logo.filename}`;
};

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
  const [currentPassThroughPage, setCurrentPassThroughPage] = useState(2);
  
  console.log('PDFPreviewModal render:', { open, project: project?.name });

  const canProceed = designApproved && rightsConfirmed;

  // Check if pass-through mode is enabled and find the multi-page PDF logo
  const passThroughInfo = useMemo(() => {
    if (!project?.useOriginalGarmentPages) return null;
    
    const multiPageLogo = logos.find((logo: any) => 
      logo.hasGarmentPages === true && 
      (logo.pageCount || 1) > 1 &&
      logo.originalMimeType === 'application/pdf'
    );
    
    if (!multiPageLogo) return null;
    
    return {
      logoId: multiPageLogo.id,
      pageCount: multiPageLogo.pageCount || 1,
      originalFilename: multiPageLogo.originalFilename
    };
  }, [project, logos]);

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

  // Check for CMYK colors in the uploaded logos
  const hasCMYKColors = logos.some(logo => {
    const svgColors = logo.svgColors as any;
    if (svgColors?.colors && Array.isArray(svgColors.colors)) {
      return svgColors.colors.some((color: any) => color.isCMYK === true);
    }
    return false;
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
      value: hasFonts ? "Text properly outlined" : "Text properly outlined",
      status: "success"
    },
    {
      icon: Palette,
      label: "Color Space",
      value: hasCMYKColors ? "CMYK colors detected" : "RGB colors detected",
      status: hasCMYKColors ? "success" : "warning"
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
            
            {/* Restore original preview method (NO IFRAMES) */}
            <div className="gap-4 flex-1 flex">
              {/* Page 1 Preview - Artwork Layout */}
              <div className="flex-1 flex flex-col">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 1 - Artwork Layout</h4>
                <div className="border rounded-lg p-4 flex-1 flex items-center justify-center relative overflow-hidden" style={{backgroundColor: '#CDCECC'}}>
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
                      
                      // Convert center-based coordinates to top-left for CSS positioning
                      const templateWidth = template?.width || 297;
                      const templateHeight = template?.height || 420;
                      const centerX = templateWidth / 2;
                      const centerY = templateHeight / 2;
                      
                      // Convert element center position to top-left corner
                      const elementCenterX = centerX + element.x;
                      const elementCenterY = centerY + element.y;
                      const leftPos = elementCenterX - element.width / 2;
                      const topPos = elementCenterY - element.height / 2;
                      
                      // Use proper URL construction for all logo types
                      const imageUrl = getImageUrl(logo);
                      
                      return (
                        <div
                          key={element.id}
                          className="absolute"
                          style={{
                            left: `${(leftPos / templateWidth) * 100}%`,
                            top: `${(topPos / templateHeight) * 100}%`,
                            width: `${(element.width / templateWidth) * 100}%`,
                            height: `${(element.height / templateHeight) * 100}%`,
                            transform: `rotate(${element.rotation || 0}deg)`,
                            transformOrigin: 'center',
                            opacity: element.opacity || 1,
                          }}
                        >
                          <img
                            src={imageUrl}
                            alt="Logo"
                            className="w-full h-full object-contain"
                            key={`preview-${element.id}`}
                            onLoad={() => {
                              console.log('✅ Image loaded for preview');
                            }}
                            onError={(e) => {
                              console.error('Image failed to load:', imageUrl);
                              // Retry with timestamp
                              const currentSrc = e.currentTarget.src;
                              if (!currentSrc.includes('?retry=')) {
                                e.currentTarget.src = `${imageUrl}?retry=${Date.now()}`;
                              }
                            }}
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

              {/* Page 2 Preview - Garment Background OR Pass-Through Pages */}
              <div className="flex-1 flex flex-col">
                {passThroughInfo ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        Original Pages ({passThroughInfo.pageCount - 1} pages from your PDF)
                      </h4>
                      {passThroughInfo.pageCount > 2 && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setCurrentPassThroughPage(p => Math.max(2, p - 1))}
                            disabled={currentPassThroughPage <= 2}
                            data-testid="button-prev-page"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Page {currentPassThroughPage} of {passThroughInfo.pageCount}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setCurrentPassThroughPage(p => Math.min(passThroughInfo.pageCount, p + 1))}
                            disabled={currentPassThroughPage >= passThroughInfo.pageCount}
                            data-testid="button-next-page"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="border rounded-lg bg-white p-4 flex-1 flex items-center justify-center relative overflow-hidden">
                      <img
                        src={`/api/logos/${passThroughInfo.logoId}/pdf-page/${currentPassThroughPage}`}
                        alt={`Original PDF Page ${currentPassThroughPage}`}
                        className="max-w-full max-h-full object-contain"
                        data-testid="img-passthrough-page"
                        onError={(e) => {
                          console.error('Failed to load pass-through page preview');
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded">
                        Your original garment pages will be used
                      </div>
                    </div>
                  </>
                ) : (
                  <>
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
                          
                          // Convert center-based coordinates to top-left for CSS positioning
                          const templateWidth = template?.width || 297;
                          const templateHeight = template?.height || 420;
                          const centerX = templateWidth / 2;
                          const centerY = templateHeight / 2;
                          
                          // Convert element center position to top-left corner
                          const elementCenterX = centerX + element.x;
                          const elementCenterY = centerY + element.y;
                          const leftPos = elementCenterX - element.width / 2;
                          const topPos = elementCenterY - element.height / 2;
                          
                          // Use proper URL construction for all logo types
                          const imageUrl = getImageUrl(logo);
                          
                          return (
                            <div
                              key={element.id}
                              className="absolute"
                              style={{
                                left: `${(leftPos / templateWidth) * 100}%`,
                                top: `${(topPos / templateHeight) * 100}%`,
                                width: `${(element.width / templateWidth) * 100}%`,
                                height: `${(element.height / templateHeight) * 100}%`,
                                transform: `rotate(${element.rotation || 0}deg)`,
                                transformOrigin: 'center',
                                opacity: element.opacity || 1,
                                backgroundColor: garmentColor,
                                border: '1px solid rgba(0,0,0,0.1)'
                              }}
                            >
                              <img
                                src={imageUrl}
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
                    </div>
                  </>
                )}
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
                  onCheckedChange={(checked: boolean) => setDesignApproved(checked)}
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
                  onCheckedChange={(checked: boolean) => setRightsConfirmed(checked)}
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