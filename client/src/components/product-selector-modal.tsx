import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import CompleteTransferLogo from "./complete-transfer-logo";
import type { TemplateSize } from "@shared/schema";
import { useState } from "react";

// Import the same icons used in the main template selector
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";

// Template group icons
const getTemplateGroupIcon = (group: string) => {
  switch (group) {
    case "Screen Printed Transfers":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Screen Printed Transfers" 
          className="h-10 w-10 object-contain"
        />
      );
    case "Digital Transfers":
      return (
        <img 
          src={dtfIconPath} 
          alt="Digital Transfers" 
          className="h-10 w-10 object-contain"
        />
      );
    default:
      return <span className="text-2xl">📐</span>;
  }
};

interface ProductSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProduct: (template: TemplateSize) => void;
  templates: TemplateSize[];
}

export function ProductSelectorModal({
  open,
  onOpenChange,
  onSelectProduct,
  templates,
}: ProductSelectorModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Group templates by category
  const groupedTemplates = templates.reduce((groups, template) => {
    const group = template.group || "Other";
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(template);
    return groups;
  }, {} as Record<string, TemplateSize[]>);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
  };

  const handleContinue = () => {
    if (selectedTemplate) {
      const template = templates.find(t => t.id === selectedTemplate);
      if (template) {
        onSelectProduct(template);
        setSelectedTemplate(null);
      }
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setSelectedTemplate(null);
  };

  const selectedTemplateData = selectedTemplate ? templates.find(t => t.id === selectedTemplate) : null;

  return (
    <Dialog open={open} onOpenChange={() => {}} modal={true}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col z-50">
        <DialogHeader>
          <CompleteTransferLogo size="xl" className="mb-6 transform scale-125" />
          <DialogTitle className="text-2xl font-bold text-center">
            Select Transfer Product
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            Choose the transfer product you'd like to order along with your vectorization service.
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
                      data-testid={`product-${template.id}`}
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

        {/* Selected Template Display */}
        {selectedTemplate && (
          <>
            <Separator />
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Selected Template</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedTemplateData?.label} ({selectedTemplateData?.width}×{selectedTemplateData?.height}mm)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedTemplateData?.description}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!selectedTemplate}
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
