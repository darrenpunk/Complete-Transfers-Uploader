import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Scissors, CheckSquare, Square, Circle, Minus as MinusIcon, Triangle, Shield, Star, Hexagon, Pentagon, Heart, Octagon, ChevronRight, ArrowRight, Shapes } from "lucide-react";
import type { CanvasElement, Logo } from "@shared/schema";

const SHAPE_TYPES = ['rectangle', 'ellipse', 'circle', 'line', 'shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];

interface EmbroideryElementSelectorProps {
  open: boolean;
  onClose: () => void;
  canvasElements: CanvasElement[];
  logos: Logo[];
  onConfirm: (selectedElementIds: string[]) => void;
  isProcessing?: boolean;
}

function getLogoThumbnailUrl(logo: Logo): string {
  if ((logo as any).isComplexFilePngFallback) {
    return `/uploads/${logo.filename}`;
  }
  if (logo.mimeType === 'application/pdf') {
    if ((logo as any).previewFilename) {
      return `/uploads/${(logo as any).previewFilename}`;
    }
    if (logo.filename.endsWith('.svg')) {
      return `/uploads/${logo.filename}`;
    }
    return `/uploads/${logo.filename}.svg`;
  }
  return `/uploads/${logo.filename}`;
}

export function EmbroideryElementSelector({
  open,
  onClose,
  canvasElements,
  logos,
  onConfirm,
  isProcessing = false
}: EmbroideryElementSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const badgeElements = canvasElements.filter(el => (el.canvasIndex || 0) === 0 && el.isVisible);

  const toggleElement = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(badgeElements.map(el => el.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5 text-purple-500" />
            Select Elements for Embroidery
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-3">
          Choose which elements to copy to the Embroidery Canvas. The originals will remain on the Badge Canvas.
        </p>

        {badgeElements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No elements on the Badge Canvas yet.</p>
            <p className="text-xs mt-1">Upload artwork first, then select elements for embroidery.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} of {badgeElements.length} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs h-7">
                  Clear
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {badgeElements.map((element) => {
                const logo = logos.find(l => l.id === element.logoId);
                const isSelected = selectedIds.has(element.id);

                return (
                  <div
                    key={element.id}
                    onClick={() => toggleElement(element.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleElement(element.id)}
                      className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                    />

                    <div className="w-14 h-14 flex-shrink-0 bg-white rounded border overflow-hidden flex items-center justify-center">
                      {logo ? (
                        <img
                          src={getLogoThumbnailUrl(logo)}
                          alt={logo.originalName || 'Element'}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : SHAPE_TYPES.includes(element.elementType || '') ? (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          {(() => {
                            switch (element.elementType) {
                              case 'rectangle': return <Square className="w-8 h-8" />;
                              case 'ellipse': case 'circle': return <Circle className="w-8 h-8" />;
                              case 'line': return <MinusIcon className="w-8 h-8" />;
                              case 'triangle': return <Triangle className="w-8 h-8" />;
                              case 'shield': return <Shield className="w-8 h-8" />;
                              case 'star': return <Star className="w-8 h-8" />;
                              case 'hexagon': return <Hexagon className="w-8 h-8" />;
                              case 'pentagon': return <Pentagon className="w-8 h-8" />;
                              case 'diamond': return <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 L22 12 L12 22 L2 12 Z" /></svg>;
                              case 'banner': return <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v12l-3-2-5 3-5-3-3 2V4z" /></svg>;
                              case 'cross': return <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v8H2v4h6v8h4v-8h6v-4h-6V2H8z" /></svg>;
                              case 'oval': return <Circle className="w-8 h-8" />;
                              case 'heart': return <Heart className="w-8 h-8" />;
                              case 'octagon': return <Octagon className="w-8 h-8" />;
                              case 'arch': return <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22V10a8 8 0 0 1 16 0v12" /></svg>;
                              case 'malteseCross': return <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l4 5-3 2h0l5 3-5 4-2-3v0l-3 5-4-5 3-2h0l-5-3 5-4 2 3v0z" /></svg>;
                              case 'chevron': return <ChevronRight className="w-8 h-8" />;
                              case 'arrow': return <ArrowRight className="w-8 h-8" />;
                              case 'ribbon': return <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8l2-4h12l2 4v8l-2 4H6l-2-4V8z" /></svg>;
                              default: return <Shapes className="w-8 h-8" />;
                            }
                          })()}
                        </div>
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          {element.elementType === 'text' ? 'T' : '?'}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {logo?.originalName || (SHAPE_TYPES.includes(element.elementType || '') ? (element.elementType || 'Shape').charAt(0).toUpperCase() + (element.elementType || 'shape').slice(1) : element.textContent || `Element ${element.id.slice(0, 8)}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(element.width)}mm × {Math.round(element.height)}mm
                        {element.rotation ? ` · ${element.rotation}°` : ''}
                      </p>
                    </div>

                    {isSelected && (
                      <CheckSquare className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || isProcessing}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isProcessing ? (
              'Processing...'
            ) : (
              <>
                <Scissors className="w-4 h-4 mr-1" />
                Copy to Embroidery ({selectedIds.size})
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
