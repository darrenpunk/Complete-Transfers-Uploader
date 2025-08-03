import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import CompleteTransferLogo from "./complete-transfer-logo";
import type { TemplateSize } from "@shared/schema";
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

// Import the same icons used in the sidebar
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";
import uvdtfIconPath from "@assets/UVDTF page2_1753544185426.png";
import wovenBadgeIconPath from "@assets/image (2)_1753544203744.png";

// Template group icons - using same icons as sidebar
const getTemplateGroupIcon = (group: string) => {
  switch (group) {
    case "Full Colour Transfer Sizes":
    case "Full Colour Transfers":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Full Colour Transfer" 
          className="h-10 w-10 object-contain"
        />
      );
    case "Full Colour Metallic":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Full Colour Metallic" 
          className="h-10 w-10 object-contain"
          style={{ filter: "contrast(1.3) brightness(1.1) saturate(1.2)" }}
        />
      );
    case "Single Colour Transfers":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Single Colour Transfer" 
          className="h-10 w-10 object-contain filter grayscale"
        />
      );
    case "DTF Transfer Sizes":
      return (
        <img 
          src={dtfIconPath} 
          alt="DTF Transfer" 
          className="h-10 w-10 object-contain"
        />
      );
    case "UV DTF Transfers":
      return (
        <img 
          src={uvdtfIconPath} 
          alt="UV DTF Transfer" 
          className="h-10 w-10 object-contain"
        />
      );
    case "Woven Badges":
      return (
        <img 
          src={wovenBadgeIconPath} 
          alt="Woven Badge" 
          className="h-10 w-10 object-contain"
        />
      );
    case "Applique Badges":
      return (
        <img 
          src={wovenBadgeIconPath} 
          alt="Applique Badge" 
          className="h-10 w-10 object-contain filter sepia"
        />
      );
    case "Reflective Transfers":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Reflective Transfer" 
          className="h-10 w-10 object-contain"
          style={{ filter: "brightness(1.2) saturate(0.8)" }}
        />
      );
    case "Full Colour HD":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Full Colour HD" 
          className="h-10 w-10 object-contain"
          style={{ filter: "contrast(1.4) saturate(1.3) brightness(1.05)" }}
        />
      );
    case "Zero Silicone Transfers":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Zero Silicone Transfer" 
          className="h-10 w-10 object-contain"
          style={{ filter: "hue-rotate(20deg)" }}
        />
      );
    case "Sublimation Transfers":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Sublimation Transfer" 
          className="h-10 w-10 object-contain"
          style={{ filter: "hue-rotate(180deg) saturate(0.9)" }}
        />
      );
    default:
      return <span className="text-2xl">📐</span>;
  }
};

interface TemplateSelectorModalProps {
  open: boolean;
  templates: TemplateSize[];
  onSelectTemplate: (templateId: string, copies: number) => void;
  onClose: () => void;
  onBack?: () => void;
  selectedGroup?: string;
}

interface PricingData {
  pricePerUnit: number;
  totalPrice: number;
  currency: string;
}

