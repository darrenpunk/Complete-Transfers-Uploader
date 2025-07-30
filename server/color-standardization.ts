// Color standardization for consistent CMYK values across similar logos
export interface StandardizedColor {
  standardRgb: string;
  standardCmyk: string;
  tolerance: number;
}

// Standard color palette for consistent CMYK conversion - now using Adobe-compatible algorithm
export const STANDARD_COLOR_PALETTE: StandardizedColor[] = [
  // Removing hardcoded values - now using Adobe-compatible CMYK conversion algorithm
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
  // Adobe Illustrator-compatible CMYK conversion
  // Uses UCR (Under Color Removal) and GCR (Gray Component Replacement) similar to Adobe
  
  // Normalize RGB values to 0-1 range
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  // Calculate basic CMYK using standard subtractive model
  const k = 1 - Math.max(rNorm, gNorm, bNorm);
  
  // Handle pure black case
  if (k === 1) {
    return "C:0 M:0 Y:0 K:100";
  }
  
  // Calculate CMY components
  let c = (1 - rNorm - k) / (1 - k);
  let m = (1 - gNorm - k) / (1 - k);
  let y = (1 - bNorm - k) / (1 - k);
  
  // Apply Adobe-style UCR/GCR adjustments for more accurate color separation
  const grayComponent = Math.min(c, m, y);
  
  // Adobe uses aggressive UCR for bright colors, conservative for dark colors
  const brightness = (rNorm + gNorm + bNorm) / 3;
  const ucrAmount = brightness > 0.5 ? 0.9 : 0.3; // More UCR for bright colors
  
  // Apply UCR - remove gray component and add to K
  const grayToRemove = grayComponent * ucrAmount;
  c = Math.max(0, c - grayToRemove);
  m = Math.max(0, m - grayToRemove);
  y = Math.max(0, y - grayToRemove);
  const adjustedK = k + grayToRemove;
  
  // Adobe tends to minimize K in bright colors for better color reproduction
  const finalK = brightness > 0.6 ? adjustedK * 0.2 : adjustedK;
  
  // Re-adjust CMY to compensate for reduced K
  const kReduction = adjustedK - finalK;
  c = Math.min(1, c + kReduction * 0.7);
  m = Math.min(1, m + kReduction * 0.7);
  y = Math.min(1, y + kReduction * 0.7);
  
  // Convert to percentages and round to match Adobe's precision
  const cPercent = Math.round(c * 100);
  const mPercent = Math.round(m * 100);
  const yPercent = Math.round(y * 100);
  const kPercent = Math.round(finalK * 100);
  
  return `C:${cPercent} M:${mPercent} Y:${yPercent} K:${kPercent}`;
}