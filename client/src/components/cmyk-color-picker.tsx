import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

interface CMYKColorPickerProps {
  initialColor: string;
  onChange: (newColor: string) => void;
  label: string;
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

function getCMYKFromRGBPercentage(rgbString: string): CMYKColor | null {
  const rgb = parseRGBPercentage(rgbString);
  if (!rgb) return null;
  return rgbToCmyk(rgb);
}

export default function CMYKColorPicker({ initialColor, onChange, label }: CMYKColorPickerProps) {
  const initialCMYK = getCMYKFromRGBPercentage(initialColor) || { c: 0, m: 0, y: 0, k: 0 };
  const [cmyk, setCmyk] = useState<CMYKColor>(initialCMYK);

  const handleCMYKChange = (channel: keyof CMYKColor, value: number) => {
    const newCMYK = { ...cmyk, [channel]: Math.max(0, Math.min(100, value)) };
    setCmyk(newCMYK);
    
    // Convert CMYK back to RGB hex for the onChange callback
    const rgb = cmykToRgb(newCMYK);
    const hex = rgbToHex(rgb);
    onChange(hex);
  };

  const previewRgb = cmykToRgb(cmyk);
  const previewColor = rgbToHex(previewRgb);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      
      {/* Color Preview */}
      <div className="flex items-center gap-3">
        <div 
          className="w-12 h-12 rounded border-2 border-gray-300 flex-shrink-0"
          style={{ backgroundColor: previewColor }}
        />
        <div className="text-xs">
          <div className="font-mono text-gray-600">{previewColor}</div>
          <div className="text-gray-500">
            C{cmyk.c} M{cmyk.m} Y{cmyk.y} K{cmyk.k}
          </div>
        </div>
      </div>

      {/* CMYK Sliders */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="w-4 text-xs font-medium text-cyan-600">C</Label>
          <input
            type="range"
            min="0"
            max="100"
            value={cmyk.c}
            onChange={(e) => handleCMYKChange('c', parseInt(e.target.value))}
            className="flex-1 h-2 bg-gradient-to-r from-white to-cyan-500 rounded-lg appearance-none cursor-pointer"
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

        <div className="flex items-center gap-2">
          <Label className="w-4 text-xs font-medium text-magenta-600">M</Label>
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

        <div className="flex items-center gap-2">
          <Label className="w-4 text-xs font-medium text-yellow-600">Y</Label>
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

        <div className="flex items-center gap-2">
          <Label className="w-4 text-xs font-medium text-gray-800">K</Label>
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
  );
}