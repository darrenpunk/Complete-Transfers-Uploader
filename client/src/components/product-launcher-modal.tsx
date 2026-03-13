import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CompleteTransferLogo from "./complete-transfer-logo";
import { OnboardingTutorial } from "./onboarding-tutorial";
import { Palette, ShoppingBag, GraduationCap, Upload } from "lucide-react";
import type { TemplateSize } from "@shared/schema";

// Import product icons
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/fullcolour_tshirt_mock.png";

// Import additional product icons
import uvdtfIconPath from "@assets/uvdtf_page2.png";
import wovenBadgeIconPath from "@assets/woven_badge_icon.png";
import sublimationIconPath from "@assets/sublimate_1757431653278.png";
import appliqueBadgeIconPath from "@assets/corrib_embroid.png";
import singleColourIconPath from "@assets/single_1757431750112.png";
import reflectiveIconPath from "@assets/reflect_1757431997071.png";
import fullColourHDIconPath from "@assets/hd_1757431808013.png";
import metallicIconPath from "@assets/metal_1757431877375.png";
import zeroIconPath from "@assets/zero_1757431932809.png";

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
    icon: metallicIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "full-colour-hd",
    name: "Full Colour HD",
    description: "High-definition full-colour screen printed transfers",
    icon: fullColourHDIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "single-colour-transfers",
    name: "Single Colour Transfers",
    description: "Screen printed using our off-the-shelf colour range",
    icon: singleColourIconPath,
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
    icon: appliqueBadgeIconPath,
    group: "Digital Transfers"
  },
  {
    id: "reflective-transfers",
    name: "Reflective Transfers",
    description: "Our silver reflective helps enhance the visibility of the wearer at night",
    icon: reflectiveIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "zero-single-colour",
    name: "ZERO Single Colour Transfers",
    description: "Zero inks are super stretchy and do not bleed!",
    icon: zeroIconPath,
    group: "Screen Printed Transfers"
  },
  {
    id: "sublimation-transfers",
    name: "Sublimation Transfers",
    description: "Sublimation heat transfers are designed for full colour decoration of white, 100% polyester",
    icon: sublimationIconPath,
    group: "Digital Transfers"
  },
  {
    id: "vectorization-service",
    name: "Vectorization Service",
    description: "Professional vectorization service for converting photos, logos, or artwork into scalable vector graphics",
    icon: null, // Will use Palette icon instead
    group: "Services",
    isService: true
  }
];

interface ProductLauncherModalProps {
  open: boolean;
  onClose: () => void;
  onSelectProduct: (productId: string) => void;
  onOpenVectorizationForm?: () => void;
  onViewOrders?: () => void;
  onQuickUploadDtf?: () => void;
  partnerEmail?: string | null;
  inline?: boolean;
}

