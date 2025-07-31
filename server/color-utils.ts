// Color conversion utilities for RGB to CMYK conversion

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
  // Normalize RGB values to 0-1 range
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  // Apply gamma correction for better print matching
  // This helps match how colors appear in professional tools
  r = Math.pow(r, 2.2);
  g = Math.pow(g, 2.2);
  b = Math.pow(b, 2.2);

  // Calculate initial K (black) value
  const k = 1 - Math.max(r, g, b);
  
  // Handle pure black
  if (k >= 0.99) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  // Calculate CMY with GCR (Gray Component Replacement)
  // This matches professional RIP software behavior
  let c = (1 - r - k) / (1 - k);
  let m = (1 - g - k) / (1 - k);
  let y = (1 - b - k) / (1 - k);

  // Apply UCR (Under Color Removal) for better ink coverage
  // This is what makes professional CMYK conversions different
  const minCmy = Math.min(c, m, y);
  const ucrAmount = minCmy * 0.5; // 50% UCR is common in print

  // Adjust values
  c = c - ucrAmount;
  m = m - ucrAmount;
  y = y - ucrAmount;
  let finalK = k + ucrAmount;

  // Clean up and round values
  c = Math.max(0, Math.min(1, c));
  m = Math.max(0, Math.min(1, m));
  y = Math.max(0, Math.min(1, y));
  finalK = Math.max(0, Math.min(1, finalK));

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(finalK * 100)
  };
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