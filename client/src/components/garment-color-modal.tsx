import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Palette } from "lucide-react";
import CMYKColorModal from "@/components/cmyk-color-modal";
import { manufacturerColors } from "@shared/garment-colors";
import gildanLogoPath from "@assets/GILDAN_LOGO_blue_1753539382856.png";
import fruitOfTheLoomLogoPath from "@assets/Fruit_logo.svg_1753539605426.png";

interface GarmentColorModalProps {
  currentColor: string | null;
  onColorChange: (color: string) => void;
  trigger?: React.ReactNode;
  autoOpen?: boolean;
}

// Professional color palette with complete specifications
const quickColors = [
  { name: "White", hex: "#FFFFFF", rgb: "255, 255, 255", cmyk: "0, 0, 0, 0", inkType: "Process" },
  { name: "Black", hex: "#171816", rgb: "23, 24, 22", cmyk: "0, 0, 0, 100", inkType: "Process" },
  { name: "Natural Cotton", hex: "#D9D2AB", rgb: "217, 210, 171", cmyk: "11, 15, 32, 0", inkType: "Spot" },
  { name: "Pastel Yellow", hex: "#F3F590", rgb: "243, 245, 144", cmyk: "4, 2, 50, 0", inkType: "Process" },
  { name: "Yellow", hex: "#F0F42A", rgb: "240, 244, 42", cmyk: "5, 0, 90, 0", inkType: "Process" },
  { name: "Hi Viz", hex: "#D2E31D", rgb: "210, 227, 29", cmyk: "20, 0, 100, 0", inkType: "Spot" },
  { name: "Hi Viz Orange", hex: "#D98F17", rgb: "217, 143, 23", cmyk: "0, 51, 93, 0", inkType: "Spot" },
  { name: "HiViz Green", hex: "#388032", rgb: "56, 128, 50", cmyk: "86, 16, 100, 3", inkType: "Process" },
  { name: "HIViz Pink", hex: "#BF0072", rgb: "191, 0, 114", cmyk: "2, 97, 4, 0", inkType: "Process" },
  { name: "Sports Grey", hex: "#767878", rgb: "118, 120, 120", cmyk: "0, 0, 0, 63", inkType: "Process" },
  { name: "Light Grey Marl", hex: "#919393", rgb: "145, 147, 147", cmyk: "0, 0, 0, 50", inkType: "Process" },
  { name: "Ash Grey", hex: "#A6A9A2", rgb: "166, 169, 162", cmyk: "32, 24, 26, 5", inkType: "Process" },
  { name: "Light Grey", hex: "#BCBFBB", rgb: "188, 191, 187", cmyk: "25, 18, 20, 2", inkType: "Process" },
  { name: "Charcoal Grey", hex: "#353330", rgb: "53, 51, 48", cmyk: "66, 57, 54, 60", inkType: "Process" },
  { name: "Pastel Blue", hex: "#B9DBEA", rgb: "185, 219, 234", cmyk: "32, 0, 5, 0", inkType: "Process" },
  { name: "Sky Blue", hex: "#5998D4", rgb: "89, 152, 212", cmyk: "70, 15, 0, 0", inkType: "Process" },
  { name: "Navy", hex: "#201C3A", rgb: "32, 28, 58", cmyk: "100, 92, 36, 39", inkType: "Process" },
  { name: "Royal Blue", hex: "#221866", rgb: "34, 24, 102", cmyk: "100, 95, 5, 0", inkType: "Process" },
  { name: "Pastel Green", hex: "#B5D55E", rgb: "181, 213, 94", cmyk: "34, 0, 73, 0", inkType: "Process" },
  { name: "Lime Green", hex: "#90BF33", rgb: "144, 191, 51", cmyk: "50, 0, 99, 0", inkType: "Process" },
  { name: "Kelly Green", hex: "#3C8A35", rgb: "60, 138, 53", cmyk: "85, 10, 100, 0", inkType: "Process" },
  { name: "Pastel Pink", hex: "#E7BBD0", rgb: "231, 187, 208", cmyk: "0, 32, 3, 0", inkType: "Process" },
  { name: "Light Pink", hex: "#D287A2", rgb: "210, 135, 162", cmyk: "2, 53, 11, 0", inkType: "Process" },
  { name: "Fuchsia Pink", hex: "#C42469", rgb: "196, 36, 105", cmyk: "0, 94, 20, 0", inkType: "Process" },
  { name: "Red", hex: "#C02300", rgb: "192, 35, 0", cmyk: "0, 99, 97, 0", inkType: "Process" },
  { name: "Burgundy", hex: "#762009", rgb: "118, 32, 9", cmyk: "26, 100, 88, 27", inkType: "Process" },
  { name: "Purple", hex: "#4C0A6A", rgb: "76, 10, 106", cmyk: "75, 100, 0, 0", inkType: "Process" }
];

