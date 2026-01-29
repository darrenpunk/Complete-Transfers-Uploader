import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { X, Plus, Palette, ChevronDown, ChevronRight } from "lucide-react";
import type { GarmentColorItem } from "@shared/schema";
import TShirtSwatch from "@/components/ui/tshirt-swatch";
import { manufacturerColors } from "@shared/garment-colors";
import gildanLogoPath from "@assets/GILDAN_LOGO_blue_1753539382856.png";
import fruitOfTheLoomLogoPath from "@assets/Fruit_logo.svg_1753539605426.png";
import CMYKColorModal from "@/components/cmyk-color-modal";

// Professional color palette - same as garment color modal
const GARMENT_COLORS = [
  { name: "White", color: "#FFFFFF" },
  { name: "Black", color: "#171816" },
  { name: "Natural Cotton", color: "#D9D2AB" },
  { name: "Pastel Yellow", color: "#F3F590" },
  { name: "Yellow", color: "#F0F42A" },
  { name: "Hi Viz", color: "#D2E31D" },
  { name: "Hi Viz Orange", color: "#D98F17" },
  { name: "HiViz Green", color: "#388032" },
  { name: "HIViz Pink", color: "#BF0072" },
  { name: "Sports Grey", color: "#767878" },
  { name: "Light Grey Marl", color: "#919393" },
  { name: "Ash Grey", color: "#A6A9A2" },
  { name: "Light Grey", color: "#BCBFBB" },
  { name: "Charcoal Grey", color: "#353330" },
  { name: "Pastel Blue", color: "#B9DBEA" },
  { name: "Sky Blue", color: "#5998D4" },
  { name: "Navy", color: "#201C3A" },
  { name: "Royal Blue", color: "#221866" },
  { name: "Pastel Green", color: "#B5D55E" },
  { name: "Lime Green", color: "#90BF33" },
  { name: "Kelly Green", color: "#3C8A35" },
  { name: "Pastel Pink", color: "#E7BBD0" },
  { name: "Light Pink", color: "#D287A2" },
  { name: "Fuchsia Pink", color: "#C42469" },
  { name: "Red", color: "#C02300" },
  { name: "Burgundy", color: "#762009" },
  { name: "Purple", color: "#4C0A6A" },
];

interface MultiColorSelectorProps {
  garmentColors: GarmentColorItem[];
  onChange: (colors: GarmentColorItem[]) => void;
  className?: string;
  targetQuantity?: number; // The original order quantity that colors must sum to
}

