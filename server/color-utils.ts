// Color conversion utilities for RGB to CMYK conversion
import { adobeRgbToCmyk } from './adobe-cmyk-profile';

export interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Convert RGB percentage values to 0-255 range
 */
export function parseRGBPercentage(rgbString: string): RGBColor | null {
  // Match rgb(percentage%, percentage%, percentage%) format
  const match = rgbString.match(/rgb\(([0-9.]+)%,\s*([0-9.]+)%,\s*([0-9.]+)%\)/);
  if (!match) return null;

  const r = Math.round((parseFloat(match[1]) / 100) * 255);
  const g = Math.round((parseFloat(match[2]) / 100) * 255);
  const b = Math.round((parseFloat(match[3]) / 100) * 255);

  return { r, g, b };
}

/**
 * Convert RGB (0-255) to CMYK (0-100)
 * This uses a professional print-oriented conversion that better matches
 * what designers expect in tools like Adobe Illustrator
 */
export function rgbToCmyk(rgb: RGBColor): CMYKColor {
  // Use Adobe's professional color conversion algorithm
  return adobeRgbToCmyk(rgb);
}

/**
 * Convert RGB percentage string to CMYK
 */
export function rgbPercentageToCmyk(rgbString: string): CMYKColor | null {
  const rgb = parseRGBPercentage(rgbString);
  if (!rgb) return null;
  return rgbToCmyk(rgb);
}

/**
 * Format CMYK values as a readable string
 */
export function formatCmyk(cmyk: CMYKColor): string {
  return `C${cmyk.c} M${cmyk.m} Y${cmyk.y} K${cmyk.k}`;
}

/**
 * Convert hex color to CMYK
 */
export function hexToCmyk(hex: string): CMYKColor | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;

  const rgb: RGBColor = {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  };

  return rgbToCmyk(rgb);
}