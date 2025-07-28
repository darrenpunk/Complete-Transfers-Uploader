import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddText: (textData: { text: string; fontSize: number; fontFamily: string; color: string }) => void;
  initialColor?: string;
}

const fontOptions = [
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Courier New", label: "Courier New" },
  { value: "Georgia", label: "Georgia" },
  { value: "Verdana", label: "Verdana" },
  { value: "Impact", label: "Impact" },
  { value: "Comic Sans MS", label: "Comic Sans MS" },
];

export function TextDialog({ open, onOpenChange, onAddText, initialColor = "#000000" }: TextDialogProps) {
  const [text, setText] = useState("Your Text Here");
  const [fontSize, setFontSize] = useState(24);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [color, setColor] = useState(initialColor);

  const handleSubmit = () => {
    if (text.trim()) {
      onAddText({
        text: text.trim(),
        fontSize,
        fontFamily,
        color
      });
      // Reset form
      setText("Your Text Here");
      setFontSize(24);
      setFontFamily("Arial");
      setColor(initialColor);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Text Element</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="text-content">Text Content</Label>
            <Input
              id="text-content"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your text..."
              className="mt-1"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="font-size">Font Size</Label>
              <Input
                id="font-size"
                type="number"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                min={8}
                max={144}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="font-family">Font Family</Label>
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontOptions.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="text-color">Text Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="text-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-16 h-10 p-1 rounded border"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#000000"
                className="flex-1"
              />
            </div>
          </div>
          
          {/* Preview */}
          <div className="border rounded p-4 bg-gray-50">
            <Label className="text-sm text-gray-600">Preview:</Label>
            <div 
              style={{ 
                fontFamily, 
                fontSize: `${Math.min(fontSize, 32)}px`, 
                color,
                marginTop: '8px'
              }}
            >
              {text || "Your Text Here"}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!text.trim()}>
            Add Text
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}