export function MultiColorSelector({ garmentColors, onChange, className, targetQuantity }: MultiColorSelectorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [expandedManufacturers, setExpandedManufacturers] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const toggleManufacturer = (name: string) => {
    setExpandedManufacturers(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupName) ? prev.filter(n => n !== groupName) : [...prev, groupName]
    );
  };

  const handleAddColor = (color: string, colorName: string) => {
    // Check if color already exists
    const exists = garmentColors.some(gc => gc.color === color);
    if (exists) {
      return; // Don't add duplicate colors
    }

    const newColor: GarmentColorItem = {
      color,
      colorName,
      quantity: 1
    };
    onChange([...garmentColors, newColor]);
    setShowColorPicker(false);
  };

  const handleRemoveColor = (index: number) => {
    const updated = garmentColors.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const updated = [...garmentColors];
    updated[index] = { ...updated[index], quantity: Math.max(1, quantity) };
    onChange(updated);
  };

  const totalQuantity = garmentColors.reduce((sum, gc) => sum + gc.quantity, 0);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <Label className="text-sm font-medium">Garment Colors & Quantities</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowColorPicker(!showColorPicker)}
          data-testid="button-add-garment-color"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Color
        </Button>
      </div>

      {/* Color Picker */}
      {showColorPicker && (
        <div className="mb-4 p-4 border rounded-lg bg-muted/50">
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-2">
            {GARMENT_COLORS.map((gc) => {
              const isSelected = garmentColors.some(existing => existing.color === gc.color);
              return (
                <button
                  key={gc.color}
                  type="button"
                  onClick={() => handleAddColor(gc.color, gc.name)}
                  disabled={isSelected}
                  className={`
                    flex flex-col items-center gap-1 p-1 rounded-md transition-all
                    ${isSelected 
                      ? 'opacity-40 cursor-not-allowed' 
                      : 'hover:bg-accent hover:scale-105 cursor-pointer'
                    }
                  `}
                  data-testid={`button-select-color-${gc.name.toLowerCase().replace(/\s+/g, '-')}`}
                  title={gc.name}
                >
                  <TShirtSwatch 
                    color={gc.color} 
                    size="md"
                    selected={isSelected}
                  />
                </button>
              );
            })}
          </div>

          {/* Manufacturer Colors */}
          <div className="mt-4 pt-4 border-t space-y-2">
            <Label className="text-xs text-muted-foreground">Manufacturer Colors</Label>
            {Object.entries(manufacturerColors).map(([manufacturerName, colorGroups]) => (
              <Collapsible
                key={manufacturerName}
                open={expandedManufacturers.includes(manufacturerName)}
                onOpenChange={() => toggleManufacturer(manufacturerName)}
              >
                <CollapsibleTrigger className="w-full p-2 bg-muted/50 border rounded-lg flex items-center justify-between hover:bg-muted transition-colors">
                  <div className="flex items-center justify-center flex-1">
                    {manufacturerName === "Gildan" && (
                      <img src={gildanLogoPath} alt="Gildan" className="h-5 w-auto object-contain" />
                    )}
                    {manufacturerName === "Fruit of the Loom" && (
                      <img src={fruitOfTheLoomLogoPath} alt="Fruit of the Loom" className="h-6 w-auto object-contain" />
                    )}
                  </div>
                  {expandedManufacturers.includes(manufacturerName) 
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  }
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1">
                  {colorGroups.map((group) => (
                    <Collapsible
                      key={group.name}
                      open={expandedGroups.includes(`${manufacturerName}-${group.name}`)}
                      onOpenChange={() => toggleGroup(`${manufacturerName}-${group.name}`)}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left hover:bg-muted rounded text-xs">
                        <span className="font-medium">{group.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{group.colors.length}</span>
                          {expandedGroups.includes(`${manufacturerName}-${group.name}`) 
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronRight className="w-3 h-3" />
                          }
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-2 pb-2">
                        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
                          {group.colors.map((color) => {
                            const isSelected = garmentColors.some(existing => existing.color === color.hex);
                            return (
                              <button
                                key={color.code}
                                type="button"
                                onClick={() => handleAddColor(color.hex, `${color.name} (${color.code})`)}
                                disabled={isSelected}
                                className={`p-1 rounded transition-all ${isSelected ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}`}
                                title={`${color.name} (${color.code})`}
                              >
                                <TShirtSwatch color={color.hex} size="sm" selected={isSelected} />
                              </button>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>

          {/* Custom CMYK Color Picker */}
          <div className="mt-4 pt-4 border-t">
            <CMYKColorModal
              initialColor="#FFFFFF"
              currentColor="#FFFFFF"
              onChange={(newColor) => {
                handleAddColor(newColor, `Custom ${newColor.toUpperCase()}`);
              }}
              label="Custom Garment Color"
              trigger={
                <Button type="button" variant="outline" className="w-full">
                  <Palette className="w-4 h-4 mr-2" />
                  Create Custom CMYK Color
                </Button>
              }
            />
          </div>
        </div>
      )}

      {/* Selected Colors List */}
      {garmentColors.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <Palette className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No garment colors selected</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Add Color" to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {garmentColors.map((gc, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 border rounded-lg bg-card"
              data-testid={`garment-color-item-${index}`}
            >
              {/* Color Swatch */}
              <div
                className="w-10 h-10 rounded-md border-2 border-border flex-shrink-0 shadow-sm"
                style={{ backgroundColor: gc.color }}
              />

              {/* Color Name */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{gc.colorName}</p>
                <p className="text-xs text-muted-foreground">{gc.color}</p>
              </div>

              {/* Quantity Input */}
              <div className="flex items-center gap-2">
                <Label htmlFor={`qty-${index}`} className="text-sm whitespace-nowrap">
                  Qty:
                </Label>
                <Input
                  id={`qty-${index}`}
                  type="number"
                  min="1"
                  value={gc.quantity}
                  onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                  className="w-20 text-center"
                  data-testid={`input-quantity-${index}`}
                />
              </div>

              {/* Remove Button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveColor(index)}
                className="flex-shrink-0"
                data-testid={`button-remove-color-${index}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}

          {/* Total */}
          <div className="pt-2 border-t space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Quantity:</span>
              <span 
                className={`text-lg font-bold ${targetQuantity && totalQuantity !== targetQuantity ? 'text-destructive' : ''}`} 
                data-testid="text-total-quantity"
              >
                {totalQuantity}
              </span>
            </div>
            {targetQuantity && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Order Quantity:</span>
                <span className={`font-medium ${totalQuantity !== targetQuantity ? 'text-destructive' : 'text-green-600'}`}>
                  {totalQuantity === targetQuantity 
                    ? '✓ Matches order' 
                    : `${totalQuantity > targetQuantity ? '+' : ''}${totalQuantity - targetQuantity} (must equal ${targetQuantity})`
                  }
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
