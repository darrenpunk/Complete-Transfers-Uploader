import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Package } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface TemplateSize {
  id: string;
  name: string;
  label: string;
  width: number;
  height: number;
  group: string;
  description: string;
}

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
  const [searchQuery, setSearchQuery] = useState("");

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, TemplateSize[]> = {};
    
    templates.forEach((template) => {
      if (!groups[template.group]) {
        groups[template.group] = [];
      }
      groups[template.group].push(template);
    });

    return groups;
  }, [templates]);

  // Filter templates based on search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedTemplates;
    }

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, TemplateSize[]> = {};

    Object.entries(groupedTemplates).forEach(([group, items]) => {
      const matchingItems = items.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          group.toLowerCase().includes(query)
      );

      if (matchingItems.length > 0) {
        filtered[group] = matchingItems;
      }
    });

    return filtered;
  }, [groupedTemplates, searchQuery]);

  const handleSelect = (template: TemplateSize) => {
    onSelectProduct(template);
    setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Select Transfer Product
          </DialogTitle>
          <DialogDescription>
            Choose from our complete range of transfer products and sizes
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products (e.g., A4, Metallic, DTF)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-product"
          />
        </div>

        {/* Products List */}
        <ScrollArea className="flex-1 pr-4">
          {Object.keys(filteredGroups).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No products found matching "{searchQuery}"</p>
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={Object.keys(filteredGroups)} className="w-full">
              {Object.entries(filteredGroups).map(([group, items]) => (
                <AccordionItem key={group} value={group}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{group}</span>
                      <span className="text-sm text-muted-foreground">({items.length})</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-2 pt-2">
                      {items.map((template) => (
                        <Button
                          key={template.id}
                          variant="outline"
                          className="w-full justify-start h-auto py-3 px-4 hover:bg-primary/5 hover:border-primary"
                          onClick={() => handleSelect(template)}
                          data-testid={`product-${template.id}`}
                        >
                          <div className="flex flex-col items-start text-left w-full">
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium">{template.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {template.width}×{template.height}mm
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {template.description}
                            </span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
