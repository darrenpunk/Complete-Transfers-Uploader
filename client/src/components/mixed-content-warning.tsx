/**
 * Mixed Content Warning Component
 * Displays warnings when PDFs contain both vector and raster content
 * Production Flow Requirement 6: Mixed content handling with warnings
 */

import { AlertTriangle, FileImage, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompleteTransferLogo } from './ui/complete-transfer-logo';

interface MixedContentWarningProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  rasterCount: number;
  vectorTypes: string[];
  onContinueAsVector: () => void;
  onVectorizeRasterElements?: () => void;
}

export function MixedContentWarning({
  open,
  onClose,
  fileName,
  rasterCount,
  vectorTypes,
  onContinueAsVector,
  onVectorizeRasterElements
}: MixedContentWarningProps) {
  
  const handleContinueAsVector = () => {
    console.log('📋 Production Flow Requirement 6: User acknowledged mixed content warning for:', fileName);
    onContinueAsVector();
    onClose();
  };

  const handleVectorizeRaster = () => {
    if (onVectorizeRasterElements) {
      console.log('🎯 Production Flow: User chose to vectorize raster elements in mixed content file:', fileName);
      onVectorizeRasterElements();
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 text-amber-600 justify-center">
            <Layers className="h-5 w-5" />
            Mixed Content Detected: {fileName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
              This file contains both vector and raster content. Some elements may not print at optimal quality.
            </p>
            
            <div className="bg-white/50 dark:bg-gray-800/50 rounded p-3 border-l-4 border-amber-400 mb-4">
              <div className="flex items-start gap-3">
                <FileImage className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Content Analysis</h4>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <li>• <strong>{rasterCount}</strong> raster image{rasterCount !== 1 ? 's' : ''} detected</li>
                    <li>• Vector elements: {vectorTypes.join(', ')}</li>
                    <li>• Recommendation: Vectorize raster elements for best quality</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Production Note:</strong> Vector elements will print at full quality. 
                Raster elements may appear pixelated when printed at large sizes.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {/* Option 1: Continue as Vector (with warning acknowledgment) */}
            <div className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
                  <Layers className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">Continue as Vector File</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Proceed with the file as-is. Vector elements will be high quality, 
                    but raster elements may have limited resolution.
                  </p>
                  <Button 
                    onClick={handleContinueAsVector}
                    variant="outline"
                    className="w-full"
                  >
                    Continue with Mixed Content
                  </Button>
                </div>
              </div>
            </div>

            {/* Option 2: Vectorize Raster Elements (if available) */}
            {onVectorizeRasterElements && (
              <div className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">Vectorize Raster Elements</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Convert the raster images within this file to vector format for 
                      consistent high-quality printing.
                    </p>
                    <Button 
                      onClick={handleVectorizeRaster}
                      className="w-full"
                    >
                      Vectorize Raster Content
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground bg-gray-50 dark:bg-gray-800 rounded p-3">
            <p className="mb-2"><strong>Mixed Content Details:</strong></p>
            <ul className="space-y-1">
              <li>• Vector content will maintain sharp edges at any size</li>
              <li>• Raster content resolution is fixed and may pixelate when enlarged</li>
              <li>• For best results, ensure all artwork is vectorized before final production</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}