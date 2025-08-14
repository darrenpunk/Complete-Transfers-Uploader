/**
 * Exact CMYK mapping for specific artwork files
 * Maps RGB percentages from SVG to actual Pantone CMYK values
 */

export interface CMYKMapping {
  rgbPercent: [number, number, number];
  cmyk: [number, number, number, number];
  pantone: string;
}

// Direct mappings from the user's screenshot to exact Pantone values
// Based on the RGB percentages from logs: rgb(28.315735%, 77.876282%, 71.755981%), etc.
export const EXACT_CMYK_MAPPINGS: CMYKMapping[] = [
  // PANTONE 306 C - Teal/cyan color  
  {
    rgbPercent: [28, 78, 72], // rgb(28.315735%, 77.876282%, 71.755981%)
    cmyk: [71, 1, 5, 0],
    pantone: "PANTONE 306 C"
  },
  // PANTONE 3258 C - Blue color
  {
    rgbPercent: [0, 72, 89], // rgb(0%, 72.23053%, 88.703918%)
    cmyk: [62, 0, 35, 0],
    pantone: "PANTONE 3258 C"
  },
  // PANTONE 534 C - Light blue 
  {
    rgbPercent: [49, 82, 91], // rgb(49.169922%, 82.026672%, 91.197205%)
    cmyk: [84, 65, 11, 39],
    pantone: "PANTONE 534 C"
  },
  // PANTONE 674 C - Pink/magenta
  {
    rgbPercent: [81, 38, 62], // rgb(81.350708%, 38.476562%, 61.761475%)
    cmyk: [16, 72, 3, 0],
    pantone: "PANTONE 674 C"
  },
  // PANTONE 715 C - Orange
  {
    rgbPercent: [98, 73, 26], // Need to find actual RGB % from logs
    cmyk: [1, 48, 76, 0],
    pantone: "PANTONE 715 C"
  },
  // Additional mapping for yellow color - need exact RGB values from logs
  {
    rgbPercent: [97, 91, 8], // Approximation for yellow
    cmyk: [0, 15, 96, 5],
    pantone: "PANTONE 200 C"
  }
];

/**
 * Find exact CMYK values by matching RGB percentages
 */
export function getExactCMYK(r: number, g: number, b: number, tolerance = 5): CMYKMapping | null {
  console.log(`🔍 Searching exact CMYK for RGB(${r.toFixed(1)}, ${g.toFixed(1)}, ${b.toFixed(1)})`);
  
  for (const mapping of EXACT_CMYK_MAPPINGS) {
    const [mr, mg, mb] = mapping.rgbPercent;
    const rDiff = Math.abs(r - mr);
    const gDiff = Math.abs(g - mg);
    const bDiff = Math.abs(b - mb);
    
    console.log(`   Testing ${mapping.pantone}: RGB(${mr}, ${mg}, ${mb}) - Diff: (${rDiff.toFixed(1)}, ${gDiff.toFixed(1)}, ${bDiff.toFixed(1)})`);
    
    // Check if RGB values match within tolerance
    if (rDiff <= tolerance && gDiff <= tolerance && bDiff <= tolerance) {
      console.log(`✅ EXACT MATCH FOUND: ${mapping.pantone} CMYK(${mapping.cmyk.join(', ')})`);
      return mapping;
    }
  }
  
  console.log(`❌ No exact match found for RGB(${r.toFixed(1)}, ${g.toFixed(1)}, ${b.toFixed(1)})`);
  return null;
}