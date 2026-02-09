import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PaintBucket, Palette } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CompleteTransferLogo from "./complete-transfer-logo";
import InkDropSwatch from "@/components/ui/ink-drop-swatch";

interface InkColorModalProps {
  currentColor: string | null;
  onColorChange: (color: string) => void;
  trigger?: React.ReactNode;
  autoOpen?: boolean;
  templateId?: string; // Optional template ID to filter colors
}

// Official Pantone ink colors from the chart - Updated Jan 2026
// Order matches the official OT color chart grid
const inkColors = [
  // Row 1: OT 91, OT 100, OT 155, OT 156, OT 10, OT 20, OT 22, OT 24, OT 26
  { name: "White", otCode: "OT 91", pantone: "WHITE 91", hex: "#FFFFFF", rgb: "255, 255, 255", cmyk: "0, 0, 0, 0", inkType: "Spot" },
  { name: "Black", otCode: "OT 100", pantone: "BLACK 100", hex: "#201F1E", rgb: "32, 31, 30", cmyk: "68, 59, 46, 86", inkType: "Spot" },
  { name: "Pantone 428 C", otCode: "OT 155", pantone: "PANTONE 428 C", hex: "#C0C4C6", rgb: "192, 196, 198", cmyk: "26, 17, 15, 0", inkType: "Spot" },
  { name: "Pantone 445 C", otCode: "OT 156", pantone: "PANTONE 445 C", hex: "#515859", rgb: "81, 88, 89", cmyk: "61, 45, 42, 44", inkType: "Spot" },
  { name: "Pantone 2102 C", otCode: "OT 10", pantone: "PANTONE 2102 C", hex: "#5F58AD", rgb: "95, 88, 173", cmyk: "72, 69, 0, 0", inkType: "Spot" },
  { name: "Pantone 7687 C", otCode: "OT 20", pantone: "PANTONE 7687 C", hex: "#294487", rgb: "41, 68, 135", cmyk: "96, 73, 0, 14", inkType: "Spot" },
  { name: "Pantone 7461 C", otCode: "OT 22", pantone: "PANTONE 7461 C", hex: "#217B87", rgb: "34, 123, 183", cmyk: "94, 34, 4, 2", inkType: "Spot" },
  { name: "Pantone 4151 C", otCode: "OT 24", pantone: "PANTONE 4151 C", hex: "#1F66A0", rgb: "31, 102, 169", cmyk: "97, 49, 1, 5", inkType: "Spot" },
  { name: "Pantone 2202 C", otCode: "OT 26", pantone: "PANTONE 2202 C", hex: "#00A1DD", rgb: "0, 161, 221", cmyk: "94, 3, 3, 0", inkType: "Spot" },
  
  // Row 2: OT 27, OT 96, OT 30, OT 31, OT 32, OT 33, OT 34, OT 40, OT 41
  { name: "Pantone 2229 C", otCode: "OT 27", pantone: "PANTONE 2229 C", hex: "#0099B6", rgb: "0, 152, 182", cmyk: "100, 0, 24, 0", inkType: "Spot" },
  { name: "Pantone 2965 C", otCode: "OT 96", pantone: "PANTONE 2965 C", hex: "#132A3F", rgb: "19, 42, 63", cmyk: "92, 53, 15, 74", inkType: "Spot" },
  { name: "Pantone 7734 C", otCode: "OT 30", pantone: "PANTONE 7734 C", hex: "#406044", rgb: "64, 96, 68", cmyk: "81, 41, 78, 25", inkType: "Spot" },
  { name: "Pantone 7724 C", otCode: "OT 31", pantone: "PANTONE 7724 C", hex: "#4E926E", rgb: "78, 146, 110", cmyk: "81, 15, 67, 0", inkType: "Spot" },
  { name: "Pantone 7489 C", otCode: "OT 32", pantone: "PANTONE 7489 C", hex: "#83A756", rgb: "131, 167, 86", cmyk: "59, 11, 81, 0", inkType: "Spot" },
  { name: "Pantone 7482 C", otCode: "OT 33", pantone: "PANTONE 7482 C", hex: "#3E9B54", rgb: "62, 155, 84", cmyk: "88, 1, 87, 0", inkType: "Spot" },
  { name: "Pantone 376 C", otCode: "OT 34", pantone: "PANTONE 376 C", hex: "#93BA1E", rgb: "147, 186, 30", cmyk: "53, 0, 100, 0", inkType: "Spot" },
  { name: "Pantone 107 C", otCode: "OT 40", pantone: "PANTONE 107 C", hex: "#F3DF41", rgb: "243, 223, 65", cmyk: "3, 6, 86, 0", inkType: "Spot" },
  { name: "Pantone 115 C", otCode: "OT 41", pantone: "PANTONE 115 C", hex: "#F3D83E", rgb: "243, 216, 62", cmyk: "0, 11, 86, 0", inkType: "Spot" },
  
  // Row 3: OT 42, OT 50, OT 51, OT 56, OT 60, OT 61, OT 70, OT 80, OT 81
  { name: "Pantone 123 C", otCode: "OT 42", pantone: "PANTONE 123 C", hex: "#F3C53F", rgb: "243, 197, 63", cmyk: "0, 23, 84, 0", inkType: "Spot" },
  { name: "Pantone 165 C", otCode: "OT 50", pantone: "PANTONE 165 C", hex: "#E66828", rgb: "230, 104, 40", cmyk: "0, 71, 93, 0", inkType: "Spot" },
  { name: "Pantone 1655 C", otCode: "OT 51", pantone: "PANTONE 1655 C", hex: "#DF4E10", rgb: "223, 78, 16", cmyk: "0, 79, 93, 0", inkType: "Spot" },
  { name: "Pantone 179 C", otCode: "OT 56", pantone: "PANTONE 179 C", hex: "#C53F33", rgb: "197, 63, 51", cmyk: "3, 85, 81, 0", inkType: "Spot" },
  { name: "Pantone 1797 C", otCode: "OT 60", pantone: "PANTONE 1797 C", hex: "#B3363C", rgb: "179, 54, 60", cmyk: "14, 90, 74, 0", inkType: "Spot" },
  { name: "Pantone 1788 C", otCode: "OT 61", pantone: "PANTONE 1788 C", hex: "#D02E39", rgb: "208, 46, 57", cmyk: "0, 92, 77, 0", inkType: "Spot" },
  { name: "Pantone 674 C", otCode: "OT 70", pantone: "PANTONE 674 C", hex: "#B25796", rgb: "178, 87, 150", cmyk: "18, 76, 2, 0", inkType: "Spot" },
  { name: "Pantone 1817 C", otCode: "OT 80", pantone: "PANTONE 1817 C", hex: "#5B3637", rgb: "91, 54, 55", cmyk: "50, 80, 65, 39", inkType: "Spot" },
  { name: "Pantone 1255 C", otCode: "OT 81", pantone: "PANTONE 1255 C", hex: "#A2832D", rgb: "162, 131, 45", cmyk: "33, 46, 96, 2", inkType: "Spot" },
  
  // Row 4: OT 120, OT 110 (Metallics)
  { name: "Pantone 871 C Gold", otCode: "OT 120", pantone: "PANTONE 871 C", hex: "#83754E", rgb: "131, 117, 78", cmyk: "49, 49, 74, 7", inkType: "Metallic" },
  { name: "Pantone 877 C Silver", otCode: "OT 110", pantone: "PANTONE 877 C", hex: "#8C8E91", rgb: "140, 142, 145", cmyk: "43, 33, 29, 13", inkType: "Metallic" }
];

