import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import CompleteTransferLogo from "./complete-transfer-logo";
import GarmentColorModal from "./garment-color-modal";
import InkColorModal from "./ink-color-modal";
import type { TemplateSize } from "@shared/schema";
import { useState } from "react";

// Import product icons
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";
import uvdtfIconPath from "@assets/UVDTF page2_1753544185426.png";
import wovenBadgeIconPath from "@assets/image (2)_1753544203744.png";
import sublimationIconPath from "@assets/sublimate_1757431653278.png";
import appliqueBadgeIconPath from "@assets/corrib embroid_1757431675232.png";
import singleColourIconPath from "@assets/single_1757431750112.png";
import reflectiveIconPath from "@assets/reflect_1757431997071.png";
import fullColourHDIconPath from "@assets/hd_1757431808013.png";
import metallicIconPath from "@assets/metal_1757431877375.png";
import zeroIconPath from "@assets/zero_1757431932809.png";

// Map template groups to product categories with icons and descriptions
const getProductCategoryData = (group: string) => {
  const categoryMap: Record<string, { icon: string; description: string }> = {
    "Full Colour Transfers": {
      icon: fullColourIconPath,
      description: "Full-Colour screen printed heat applied transfers"
    },
    "Full Colour Metallic": {
      icon: metallicIconPath,
      description: "Full-Colour screen printed with metallic finish"
    },
    "Full Colour HD": {
      icon: fullColourHDIconPath,
      description: "High-definition full-colour screen printed transfers"
    },
    "Single Colour Transfers": {
      icon: singleColourIconPath,
      description: "Screen printed using our off-the-shelf colour range"
    },
    "DTF - Digital Film Transfers": {
      icon: dtfIconPath,
      description: "Small order digital heat transfers"
    },
    "UV DTF": {
      icon: uvdtfIconPath,
      description: "Hard Surface Transfers"
    },
    "Custom Badges": {
      icon: wovenBadgeIconPath,
      description: "Polyester textile woven badges"
    },
    "Applique Badges": {
      icon: appliqueBadgeIconPath,
      description: "Fabric applique badges"
    },
    "Reflective Transfers": {
      icon: reflectiveIconPath,
      description: "Our silver reflective helps enhance the visibility of the wearer at night"
    },
    "ZERO Single Colour Transfers": {
      icon: zeroIconPath,
      description: "Zero inks are super stretchy and do not bleed!"
    },
    "Sublimation Transfers": {
      icon: sublimationIconPath,
      description: "Sublimation heat transfers are designed for full colour decoration of white, 100% polyester"
    }
  };

  return categoryMap[group] || { icon: fullColourIconPath, description: group };
};

interface ProductSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProduct: (template: TemplateSize, garmentColor: string | null, inkColor: string | null, quantity: number) => void;
  templates: TemplateSize[];
}

