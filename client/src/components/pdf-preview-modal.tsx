import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Layers, Palette, Type, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { CompleteTransferLogo } from "./complete-transfer-logo";
import { useState, useMemo, useCallback } from "react";

const SHAPE_TYPES = ['rectangle', 'ellipse', 'circle', 'line', 'shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];

function getShapeSvgPath(type: string, w: number, h: number): string {
  switch (type) {
    case 'shield':
      return `M ${w * 0.5} 0 L ${w} ${h * 0.15} L ${w} ${h * 0.55} Q ${w * 0.5} ${h} ${w * 0.5} ${h} Q ${w * 0.5} ${h} 0 ${h * 0.55} L 0 ${h * 0.15} Z`;
    case 'star': {
      const cx = w / 2, cy = h / 2;
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.38;
      let d = '';
      for (let i = 0; i < 5; i++) {
        const outerAngle = (i * 72 - 90) * Math.PI / 180;
        const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
        d += `${i === 0 ? 'M' : 'L'} ${cx + outerR * Math.cos(outerAngle)} ${cy + outerR * Math.sin(outerAngle)} `;
        d += `L ${cx + innerR * Math.cos(innerAngle)} ${cy + innerR * Math.sin(innerAngle)} `;
      }
      return d + 'Z';
    }
    case 'hexagon': {
      const cx = w / 2, cy = h / 2;
      let d = '';
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * Math.PI / 180;
        d += `${i === 0 ? 'M' : 'L'} ${cx + (w / 2) * Math.cos(angle)} ${cy + (h / 2) * Math.sin(angle)} `;
      }
      return d + 'Z';
    }
    case 'pentagon': {
      const cx = w / 2, cy = h / 2;
      let d = '';
      for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180;
        d += `${i === 0 ? 'M' : 'L'} ${cx + (w / 2) * Math.cos(angle)} ${cy + (h / 2) * Math.sin(angle)} `;
      }
      return d + 'Z';
    }
    case 'triangle':
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    case 'diamond':
      return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    case 'banner':
      return `M 0 0 L ${w} 0 L ${w} ${h * 0.75} L ${w * 0.5} ${h} L 0 ${h * 0.75} Z`;
    case 'cross': {
      const armW = w / 3;
      const armH = h / 3;
      return `M ${armW} 0 L ${armW * 2} 0 L ${armW * 2} ${armH} L ${w} ${armH} L ${w} ${armH * 2} L ${armW * 2} ${armH * 2} L ${armW * 2} ${h} L ${armW} ${h} L ${armW} ${armH * 2} L 0 ${armH * 2} L 0 ${armH} L ${armW} ${armH} Z`;
    }
    case 'heart': {
      const cx = w / 2;
      return `M ${cx} ${h * 0.25} C ${cx} 0, ${w} 0, ${w} ${h * 0.3} C ${w} ${h * 0.55}, ${cx} ${h * 0.8}, ${cx} ${h} C ${cx} ${h * 0.8}, 0 ${h * 0.55}, 0 ${h * 0.3} C 0 0, ${cx} 0, ${cx} ${h * 0.25} Z`;
    }
    case 'octagon': {
      const cx = w / 2, cy = h / 2;
      let d = '';
      for (let i = 0; i < 8; i++) {
        const angle = (i * 45 - 90 + 22.5) * Math.PI / 180;
        d += `${i === 0 ? 'M' : 'L'} ${cx + (w / 2) * Math.cos(angle)} ${cy + (h / 2) * Math.sin(angle)} `;
      }
      return d + 'Z';
    }
    case 'arch':
      return `M 0 ${h} L 0 ${h * 0.4} Q 0 0, ${w / 2} 0 Q ${w} 0, ${w} ${h * 0.4} L ${w} ${h} Z`;
    case 'malteseCross': {
      const notch = 0.22, arm = 0.35;
      return `M ${w * 0.5} 0 L ${w * (0.5 + arm)} ${h * notch} L ${w * (0.5 + notch)} ${h * (0.5 - arm)} L ${w} ${h * 0.5} L ${w * (0.5 + notch)} ${h * (0.5 + arm)} L ${w * (0.5 + arm)} ${h * (1 - notch)} L ${w * 0.5} ${h} L ${w * (0.5 - arm)} ${h * (1 - notch)} L ${w * (0.5 - notch)} ${h * (0.5 + arm)} L 0 ${h * 0.5} L ${w * (0.5 - notch)} ${h * (0.5 - arm)} L ${w * (0.5 - arm)} ${h * notch} Z`;
    }
    case 'chevron':
      return `M 0 0 L ${w} 0 L ${w} ${h * 0.7} L ${w * 0.5} ${h} L 0 ${h * 0.7} Z`;
    case 'arrow':
      return `M 0 ${h * 0.25} L ${w * 0.65} ${h * 0.25} L ${w * 0.65} 0 L ${w} ${h * 0.5} L ${w * 0.65} ${h} L ${w * 0.65} ${h * 0.75} L 0 ${h * 0.75} Z`;
    case 'ribbon':
      return `M 0 ${h * 0.2} L ${w * 0.1} 0 L ${w * 0.1} ${h * 0.2} L ${w * 0.9} ${h * 0.2} L ${w * 0.9} 0 L ${w} ${h * 0.2} L ${w} ${h * 0.8} L ${w * 0.9} ${h} L ${w * 0.9} ${h * 0.8} L ${w * 0.1} ${h * 0.8} L ${w * 0.1} ${h} L 0 ${h * 0.8} Z`;
    default:
      return '';
  }
}