// Function to get color name from hex value
function getColorName(hex: string): string {
  // Check quick colors first
  const quickColor = quickColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  if (quickColor) {
    return quickColor.name;
  }

  // Check manufacturer colors
  for (const [manufacturerName, colorGroups] of Object.entries(manufacturerColors)) {
    for (const group of colorGroups) {
      const manufacturerColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
      if (manufacturerColor) {
        return `${manufacturerColor.name} (${manufacturerColor.code})`;
      }
    }
  }

  // If no match found, return hex as fallback
  return hex;
}

export default function GarmentColorModal({ currentColor, onColorChange, trigger, autoOpen = false }: GarmentColorModalProps) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
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

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) 
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    );
  };

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
            Select Garment Color
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Select Garment Color
            {!currentColor && <span className="text-red-500 text-sm font-normal">*Required</span>}
          </DialogTitle>
          <DialogDescription>
            Choose a garment color for your Full Colour Transfer design. This will be the background color for your artwork.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!currentColor && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">
                ⚠️ Please select a garment color to continue
              </p>
              <p className="text-xs text-red-600 mt-1">
                Choose from the professional colors below or create a custom CMYK color
              </p>
            </div>
          )}

          {/* Professional Colors */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Professional Colors</h4>
            <div className="grid grid-cols-9 gap-3">
              {quickColors.map((color) => (
                <TooltipProvider key={color.hex}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={`w-12 h-12 rounded-full border-2 shadow-sm hover:scale-105 transition-transform ${
                          currentColor === color.hex
                            ? "border-primary ring-2 ring-blue-200"
                            : "border-gray-300 hover:border-gray-400"
                        }`}
                        style={{ backgroundColor: color.hex }}
                        onClick={() => handleColorSelect(color.hex)}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="text-sm">
                        <div className="font-semibold text-gray-900">{color.name}</div>
                        <div className="text-xs text-gray-600 mt-1">
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

          {/* Manufacturer Colors */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Manufacturer Colors</h4>
            <div className="space-y-3">
              {Object.entries(manufacturerColors).map(([manufacturerName, colorGroups]) => (
                <div key={manufacturerName} className="border border-gray-200 rounded-lg">
                  <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-center">
                    {manufacturerName === "Gildan" && (
                      <img 
                        src={gildanLogoPath} 
                        alt="Gildan" 
                        className="h-6 w-auto object-contain"
                      />
                    )}
                    {manufacturerName === "Fruit of the Loom" && (
                      <img 
                        src={fruitOfTheLoomLogoPath} 
                        alt="Fruit of the Loom" 
                        className="h-8 w-auto object-contain"
                      />
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    {colorGroups.map((group) => (
                      <Collapsible 
                        key={group.name}
                        open={expandedGroups.includes(`${manufacturerName}-${group.name}`)}
                        onOpenChange={() => toggleGroup(`${manufacturerName}-${group.name}`)}
                      >
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left hover:bg-gray-100 rounded text-sm">
                          <span className="font-medium text-gray-700">{group.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {group.colors.length} colors
                            </span>
                            {expandedGroups.includes(`${manufacturerName}-${group.name}`) 
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />
                            }
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-2 pb-2">
                          <div className="grid grid-cols-8 gap-2">
                            {group.colors.map((color) => (
                              <TooltipProvider key={color.code}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <button
                                        className={`w-10 h-10 rounded-full border-2 shadow-sm hover:scale-105 transition-transform ${
                                          currentColor === color.hex
                                            ? "border-primary ring-2 ring-blue-200"
                                            : "border-gray-300 hover:border-gray-400"
                                        }`}
                                        style={{ backgroundColor: color.hex }}
                                        onClick={() => handleColorSelect(color.hex)}
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="text-sm">
                                      <div className="font-semibold text-gray-900">{color.name}</div>
                                      <div className="text-xs text-gray-600 mt-1">
                                        <div>Code: <span className="font-mono">{color.code}</span></div>
                                        <div>HEX: <span className="font-mono">{color.hex}</span></div>
                                        <div>CMYK: <span className="font-mono">C{color.cmyk.c} M{color.cmyk.m} Y{color.cmyk.y} K{color.cmyk.k}</span></div>
                                        {color.pantone && (
                                          <div>Pantone: <span className="font-mono">{color.pantone}</span></div>
                                        )}
                                        {color.pantoneTextile && (
                                          <div>Textile: <span className="font-mono">{color.pantoneTextile}</span></div>
                                        )}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </div>
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
            
            {/* Custom Color CMYK Picker */}
            <CMYKColorModal
              initialColor="#FFFFFF"
              currentColor={currentColor || ""}
              onChange={(newColor) => handleColorSelect(newColor)}
              label="Custom Garment Color"
              trigger={
                <Button variant="outline" className="w-full">
                  <Palette className="w-4 h-4 mr-2" />
                  Create Custom Color
                </Button>
              }
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}