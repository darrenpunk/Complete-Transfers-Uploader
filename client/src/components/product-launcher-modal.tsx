import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CompleteTransferLogo from "./complete-transfer-logo";
import type { TemplateSize } from "@shared/schema";

// Import product icons
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";

// Import additional product icons
import uvdtfIconPath from "@assets/UVDTF page2_1753544185426.png";
import wovenBadgeIconPath from "@assets/image (2)_1753544203744.png";

// All individual product types as shown in the deployed version
const productCategories = [
  {
    id: "full-colour-transfers",
    name: "Full Colour Transfers",
    description: "Full-Colour screen printed heat applied transfers",
    icon: fullColourIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "full-colour-metallic",
    name: "Full Colour Metallic", 
    description: "Full-Colour screen printed with metallic finish",
    icon: fullColourIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "full-colour-hd",
    name: "Full Colour HD",
    description: "High-definition full-colour screen printed transfers",
    icon: fullColourIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "single-colour-transfers",
    name: "Single Colour Transfers",
    description: "Screen printed using our off-the-shelf colour range",
    icon: fullColourIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "dtf-transfers",
    name: "DTF - Digital Film Transfers",
    description: "Small order digital heat transfers",
    icon: dtfIconPath,
    group: "Digital Transfers"
  },
  {
    id: "uv-dtf",
    name: "UV DTF",
    description: "Hard Surface Transfers",
    icon: uvdtfIconPath,
    group: "Digital Transfers"
  },
  {
    id: "custom-badges",
    name: "Custom Badges",
    description: "Polyester textile woven badges",
    icon: wovenBadgeIconPath,
    group: "Digital Transfers"
  },
  {
    id: "applique-badges",
    name: "Applique Badges",
    description: "Fabric applique badges",
    icon: wovenBadgeIconPath,
    group: "Digital Transfers"
  },
  {
    id: "reflective-transfers",
    name: "Reflective Transfers",
    description: "Our silver reflective helps enhance the visibility of the wearer at night",
    icon: fullColourIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "zero-single-colour",
    name: "ZERO Single Colour Transfers",
    description: "Zero inks are super stretchy and do not bleed!",
    icon: fullColourIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "sublimation-transfers",
    name: "Sublimation Transfers",
    description: "Sublimation heat transfers are designed for full colour decoration of white, 100% polyester",
    icon: fullColourIconPath,
    group: "Digital Transfers"
  },
  {
    id: "zero-silicone-transfers",
    name: "Zero Silicone Transfers",
    description: "Silicone-free transfers",
    icon: fullColourIconPath,
    group: "Screen Printed Transfers"
  }
];

interface ProductLauncherModalProps {
  open: boolean;
  onClose: () => void;
  onSelectProduct: (productId: string) => void;
}

export default function ProductLauncherModal({ 
  open, 
  onClose, 
  onSelectProduct 
}: ProductLauncherModalProps) {
  
  const handleProductSelect = (productId: string) => {
    onSelectProduct(productId);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
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
          {productCategories.map((product) => (
            <Card 
              key={product.id}
              className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border border-gray-700 bg-gray-900 hover:border-primary"
              onClick={() => handleProductSelect(product.id)}
            >
              <CardContent className="p-4 text-center space-y-3">
                <div className="mx-auto w-16 h-16 flex items-center justify-center">
                  <img 
                    src={product.icon} 
                    alt={product.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-white">
                    {product.name}
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {product.description}
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full text-xs bg-transparent border-gray-600 text-gray-300 hover:bg-gray-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProductSelect(product.id);
                  }}
                >
                  Select
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="flex justify-center pt-4 border-t border-gray-700">
          <Button variant="outline" onClick={onClose} className="bg-transparent border-gray-600 text-gray-300 hover:bg-gray-800">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}