import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import CompleteTransferLogo from "./complete-transfer-logo";
import { FileText, AlertCircle, MessageSquare, Palette } from "lucide-react";
import { MultiColorSelector } from "./multi-color-selector";
import type { GarmentColorItem } from "@shared/schema";

interface ProjectNameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName?: string;
  onConfirm: (projectData: { 
    name: string; 
    comments: string; 
    garmentColors?: GarmentColorItem[];
    totalQuantity?: number;
  }) => void;
  isGeneratingPDF?: boolean;
  title?: string;
  description?: string;
}

export default function ProjectNameModal({
  open,
  onOpenChange,
  currentName = "",
  onConfirm,
  isGeneratingPDF = false,
  title = "Name Your Project",
  description = "Please provide project details before continuing. This information will be used for the PDF filename and Odoo integration."
}: ProjectNameModalProps) {
  const [projectName, setProjectName] = useState(currentName);
  const [comments, setComments] = useState("");
  const [hasError, setHasError] = useState(false);
  const [useMultiColor, setUseMultiColor] = useState(false);
  const [garmentColors, setGarmentColors] = useState<GarmentColorItem[]>([]);

  const handleConfirm = () => {
    const trimmedName = projectName.trim();
    
    if (!trimmedName || trimmedName === 'Untitled Project') {
      setHasError(true);
      return;
    }

    setHasError(false);
    
    // Generate comments from garment colors if multi-color mode is enabled
    let finalComments = comments.trim();
    if (useMultiColor && garmentColors.length > 0) {
      const colorComments = garmentColors
        .map(gc => `${gc.quantity} ${gc.colorName}`)
        .join('\n');
      
      // Prepend color info to existing comments
      finalComments = colorComments + (finalComments ? '\n\n' + finalComments : '');
    }
    
    // Calculate total quantity from garment colors
    const totalQuantity = useMultiColor && garmentColors.length > 0
      ? garmentColors.reduce((sum, gc) => sum + gc.quantity, 0)
      : undefined;
    
    onConfirm({
      name: trimmedName,
      comments: finalComments,
      garmentColors: useMultiColor && garmentColors.length > 0 ? garmentColors : undefined,
      totalQuantity
    });
    onOpenChange(false);
  };

  const handleInputChange = (value: string) => {
    setProjectName(value);
    if (hasError && value.trim() && value.trim() !== 'Untitled Project') {
      setHasError(false);
    }
  };



  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 justify-center">
            <FileText className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter project name..."
              className={hasError ? "border-red-300 focus:border-red-500" : ""}
              autoFocus
            />
          </div>



          {/* Multi-Color Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="flex-1">
              <Label htmlFor="multi-color-toggle" className="flex items-center gap-2 cursor-pointer">
                <Palette className="w-4 h-4" />
                <span className="font-medium">Multiple Garment Colors</span>
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Need the same artwork on different garment colors with specific quantities
              </p>
            </div>
            <Switch
              id="multi-color-toggle"
              checked={useMultiColor}
              onCheckedChange={setUseMultiColor}
              data-testid="switch-multi-color"
            />
          </div>

          {/* Multi-Color Selector */}
          {useMultiColor && (
            <MultiColorSelector
              garmentColors={garmentColors}
              onChange={setGarmentColors}
              className="border rounded-lg p-4 bg-card"
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="comments" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {useMultiColor ? "Additional Comments (Optional)" : "Comments"}
            </Label>
            {useMultiColor && (
              <div className="text-sm text-muted-foreground mb-2">
                Garment colors will be automatically added to comments. Add any additional notes below.
              </div>
            )}
            {!useMultiColor && (
              <div className="text-sm text-muted-foreground mb-2">
                This area is for artwork related comments ONLY, and will only be seen at the time of processing artwork. All other requests must be sent by replying to the email confirmation that you will receive after the order is placed.
              </div>
            )}
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={useMultiColor ? "Enter any additional instructions..." : "Enter any special instructions or comments..."}
              rows={3}
              className="resize-none"
            />
          </div>
          
          {hasError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              Please enter a valid project name
            </div>
          )}
          
          <div className="text-xs text-muted-foreground">
            Project name will be used for PDF filename and project identification.
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGeneratingPDF}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isGeneratingPDF}
          >
            {isGeneratingPDF ? "Generating..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}