import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Palette } from "lucide-react";

interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

interface CMYKColorModalProps {
  initialColor: string;
  onChange: (newColor: string) => void;
  label: string;
  currentColor: string;
  trigger?: React.ReactNode;
  cmykValues?: {
    c: number;
    m: number;
    y: number;
    k: number;
  };
}

// Color conversion utilities
function parseRGBPercentage(rgbString: string): { r: number; g: number; b: number } | null {
  const match = rgbString.match(/rgb\(([0-9.]+)%,\s*([0-9.]+)%,\s*([0-9.]+)%\)/);
  if (!match) return null;

  const r = Math.round((parseFloat(match[1]) / 100) * 255);
  const g = Math.round((parseFloat(match[2]) / 100) * 255);
  const b = Math.round((parseFloat(match[3]) / 100) * 255);

  return { r, g, b };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  };
}

function rgbToCmyk(rgb: { r: number; g: number; b: number }): CMYKColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const k = 1 - Math.max(r, Math.max(g, b));
  const c = k === 1 ? 0 : (1 - r - k) / (1 - k);
  const m = k === 1 ? 0 : (1 - g - k) / (1 - k);
  const y = k === 1 ? 0 : (1 - b - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

function cmykToRgb(cmyk: CMYKColor): { r: number; g: number; b: number } {
  const c = cmyk.c / 100;
  const m = cmyk.m / 100;
  const y = cmyk.y / 100;
  const k = cmyk.k / 100;

  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));

  return { r, g, b };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function getCMYKFromColor(colorString: string): CMYKColor | null {
  // Try RGB percentage first
  const rgbPercent = parseRGBPercentage(colorString);
  if (rgbPercent) return rgbToCmyk(rgbPercent);
  
  // Try hex color
  const rgb = hexToRgb(colorString);
  if (rgb) return rgbToCmyk(rgb);
  
  return null;
}

export default function CMYKColorModal({ initialColor, onChange, label, currentColor, trigger, cmykValues }: CMYKColorModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const initialCMYK = cmykValues || getCMYKFromColor(currentColor) || getCMYKFromColor(initialColor) || { c: 0, m: 0, y: 0, k: 0 };
  const [cmyk, setCmyk] = useState<CMYKColor>(initialCMYK);

  const handleCMYKChange = (channel: keyof CMYKColor, value: number) => {
    const newCMYK = { ...cmyk, [channel]: Math.max(0, Math.min(100, value)) };
    setCmyk(newCMYK);
    
    // Convert CMYK back to RGB hex for the onChange callback
    const rgb = cmykToRgb(newCMYK);
    const hex = rgbToHex(rgb);
    onChange(hex);
  };

  const handleApply = () => {
    setIsOpen(false);
  };

  const previewRgb = cmykToRgb(cmyk);
  const previewColor = rgbToHex(previewRgb);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <div 
              className="w-8 h-8 rounded border-2 border-gray-300 flex-shrink-0"
              style={{ backgroundColor: currentColor }}
            />
            <div className="flex-1">
              <div className="text-xs text-gray-600">{label}</div>
              <div className="text-xs font-mono text-gray-500">{currentColor}</div>
            </div>
            <Button variant="outline" size="sm">
              <Palette className="w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md" aria-describedby="cmyk-editor-description">
        <DialogHeader>
          <DialogTitle>CMYK Color Editor</DialogTitle>
        </DialogHeader>
        <div id="cmyk-editor-description" className="sr-only">
          Professional CMYK color editor with sliders and numeric inputs for precise color control
        </div>
        
        <div className="space-y-4">
          {/* Color Preview */}
          <div className="flex items-center gap-3">
            <div 
              className="w-16 h-16 rounded border-2 border-gray-300 flex-shrink-0"
              style={{ backgroundColor: previewColor }}
            />
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs font-mono text-gray-600">{previewColor}</div>
              <div className="text-xs text-gray-500">
                C{cmyk.c} M{cmyk.m} Y{cmyk.y} K{cmyk.k}
              </div>
            </div>
          </div>

          {/* CMYK Sliders */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-cyan-600">Cyan (C)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cmyk.c}
                  onChange={(e) => handleCMYKChange('c', parseInt(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, white, cyan)`
                  }}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={cmyk.c}
                  onChange={(e) => handleCMYKChange('c', parseInt(e.target.value) || 0)}
                  className="w-16 h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-pink-600">Magenta (M)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cmyk.m}
                  onChange={(e) => handleCMYKChange('m', parseInt(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, white, magenta)`
                  }}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={cmyk.m}
                  onChange={(e) => handleCMYKChange('m', parseInt(e.target.value) || 0)}
                  className="w-16 h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-yellow-600">Yellow (Y)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cmyk.y}
                  onChange={(e) => handleCMYKChange('y', parseInt(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, white, yellow)`
                  }}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={cmyk.y}
                  onChange={(e) => handleCMYKChange('y', parseInt(e.target.value) || 0)}
                  className="w-16 h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-800">Black (K)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cmyk.k}
                  onChange={(e) => handleCMYKChange('k', parseInt(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, white, black)`
                  }}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={cmyk.k}
                  onChange={(e) => handleCMYKChange('k', parseInt(e.target.value) || 0)}
                  className="w-16 h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              Apply Color
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}