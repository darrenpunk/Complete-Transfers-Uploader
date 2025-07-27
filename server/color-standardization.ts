// Color standardization for consistent CMYK values across similar logos
export interface StandardizedColor {
  standardRgb: string;
  standardCmyk: string;
  tolerance: number;
}

// Standard color palette for consistent CMYK conversion
export const STANDARD_COLOR_PALETTE: StandardizedColor[] = [
  // Green eco-friendly colors (common in logos)
  { standardRgb: "rgb(105, 140, 34)", standardCmyk: "C:25 M:0 Y:76 K:45", tolerance: 15 },
  { standardRgb: "rgb(155, 193, 43)", standardCmyk: "C:20 M:0 Y:78 K:24", tolerance: 15 },
  { standardRgb: "rgb(187, 215, 140)", standardCmyk: "C:13 M:0 Y:35 K:16", tolerance: 15 },
  { standardRgb: "rgb(65, 87, 22)", standardCmyk: "C:25 M:0 Y:75 K:66", tolerance: 15 },
];

export function findStandardizedColor(inputRgb: string): StandardizedColor | null {
  const rgbMatch = inputRgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!rgbMatch) return null;

  const [, rStr, gStr, bStr] = rgbMatch;
  const r = parseInt(rStr);
  const g = parseInt(gStr);
  const b = parseInt(bStr);

  // Find the closest standard color within tolerance
  for (const standardColor of STANDARD_COLOR_PALETTE) {
    const standardMatch = standardColor.standardRgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!standardMatch) continue;

    const [, stdR, stdG, stdB] = standardMatch;
    const stdRNum = parseInt(stdR);
    const stdGNum = parseInt(stdG);
    const stdBNum = parseInt(stdB);

    // Calculate color distance
    const distance = Math.sqrt(
      Math.pow(r - stdRNum, 2) + 
      Math.pow(g - stdGNum, 2) + 
      Math.pow(b - stdBNum, 2)
    );

    if (distance <= standardColor.tolerance) {
      return standardColor;
    }
  }

  return null;
}

export function standardizeRgbToCmyk(r: number, g: number, b: number): string {
  // First check if this color should be standardized
  const inputRgb = `rgb(${r}, ${g}, ${b})`;
  const standardized = findStandardizedColor(inputRgb);
  
  if (standardized) {
    console.log(`Standardized color ${inputRgb} to ${standardized.standardCmyk}`);
    return standardized.standardCmyk;
  }

  // If not standardized, use normal conversion
  const rPercent = r / 255;
  const gPercent = g / 255;
  const bPercent = b / 255;
  
  const k = 1 - Math.max(rPercent, gPercent, bPercent);
  const c = k === 1 ? 0 : (1 - rPercent - k) / (1 - k);
  const m = k === 1 ? 0 : (1 - gPercent - k) / (1 - k);
  const y = k === 1 ? 0 : (1 - bPercent - k) / (1 - k);
  
  return `C:${Math.round(c * 100)} M:${Math.round(m * 100)} Y:${Math.round(y * 100)} K:${Math.round(k * 100)}`;
}