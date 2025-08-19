import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CanvasElement, TemplateSize } from "@shared/schema";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Grid, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ImpositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedElement: CanvasElement;
  template: TemplateSize;
}

export default function ImpositionModal({
  open,
  onOpenChange,
  selectedElement,
  template
}: ImpositionModalProps) {
  const [rows, setRows] = useState(2);
  const [columns, setColumns] = useState(2);
  const [horizontalSpacing, setHorizontalSpacing] = useState(10);
  const [verticalSpacing, setVerticalSpacing] = useState(10);
  const [centerOnCanvas, setCenterOnCanvas] = useState(true);

  // Create imposition mutation
  const createImpositionMutation = useMutation({
    mutationFn: async (params: {
      elementId: string;
      rows: number;
      columns: number;
      horizontalSpacing: number;
      verticalSpacing: number;
      centerOnCanvas: boolean;
    }) => {
      const response = await apiRequest("POST", `/api/canvas-elements/${params.elementId}/imposition`, {
        rows: params.rows,
        columns: params.columns,
        horizontalSpacing: params.horizontalSpacing,
        verticalSpacing: params.verticalSpacing,
        centerOnCanvas: params.centerOnCanvas
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedElement.projectId, "canvas-elements"]
      });
      toast({
        title: "Success",
        description: `Created ${rows} down × ${columns} across imposition grid`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Imposition error:', error);
      toast({
        title: "Error",
        description: "Failed to create imposition. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleCreateImposition = () => {
    // Validate inputs
    if (rows < 1 || rows > 20) {
      toast({
        title: "Invalid Input",
        description: "Down must be between 1 and 20",
        variant: "destructive",
      });
      return;
    }
    
    if (columns < 1 || columns > 20) {
      toast({
        title: "Invalid Input", 
        description: "Across must be between 1 and 20",
        variant: "destructive",
      });
      return;
    }

    // Check if imposition will fit on canvas only if NOT centering
    const totalWidth = (columns * selectedElement.width) + ((columns - 1) * horizontalSpacing);
    const totalHeight = (rows * selectedElement.height) + ((rows - 1) * verticalSpacing);
    
    if (!centerOnCanvas && (selectedElement.x + totalWidth > template.width || selectedElement.y + totalHeight > template.height)) {
      toast({
        title: "Size Warning",
        description: "Imposition may extend beyond canvas boundaries. Try enabling 'Center grid on canvas'.",
        variant: "destructive",
      });
      return;
    }
    
    // If centering, check if grid itself is bigger than template
    if (centerOnCanvas && (totalWidth > template.width || totalHeight > template.height)) {
      toast({
        title: "Size Warning",
        description: "Grid is too large for this template. Reduce grid size or spacing.",
        variant: "destructive",
      });
      return;
    }

    createImpositionMutation.mutate({
      elementId: selectedElement.id,
      rows,
      columns,
      horizontalSpacing,
      verticalSpacing,
      centerOnCanvas
    });
  };

  const totalCopies = rows * columns;
  const totalWidth = (columns * selectedElement.width) + ((columns - 1) * horizontalSpacing);
  const totalHeight = (rows * selectedElement.height) + ((rows - 1) * verticalSpacing);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Grid className="w-5 h-5" />
            Imposition Tool
          </DialogTitle>
          <DialogDescription>
            Replicate the selected logo across the canvas in a grid pattern
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Grid Configuration */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Down</Label>
                <Input
                  type="number"
                  value={rows}
                  onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={20}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Across</Label>
                <Input
                  type="number"
                  value={columns}
                  onChange={(e) => setColumns(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={20}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">H-Spacing (mm)</Label>
                <Input
                  type="number"
                  value={horizontalSpacing}
                  onChange={(e) => setHorizontalSpacing(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  max={50}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">V-Spacing (mm)</Label>
                <Input
                  type="number"
                  value={verticalSpacing}
                  onChange={(e) => setVerticalSpacing(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  max={50}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Centering Option */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="centerOnCanvas"
                checked={centerOnCanvas}
                onCheckedChange={(checked) => setCenterOnCanvas(checked === true)}
              />
              <Label htmlFor="centerOnCanvas" className="text-sm font-medium">
                Center grid on canvas
              </Label>
            </div>
          </div>

          {/* Preview Information */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="text-sm font-medium text-gray-900">Preview</div>
            <div className="text-sm text-gray-600 space-y-1">
              <div>Total copies: {totalCopies}</div>
              <div>Grid size: {Math.round(totalWidth)}×{Math.round(totalHeight)}mm</div>
              <div>Logo size: {Math.round(selectedElement.width)}×{Math.round(selectedElement.height)}mm</div>
            </div>
            
            {!centerOnCanvas && (selectedElement.x + totalWidth > template.width || selectedElement.y + totalHeight > template.height) && (
              <div className="text-sm text-red-600 font-medium">
                ⚠️ Grid may extend beyond canvas (try centering)
              </div>
            )}
            {centerOnCanvas && (totalWidth > template.width || totalHeight > template.height) && (
              <div className="text-sm text-red-600 font-medium">
                ⚠️ Grid too large for template
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateImposition}
              disabled={createImpositionMutation.isPending}
              className="flex-1"
            >
              {createImpositionMutation.isPending ? "Creating..." : `Create ${totalCopies} Copies`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}