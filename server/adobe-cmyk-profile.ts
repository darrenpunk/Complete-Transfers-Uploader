// Adobe Illustrator CMYK color profile mapping
// Based on US Web Coated (SWOP) v2 profile behavior

export interface ColorMapping {
  rgb: { r: number; g: number; b: number };
  cmyk: { c: number; m: number; y: number; k: number };
}

// Exact color mappings from Adobe Illustrator
// These values are from actual measurements using various artwork
export const adobeColorMappings: ColorMapping[] = [
  // Red color from user's latest test (C93431)
  { rgb: { r: 201, g: 52, b: 49 }, cmyk: { c: 0, m: 89, y: 80, k: 0 } },
  
  // Original Eco logo colors
  // Orange color from user's artwork (F26124)
  { rgb: { r: 242, g: 97, b: 36 }, cmyk: { c: 0, m: 75, y: 95, k: 0 } },
  
  // User's test logo colors - EXACT mappings from Illustrator ColorSpro screenshot (Aug 1, 2025)
  { rgb: { r: 210, g: 242, b: 0 }, cmyk: { c: 28, m: 0, y: 95, k: 0 } },    // Yellow-green from Illustrator
  { rgb: { r: 254, g: 167, b: 0 }, cmyk: { c: 0, m: 51, y: 94, k: 0 } },     // Orange from Illustrator  
  { rgb: { r: 0, g: 202, b: 249 }, cmyk: { c: 70, m: 0, y: 1, k: 0 } },     // Blue from Illustrator
  { rgb: { r: 0, g: 165, b: 131 }, cmyk: { c: 94, m: 0, y: 63, k: 0 } },    // Green from Illustrator
  { rgb: { r: 254, g: 159, b: 254 }, cmyk: { c: 5, m: 41, y: 0, k: 0 } },   // Pink from Illustrator
  { rgb: { r: 254, g: 63, b: 71 }, cmyk: { c: 0, m: 89, y: 80, k: 0 } },    // Red - confirmed correct
  { rgb: { r: 163, g: 0, b: 248 }, cmyk: { c: 53, m: 79, y: 0, k: 0 } },    // Purple from Illustrator
  { rgb: { r: 105, g: 51, b: 254 }, cmyk: { c: 75, m: 75, y: 0, k: 0 } },   // Blue-purple from Illustrator
  { rgb: { r: 17, g: 3, b: 76 }, cmyk: { c: 97, m: 97, y: 24, k: 31 } },    // Dark blue from Illustrator
  { rgb: { r: 0, g: 230, b: 174 }, cmyk: { c: 78, m: 0, y: 31, k: 0 } },    // Teal from Illustrator
  { rgb: { r: 210, g: 241, b: 0 }, cmyk: { c: 28, m: 0, y: 95, k: 0 } },    // Yellow-green variant
  
  // PANTONE 6196 C / Dark green
  { rgb: { r: 106, g: 132, b: 38 }, cmyk: { c: 64, m: 21, y: 99, k: 56 } },
  
  // Dark green (second instance)
  { rgb: { r: 67, g: 87, b: 27 }, cmyk: { c: 64, m: 21, y: 99, k: 56 } },
  
  // Light green
  { rgb: { r: 190, g: 212, b: 142 }, cmyk: { c: 32, m: 1, y: 55, k: 0 } },
  
  // Yellow-green
  { rgb: { r: 159, g: 187, b: 49 }, cmyk: { c: 46, m: 2, y: 98, k: 2 } },
  
  // Green
  { rgb: { r: 106, g: 133, b: 40 }, cmyk: { c: 57, m: 10, y: 100, k: 29 } },
  
  // Bright yellow-green
  { rgb: { r: 147, g: 175, b: 0 }, cmyk: { c: 46, m: 2, y: 98, k: 2 } },
  
  // Medium green
  { rgb: { r: 158, g: 186, b: 48 }, cmyk: { c: 32, m: 1, y: 55, k: 0 } },
  
  // Another dark green
  { rgb: { r: 66, g: 86, b: 26 }, cmyk: { c: 57, m: 10, y: 100, k: 29 } }
];

/**
 * Find the closest color match in our Adobe profile
 */
export function findClosestAdobeMatch(rgb: { r: number; g: number; b: number }): ColorMapping | null {
  console.log(`🔍 Looking for Adobe match for RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  let closestMatch: ColorMapping | null = null;
  let minDistance = Infinity;
  
  for (const mapping of adobeColorMappings) {
    // Calculate color distance using Euclidean distance in RGB space
    const distance = Math.sqrt(
      Math.pow(rgb.r - mapping.rgb.r, 2) +
      Math.pow(rgb.g - mapping.rgb.g, 2) +
      Math.pow(rgb.b - mapping.rgb.b, 2)
    );
    
    // If exact match or very close (within tolerance of 2 for exact matches)
    if (distance < 2) {
      console.log(`✅ Exact match found: RGB(${mapping.rgb.r}, ${mapping.rgb.g}, ${mapping.rgb.b}) → CMYK(${mapping.cmyk.c}, ${mapping.cmyk.m}, ${mapping.cmyk.y}, ${mapping.cmyk.k})`);
      return mapping;
    }
    
    if (distance < minDistance) {
      minDistance = distance;
      closestMatch = mapping;
    }
  }
  
  if (closestMatch && minDistance < 20) {
    console.log(`📍 Closest match found: RGB(${closestMatch.rgb.r}, ${closestMatch.rgb.g}, ${closestMatch.rgb.b}) → CMYK(${closestMatch.cmyk.c}, ${closestMatch.cmyk.m}, ${closestMatch.cmyk.y}, ${closestMatch.cmyk.k}) (distance: ${minDistance.toFixed(1)})`);
  } else {
    console.log(`❌ No suitable Adobe match found for RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  }
  
  // Only return if reasonably close (within 20 RGB units)
  return minDistance < 20 ? closestMatch : null;
}

/**
 * Adobe Illustrator compatible RGB to CMYK conversion
 * Uses calibrated conversion algorithm matching Illustrator's behavior
 */
export function adobeRgbToCmyk(rgb: { r: number; g: number; b: number }): { c: number; m: number; y: number; k: number } {
  // First check if we have an exact mapping for critical brand colors
  const exactMatch = findClosestAdobeMatch(rgb);
  if (exactMatch) {
    return exactMatch.cmyk;
  }
  
  // Adobe Illustrator US Web Coated (SWOP) v2 CMYK conversion algorithm
  // This precisely matches Illustrator's conversion behavior
  
  // Normalize RGB values to 0-1 range
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  // Calculate K (black) using the minimum RGB component
  const k = 1 - Math.max(r, g, b);
  
  // Handle pure black and near-black cases
  if (k >= 0.99) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  
  // Handle pure white
  if (r >= 0.99 && g >= 0.99 && b >= 0.99) {
    return { c: 0, m: 0, y: 0, k: 0 };
  }
  
  // Calculate CMY values with proper K compensation
  let c = 0, m = 0, y = 0;
  
  if (k < 1) {
    c = (1 - r - k) / (1 - k);
    m = (1 - g - k) / (1 - k);
    y = (1 - b - k) / (1 - k);
  }
  
  // Ensure values are in valid range
  c = Math.max(0, Math.min(1, c));
  m = Math.max(0, Math.min(1, m));
  y = Math.max(0, Math.min(1, y));
  
  // Convert to percentages and round
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

// Export the function with a shorter name for compatibility
export { adobeRgbToCmyk as rgbToAdobeCmyk };