function ProductContent({
  onClose,
  onSelectProduct,
  onOpenVectorizationForm,
  onViewOrders,
  onQuickUploadDtf,
  partnerEmail,
  hideHeader = false,
}: Omit<ProductLauncherModalProps, 'open' | 'inline'> & { hideHeader?: boolean }) {
  const [showTutorial, setShowTutorial] = useState(false);
  const [hasDtfQuickUpload, setHasDtfQuickUpload] = useState(false);

  useEffect(() => {
    if (!partnerEmail) return;
    fetch(`/api/customer-features?email=${encodeURIComponent(partnerEmail)}`)
      .then(r => r.json())
      .then(data => {
        if (data.dtfQuickUpload) setHasDtfQuickUpload(true);
      })
      .catch(() => {});
  }, [partnerEmail]);

  const handleProductSelect = (productId: string) => {
    if (productId === "vectorization-service" && onOpenVectorizationForm) {
      onClose();
      onOpenVectorizationForm();
    } else {
      onSelectProduct(productId);
    }
  };

  return (
    <>
      <div className="w-full max-w-7xl mx-auto">
        {!hideHeader && (
          <div className="text-center mb-6">
            <CompleteTransferLogo size="md" className="mb-4" />
            <h2 className="text-2xl font-bold text-center mb-2 text-white">
              Select Product Type
            </h2>
            <p className="text-center text-gray-400">
              Choose the type of product you want to create artwork for
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 px-2 md:px-6 mb-4">
          <Button
            variant="outline"
            size="sm"
            className="flex flex-col items-center gap-0.5 h-auto py-2 px-4 bg-gray-900 border-gray-600 text-white hover:bg-gray-800 hover:border-gray-500"
            onClick={() => setShowTutorial(true)}
          >
            <GraduationCap className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wide">Quick Start</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">How It Works</span>
          </Button>
          {onViewOrders && (
            <Button
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-0.5 h-auto py-2 px-4 bg-gray-900 border-gray-600 text-white hover:bg-gray-800 hover:border-gray-500"
              onClick={onViewOrders}
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wide">My Orders</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">View Orders and Reorder</span>
            </Button>
          )}
        </div>
        
        <div className="relative px-2 md:px-6 pt-2 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* DTF Quick Upload card — only shown to enabled customers */}
            {hasDtfQuickUpload && onQuickUploadDtf && (
              <Card
                className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border border-yellow-500/50 bg-yellow-500/5 hover:border-yellow-400"
                onClick={() => { onClose(); onQuickUploadDtf(); }}
                data-testid="product-card-dtf-quick-upload"
              >
                <CardContent className="p-4 text-center space-y-3 bg-[#020202]">
                  <div className="mx-auto w-16 h-16 flex items-center justify-center">
                    <Upload className="w-10 h-10 text-yellow-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-yellow-300">
                      DTF 1000×550 Quick Upload
                    </h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Upload a print-ready PDF directly to cart — no design step needed
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs bg-transparent border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      onQuickUploadDtf();
                    }}
                    data-testid="button-dtf-quick-upload"
                  >
                    Quick Upload
                  </Button>
                </CardContent>
              </Card>
            )}

            {productCategories.map((product) => (
              <Card 
                key={product.id}
                className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border border-gray-700 bg-gray-900 hover:border-primary"
                onClick={() => handleProductSelect(product.id)}
                data-testid={`product-card-${product.id}`}
              >
                <CardContent className="p-4 text-center space-y-3 bg-[#020202]">
                  <div className="mx-auto w-16 h-16 flex items-center justify-center">
                    {product.icon ? (
                      <img 
                        src={product.icon} 
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Palette className="w-12 h-12 text-primary" />
                    )}
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
                    data-testid={`button-select-${product.id}`}
                  >
                    Select
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <OnboardingTutorial open={showTutorial} onOpenChange={setShowTutorial} />
    </>
  );
}

export default function ProductLauncherModal({ 
  open, 
  onClose, 
  onSelectProduct,
  onOpenVectorizationForm,
  onViewOrders,
  onQuickUploadDtf,
  partnerEmail,
  inline = false,
}: ProductLauncherModalProps) {
  if (!open) return null;

  if (inline) {
    return (
      <div className="min-h-screen bg-background flex items-start justify-center pt-8 pb-8 px-4 overflow-y-auto">
        <ProductContent
          onClose={onClose}
          onSelectProduct={onSelectProduct}
          onOpenVectorizationForm={onOpenVectorizationForm}
          onViewOrders={onViewOrders}
          onQuickUploadDtf={onQuickUploadDtf}
          partnerEmail={partnerEmail}
        />
      </div>
    );
  }

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
        <ProductContent
          onClose={onClose}
          onSelectProduct={onSelectProduct}
          onOpenVectorizationForm={onOpenVectorizationForm}
          onViewOrders={onViewOrders}
          onQuickUploadDtf={onQuickUploadDtf}
          partnerEmail={partnerEmail}
          hideHeader
        />
        <div className="flex justify-center pt-4 border-t border-gray-700">
          <Button variant="outline" onClick={onClose} className="bg-transparent border-gray-600 text-gray-300 hover:bg-gray-800">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