export function ProductSelectorModal({
  open,
  onOpenChange,
  onSelectProduct,
  templates,
}: ProductSelectorModalProps) {
  const [selectedProductGroup, setSelectedProductGroup] = useState<string | null>(null);
  const [garmentColor, setGarmentColor] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  // Group templates by their group (Full Colour Transfers, DTF, etc.)
  const productGroups = templates.reduce((acc, template) => {
    const groupKey = template.group || "Other";
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(template);
    return acc;
  }, {} as Record<string, TemplateSize[]>);

  // Get selected template
  const selectedTemplate = selectedProductGroup 
    ? productGroups[selectedProductGroup]?.[0] 
    : null;

  // Determine if product needs garment color (Full Colour products)
  const needsGarmentColor = selectedProductGroup?.toLowerCase().includes('full colour') || false;
  
  // Determine if product needs ink color (Single Colour, Reflective, ZERO)
  const needsInkColor = selectedProductGroup?.toLowerCase().includes('single colour') || 
                        selectedProductGroup?.toLowerCase().includes('reflective') || 
                        selectedProductGroup?.toLowerCase().includes('zero') || false;

  const handleProductSelect = (groupKey: string) => {
    setSelectedProductGroup(groupKey);
    // Reset colors when changing product
    setGarmentColor(null);
    setInkColor(null);
  };

  const handleContinue = () => {
    if (selectedTemplate) {
      // Validate required colors
      if (needsGarmentColor && !garmentColor) {
        return; // Garment color is required but not selected
      }
      if (needsInkColor && !inkColor) {
        return; // Ink color is required but not selected
      }

      onSelectProduct(selectedTemplate, garmentColor, inkColor, quantity);
      handleCancel(); // Reset form
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setSelectedProductGroup(null);
    setGarmentColor(null);
    setInkColor(null);
    setQuantity(1);
  };

  // Check if continue button should be enabled
  const canContinue = selectedProductGroup && 
                      (!needsGarmentColor || garmentColor) && 
                      (!needsInkColor || inkColor) &&
                      quantity > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto !top-[2%] !translate-y-0">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="text-2xl font-bold text-center mb-2">
            Select Product Type
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            Choose the type of product you want to create artwork for
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
          {Object.entries(productGroups).map(([groupName, groupTemplates]) => {
            const categoryData = getProductCategoryData(groupName);
            return (
              <Card 
                key={groupName}
                className={`cursor-pointer hover:shadow-lg transition-shadow duration-200 border ${
                  selectedProductGroup === groupName 
                    ? 'border-primary bg-primary/10' 
                    : 'border-gray-700 bg-gray-900 hover:border-primary'
                }`}
                onClick={() => handleProductSelect(groupName)}
                data-testid={`product-category-${groupName}`}
              >
                <CardContent className="p-4 text-center space-y-3 bg-[#020202]">
                  <div className="mx-auto w-16 h-16 flex items-center justify-center">
                    <img 
                      src={categoryData.icon} 
                      alt={groupName}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-white">
                      {groupName}
                    </h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {categoryData.description}
                    </p>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={`w-full text-xs ${
                      selectedProductGroup === groupName
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent border-gray-600 text-gray-300 hover:bg-gray-800'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProductSelect(groupName);
                    }}
                    data-testid={`button-select-${groupName}`}
                  >
                    {selectedProductGroup === groupName ? 'Selected' : 'Select'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Color Selection and Quantity */}
        {selectedProductGroup && (
          <>
            <Separator />
            <div className="space-y-4 px-6 pb-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Product Details</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedProductGroup}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Garment Color Selection */}
                {needsGarmentColor && (
                  <div className="space-y-2">
                    <Label>
                      Garment Color <span className="text-red-500">*</span>
                    </Label>
                    <GarmentColorModal 
                      currentColor={garmentColor}
                      onColorChange={setGarmentColor}
                      trigger={
                        <Button 
                          variant="outline" 
                          className="w-full justify-start"
                          data-testid="button-select-garment-color"
                        >
                          {garmentColor ? (
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-5 h-5 border border-gray-300 rounded"
                                style={{ backgroundColor: garmentColor }}
                              />
                              <span className="text-sm">Selected</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Select Garment Color</span>
                          )}
                        </Button>
                      }
                    />
                  </div>
                )}

                {/* Ink Color Selection */}
                {needsInkColor && (
                  <div className="space-y-2">
                    <Label>
                      Ink Color <span className="text-red-500">*</span>
                    </Label>
                    <InkColorModal 
                      currentColor={inkColor}
                      onColorChange={setInkColor}
                      templateId={selectedTemplate?.id}
                      trigger={
                        <Button 
                          variant="outline" 
                          className="w-full justify-start"
                          data-testid="button-select-ink-color"
                        >
                          {inkColor ? (
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-5 h-5 border border-gray-300 rounded"
                                style={{ backgroundColor: inkColor }}
                              />
                              <span className="text-sm">Selected</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Select Ink Color</span>
                          )}
                        </Button>
                      }
                    />
                  </div>
                )}

                {/* Quantity */}
                <div className="space-y-2">
                  <Label htmlFor="quantity">
                    Quantity <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    data-testid="input-quantity"
                  />
                </div>
              </div>
            </div>
          </>
        )}
        
        <div className="flex justify-center gap-3 pt-4 px-6 pb-6 border-t border-gray-700">
          <Button 
            variant="outline" 
            onClick={handleCancel} 
            className="flex-1 bg-transparent border-gray-600 text-gray-300 hover:bg-gray-800"
            data-testid="button-cancel-product-selection"
          >
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!canContinue}
            className="flex-1"
            data-testid="button-continue-product-selection"
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
