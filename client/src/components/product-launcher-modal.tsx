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

// Product categories with icons and descriptions
const productCategories = [
  {
    id: "full-colour",
    name: "Full Colour Transfers",
    description: "High-quality digital transfers",
    icon: fullColourIconPath,
    group: "Full Colour Transfer Sizes"
  },
  {
    id: "single-colour", 
    name: "Single Colour Transfers",
    description: "One color vinyl transfers",
    icon: fullColourIconPath,
    group: "Single Colour Transfer Sizes",
    grayscale: true
  },
  {
    id: "dtf",
    name: "DTF Transfers", 
    description: "Direct-to-film printing",
    icon: dtfIconPath,
    group: "DTF Transfer Sizes"
  },
  {
    id: "uv-dtf",
    name: "UV DTF Transfers",
    description: "UV-resistant transfers",
    icon: uvdtfIconPath,
    group: "UV DTF Transfers"
  },
  {
    id: "woven-badges",
    name: "Woven Badges",
    description: "Premium woven patches",
    icon: wovenBadgeIconPath,
    group: "Woven Badges"
  },
  {
    id: "applique-badges",
    name: "Applique Badges", 
    description: "Embroidered patches",
    icon: wovenBadgeIconPath,
    group: "Applique Badges",
    sepia: true
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center mb-2">
            Select Product Type
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            Choose the type of product you want to create artwork for
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
          {productCategories.map((product) => (
            <Card 
              key={product.id}
              className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-primary"
              onClick={() => handleProductSelect(product.group)}
            >
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto w-20 h-20 flex items-center justify-center">
                  <img 
                    src={product.icon} 
                    alt={product.name}
                    className={`w-full h-full object-contain ${
                      product.grayscale ? 'filter grayscale' : ''
                    } ${
                      product.sepia ? 'filter sepia' : ''
                    }`}
                  />
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-gray-900">
                    {product.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {product.description}
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProductSelect(product.group);
                  }}
                >
                  Select Templates
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