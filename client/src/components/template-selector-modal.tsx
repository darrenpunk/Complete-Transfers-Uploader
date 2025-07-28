import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TemplateSize } from "@shared/schema";

// Import the same icons used in the sidebar
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";
import uvdtfIconPath from "@assets/UVDTF page2_1753544185426.png";
import wovenBadgeIconPath from "@assets/image (2)_1753544203744.png";

// Template group icons - using same icons as sidebar
const getTemplateGroupIcon = (group: string) => {
  switch (group) {
    case "Full Colour Transfer Sizes":
      return (
        <img 
          src={fullColourIconPath} 
          alt="Full Colour Transfer" 
          className="h-10 w-10 object-contain"
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
          style={{ filter: "contrast(1.1) saturate(1.1)" }}
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
  onSelectTemplate: (templateId: string) => void;
  onClose: () => void;
  selectedGroup?: string;
}

export default function TemplateSelectorModal({
  open,
  templates,
  onSelectTemplate,
  onClose,
  selectedGroup
}: TemplateSelectorModalProps) {
  // Group templates by category first
  const groupedTemplates = templates.reduce((groups, template) => {
    const group = template.group || "Other";
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(template);
    return groups;
  }, {} as Record<string, TemplateSize[]>);

  const handleTemplateSelect = (templateId: string) => {
    onSelectTemplate(templateId);
    onClose();
  };

  console.log('TemplateSelectorModal render', { open, templatesLength: templates.length });
  
  return (
    <Dialog open={open} onOpenChange={() => {}} modal={true}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col z-50">
        <DialogHeader>
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
                        variant="outline"
                        className="h-auto p-3 flex flex-col items-center justify-center space-y-2 hover:bg-gray-50 hover:border-blue-500 transition-colors"
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

        <div className="flex justify-center pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}