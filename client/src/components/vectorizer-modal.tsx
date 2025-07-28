import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, AlertCircle } from "lucide-react";
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

  useEffect(() => {
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
      
      // Call our backend API which will handle vectorizer.ai integration
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
      setVectorSvg(result.svg);
      setIsProcessing(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vectorization failed');
      setIsProcessing(false);
    }
  };

  const handleApproveVector = () => {
    if (vectorSvg) {
      onVectorDownload(vectorSvg);
      onClose();
    }
  };

  const handleRetry = () => {
    processVectorization();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Vectorization: {fileName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Cost Information */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Vectorization Cost:</strong> ${cost.toFixed(2)} will be added to your order if you approve the result.
            </p>
          </div>

          {/* Processing State */}
          {isProcessing && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-lg font-medium">Processing with vectorizer.ai...</p>
              <p className="text-sm text-muted-foreground mt-2">
                A new window has opened. Please upload your file and configure the vectorization settings.
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
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Original */}
                <div>
                  <h3 className="font-semibold mb-2">Original Raster</h3>
                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                    <img 
                      src={previewUrl} 
                      alt="Original" 
                      className="max-w-full h-auto mx-auto"
                      style={{ maxHeight: '300px' }}
                    />
                  </div>
                </div>

                {/* Vectorized Preview */}
                <div>
                  <h3 className="font-semibold mb-2">Vectorized Result</h3>
                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                    {vectorSvg ? (
                      <div className="text-center py-8">
                        <p className="text-green-600 mb-4">✓ Vectorization Complete</p>
                        <p className="text-sm text-muted-foreground">
                          Vector result ready for download
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-sm">Generating vector...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Instructions:</strong> Use the vectorizer.ai window to upload your file and adjust settings. 
                  When satisfied with the preview, download the SVG and return here to approve the result.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4 border-t">
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