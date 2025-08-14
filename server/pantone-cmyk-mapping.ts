/**
 * Pantone CMYK Color Mapping
 * Maps RGB percentages (from PDF-to-SVG conversion) back to original Pantone CMYK values
 */

export interface PantoneColor {
  name: string;
  cmyk: [number, number, number, number]; // C, M, Y, K percentages
  rgb: [number, number, number]; // RGB percentages as found in SVG
}

// Pantone color mappings based on user's swatches - exact RGB values from console logs
export const PANTONE_MAPPINGS: PantoneColor[] = [
  {
    name: "PANTONE 200 C", 
    cmyk: [15, 99, 78, 12],
    rgb: [71.786499, 8.44574, 17.202759] // From console: rgb(71.786499%, 8.44574%, 17.202759%)
  },
  {
    name: "PANTONE 306 C",
    cmyk: [71, 1, 5, 0], 
    rgb: [28.315735, 77.876282, 71.755981] // From console: rgb(28.315735%, 77.876282%, 71.755981%)
  },
  {
    name: "PANTONE 3258 C",
    cmyk: [62, 0, 35, 0],
    rgb: [0, 72.23053, 88.703918] // From console: rgb(0%, 72.23053%, 88.703918%)
  },
  {
    name: "PANTONE 534 C", 
    cmyk: [84, 65, 11, 39],
    rgb: [49.169922, 82.026672, 91.197205] // From grep: rgb(49.169922%, 82.026672%, 91.197205%)
  },
  {
    name: "PANTONE 674 C",
    cmyk: [16, 72, 3, 0],
    rgb: [96.229553, 58.972168, 26.94397] // From grep: rgb(96.229553%, 58.972168%, 26.94397%)
  },
  {
    name: "PANTONE 715 C", 
    cmyk: [1, 48, 76, 0],
    rgb: [81.350708, 38.476562, 61.761475] // From grep: rgb(81.350708%, 38.476562%, 61.761475%)
  },
  {
    name: "PANTONE Blue 0821 C",
    cmyk: [49, 0, 7, 0],
    rgb: [16.470337, 14.117432, 37.254333] // From grep: rgb(16.470337%, 14.117432%, 37.254333%)
  },
  {
    name: "White/Background",
    cmyk: [0, 0, 0, 0],
    rgb: [100, 100, 100] // White background
  }
];

/**
 * Find Pantone color by RGB percentage values
 */
export function findPantoneByRGB(r: number, g: number, b: number, tolerance = 0.5): PantoneColor | null {
  for (const pantone of PANTONE_MAPPINGS) {
    const [pr, pg, pb] = pantone.rgb;
    
    // Check if RGB values match within tolerance
    if (Math.abs(r - pr) <= tolerance && 
        Math.abs(g - pg) <= tolerance && 
        Math.abs(b - pb) <= tolerance) {
      return pantone;
    }
  }
  return null;
}

/**
 * Get original CMYK values for RGB percentage
 */
export function getOriginalCMYK(r: number, g: number, b: number): number[] | null {
  const pantone = findPantoneByRGB(r, g, b);
  return pantone ? pantone.cmyk : null;
}