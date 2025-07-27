import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, AlertCircle } from "lucide-react";

interface ProjectNameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName?: string;
  onConfirm: (projectName: string) => void;
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
  description = "Please provide a name for your project before continuing. This will be used for the PDF filename."
}: ProjectNameModalProps) {
  const [projectName, setProjectName] = useState(currentName);
  const [hasError, setHasError] = useState(false);

  const handleConfirm = () => {
    const trimmedName = projectName.trim();
    
    if (!trimmedName || trimmedName === 'Untitled Project') {
      setHasError(true);
      return;
    }

    setHasError(false);
    onConfirm(trimmedName);
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
      <DialogContent className="sm:max-w-md">
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
            {hasError && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                Please enter a valid project name
              </div>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground">
            This name will be used for the PDF filename and project identification.
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