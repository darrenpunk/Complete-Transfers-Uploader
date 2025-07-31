import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TemplateSize } from "@shared/schema";

// Import product icons
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";
import uvdtfIconPath from "@assets/UVDTF page2_1753544185426.png";
import wovenBadgeIconPath from "@assets/image (2)_1753544203744.png";
import completeTransfersLogoPath from "@assets/Artboard 1@4x_1753539065182.png";

// Product categories with icons and descriptions
const productCategories = [
  {
    id: "full-colour",
    name: "Full Colour Transfers",
    description: "Full-Colour screen printed heat applied transfers",
    icon: fullColourIconPath,
    group: "Full Colour Transfers"
  },
  {
    id: "full-colour-metallic",
    name: "Full Colour Metallic",
    description: "Full-Colour screen printed with metallic finish",
    icon: fullColourIconPath,
    group: "Full Colour Metallic",
    filter: "contrast(1.3) brightness(1.1) saturate(1.2)"
  },
  {
    id: "full-colour-hd",
    name: "Full Colour HD",
    description: "High-definition full-colour screen printed transfers",
    icon: fullColourIconPath,
    group: "Full Colour HD",
    filter: "contrast(1.4) saturate(1.3) brightness(1.05)"
  },
  {
    id: "single-colour", 
    name: "Single Colour Transfers",
    description: "Screen printed using our off-the-shelf colour range",
    icon: fullColourIconPath,
    group: "Single Colour Transfers",
    grayscale: true
  },
  {
    id: "dtf",
    name: "DTF - Digital Film Transfers", 
    description: "Small order digital heat transfers",
    icon: dtfIconPath,
    group: "DTF - Digital Film Transfers"
  },
  {
    id: "uv-dtf",
    name: "UV DTF",
    description: "Hard Surface Transfers",
    icon: uvdtfIconPath,
    group: "UV DTF"
  },
  {
    id: "woven-badges",
    name: "Custom Badges",
    description: "Polyester textile woven badges",
    icon: wovenBadgeIconPath,
    group: "Custom Badges"
  },
  {
    id: "applique-badges",
    name: "Applique Badges", 
    description: "Fabric applique badges",
    icon: wovenBadgeIconPath,
    group: "Applique Badges",
    sepia: true
  },
  {
    id: "reflective-transfers",
    name: "Reflective Transfers",
    description: "Our silver reflective helps enhance the visibility of the wearer at night",
    icon: fullColourIconPath,
    group: "Reflective Transfers",
    filter: "brightness(1.2) saturate(0.8)"
  },
  {
    id: "zero-single-colour",
    name: "ZERO Single Colour Transfers",
    description: "Zero inks are super stretchy and do not bleed!",
    icon: fullColourIconPath,
    group: "ZERO Single Colour Transfers",
    filter: "contrast(1.1) saturate(1.1)"
  },
  {
    id: "sublimation-transfers",
    name: "Sublimation Transfers",
    description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester",
    icon: fullColourIconPath,
    group: "Sublimation Transfers",
    filter: "hue-rotate(180deg) saturate(1.2)"
  },
  {
    id: "zero-silicone",
    name: "Zero Silicone Transfers",
    description: "Silicone-free transfers",
    icon: fullColourIconPath,
    group: "Zero Silicone Transfers",
    filter: "hue-rotate(20deg)"
  }
];

interface ProductLauncherModalProps {
  open: boolean;
  onClose: () => void;
  onSelectProduct: (group: string) => void;
}

export default function ProductLauncherModal({ 
  open, 
  onClose, 
  onSelectProduct 
}: ProductLauncherModalProps) {
  
  const handleProductSelect = (group: string) => {
    onSelectProduct(group);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="text-center mb-4">
            <div className="flex justify-center mb-3">
              <img 
                src={completeTransfersLogoPath} 
                alt="CompleteTransfers" 
                className="h-16 w-auto object-contain"
              />
            </div>
            <DialogTitle className="text-2xl font-bold">
              Select Product Type
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-1">
              Choose the type of product you want to create artwork for
            </DialogDescription>
          </div>
        </DialogHeader>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
          {productCategories.map((product) => (
            <Card 
              key={product.id}
              className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-primary"
              onClick={() => handleProductSelect(product.group)}
            >
              <CardContent className="p-4 text-center space-y-3">
                <div className="mx-auto w-16 h-16 flex items-center justify-center">
                  <img 
                    src={product.icon} 
                    alt={product.name}
                    className={`w-full h-full object-contain ${
                      product.grayscale ? 'filter grayscale' : ''
                    } ${
                      product.sepia ? 'filter sepia' : ''
                    }`}
                    style={{
                      filter: product.filter || (product.grayscale ? 'grayscale(100%)' : product.sepia ? 'sepia(100%)' : 'none')
                    }}
                  />
                </div>
                
                <div className="space-y-1">
                  <h3 className="font-semibold text-base text-gray-900">
                    {product.name}
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {product.description}
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProductSelect(product.group);
                  }}
                >
                  Select
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="flex justify-center pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}