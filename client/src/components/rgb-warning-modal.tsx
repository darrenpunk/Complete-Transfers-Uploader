import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RGBWarningModalProps {
  hasRGBColors: boolean;
  onClose: () => void;
}

export function RGBWarningModal({ hasRGBColors, onClose }: RGBWarningModalProps) {
  const [open, setOpen] = useState(false);
  const [hasShownWarning, setHasShownWarning] = useState(false);

  useEffect(() => {
    // Show warning only once per session when RGB colors are detected
    if (hasRGBColors && !hasShownWarning) {
      setOpen(true);
      setHasShownWarning(true);
    }
  }, [hasRGBColors, hasShownWarning]);

  const handleClose = () => {
    setOpen(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
            RGB Colors Detected
          </DialogTitle>
          <DialogDescription className="space-y-4 pt-4">
            <p>
              Your uploaded file contains RGB colors. Please note:
            </p>
            
            <div className="space-y-2 text-sm">
              <p className="font-semibold">• Color Shift Warning:</p>
              <p className="pl-4">
                RGB colors will be automatically converted to CMYK during production printing. 
                This conversion may cause noticeable color shifts, especially with bright or vibrant colors.
              </p>
              
              <p className="font-semibold">• Preview Feature:</p>
              <p className="pl-4">
                Use the "CMYK Preview" toggle in the color panel to see an approximation of how 
                your colors will look after conversion.
              </p>
              
              <p className="font-semibold">• Recommendation:</p>
              <p className="pl-4">
                For best results, we recommend using artwork that's already in CMYK color mode, 
                or adjusting your RGB colors using the color picker to achieve your desired appearance.
              </p>
            </div>
            
            <p className="text-xs text-gray-500 italic">
              This warning appears once per file upload. The actual printed colors may vary 
              from screen display due to the nature of CMYK printing.
            </p>
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-end mt-4">
          <Button onClick={handleClose}>
            I Understand
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}