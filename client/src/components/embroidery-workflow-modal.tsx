import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Scissors, Upload, MousePointerClick, Copy, CheckSquare, FileUp, Loader2 } from "lucide-react";
import type { CanvasElement, Logo } from "@shared/schema";

type WorkflowStep = 'choose' | 'select-elements' | 'upload';

interface EmbroideryWorkflowModalProps {
  open: boolean;
  onClose: () => void;
  canvasElements: CanvasElement[];
  logos: Logo[];
  onSelectElements: (selectedElementIds: string[]) => void;
  onEnterElementSelectMode: () => void;
  onUploadFile: (file: File) => void;
  isProcessing?: boolean;
  hasSvgElements?: boolean;
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

export function EmbroideryWorkflowModal({
  open,
  onClose,
  canvasElements,
  logos,
  onSelectElements,
  onEnterElementSelectMode,
  onUploadFile,
  isProcessing = false,
  hasSvgElements = false,
}: EmbroideryWorkflowModalProps) {
  const [step, setStep] = useState<WorkflowStep>('choose');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleConfirmSelection = () => {
    onSelectElements(Array.from(selectedIds));
    setSelectedIds(new Set());
    setStep('choose');
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setStep('choose');
    onClose();
  };

  const handleEnterPrecisionMode = () => {
    handleClose();
    onEnterElementSelectMode();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      handleClose();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onUploadFile(file);
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Scissors className="w-5 h-5 text-purple-500" />
            Embroidery Artwork Setup
          </DialogTitle>
        </DialogHeader>

        {step === 'choose' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose how to add artwork to the Embroidery Canvas. These elements will be stitched onto the badge.
            </p>

            <div className="space-y-2">
              {hasSvgElements && (
                <button
                  onClick={handleEnterPrecisionMode}
                  className="w-full flex items-start gap-4 p-4 rounded-lg border border-border hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                    <MousePointerClick className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Select Individual Parts</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Click individual paths and shapes in your SVG artwork to pick exactly which parts get embroidered
                    </p>
                  </div>
                </button>
              )}

              {badgeElements.length > 0 && (
                <button
                  onClick={() => setStep('select-elements')}
                  className="w-full flex items-start gap-4 p-4 rounded-lg border border-border hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                    <Copy className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Copy Whole Elements</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select complete logos from the Badge Canvas to duplicate onto the Embroidery Canvas
                    </p>
                  </div>
                </button>
              )}

              <button
                onClick={() => setStep('upload')}
                className="w-full flex items-start gap-4 p-4 rounded-lg border border-border hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                  <Upload className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">Upload Embroidery File</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload a separate file (SVG, PDF, or image) specifically for the embroidery layer
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === 'select-elements' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose which elements to copy to the Embroidery Canvas. The originals will remain on the Badge Canvas.
            </p>

            {badgeElements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No elements on the Badge Canvas yet.</p>
                <p className="text-xs mt-1">Upload artwork first, then select elements for embroidery.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
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

                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
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
                          className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 pointer-events-none"
                        />

                        <div className="w-12 h-12 flex-shrink-0 bg-white rounded border overflow-hidden flex items-center justify-center">
                          {logo ? (
                            <img
                              src={getLogoThumbnailUrl(logo)}
                              alt={logo.originalName || 'Element'}
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : element.elementType === 'shape' ? (
                            <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                              <span className="text-lg">
                                {(element as any).shapeType === 'ellipse' ? '⬭' : (element as any).shapeType === 'line' ? '╱' : '▭'}
                              </span>
                            </div>
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                              {element.elementType === 'text' ? 'T' : '?'}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {logo?.originalName || element.textContent || (element.elementType === 'shape' ? `${(element as any).shapeType || 'Shape'}` : `Element`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(element.width)}mm x {Math.round(element.height)}mm
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

            <div className="flex justify-between gap-2 pt-3 border-t">
              <Button variant="ghost" onClick={() => setStep('choose')} disabled={isProcessing}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmSelection}
                  disabled={selectedIds.size === 0 || isProcessing}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy to Embroidery ({selectedIds.size})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a file to use as the embroidery artwork. This will be placed on the Embroidery Canvas.
            </p>

            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-border hover:border-blue-400 hover:bg-muted/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <FileUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Drop file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                SVG, PDF, PNG, JPG, AI, EPS
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,.pdf,.png,.jpg,.jpeg,.ai,.eps"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex justify-between pt-3 border-t">
              <Button variant="ghost" onClick={() => setStep('choose')}>
                Back
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
