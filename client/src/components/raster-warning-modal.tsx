import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Camera, Wand2, Users } from "lucide-react";
import { useState } from "react";

interface RasterWarningModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  onPhotographicApprove: () => void;
  onVectorizeWithAI: () => void;
  onVectorizeWithService: () => void;
}

export function RasterWarningModal({
  open,
  onClose,
  fileName,
  onPhotographicApprove,
  onVectorizeWithAI,
  onVectorizeWithService
}: RasterWarningModalProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleOptionSelect = (option: string) => {
    setSelectedOption(option);
    
    switch (option) {
      case 'photographic':
        onPhotographicApprove();
        break;
      case 'ai-vectorize':
        onVectorizeWithAI();
        break;
      case 'service-vectorize':
        onVectorizeWithService();
        break;
    }
    
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
            Raster File Detected: {fileName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              This file is a raster image (PNG/JPEG). For best print quality, vector files (SVG/PDF) are recommended. 
              Please choose how you'd like to proceed:
            </p>
          </div>

          <div className="grid gap-4">
            {/* Option 1: Photographic Content */}
            <div className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                  <Camera className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">Photographic Content</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    This is a photograph or image with complex details that doesn't need vectorization.
                    It's suitable for full-color printing as-is.
                  </p>
                  <Button 
                    onClick={() => handleOptionSelect('photographic')}
                    variant="outline"
                    className="w-full"
                  >
                    Import as Photographic Content
                  </Button>
                </div>
              </div>
            </div>

            {/* Option 2: AI Vectorization */}
            <div className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                  <Wand2 className="h-6 w-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">AI Vectorization</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    This is a logo or simple graphic that can be automatically converted to vector format.
                    Uses vectorizer.ai for instant conversion with preview.
                  </p>
                  <Button 
                    onClick={() => handleOptionSelect('ai-vectorize')}
                    variant="outline"
                    className="w-full"
                  >
                    Vectorize with AI Tool
                  </Button>
                </div>
              </div>
            </div>

            {/* Option 3: Professional Service */}
            <div className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">Professional Vectorization Service</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Complex logo requiring manual vectorization by our design team.
                    Places a placeholder and adds vectorization charge to order.
                  </p>
                  <Button 
                    onClick={() => handleOptionSelect('service-vectorize')}
                    variant="outline"
                    className="w-full"
                  >
                    Request Vectorization Service
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="ghost" onClick={onClose}>
              Cancel Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}