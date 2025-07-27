import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

interface AppliqueBadgesFormData {
  embroideryFileOptions: string[];
  embroideryThreadOptions: string[];
  position: string[];
  graphicSize: string;
  embroideredParts: string;
}

interface AppliqueBadgesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (formData: AppliqueBadgesFormData) => void;
  isLoading?: boolean;
}

export default function AppliqueBadgesModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false
}: AppliqueBadgesModalProps) {
  console.log('AppliqueBadgesModal render:', { open, isLoading });
  
  useEffect(() => {
    console.log('AppliqueBadgesModal open state changed:', open);
  }, [open]);
  const [formData, setFormData] = useState<AppliqueBadgesFormData>({
    embroideryFileOptions: [],
    embroideryThreadOptions: [],
    position: [],
    graphicSize: "",
    embroideredParts: ""
  });

  const embroideryFileOptions = [
    "EMB Ver: 2006", "EMB Ver: E1", "EMB Ver: E2",
    "EMB Ver: E3", "EMB Ver: E4", "EMB Ver: 4.1",
    "Melco: OFM", "Bernina: ART", "Husqvarna/ viking: VP3",
    "Melco: EXP", "Singer: XXX", "Husqvarna / viking: HUS",
    "Pfaff: PCD / PCM / PCS", "Janome: JEF", "Brother / Babylock / Deco: PES / PEC"
  ];

  const threadOptions = [
    "Maderia Classic 40", "Maderia Polyneon 40",
    "Maderia Classic 60", "Maderia Polyneon 60"
  ];

  const positionOptions = [
    "LEFT BREAST", "RIGHT BREAST", "FRONT OF CAP", "SIDE OF CAP",
    "BEANIE HATS", "LARGE REAR", "NAPE OF NECK", "REAR OF CAP",
    "SLEEVE", "OTHER", "COLLAR"
  ];

  const handleCheckboxChange = (
    field: keyof AppliqueBadgesFormData,
    value: string,
    checked: boolean
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked
        ? [...(prev[field] as string[]), value]
        : (prev[field] as string[]).filter(item => item !== value)
    }));
  };

  const handleTextChange = (field: keyof AppliqueBadgesFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = () => {
    onConfirm(formData);
    onOpenChange(false);
  };

  const handleCancel = () => {
    // Reset form data
    setFormData({
      embroideryFileOptions: [],
      embroideryThreadOptions: [],
      position: [],
      graphicSize: "",
      embroideredParts: ""
    });
    onOpenChange(false);
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              EMBROIDERY FILE OPTIONS
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>
            We will automatically produce a DST and EMB file for your order. If you require any additional machine file please select it below
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Embroidery File Options */}
          <div>
            <Label className="text-base font-medium mb-3 block">
              Embroidery File Options
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {embroideryFileOptions.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`file-${option}`}
                    checked={formData.embroideryFileOptions.includes(option)}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange('embroideryFileOptions', option, checked === true)
                    }
                  />
                  <Label htmlFor={`file-${option}`} className="text-sm font-normal">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Embroidery Thread Options */}
          <div>
            <Label className="text-base font-medium mb-3 block">
              EMBROIDERY THREAD OPTIONS
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Please select the thread type required
            </p>
            <div className="grid grid-cols-2 gap-3">
              {threadOptions.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`thread-${option}`}
                    checked={formData.embroideryThreadOptions.includes(option)}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange('embroideryThreadOptions', option, checked === true)
                    }
                  />
                  <Label htmlFor={`thread-${option}`} className="text-sm font-normal">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Position */}
          <div>
            <Label className="text-base font-medium mb-3 block">
              Position
            </Label>
            <div className="grid grid-cols-4 gap-3">
              {positionOptions.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`position-${option}`}
                    checked={formData.position.includes(option)}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange('position', option, checked === true)
                    }
                  />
                  <Label htmlFor={`position-${option}`} className="text-sm font-normal">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Graphic Size */}
          <div>
            <Label htmlFor="graphic-size" className="text-base font-medium mb-3 block">
              Graphic Size
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Please enter in mm the overall size of the graphic including the embroidery
            </p>
            <Textarea
              id="graphic-size"
              value={formData.graphicSize}
              onChange={(e) => handleTextChange('graphicSize', e.target.value)}
              placeholder="Enter size in mm..."
              className="min-h-[80px]"
            />
          </div>

          {/* Embroidered Parts */}
          <div>
            <Label htmlFor="embroidered-parts" className="text-base font-medium mb-3 block">
              Embroidered Parts
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Please detail the parts of you graphic that you need embroidered
            </p>
            <Textarea
              id="embroidered-parts"
              value={formData.embroideredParts}
              onChange={(e) => handleTextChange('embroideredParts', e.target.value)}
              placeholder="Detail the parts that need embroidering..."
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="bg-purple-600 text-white hover:bg-purple-700 border-purple-600"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            {isLoading ? "Processing..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}