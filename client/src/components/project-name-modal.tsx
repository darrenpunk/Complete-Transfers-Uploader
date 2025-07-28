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
import { FileText, AlertCircle, MessageSquare, Hash } from "lucide-react";

interface ProjectNameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName?: string;
  onConfirm: (projectData: { name: string; comments: string; quantity: number }) => void;
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
  const [quantity, setQuantity] = useState(1);
  const [hasError, setHasError] = useState(false);

  const handleConfirm = () => {
    const trimmedName = projectName.trim();
    
    if (!trimmedName || trimmedName === 'Untitled Project') {
      setHasError(true);
      return;
    }

    if (quantity < 1) {
      setHasError(true);
      return;
    }

    setHasError(false);
    onConfirm({
      name: trimmedName,
      comments: comments.trim(),
      quantity: quantity
    });
    onOpenChange(false);
  };

  const handleInputChange = (value: string) => {
    setProjectName(value);
    if (hasError && value.trim() && value.trim() !== 'Untitled Project' && quantity >= 1) {
      setHasError(false);
    }
  };

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value) || 1;
    setQuantity(Math.max(1, num));
    if (hasError && projectName.trim() && projectName.trim() !== 'Untitled Project' && num >= 1) {
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
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
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

          <div className="space-y-2">
            <Label htmlFor="quantity" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Quantity of Transfers Required
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              placeholder="1"
              className={hasError ? "border-red-300 focus:border-red-500" : ""}
            />
            <div className="text-xs text-muted-foreground">
              This quantity will be added to the Odoo webcart
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comments
            </Label>
            <div className="text-sm text-muted-foreground mb-2">
              Artwork Comments Box: This area is for artwork related comments ONLY, and will only be seen at the time of processing artwork. All other requests must be sent by replying to the email confirmation that you will receive after the order is placed.
            </div>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter any special instructions or comments..."
              rows={3}
              className="resize-none"
            />
          </div>
          
          {hasError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              Please enter a valid project name and quantity (minimum 1)
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