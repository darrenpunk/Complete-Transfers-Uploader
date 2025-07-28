import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  Copyright,
  Palette,
  Type,
  Layers
} from "lucide-react";

interface PDFPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  project: any;
  logos: any[];
  canvasElements: any[];
  template: any;
}

export default function PDFPreviewModal({
  open,
  onOpenChange,
  onApprove,
  project,
  logos,
  canvasElements,
  template
}: PDFPreviewModalProps) {
  const [designApproved, setDesignApproved] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const canProceed = designApproved && rightsConfirmed;

  const handleApprove = () => {
    if (canProceed) {
      onApprove();
      onOpenChange(false);
      // Reset checkboxes for next time
      setDesignApproved(false);
      setRightsConfirmed(false);
    }
  };

  // Calculate preflight summary data
  const totalLogos = logos.length;
  const hasLowResLogos = logos.some(logo => {
    const colorInfo = logo.svgColors as any;
    return colorInfo && colorInfo.resolution && colorInfo.resolution < 300;
  });
  const hasFonts = logos.some(logo => {
    const colorInfo = logo.svgColors as any;
    return colorInfo && colorInfo.fonts && colorInfo.fonts.length > 0;
  });
  const hasUnconvertedColors = logos.some(logo => {
    const colorInfo = logo.svgColors as any;
    return colorInfo && !colorInfo.converted;
  });

  const preflightItems = [
    {
      icon: Layers,
      label: "Design Elements",
      value: `${totalLogos} logo${totalLogos !== 1 ? 's' : ''} uploaded`,
      status: totalLogos > 0 ? "success" : "warning"
    },
    {
      icon: Eye,
      label: "Image Quality", 
      value: hasLowResLogos ? "Low resolution detected" : "High quality vectors",
      status: hasLowResLogos ? "warning" : "success"
    },
    {
      icon: Type,
      label: "Typography",
      value: hasFonts ? "Fonts need outlining" : "Text properly outlined",
      status: hasFonts ? "warning" : "success"
    },
    {
      icon: Palette,
      label: "Color Space",
      value: hasUnconvertedColors ? "RGB colors detected" : "CMYK ready",
      status: hasUnconvertedColors ? "warning" : "success"
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            PDF Preview & Approval
          </DialogTitle>
          <DialogDescription>
            Review your design and confirm approval before generating the final PDF
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex gap-6 h-[70vh]">
          {/* PDF Preview Section */}
          <div className="flex-1 space-y-4">
            <h3 className="text-lg font-semibold">PDF Preview</h3>
            
            {/* Page 1 Preview */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Page 1 - Artwork Layout</h4>
              <div className="border rounded-lg p-4 bg-muted/20 min-h-[300px] flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm">Artwork preview will be displayed here</p>
                  <p className="text-xs mt-1">Template: {template?.name} ({template?.width}×{template?.height}mm)</p>
                </div>
              </div>
            </div>

            {/* Page 2 Preview */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Page 2 - Garment Background</h4>
              <div className="border rounded-lg p-4 bg-muted/20 min-h-[200px] flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">Garment color preview</p>
                  {project?.garmentColor && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <div 
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: project.garmentColor }}
                      />
                      <span className="text-xs">{project.garmentColor}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator orientation="vertical" />

          {/* Preflight Summary Sidebar */}
          <div className="w-80 space-y-4">
            <h3 className="text-lg font-semibold">Preflight Summary</h3>
            
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {preflightItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg border">
                    <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.status === "success" ? (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Separator />

            {/* Project Details */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Project Details</h4>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p><span className="font-medium">Template:</span> {template?.name}</p>
                <p><span className="font-medium">Size:</span> {template?.width}×{template?.height}mm</p>
                <p><span className="font-medium">Elements:</span> {canvasElements.length} positioned</p>
                <p><span className="font-medium">Project:</span> {project?.name || "Untitled Project"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Approval Checkboxes */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-start space-x-3">
            <Checkbox 
              id="design-approval" 
              checked={designApproved}
              onCheckedChange={(checked) => setDesignApproved(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label 
                htmlFor="design-approval"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I approve this design layout and artwork positioning
              </Label>
              <p className="text-xs text-muted-foreground">
                Confirm that the design appears as intended and all elements are correctly positioned
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox 
              id="rights-confirmation" 
              checked={rightsConfirmed}
              onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label 
                htmlFor="rights-confirmation"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
              >
                <Copyright className="w-3 h-3" />
                I have the rights to use all images and artwork
              </Label>
              <p className="text-xs text-muted-foreground">
                I confirm that I own or have permission to use all uploaded images, logos, and artwork for commercial printing
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleApprove}
            disabled={!canProceed}
            className={!canProceed ? "opacity-50 cursor-not-allowed" : ""}
          >
            Approve & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}