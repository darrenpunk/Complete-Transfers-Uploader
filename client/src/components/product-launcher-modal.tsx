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

// Two main product groups 
const productCategories = [
  {
    id: "screen-printed-transfers",
    name: "Screen Printed Transfers",
    description: "Full-Colour & Single Colour screen printed heat applied transfers",
    icon: fullColourIconPath,
    templateTypes: [
      'template-A3', 'template-A4', 'template-A5',
      'template-FOTLA3', 'template-FOTLA4', 
      'template-metallic-a3', 'template-metallic-a4',
      'template-reflective-a3', 'template-reflective-a4',
      'template-hi-viz-a3', 'template-hi-viz-a4',
      'template-glitter-a3', 'template-glitter-a4',
      'template-holographic-a3', 'template-holographic-a4',
      'template-glow-in-dark-a3', 'template-glow-in-dark-a4',
      'template-puff-a3', 'template-puff-a4',
      'template-foil-a3', 'template-foil-a4',
      'template-photographic-a3', 'template-photographic-a4'
    ]
  },
  {
    id: "digital-transfers",
    name: "Digital Transfers",
    description: "DTF, UV DTF, Sublimation, and Badges",
    icon: dtfIconPath,
    templateTypes: [
      'template-dtf-a3', 'template-dtf-a4',
      'template-uv-dtf-a3', 'template-uv-dtf-a4',
      'template-sublimation-a3', 'template-sublimation-a4',
      'template-embroidery-badges-a3', 'template-embroidery-badges-a4',
      'template-applique-badges-a3', 'template-applique-badges-a4',
      'template-laser-cut-badges-a3', 'template-laser-cut-badges-a4',
      'template-woven-badges-a3', 'template-woven-badges-a4'
    ]
  }
];

interface ProductLauncherModalProps {
  open: boolean;
  onClose: () => void;
  onSelectProduct: (group: string, templateTypes: string[]) => void;
}

export default function ProductLauncherModal({ 
  open, 
  onClose, 
  onSelectProduct 
}: ProductLauncherModalProps) {
  
  const handleProductSelect = (product: any) => {
    onSelectProduct(product.name, product.templateTypes);
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 max-w-4xl mx-auto">
          {productCategories.map((product) => (
            <Card 
              key={product.id}
              className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border border-gray-700 bg-gray-900 hover:border-primary"
              onClick={() => handleProductSelect(product)}
            >
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto w-20 h-20 flex items-center justify-center">
                  <img 
                    src={product.icon} 
                    alt={product.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg text-white">
                    {product.name}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {product.description}
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  size="default"
                  className="w-full bg-transparent border-gray-600 text-gray-300 hover:bg-gray-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProductSelect(product);
                  }}
                >
                  Select Templates
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