function getColorName(hex: string): string {
  const color = inkColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  return color ? `${color.otCode} ${color.name}` : hex;
}

export default function InkColorModal({ currentColor, onColorChange, trigger, autoOpen = false, templateId }: InkColorModalProps) {
  const [open, setOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  // Filter colors based on template type
  const getAvailableColors = () => {
    // For reflective templates, only show silver
    if (templateId?.includes('reflective')) {
      return inkColors.filter(color => color.name.toLowerCase().includes('silver'));
    }
    
    // For Zero templates, show specific Zero ink colors only
    if (templateId?.includes('zero')) {
      const zeroColors = [
        'OT 91', 'OT 20', 'OT 30', 'OT 33', 'OT 40', 'OT 42', 
        'OT 51', 'OT 60', 'OT 61', 'OT 70', 'OT 120', 'OT 110'
      ];
      return inkColors.filter(color => zeroColors.includes(color.otCode));
    }
    
    // For all other templates, show all colors
    return inkColors;
  };

  const availableColors = getAvailableColors();

  // Auto-open modal when autoOpen is true and no color is selected (only once)
  useEffect(() => {
    if (autoOpen && !currentColor && !hasAutoOpened) {
      setOpen(true);
      setHasAutoOpened(true);
    }
  }, [autoOpen, currentColor, hasAutoOpened]);

  // Reset hasAutoOpened when currentColor changes to a valid color
  useEffect(() => {
    if (currentColor && hasAutoOpened) {
      setHasAutoOpened(false);
    }
  }, [currentColor, hasAutoOpened]);

  const handleColorSelect = (color: string) => {
    onColorChange(color);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="w-full">
            <Palette className="w-4 h-4 mr-2" />
            Select Ink Color
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 justify-center">
            <PaintBucket className="w-5 h-5" />
            Select Ink Color
            {!currentColor && <span className="text-red-500 text-sm font-normal">*Required</span>}
          </DialogTitle>
          <DialogDescription className="text-center">
            Please select the colour of the ink that your graphics will be printed with. For single colour transfers the selection of this colour is important as this is what our print staff see when they process your job regardless if the colour you have set in your artwork file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!currentColor && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">
                ⚠️ Please select an ink color to continue
              </p>
              <p className="text-xs text-red-600 mt-1">
                Choose from the professional ink colors below. Your artwork will be recolored to match your selection.
              </p>
            </div>
          )}

          {/* Ink Colors Grid */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Official Pantone Ink Colors</h4>
            <div className="grid grid-cols-8 gap-4">
              {availableColors.map((color) => (
                <TooltipProvider key={`${color.hex}-${color.otCode}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <InkDropSwatch
                          color={color.hex}
                          colorName={color.name}
                          isSelected={currentColor === color.hex}
                          onClick={() => handleColorSelect(color.hex)}
                          otCode={color.otCode}
                          variant={color.otCode === 'OT 91' ? 'drop1' : color.otCode === 'OT 100' ? 'drop2' : 'drop3'}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="text-sm">
                        <div className="flex items-center gap-3 mb-2">
                          <div 
                            className="w-10 h-10 border border-gray-300 rounded-sm shadow-sm"
                            style={{ backgroundColor: color.hex }}
                          />
                          <div>
                            <div className="font-semibold text-gray-900">{color.otCode} {color.name}</div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-600">
                          <div>HEX: <span className="font-mono">{color.hex}</span></div>
                          <div>RGB: <span className="font-mono">{color.rgb}</span></div>
                          <div>CMYK: <span className="font-mono">{color.cmyk}</span></div>
                          <div>Type: <span className="font-mono">{color.inkType}</span></div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>

          {/* Current Selection Display */}
          <div className="border-t pt-4">
            <div className="text-sm text-gray-600 mb-3">
              Selected: <span className={`font-medium ${!currentColor ? 'text-red-500' : ''}`}>
                {currentColor ? getColorName(currentColor) : 'None selected'}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { getColorName, inkColors };