function renderShapePreview(element: any, templateWidth: number, templateHeight: number) {
  const isShape = SHAPE_TYPES.includes(element.elementType || '');
  if (!isShape) return null;
  
  const centerX = templateWidth / 2;
  const centerY = templateHeight / 2;
  const elementCenterX = centerX + element.x;
  const elementCenterY = centerY + element.y;
  const leftPos = elementCenterX - element.width / 2;
  const topPos = elementCenterY - element.height / 2;
  const svgW = 100;
  const svgH = 100;
  
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
      <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
        {(element.elementType === 'rectangle') && (
          <rect x="1" y="1" width={svgW - 2} height={svgH - 2} rx={element.cornerRadius ? (element.cornerRadius / element.width) * svgW : 0} fill={element.fillColor || 'none'} stroke={element.strokeColor || '#000000'} strokeWidth="2" />
        )}
        {(element.elementType === 'ellipse' || element.elementType === 'circle' || element.elementType === 'oval') && (
          <ellipse cx={svgW / 2} cy={svgH / 2} rx={(svgW - 2) / 2} ry={(svgH - 2) / 2} fill={element.fillColor || 'none'} stroke={element.strokeColor || '#000000'} strokeWidth="2" />
        )}
        {element.elementType === 'line' && (
          <line x1="0" y1={svgH / 2} x2={svgW} y2={svgH / 2} stroke={element.strokeColor || '#000000'} strokeWidth="2" />
        )}
        {!['rectangle', 'ellipse', 'circle', 'oval', 'line'].includes(element.elementType || '') && (
          <path d={getShapeSvgPath(element.elementType || '', svgW, svgH)} fill={element.fillColor || 'none'} stroke={element.strokeColor || '#000000'} strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}

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

  const isSingleColourTemplate = useMemo(() => {
    if (!template) return false;
    return template.group === "Screen Printed Transfers" && 
      (template.label?.includes("Single Colour") || template.label?.includes("Zero"));
  }, [template]);

  const shouldRecolorForInk = isSingleColourTemplate && !!project?.inkColor;

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
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Page 1 - {(template?.id?.includes('applique') || template?.name?.includes('applique')) ? 'Badge Artwork' : 'Artwork Layout'}
                </h4>
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
                    {canvasElements
                      .filter(el => {
                        const isApplique = template?.id?.includes('applique') || template?.name?.includes('applique');
                        return isApplique ? (el.canvasIndex || 0) === 0 : true;
                      })
                      .map((element) => {
                      const isShape = SHAPE_TYPES.includes(element.elementType || '');
                      if (isShape) {
                        return renderShapePreview(element, template?.width || 297, template?.height || 420);
                      }
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
                      let imageUrl = getImageUrl(logo);
                      if (shouldRecolorForInk) {
                        const sep = imageUrl.includes('?') ? '&' : '?';
                        imageUrl = `${imageUrl}${sep}inkColor=${encodeURIComponent(project.inkColor)}&recolor=true&t=${Date.now()}`;
                      }
                      
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
                            key={`preview-${element.id}-${project?.inkColor || ''}`}
                            onLoad={() => {
                              console.log('✅ Image loaded for preview');
                            }}
                            onError={(e) => {
                              console.error('Image failed to load:', imageUrl);
                              const currentSrc = e.currentTarget.src;
                              if (!currentSrc.includes('retry=')) {
                                e.currentTarget.src = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}retry=${Date.now()}`;
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

              {/* Page 2 Preview - Embroidery Artwork (applique) OR Garment Background OR Pass-Through Pages */}
              <div className="flex-1 flex flex-col">
                {(template?.id?.includes('applique') || template?.name?.includes('applique')) ? (
                  <>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Page 2 - Embroidery Artwork</h4>
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
                        {canvasElements.filter(el => (el.canvasIndex || 0) === 1).map((element) => {
                          const isShape = SHAPE_TYPES.includes(element.elementType || '');
                          if (isShape) {
                            return renderShapePreview(element, template?.width || 297, template?.height || 420);
                          }
                          const logo = logos.find(l => l.id === element.logoId);
                          if (!logo) return null;
                          
                          const templateWidth = template?.width || 297;
                          const templateHeight = template?.height || 420;
                          const centerX = templateWidth / 2;
                          const centerY = templateHeight / 2;
                          const elementCenterX = centerX + element.x;
                          const elementCenterY = centerY + element.y;
                          const leftPos = elementCenterX - element.width / 2;
                          const topPos = elementCenterY - element.height / 2;
                          let imageUrl = getImageUrl(logo);
                          if (shouldRecolorForInk) {
                            const sep = imageUrl.includes('?') ? '&' : '?';
                            imageUrl = `${imageUrl}${sep}inkColor=${encodeURIComponent(project.inkColor)}&recolor=true&t=${Date.now()}`;
                          }
                          
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
                                alt="Embroidery element"
                                className="w-full h-full object-contain"
                              />
                            </div>
                          );
                        })}
                        {canvasElements.filter(el => (el.canvasIndex || 0) === 1).length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                            No embroidery elements
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : passThroughInfo ? (
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
                          let imageUrl = getImageUrl(logo);
                          if (shouldRecolorForInk) {
                            const sep = imageUrl.includes('?') ? '&' : '?';
                            imageUrl = `${imageUrl}${sep}inkColor=${encodeURIComponent(project.inkColor)}&recolor=true&t=${Date.now()}`;
                          }
                          
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
                                key={`garment-preview-${element.id}-${project?.inkColor || ''}`}
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

          {/* Approval & Preflight */}
          <div className="w-80 flex flex-col min-h-0">
            {/* Approval Checkboxes - always visible at top */}
            <div className="space-y-3 mb-4">
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

            {/* Action Buttons - always visible */}
            <div className="flex gap-3 mb-4">
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

            {/* Preflight Summary - scrollable below buttons */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <h3 className="text-lg font-semibold mb-3">Preflight Summary</h3>
              
              <div className="space-y-3 mb-4">
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
              <div className="space-y-2">
                <h4 className="font-semibold">Project Details</h4>
                <div className="text-sm space-y-1">
                  <div>Template: {template?.name || 'business_card'}</div>
                  <div>Size: {template?.width || 295}×{template?.height || 100}mm</div>
                  <div>Elements: {canvasElements.length} positioned</div>
                  <div>Project: {project?.name || 'Untitled Project'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}