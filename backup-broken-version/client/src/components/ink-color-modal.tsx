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
}

// Official Pantone ink colors from the chart
const inkColors = [
  // Row 1
  { name: "White", otCode: "OT 91", pantone: "WHITE", hex: "#FFFFFF", rgb: "255, 255, 255", cmyk: "0, 0, 0, 0", inkType: "Spot" },
  { name: "Black", otCode: "OT 100", pantone: "BLACK", hex: "#000000", rgb: "0, 0, 0", cmyk: "0, 0, 0, 100", inkType: "Spot" },
  { name: "Pantone 428C", otCode: "OT 155", pantone: "PANTONE 428C", hex: "#C7C9C7", rgb: "199, 201, 199", cmyk: "22, 17, 18, 0", inkType: "Pantone" },
  { name: "Pantone 445C", otCode: "OT 156", pantone: "PANTONE 445C", hex: "#7A7C7A", rgb: "122, 124, 122", cmyk: "50, 42, 44, 8", inkType: "Pantone" },
  { name: "Pantone 2102C", otCode: "OT 10", pantone: "PANTONE 2102C", hex: "#5A4FCF", rgb: "90, 79, 207", cmyk: "66, 74, 0, 0", inkType: "Pantone" },
  { name: "Pantone 3548C", otCode: "OT 20", pantone: "PANTONE 3548C", hex: "#00509D", rgb: "0, 80, 157", cmyk: "100, 75, 0, 2", inkType: "Pantone" },
  { name: "Pantone 2383C", otCode: "OT 22", pantone: "PANTONE 2383C", hex: "#0077BE", rgb: "0, 119, 190", cmyk: "85, 37, 0, 0", inkType: "Pantone" },
  { name: "Pantone 4151C", otCode: "OT 24", pantone: "PANTONE 4151C", hex: "#4682B4", rgb: "70, 130, 180", cmyk: "68, 30, 0, 0", inkType: "Pantone" },
  { name: "Pantone 2191C", otCode: "OT 26", pantone: "PANTONE 2191C", hex: "#87CEEB", rgb: "135, 206, 235", cmyk: "43, 12, 0, 0", inkType: "Pantone" },
  
  // Row 2
  { name: "Pantone 2396C", otCode: "OT 27", pantone: "PANTONE 2396C", hex: "#5DADE2", rgb: "93, 173, 226", cmyk: "59, 23, 0, 0", inkType: "Pantone" },
  { name: "Pantone 2965C", otCode: "OT 96", pantone: "PANTONE 2965C", hex: "#2C3E50", rgb: "44, 62, 80", cmyk: "75, 62, 45, 25", inkType: "Pantone" },
  { name: "Pantone 7734C", otCode: "OT 30", pantone: "PANTONE 7734C", hex: "#556B2F", rgb: "85, 107, 47", cmyk: "65, 45, 100, 20", inkType: "Pantone" },
  { name: "Pantone 7739C", otCode: "OT 31", pantone: "PANTONE 7739C", hex: "#6B8E23", rgb: "107, 142, 35", cmyk: "55, 30, 100, 5", inkType: "Pantone" },
  { name: "Pantone 7489C", otCode: "OT 32", pantone: "PANTONE 7489C", hex: "#8FBC8F", rgb: "143, 188, 143", cmyk: "40, 10, 50, 0", inkType: "Pantone" },
  { name: "Pantone 7482C", otCode: "OT 33", pantone: "PANTONE 7482C", hex: "#32CD32", rgb: "50, 205, 50", cmyk: "60, 0, 85, 0", inkType: "Pantone" },
  { name: "Pantone 376C", otCode: "OT 34", pantone: "PANTONE 376C", hex: "#9ACD32", rgb: "154, 205, 50", cmyk: "40, 0, 85, 0", inkType: "Pantone" },
  { name: "Pantone 604C", otCode: "OT 40", pantone: "PANTONE 604C", hex: "#FFD500", rgb: "255, 213, 0", cmyk: "0, 15, 100, 0", inkType: "Pantone" },
  { name: "Pantone 115C", otCode: "OT 41", pantone: "PANTONE 115C", hex: "#FFFF00", rgb: "255, 255, 0", cmyk: "0, 0, 100, 0", inkType: "Pantone" },
  
  // Row 3
  { name: "Pantone 123C", otCode: "OT 42", pantone: "PANTONE 123C", hex: "#FFC72C", rgb: "255, 199, 44", cmyk: "0, 22, 83, 0", inkType: "Pantone" },
  { name: "Pantone 1595C", otCode: "OT 50", pantone: "PANTONE 1595C", hex: "#D2691E", rgb: "210, 105, 30", cmyk: "0, 65, 95, 0", inkType: "Pantone" },
  { name: "Pantone 1665C", otCode: "OT 51", pantone: "PANTONE 1665C", hex: "#B22222", rgb: "178, 34, 34", cmyk: "15, 95, 100, 5", inkType: "Pantone" },
  { name: "Pantone 179C", otCode: "OT 56", pantone: "PANTONE 179C", hex: "#DC143C", rgb: "220, 20, 60", cmyk: "0, 95, 75, 0", inkType: "Pantone" },
  { name: "Pantone 1797C", otCode: "OT 60", pantone: "PANTONE 1797C", hex: "#8B0000", rgb: "139, 0, 0", cmyk: "30, 100, 100, 30", inkType: "Pantone" },
  { name: "Pantone 187C", otCode: "OT 61", pantone: "PANTONE 187C", hex: "#A52A2A", rgb: "165, 42, 42", cmyk: "25, 100, 85, 15", inkType: "Pantone" },
  { name: "Pantone 674C", otCode: "OT 70", pantone: "PANTONE 674C", hex: "#DDA0DD", rgb: "221, 160, 221", cmyk: "15, 40, 0, 0", inkType: "Pantone" },
  { name: "Pantone 1817C", otCode: "OT 80", pantone: "PANTONE 1817C", hex: "#4B0082", rgb: "75, 0, 130", cmyk: "85, 100, 0, 0", inkType: "Pantone" },
  { name: "Pantone 7617C", otCode: "OT 81", pantone: "PANTONE 7617C", hex: "#808000", rgb: "128, 128, 0", cmyk: "35, 25, 100, 10", inkType: "Pantone" },
  
  // Row 4
  { name: "Pantone 873C Gold", otCode: "OT 120", pantone: "PANTONE 873C GOLD", hex: "#FFD700", rgb: "255, 215, 0", cmyk: "0, 15, 100, 0", inkType: "Metallic" },
  { name: "Pantone 877C Silver", otCode: "OT 110", pantone: "PANTONE 877C SILVER", hex: "#C0C0C0", rgb: "192, 192, 192", cmyk: "25, 20, 20, 0", inkType: "Metallic" }
];

function getColorName(hex: string): string {
  const color = inkColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  return color ? `${color.otCode} ${color.name}` : hex;
}

export default function InkColorModal({ currentColor, onColorChange, trigger, autoOpen = false }: InkColorModalProps) {
  const [open, setOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

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
            <div className="grid grid-cols-9 gap-3">
              {inkColors.map((color) => (
                <TooltipProvider key={`${color.hex}-${color.otCode}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <InkDropSwatch
                          color={color.hex}
                          colorName={color.name}
                          isSelected={currentColor === color.hex}
                          onClick={() => handleColorSelect(color.hex)}
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

export { getColorName };