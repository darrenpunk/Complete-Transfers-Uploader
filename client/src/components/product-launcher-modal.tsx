import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CompleteTransferLogo from "./complete-transfer-logo";
import { useQuery } from "@tanstack/react-query";
import type { TemplateSize } from "@shared/schema";

// Import product icons
import dtfIconPath from "@assets/DTF_1753540006979.png";
import fullColourIconPath from "@assets/Full Colour tshirt mock_1753540286823.png";
import uvdtfIconPath from "@assets/UVDTF page2_1753544185426.png";
import wovenBadgeIconPath from "@assets/image (2)_1753544203744.png";

// Template category icons mapping
const categoryIcons: { [key: string]: string } = {
  'A3': fullColourIconPath,
  'A4': fullColourIconPath,
  'A5': fullColourIconPath,
  'A6': fullColourIconPath,
  'DTF': dtfIconPath,
  'UV DTF': uvdtfIconPath,
  'Sublimation': fullColourIconPath,
  'Applique': wovenBadgeIconPath,
  'Woven': wovenBadgeIconPath,
  'Reflective': fullColourIconPath,
  'Metallic': fullColourIconPath,
  'HD': fullColourIconPath,
  'Single Colour': fullColourIconPath,
  'default': fullColourIconPath
};

// Get icon for template based on its label
const getTemplateIcon = (template: TemplateSize): string => {
  const label = template.label.toLowerCase();
  
  if (label.includes('dtf') && !label.includes('uv')) return categoryIcons['DTF'];
  if (label.includes('uv dtf')) return categoryIcons['UV DTF'];
  if (label.includes('sublimation')) return categoryIcons['Sublimation'];
  if (label.includes('applique')) return categoryIcons['Applique'];
  if (label.includes('woven')) return categoryIcons['Woven'];
  if (label.includes('reflective')) return categoryIcons['Reflective'];
  if (label.includes('metallic')) return categoryIcons['Metallic'];
  if (label.includes('hd')) return categoryIcons['HD'];
  if (label.includes('single colour')) return categoryIcons['Single Colour'];
  
  return categoryIcons['default'];
};

interface ProductLauncherModalProps {
  open: boolean;
  onClose: () => void;
  onSelectProduct: (templateId: string) => void;
}

export default function ProductLauncherModal({ 
  open, 
  onClose, 
  onSelectProduct 
}: ProductLauncherModalProps) {
  
  const { data: templateSizes = [] } = useQuery<TemplateSize[]>({
    queryKey: ['/api/template-sizes'],
  });

  // Group templates by their group property
  const groupedTemplates = templateSizes.reduce((acc: { [key: string]: TemplateSize[] }, template) => {
    const group = template.group;
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(template);
    return acc;
  }, {});

  const handleTemplateSelect = (templateId: string) => {
    onSelectProduct(templateId);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="text-2xl font-bold text-center mb-2">
            Select Template
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            Choose the template size and type for your transfer
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-8 p-6">
          {Object.entries(groupedTemplates).map(([groupName, templates]) => (
            <div key={groupName} className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">
                {groupName}
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {templates.map((template) => (
                  <Card 
                    key={template.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-primary"
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <CardContent className="p-4 text-center space-y-3">
                      <div className="mx-auto w-12 h-12 flex items-center justify-center">
                        <img 
                          src={getTemplateIcon(template)} 
                          alt={template.label}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <h3 className="font-semibold text-sm text-gray-900">
                          {template.label}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {template.width}×{template.height}mm
                        </p>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTemplateSelect(template.id);
                        }}
                      >
                        Select
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
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