export default function TemplateSelectorModal({
  open,
  templates,
  onSelectTemplate,
  onClose,
  onBack,
  selectedGroup
}: TemplateSelectorModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [copies, setCopies] = useState<number>(1); // Start at 1, will be adjusted based on template
  const [inputValue, setInputValue] = useState<string>('1'); // Separate state for input display
  const [debouncedCopies, setDebouncedCopies] = useState<number>(1);

  // Group templates by category first
  const groupedTemplates = templates.reduce((groups, template) => {
    const group = template.group || "Other";
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(template);
    return groups;
  }, {} as Record<string, TemplateSize[]>);

  // Get pricing data for selected template and copies
  const selectedTemplateData = selectedTemplate ? templates.find(t => t.id === selectedTemplate) : null;
  
  // Determine minimum quantity based on template group
  const getMinQuantity = (template: TemplateSize | null): number => {
    if (!template) return 10;
    const dtfGroups = ['DTF Transfer Sizes', 'UV DTF Transfers', 'DTF - Digital Film Transfers', 'UV DTF - Select Template Size'];
    return dtfGroups.includes(template.group || '') ? 1 : 10;
  };
  
  const minQuantity = getMinQuantity(selectedTemplateData || null);
  
  // Debounce effect for copies
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCopies(copies);
    }, 300); // 300ms delay
    
    return () => clearTimeout(timer);
  }, [copies]);
  
  const { data: pricingData, isLoading: isPricingLoading } = useQuery<PricingData>({
    queryKey: ['/api/pricing', selectedTemplate, debouncedCopies],
    enabled: !!selectedTemplate && debouncedCopies > 0,
    staleTime: 30000, // Cache for 30 seconds
  });

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    // Update copies to minimum when template changes
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const newMinQuantity = getMinQuantity(template);
      // Always set to minimum quantity when selecting a template
      setCopies(newMinQuantity);
      setInputValue(String(newMinQuantity));
    }
  };

  const handleContinue = () => {
    if (selectedTemplate && copies > 0) {
      onSelectTemplate(selectedTemplate, copies);
      onClose();
      // Reset state for next time
      setSelectedTemplate(null);
      setCopies(1);
    }
  };

  const handleCancel = () => {
    // If onBack is available, go back to product selector instead of closing
    if (onBack) {
      onBack();
    } else {
      onClose();
    }
    // Reset state for next time
    setSelectedTemplate(null);
    setCopies(1);
  };

  console.log('TemplateSelectorModal render', { open, templatesLength: templates.length });
  
  return (
    <Dialog open={open} onOpenChange={() => {}} modal={true}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col z-50">
        <DialogHeader>
          <CompleteTransferLogo size="xl" className="mb-6 transform scale-125" />
          <DialogTitle className="text-2xl font-bold text-center">
            {selectedGroup ? `${selectedGroup} - Select Template Size` : "Select Your Template Size"}
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            {selectedGroup 
              ? `Choose the specific template size for your ${selectedGroup.toLowerCase()}.`
              : "Choose a template that matches your project requirements. Different templates are optimized for specific print types."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 pr-2">
          {Object.entries(groupedTemplates).map(([groupName, groupTemplates]) => (
            <Card key={groupName} className="border-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">{getTemplateGroupIcon(groupName)}</div>
                  <div>
                    <div className="font-semibold text-lg">{groupName}</div>
                    <div className="text-sm text-gray-500">
                      {groupTemplates.length} template{groupTemplates.length !== 1 ? 's' : ''} available
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {groupTemplates.map((template) => (
                      <Button
                        key={template.id}
                        variant={selectedTemplate === template.id ? "default" : "outline"}
                        className={`h-auto p-3 flex flex-col items-center justify-center space-y-2 transition-colors ${
                          selectedTemplate === template.id 
                            ? "bg-primary text-primary-foreground border-primary" 
                            : "hover:bg-gray-400 hover:border-blue-500"
                        }`}
                        onClick={() => handleTemplateSelect(template.id)}
                      >
                        <div className="font-semibold">{template.label}</div>
                        <div className="text-xs opacity-75">
                          {template.width}×{template.height}mm
                        </div>
                        {template.name === "dtf_1000x550" && (
                          <Badge variant="secondary" className="text-xs">
                            Large Format
                          </Badge>
                        )}
                      </Button>
                    ))}
                  </div>
                </CardContent>
            </Card>
          ))}
        </div>

        {/* Copies and Pricing Section */}
        {selectedTemplate && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Selected Template</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedTemplateData?.label} ({selectedTemplateData?.width}×{selectedTemplateData?.height}mm)
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <Label htmlFor="copies" className="text-sm font-medium">
                    Quantity of Transfers Required
                  </Label>
                  <Input
                    id="copies"
                    type="number"
                    min={minQuantity}
                    max="10000"
                    value={inputValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInputValue(value);
                      const numValue = parseInt(value) || minQuantity;
                      const validValue = Math.max(minQuantity, Math.min(10000, numValue));
                      setCopies(validValue);
                    }}
                    onBlur={() => {
                      // Ensure input shows valid value on blur
                      setInputValue(String(copies));
                    }}
                    className="w-24 text-center"
                  />
                  <p className="text-xs text-muted-foreground">
                    Min: {minQuantity} {minQuantity === 1 ? '(DTF/UV DTF)' : '(Standard)'}
                  </p>
                </div>
              </div>

              {/* Pricing Display */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Price Estimate</p>
                    {isPricingLoading ? (
                      <p className="text-sm">Loading pricing...</p>
                    ) : pricingData ? (
                      <div className="space-y-1">
                        <p className="text-sm">
                          €{pricingData.pricePerUnit.toFixed(2)} per unit ex VAT
                        </p>
                        <p className="text-lg font-semibold">
                          Total: €{pricingData.totalPrice.toFixed(2)} ex VAT
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Pricing unavailable
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {copies} × {selectedTemplateData?.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Prices from Odoo system
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {onBack ? 'Back to Product Selection' : 'Cancel'}
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!selectedTemplate || copies < minQuantity}
            className="min-w-32"
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}