import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, Download, AlertCircle, ZoomIn, ZoomOut, Maximize2, Grid, Palette, Wand2 } from "lucide-react";
import { useState, useEffect } from "react";

interface VectorizerModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  imageFile: File;
  onVectorDownload: (vectorSvg: string) => void;
}

export function VectorizerModal({
  open,
  onClose,
  fileName,
  imageFile,
  onVectorDownload
}: VectorizerModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [vectorSvg, setVectorSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number>(2.50); // Base vectorization cost
  const [zoom, setZoom] = useState<number>(100); // Zoom percentage
  const [showGrid, setShowGrid] = useState<boolean>(true); // Show transparency grid
  const [showPalette, setShowPalette] = useState<boolean>(false); // Show color palette
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [coloredSvg, setColoredSvg] = useState<string | null>(null);

  // Debug logging
  console.log('VectorizerModal render:', { open, fileName, hasImageFile: !!imageFile });

  useEffect(() => {
    console.log('VectorizerModal useEffect:', { open, hasImageFile: !!imageFile, fileName });
    if (open && imageFile) {
      processVectorization();
    }
  }, [open, imageFile]);

  const processVectorization = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Show preview of original image
      const imageUrl = URL.createObjectURL(imageFile);
      setPreviewUrl(imageUrl);
      
      // Call our backend API which will handle vectorization
      const formData = new FormData();
      formData.append('image', imageFile);
      
      const response = await fetch('/api/vectorize', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Vectorization failed');
      }
      
      const result = await response.json();
      console.log('Received SVG:', result.svg?.substring(0, 200) + '...');
      setVectorSvg(result.svg);
      setColoredSvg(null); // Don't initialize colored SVG
      setShowPalette(true); // Show palette when vector is ready
      setIsProcessing(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vectorization failed');
      setIsProcessing(false);
    }
  };

  const handleApproveVector = () => {
    const svgToDownload = coloredSvg || vectorSvg;
    console.log('handleApproveVector called', { 
      hasColoredSvg: !!coloredSvg, 
      hasVectorSvg: !!vectorSvg,
      svgLength: svgToDownload?.length 
    });
    if (svgToDownload) {
      console.log('Calling onVectorDownload');
      onVectorDownload(svgToDownload);
      onClose();
    }
  };

  // Function to apply color to SVG
  const applyColorToSvg = (svg: string, color: string) => {
    // Parse the SVG and update all fill attributes except for 'none'
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    
    // Find all elements with fill attribute
    const elements = doc.querySelectorAll('*[fill]:not([fill="none"])');
    elements.forEach(el => {
      el.setAttribute('fill', color);
    });
    
    // Also update stroke for outlined elements
    const strokeElements = doc.querySelectorAll('*[stroke]:not([stroke="none"])');
    strokeElements.forEach(el => {
      el.setAttribute('stroke', color);
    });
    
    return new XMLSerializer().serializeToString(doc.documentElement);
  };

  const handleRetry = () => {
    processVectorization();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>AI Vectorization: {fileName}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowGrid(!showGrid)}
                title="Toggle transparency grid"
              >
                <Grid className={`h-4 w-4 ${showGrid ? 'text-primary' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPalette(!showPalette)}
                title="Toggle color palette"
              >
                <Palette className={`h-4 w-4 ${showPalette ? 'text-primary' : ''}`} />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Cost Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex-shrink-0">
            <p className="text-sm text-blue-800">
              <strong>Vectorization Cost:</strong> ${cost.toFixed(2)} will be added to your order if you approve the result.
            </p>
          </div>

          {/* Processing State */}
          {isProcessing && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-lg font-medium">Processing image vectorization...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Converting your raster image to vector format. This may take a moment.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-500" />
              <p className="text-lg font-medium text-red-600">Vectorization Failed</p>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
              <Button onClick={handleRetry} className="mt-4">
                Try Again
              </Button>
            </div>
          )}

          {/* Preview State */}
          {previewUrl && !isProcessing && !error && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Zoom Controls */}
              <div className="flex items-center justify-center gap-4 mb-4 flex-shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom(Math.max(25, zoom - 25))}
                  disabled={zoom <= 25}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2 min-w-[200px]">
                  <Slider
                    value={[zoom]}
                    onValueChange={(value) => setZoom(value[0])}
                    min={25}
                    max={400}
                    step={25}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-12">{zoom}%</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom(Math.min(400, zoom + 25))}
                  disabled={zoom >= 400}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom(100)}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Color Palette */}
              {showPalette && vectorSvg && (
                <div className="flex items-center gap-4 mb-4 p-4 bg-gray-100 rounded-lg flex-shrink-0">
                  <span className="text-sm font-medium text-gray-900">Color Presets:</span>
                  <div className="flex gap-2">
                    {['#000000', '#FFFFFF', '#5B9BD5', '#ED7D31', '#70AD47', '#FFC000'].map((color) => (
                      <button
                        key={color}
                        className={`w-8 h-8 rounded-full border-2 ${selectedColor === color ? 'border-primary' : 'border-gray-300'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setSelectedColor(color);
                          const newSvg = applyColorToSvg(vectorSvg, color);
                          setColoredSvg(newSvg);
                        }}
                      />
                    ))}
                    <button
                      className="px-3 py-1 text-sm border rounded"
                      onClick={() => {
                        setSelectedColor(null);
                        setColoredSvg(vectorSvg);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
                {/* Original */}
                <div className="flex flex-col overflow-hidden">
                  <h3 className="font-semibold mb-2 text-center">Original Image</h3>
                  <div 
                    className={`flex-1 border rounded-lg overflow-auto ${
                      showGrid ? 'transparency-grid' : 'bg-white'
                    }`}
                  >
                    <div 
                      className="p-8 flex items-center justify-center min-h-full"
                      style={{ 
                        transform: `scale(${zoom / 100})`,
                        transformOrigin: 'center',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <img 
                        src={previewUrl} 
                        alt="Original" 
                        className="max-w-none"
                        style={{ imageRendering: zoom > 200 ? 'pixelated' : 'auto' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Vectorized Preview */}
                <div className="flex flex-col overflow-hidden">
                  <h3 className="font-semibold mb-2 text-center">Vectorized Result</h3>
                  <div 
                    className={`flex-1 border rounded-lg overflow-auto ${
                      showGrid ? 'transparency-grid' : 'bg-white'
                    }`}
                  >
                    {(coloredSvg || vectorSvg) ? (
                      <div 
                        className="p-8 flex items-center justify-center min-h-full"
                        style={{ 
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s ease'
                        }}
                      >
                        <div 
                          className="vector-preview-wrapper"
                          style={{ width: 'auto', height: 'auto' }}
                          dangerouslySetInnerHTML={{ __html: coloredSvg || vectorSvg || '' }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                          <p className="text-sm">Generating vector...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4 flex-shrink-0">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Tip:</strong> Use the zoom controls to inspect details. The transparency grid helps you see which parts of the image have been made transparent.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4 mt-4 border-t flex-shrink-0">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            
            <div className="flex gap-3">
              {vectorSvg && (
                <Button onClick={handleApproveVector} className="bg-green-600 hover:bg-green-700">
                  <Download className="h-4 w-4 mr-2" />
                  Approve & Download (${cost.toFixed(2)})
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}