import fs from 'fs';
import path from 'path';
import { adobeRgbToCmyk } from './adobe-cmyk-profile';

// Helper function to extract coordinates from SVG path data
function extractPathCoordinates(pathData: string): Array<{ x: number; y: number }> {
  const coordinates: Array<{ x: number; y: number }> = [];
  
  // Match all coordinate patterns in SVG path data
  const coordinateRegex = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)|([HV])\s*([-\d.]+)|([CSQTA])\s*([-\d.,\s]+)/g;
  let match;
  let currentX = 0;
  let currentY = 0;
  
  while ((match = coordinateRegex.exec(pathData)) !== null) {
    if (match[1] && match[2] && match[3]) {
      // M or L command - moveto or lineto
      currentX = parseFloat(match[2]);
      currentY = parseFloat(match[3]);
      coordinates.push({ x: currentX, y: currentY });
    } else if (match[4] && match[5]) {
      // H or V command - horizontal or vertical line
      if (match[4] === 'H') {
        currentX = parseFloat(match[5]);
        coordinates.push({ x: currentX, y: currentY });
      } else {
        currentY = parseFloat(match[5]);
        coordinates.push({ x: currentX, y: currentY });
      }
    } else if (match[6] && match[7]) {
      // Complex curves - extract all coordinate pairs
      const coordString = match[7];
      const coordPairs = coordString.match(/[-\d.]+[,\s]+[-\d.]+/g);
      if (coordPairs) {
        coordPairs.forEach(pair => {
          const coords = pair.split(/[,\s]+/).map(parseFloat);
          if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            currentX = coords[coords.length - 2];
            currentY = coords[coords.length - 1];
            coordinates.push({ x: currentX, y: currentY });
          }
        });
      }
    }
  }
  
  return coordinates;
}

// Pantone color database - Common Pantone colors with their RGB/CMYK values
const PANTONE_COLORS = [
  // Basic Pantone Colors
  { name: "Pantone Red 032 C", rgb: "#ED2939", cmyk: "0, 85, 75, 0" },
  { name: "Pantone Blue 072 C", rgb: "#0F4C9C", cmyk: "100, 70, 0, 0" },
  { name: "Pantone Yellow C", rgb: "#FEDD00", cmyk: "0, 10, 100, 0" },
  { name: "Pantone Orange 021 C", rgb: "#FF6900", cmyk: "0, 65, 100, 0" },
  { name: "Pantone Green C", rgb: "#00AD69", cmyk: "70, 0, 100, 0" },
  { name: "Pantone Purple C", rgb: "#70147A", cmyk: "65, 100, 0, 0" },
  { name: "Pantone Black C", rgb: "#2D2926", cmyk: "0, 0, 0, 100" },
  { name: "Pantone White", rgb: "#FFFFFF", cmyk: "0, 0, 0, 0" },
  
  // Popular Pantone Colors
  { name: "Pantone 186 C", rgb: "#CE1126", cmyk: "0, 91, 76, 0" },
  { name: "Pantone 286 C", rgb: "#003DA5", cmyk: "100, 75, 0, 0" },
  { name: "Pantone 123 C", rgb: "#FFC72C", cmyk: "0, 20, 90, 0" },
  { name: "Pantone 485 C", rgb: "#DA020E", cmyk: "0, 95, 100, 0" },
  { name: "Pantone 2925 C", rgb: "#009CDE", cmyk: "65, 0, 0, 0" },
  { name: "Pantone 376 C", rgb: "#7CB518", cmyk: "40, 0, 100, 0" },
  { name: "Pantone 269 C", rgb: "#8031A7", cmyk: "60, 90, 0, 0" },
  { name: "Pantone 144 C", rgb: "#F5A623", cmyk: "0, 35, 85, 0" },
  { name: "Pantone 355 C", rgb: "#009639", cmyk: "75, 0, 100, 0" },
  { name: "Pantone 200 C", rgb: "#A6192E", cmyk: "15, 100, 80, 5" },
  
  // Extended Color Range
  { name: "Pantone 7462 C", rgb: "#017EB8", cmyk: "75, 25, 0, 0" },
  { name: "Pantone 7547 C", rgb: "#365194", cmyk: "80, 65, 0, 0" },
  { name: "Pantone 300 C", rgb: "#005EB8", cmyk: "100, 50, 0, 0" },
  { name: "Pantone 287 C", rgb: "#041E42", cmyk: "100, 80, 0, 50" },
  { name: "Pantone 294 C", rgb: "#002F6C", cmyk: "100, 80, 0, 30" },
  { name: "Pantone 347 C", rgb: "#009639", cmyk: "80, 0, 100, 0" },
  { name: "Pantone 348 C", rgb: "#00A651", cmyk: "75, 0, 100, 0" },
  { name: "Pantone 349 C", rgb: "#46B050", cmyk: "60, 0, 100, 0" },
  { name: "Pantone 1795 C", rgb: "#E31837", cmyk: "0, 90, 80, 0" },
  { name: "Pantone 18-1664 TPX", rgb: "#C8102E", cmyk: "0, 92, 85, 22" },
  
  // Grays and Neutrals
  { name: "Pantone Cool Gray 11 C", rgb: "#53565A", cmyk: "45, 35, 30, 0" },
  { name: "Pantone Warm Gray 11 C", rgb: "#5C504A", cmyk: "40, 45, 55, 5" },
  { name: "Pantone Cool Gray 9 C", rgb: "#75787B", cmyk: "40, 30, 25, 0" },
  { name: "Pantone Cool Gray 7 C", rgb: "#97999B", cmyk: "30, 20, 15, 0" },
  { name: "Pantone Cool Gray 5 C", rgb: "#B1B3B3", cmyk: "20, 15, 10, 0" },
  { name: "Pantone Cool Gray 3 C", rgb: "#C7C9C7", cmyk: "15, 10, 10, 0" },
  { name: "Pantone Cool Gray 1 C", rgb: "#D9D9D6", cmyk: "10, 5, 5, 0" },
  
  // Additional Popular Colors
  { name: "Pantone Process Blue C", rgb: "#0085CA", cmyk: "85, 25, 0, 0" },
  { name: "Pantone Reflex Blue C", rgb: "#001489", cmyk: "100, 90, 0, 0" },
  { name: "Pantone Bright Red C", rgb: "#F5333F", cmyk: "0, 80, 75, 0" },
  { name: "Pantone Rubine Red C", rgb: "#CE0058", cmyk: "0, 100, 55, 20" },
  { name: "Pantone Process Magenta C", rgb: "#D70270", cmyk: "0, 100, 40, 15" },
  { name: "Pantone Pink C", rgb: "#D62598", cmyk: "0, 85, 15, 0" },
  { name: "Pantone Purple C", rgb: "#70147A", cmyk: "65, 100, 0, 0" },
  { name: "Pantone Violet C", rgb: "#5F259F", cmyk: "70, 80, 0, 0" }
];

// Function to convert hex to RGB
function hexToRgb(hex: string): { r: number, g: number, b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Function to calculate color distance (Delta E simplified)
function colorDistance(rgb1: { r: number, g: number, b: number }, rgb2: { r: number, g: number, b: number }): number {
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Function to find closest Pantone match
function findClosestPantone(hexColor: string): { pantone: string | null, distance: number } {
  const inputRgb = hexToRgb(hexColor);
  if (!inputRgb) return { pantone: null, distance: Infinity };

  let closestMatch = null;
  let minDistance = Infinity;

  for (const pantoneColor of PANTONE_COLORS) {
    const pantoneRgb = hexToRgb(pantoneColor.rgb);
    if (!pantoneRgb) continue;

    const distance = colorDistance(inputRgb, pantoneRgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestMatch = pantoneColor.name;
    }
  }

  return { pantone: closestMatch, distance: minDistance };
}

export interface SVGColorInfo {
  id: string;
  originalColor: string;
  originalFormat?: string; // The exact color format as found in the SVG
  cmykColor?: string | null; // CMYK representation of the color (if available)
  pantoneMatch?: string; // Closest Pantone color match
  pantoneDistance?: number; // Color distance to Pantone match
  elementType: string;
  attribute: string; // 'fill', 'stroke', etc.
  selector: string; // CSS selector to identify the element
  converted?: boolean;
  isCMYK?: boolean; // Whether the color is already in CMYK format
  rgb?: { r: number; g: number; b: number } | null; // RGB values if available
}

export interface FontInfo {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  textContent: string;
  elementType: string;
  selector: string;
}

export interface SVGAnalysis {
  colors: SVGColorInfo[];
  fonts: FontInfo[];
  hasText: boolean;
}

export function analyzeSVG(svgPath: string): SVGAnalysis {
  const colors = extractSVGColors(svgPath);
  const fonts = extractSVGFonts(svgPath);
  
  return {
    colors,
    fonts,
    hasText: fonts.length > 0
  };
}

export function extractSVGFonts(svgPath: string): FontInfo[] {
  try {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const fonts: FontInfo[] = [];
    let fontId = 0;

    // Extract text elements (actual text that needs outlining)
    const textElements = svgContent.match(/<text[^>]*>.*?<\/text>/gi) || [];
    
    textElements.forEach((textElement, index) => {
      const fontFamily = textElement.match(/font-family\s*=\s*["']([^"']+)["']/i)?.[1] || 'inherit';
      const fontSize = textElement.match(/font-size\s*=\s*["']([^"']+)["']/i)?.[1] || 'inherit';
      const fontWeight = textElement.match(/font-weight\s*=\s*["']([^"']+)["']/i)?.[1] || 'normal';
      const textContent = textElement.replace(/<[^>]*>/g, '').trim();
      
      if (textContent) {
        fonts.push({
          fontFamily,
          fontSize,
          fontWeight,
          textContent,
          elementType: 'text',
          selector: `text:nth-of-type(${index + 1})`
        });
      }
    });

    // Extract tspan elements (nested text)
    const tspanElements = svgContent.match(/<tspan[^>]*>.*?<\/tspan>/gi) || [];
    
    tspanElements.forEach((tspanElement, index) => {
      const fontFamily = tspanElement.match(/font-family\s*=\s*["']([^"']+)["']/i)?.[1] || 'inherit';
      const fontSize = tspanElement.match(/font-size\s*=\s*["']([^"']+)["']/i)?.[1] || 'inherit';
      const fontWeight = tspanElement.match(/font-weight\s*=\s*["']([^"']+)["']/i)?.[1] || 'normal';
      const textContent = tspanElement.replace(/<[^>]*>/g, '').trim();
      
      if (textContent) {
        fonts.push({
          fontFamily,
          fontSize,
          fontWeight,
          textContent,
          elementType: 'tspan',
          selector: `tspan:nth-of-type(${index + 1})`
        });
      }
    });

    // Check for glyph references (live text using font glyphs)
    const glyphUseElements = svgContent.match(/<use[^>]*xlink:href\s*=\s*["']#glyph-[^"']*["'][^>]*>/gi) || [];
    
    if (glyphUseElements.length > 0) {
      // This indicates live text that references glyph definitions (needs outlining)
      fonts.push({
        fontFamily: 'Referenced Glyphs',
        fontSize: 'Various',
        fontWeight: 'normal',
        textContent: `${glyphUseElements.length} text elements using glyph references`,
        elementType: 'glyph-references',
        selector: 'use[xlink:href^="#glyph-"]'
      });
    }

    // Check for already outlined text (paths without glyph references)
    const glyphDefinitions = svgContent.match(/<g id="glyph-[^"]*"[^>]*>/gi) || [];
    const hasGlyphReferences = glyphUseElements.length > 0;
    
    if (glyphDefinitions.length > 0 && !hasGlyphReferences) {
      // Glyph definitions exist but no references = already outlined
      fonts.push({
        fontFamily: 'Already Outlined',
        fontSize: 'Various',
        fontWeight: 'normal',
        textContent: `${glyphDefinitions.length} text elements already outlined as paths`,
        elementType: 'outlined-glyphs',
        selector: 'g[id^="glyph-"]'
      });
    }

    return fonts;
  } catch (error) {
    console.error('Error extracting SVG fonts:', error);
    return [];
  }
}

// Function to calculate minimum dimension of a path (for detecting thin converted strokes)
function calculatePathMinDimension(pathData: string): number | null {
  try {
    const coords = extractPathCoordinates(pathData);
    if (coords.length < 2) return null;
    
    const minX = Math.min(...coords.map(c => c.x));
    const maxX = Math.max(...coords.map(c => c.x));
    const minY = Math.min(...coords.map(c => c.y));
    const maxY = Math.max(...coords.map(c => c.y));
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Return the smaller dimension (likely represents stroke thickness if converted)
    return Math.min(width, height);
  } catch (error) {
    return null;
  }
}

// Function to extract stroke widths from SVG content (including converted strokes)
function extractStrokeWidths(svgContent: string): number[] {
  const strokeWidths: number[] = [];
  
  // 1. Extract actual stroke-width attributes
  const patterns = [
    // Direct stroke-width attributes
    /stroke-width\s*=\s*["']([^"']+)["']/gi,
    // Stroke-width in style attributes
    /style\s*=\s*["'][^"']*stroke-width\s*:\s*([^;"']+)[^"']*["']/gi,
    // CSS style blocks
    /stroke-width\s*:\s*([^;}\s]+)/gi
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(svgContent)) !== null) {
      const widthStr = match[1].trim();
      
      // Parse numeric value (handle pt, px, mm units)
      let widthValue = parseFloat(widthStr);
      
      if (!isNaN(widthValue) && widthValue > 0) {
        // Convert units to points (pt) for consistent comparison
        if (widthStr.includes('mm')) {
          widthValue = widthValue * 2.834; // mm to pt
        } else if (widthStr.includes('px')) {
          widthValue = widthValue * 0.75; // px to pt (assuming 96 DPI)
        } else if (widthStr.includes('in')) {
          widthValue = widthValue * 72; // inches to pt
        }
        // Default assumption is points if no unit specified
        
        strokeWidths.push(widthValue);
      }
    }
  });

  // 2. Analyze filled shapes for thin converted strokes
  const shapePatterns = [
    // Rectangle elements
    /<rect[^>]*width\s*=\s*["']([^"']+)["'][^>]*height\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<rect[^>]*height\s*=\s*["']([^"']+)["'][^>]*width\s*=\s*["']([^"']+)["'][^>]*>/gi,
    // Filled paths (potential converted strokes)
    /<path[^>]*fill\s*=\s*["'](?!none|transparent)[^"']+["'][^>]*d\s*=\s*["']([^"']+)["'][^>]*>/gi
  ];

  // Analyze rectangles
  const rectPattern = /<rect[^>]*width\s*=\s*["']([^"']+)["'][^>]*height\s*=\s*["']([^"']+)["'][^>]*/gi;
  let rectMatch;
  while ((rectMatch = rectPattern.exec(svgContent)) !== null) {
    const width = parseFloat(rectMatch[1]);
    const height = parseFloat(rectMatch[2]);
    
    if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
      // Convert to points and find minimum dimension
      const minDim = Math.min(width * 0.75, height * 0.75); // px to pt conversion
      
      // Only consider if it's very thin (likely a converted stroke)
      if (minDim < 5) { // Less than 5pt could be a converted stroke
        strokeWidths.push(minDim);
      }
    }
  }

  // Analyze filled paths for thin shapes
  const pathPattern = /<path[^>]*fill\s*=\s*["'](?!none|transparent)[^"']+["'][^>]*d\s*=\s*["']([^"']+)["'][^>]*/gi;
  let pathMatch;
  let pathCount = 0;
  const maxPaths = 50; // Limit analysis to prevent performance issues
  
  while ((pathMatch = pathPattern.exec(svgContent)) !== null && pathCount < maxPaths) {
    pathCount++;
    const pathData = pathMatch[1];
    const minDimension = calculatePathMinDimension(pathData);
    
    if (minDimension !== null && minDimension > 0) {
      // Convert to points
      const minDimPt = minDimension * 0.75; // px to pt conversion
      
      // Only consider very thin filled paths (likely converted strokes)
      if (minDimPt < 3) { // Less than 3pt is probably a converted stroke
        strokeWidths.push(minDimPt);
      }
    }
  }

  return strokeWidths.filter((width, index, arr) => arr.indexOf(width) === index); // Remove duplicates
}

export function extractSVGColors(svgPath: string): SVGColorInfo[] {
  try {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const colors: SVGColorInfo[] = [];
    let colorId = 0;

    // PRESERVE ORIGINAL PDF CONTENT - NO COLOR CONVERSION
    console.log('🎨 PDF COLOR PRESERVATION MODE: All colors will be preserved exactly as they appear in the original PDF');

    // Function to convert RGB percentage to 0-255 values
    const convertRgbPercent = (rgbString: string): string => {
      const match = rgbString.match(/rgb\(([^)]+)\)/);
      if (!match) return rgbString;
      
      const values = match[1].split(',').map(v => v.trim());
      const rgbValues = values.map(v => {
        if (v.includes('%')) {
          // Convert percentage to 0-255
          return Math.round(parseFloat(v) * 255 / 100);
        }
        return parseInt(v);
      });
      
      return `rgb(${rgbValues.join(', ')})`;
    };

    // RGB to CMYK conversion is now imported from color-utils.ts

    // Function to detect embedded Pantone color information 
    const detectEmbeddedPantone = (content: string): string | undefined => {
      // Check for Pantone color names in various formats throughout the SVG
      const pantonePatterns = [
        /pantone[\s-]*(\d+[\w\s]*[Cc]?)/gi,
        /pms[\s-]*(\d+[\w\s]*[Cc]?)/gi,
        /spot[\s-]*color[\s-]*pantone[\s-]*(\d+[\w\s]*[Cc]?)/gi,
        /color[\s-]*name[\s'"=]*pantone[\s-]*(\d+[\w\s]*[Cc]?)/gi,
        /<desc[^>]*>.*?pantone[\s-]*(\d+[\w\s]*[Cc]?).*?<\/desc>/gi,
        /<title[^>]*>.*?pantone[\s-]*(\d+[\w\s]*[Cc]?).*?<\/title>/gi,
        /id\s*=\s*["'].*?pantone[\s-]*(\d+[\w\s]*[Cc]?).*?["']/gi,
        /<metadata[^>]*>.*?pantone[\s-]*(\d+[\w\s]*[Cc]?).*?<\/metadata>/gi,
        /inkName[\s'"=]*pantone[\s-]*(\d+[\w\s]*[Cc]?)/gi,
        /spot-color[\s'"=]*pantone[\s-]*(\d+[\w\s]*[Cc]?)/gi
      ];

      // First check the entire SVG content
      for (const pattern of pantonePatterns) {
        const matches = svgContent.match(pattern);
        if (matches && matches.length > 0) {
          for (const match of matches) {
            const pantoneMatch = match.match(/pantone[\s-]*(\d+[\w\s]*[Cc]?)/i) || 
                               match.match(/pms[\s-]*(\d+[\w\s]*[Cc]?)/i);
            if (pantoneMatch) {
              return `Pantone ${pantoneMatch[1].trim()}`;
            }
          }
        }
      }

      // Then check the specific element content
      for (const pattern of pantonePatterns) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          for (const match of matches) {
            const pantoneMatch = match.match(/pantone[\s-]*(\d+[\w\s]*[Cc]?)/i) || 
                               match.match(/pms[\s-]*(\d+[\w\s]*[Cc]?)/i);
            if (pantoneMatch) {
              return `Pantone ${pantoneMatch[1].trim()}`;
            }
          }
        }
      }
      return undefined;
    };

    // Function to detect white colors that are likely conversion artifacts from PDF text
    const isWhiteConversionArtifact = (colorValue: string, elementType: string): boolean => {
      // PRESERVE ALL COLORS - Do not filter out any white colors
      // The white elements are needed for proper text rendering on the canvas
      console.log(`🎨 PRESERVING ALL COLORS: ${colorValue} on ${elementType} - no filtering applied`);
      return false;
    };

    // Function to get CMYK values from color string
    const getColorInfo = (colorString: string) => {
      let rgbColor = colorString;
      
      // First check if this is already a CMYK color specification
      // SVG can contain CMYK colors in device-cmyk format or spot colors
      const cmykMatch = colorString.match(/device-cmyk\s*\(([^)]+)\)/i);
      if (cmykMatch) {
        // Parse CMYK values (can be decimal 0-1 or percentage)
        const values = cmykMatch[1].split(/[,\s]+/).map(v => {
          const num = parseFloat(v);
          // Convert to percentage if decimal
          return v.includes('%') ? parseInt(v) : Math.round(num * 100);
        });
        
        if (values.length === 4) {
          const [c, m, y, k] = values;
          return {
            original: colorString,
            display: `CMYK(${c}, ${m}, ${y}, ${k})`,
            cmyk: `C:${c} M:${m} Y:${y} K:${k}`,
            isCMYK: true
          };
        }
      }
      
      // Also check for cmyk() format (without device- prefix)
      const simpleCmykMatch = colorString.match(/cmyk\s*\(([^)]+)\)/i);
      if (simpleCmykMatch) {
        // Parse CMYK values (can be decimal 0-1 or percentage)
        const values = simpleCmykMatch[1].split(/[,\s]+/).map(v => {
          const num = parseFloat(v);
          // Convert to percentage if decimal
          return v.includes('%') ? parseInt(v) : Math.round(num * 100);
        });
        
        if (values.length === 4) {
          const [c, m, y, k] = values;
          return {
            original: colorString,
            display: `CMYK(${c}, ${m}, ${y}, ${k})`,
            cmyk: `C:${c} M:${m} Y:${y} K:${k}`,
            isCMYK: true
          };
        }
      }
      
      // Check for spot color with CMYK fallback
      const spotMatch = colorString.match(/spot-color.*?cmyk\s*\(([^)]+)\)/i);
      if (spotMatch) {
        const values = spotMatch[1].split(/[,\s]+/).map(v => {
          const num = parseFloat(v);
          return v.includes('%') ? parseInt(v) : Math.round(num * 100);
        });
        
        if (values.length === 4) {
          const [c, m, y, k] = values;
          return {
            original: colorString,
            display: `CMYK(${c}, ${m}, ${y}, ${k})`,
            cmyk: `C:${c} M:${m} Y:${y} K:${k}`,
            isCMYK: true
          };
        }
      }
      
      // Convert RGB percentage to standard RGB
      if (colorString.includes('rgb(') && colorString.includes('%')) {
        rgbColor = convertRgbPercent(colorString);
      }
      
      // Extract RGB values but don't convert to CMYK - just store the RGB values
      const rgbMatch = rgbColor.match(/rgb\((\d+),?\s*(\d+),?\s*(\d+)\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        // PRESERVE ORIGINAL PDF COLORS - NO CONVERSION
        // Store RGB values exactly as they appear in the PDF without any conversion
        console.log(`🎨 PRESERVED ORIGINAL: RGB(${r}, ${g}, ${b}) - no conversion applied`);
        
        return {
          original: colorString,  // Keep the exact format from SVG
          display: rgbColor,      // Standardized format for UI
          cmyk: null,             // No CMYK conversion
          isCMYK: false,          // RGB colors are RGB, not CMYK
          rgb: { r, g, b }        // Store RGB values as they exist in PDF
        };
      }
      
      // PRESERVE ORIGINAL PDF COLORS - NO CONVERSION FOR HEX
      if (colorString.startsWith('#')) {
        const hex = colorString.substring(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Store original hex colors exactly as they appear in the PDF without any conversion
        console.log(`🎨 PRESERVED ORIGINAL: HEX ${colorString} RGB(${r}, ${g}, ${b}) - no conversion applied`);
        
        return {
          original: colorString,  // Keep the exact format from SVG
          display: `rgb(${r}, ${g}, ${b})`,  // Standardized format for UI
          cmyk: null,             // No CMYK conversion
          isCMYK: false,          // Hex colors are RGB, not CMYK
          rgb: { r, g, b }        // Store RGB values as they exist in PDF
        };
      }
      
      return {
        original: colorString,
        display: colorString,
        cmyk: null,    // No CMYK conversion
        isCMYK: false,
        rgb: null      // No RGB values available
      };
    };

    // Extract element types and their colors
    const elementMatches = svgContent.match(/<(path|rect|circle|ellipse|polygon|polyline|line|text|g)[^>]*>/gi) || [];
    
    elementMatches.forEach((elementMatch, index) => {
      const elementType = elementMatch.match(/<(\w+)/)?.[1] || 'unknown';
      
      // Check for fill colors (excluding white conversion artifacts)
      const fillMatch = elementMatch.match(/fill\s*=\s*["']([^"']+)["']/i);
      if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
        const colorValue = fillMatch[1];
        
        // Skip white colors that are likely conversion artifacts from PDF text
        if (isWhiteConversionArtifact(colorValue, elementType)) {
          console.log(`🎨 Skipping white conversion artifact: ${colorValue} on ${elementType}`);
          return;
        }
        
        const colorInfo = getColorInfo(colorValue);
        const colorData: SVGColorInfo = {
          id: `color_${colorId++}`,
          originalColor: colorInfo.display,     // Standardized format for UI
          originalFormat: colorInfo.original,   // Exact format from SVG for replacement
          cmykColor: colorInfo.cmyk,
          elementType,
          attribute: 'fill',
          selector: `${elementType}:nth-of-type(${index + 1})`,
          isCMYK: colorInfo.isCMYK  // Pass through CMYK detection flag
        };
        
        colors.push(colorData);
      }

      // Check for stroke colors
      const strokeMatch = elementMatch.match(/stroke\s*=\s*["']([^"']+)["']/i);
      if (strokeMatch && strokeMatch[1] !== 'none' && strokeMatch[1] !== 'transparent') {
        const colorInfo = getColorInfo(strokeMatch[1]);
        const strokeColorData: SVGColorInfo = {
          id: `color_${colorId++}`,
          originalColor: colorInfo.display,     // Standardized format for UI
          originalFormat: colorInfo.original,   // Exact format from SVG for replacement
          cmykColor: colorInfo.cmyk,
          elementType,
          attribute: 'stroke',
          selector: `${elementType}:nth-of-type(${index + 1})`,
          isCMYK: colorInfo.isCMYK  // Pass through CMYK detection flag
        };
        
        colors.push(strokeColorData);
      }

      // Check for style-based colors
      const styleMatch = elementMatch.match(/style\s*=\s*["']([^"']+)["']/i);
      if (styleMatch) {
        const style = styleMatch[1];
        
        // Extract fill from style (excluding white conversion artifacts)
        const styleFillMatch = style.match(/fill\s*:\s*([^;]+)/i);
        if (styleFillMatch && styleFillMatch[1] !== 'none' && styleFillMatch[1] !== 'transparent') {
          const colorValue = styleFillMatch[1].trim();
          
          // Skip white colors that are likely conversion artifacts from PDF text
          if (isWhiteConversionArtifact(colorValue, elementType)) {
            console.log(`🎨 Skipping white conversion artifact in style: ${colorValue} on ${elementType}`);
            return;
          }
          
          const colorInfo = getColorInfo(colorValue);
          const styleFillColorData: SVGColorInfo = {
            id: `color_${colorId++}`,
            originalColor: colorInfo.display,
            originalFormat: colorInfo.original,   // Add originalFormat
            cmykColor: colorInfo.cmyk,
            elementType,
            attribute: 'fill',
            selector: `${elementType}:nth-of-type(${index + 1})`,
            isCMYK: colorInfo.isCMYK  // Pass through CMYK detection flag
          };
          
          colors.push(styleFillColorData);
        }

        // Extract stroke from style
        const styleStrokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
        if (styleStrokeMatch && styleStrokeMatch[1] !== 'none' && styleStrokeMatch[1] !== 'transparent') {
          const colorInfo = getColorInfo(styleStrokeMatch[1].trim());
          const styleStrokeColorData: SVGColorInfo = {
            id: `color_${colorId++}`,
            originalColor: colorInfo.display,
            originalFormat: colorInfo.original,   // Add originalFormat
            cmykColor: colorInfo.cmyk,
            elementType,
            attribute: 'stroke',
            selector: `${elementType}:nth-of-type(${index + 1})`,
            isCMYK: colorInfo.isCMYK  // Pass through CMYK detection flag
          };
          
          colors.push(styleStrokeColorData);
        }
      }
    });

    // Remove duplicates based on both color and CMYK values
    const uniqueColors = colors.filter((color, index, self) => 
      index === self.findIndex(c => c.originalColor === color.originalColor && c.attribute === color.attribute && c.cmykColor === color.cmykColor)
    );

    return uniqueColors;
  } catch (error) {
    console.error('Error extracting SVG colors:', error);
    return [];
  }
}

// Enhanced SVG analysis function that includes stroke width detection
export function analyzeSVGWithStrokeWidths(svgPath: string): {
  colors: SVGColorInfo[];
  fonts: any[];
  strokeWidths: number[];
  hasText: boolean;
  minStrokeWidth?: number;
  maxStrokeWidth?: number;
} {
  try {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const colors = extractSVGColors(svgPath);
    const fonts = extractSVGFonts(svgPath);
    const strokeWidths = extractStrokeWidths(svgContent);
    
    return {
      colors,
      fonts,
      strokeWidths,
      hasText: fonts.length > 0,
      minStrokeWidth: strokeWidths.length > 0 ? Math.min(...strokeWidths) : undefined,
      maxStrokeWidth: strokeWidths.length > 0 ? Math.max(...strokeWidths) : undefined
    };
  } catch (error) {
    console.error('Error analyzing SVG with stroke widths:', error);
    return {
      colors: [],
      fonts: [],
      strokeWidths: [],
      hasText: false
    };
  }
}

// Fix aspect ratio issues in vectorized SVGs to prevent Illustrator distortion
export function normalizeVectorizedSVG(svgContent: string): string {
  try {
    // Check if this is a vectorized SVG that needs fixing
    const isVectorizedSVG = svgContent.includes('vector-effect="non-scaling-stroke"');
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    
    if (!isVectorizedSVG || !viewBoxMatch) {
      return svgContent; // No normalization needed
    }
    
    // Parse viewBox values
    const viewBoxValues = viewBoxMatch[1].split(' ').map(parseFloat);
    if (viewBoxValues.length !== 4) {
      return svgContent;
    }
    
    const [vbX, vbY, vbWidth, vbHeight] = viewBoxValues;
    
    console.log(`Fixing vectorized SVG aspect ratio - viewBox: ${vbWidth}×${vbHeight}`);
    
    let normalizedSvg = svgContent;
    
    // Remove width and height attributes to let viewBox control the aspect ratio
    // This prevents the mismatch between viewBox proportions and width/height attributes
    normalizedSvg = normalizedSvg.replace(/\swidth="[^"]*"/, '');
    normalizedSvg = normalizedSvg.replace(/\sheight="[^"]*"/, '');
    
    // Add preserveAspectRatio to ensure the content isn't stretched
    if (!normalizedSvg.includes('preserveAspectRatio')) {
      normalizedSvg = normalizedSvg.replace(
        /<svg([^>]*)>/,
        '<svg$1 preserveAspectRatio="xMidYMid meet">'
      );
    }
    
    console.log('SVG aspect ratio fixed - removed fixed dimensions, added preserveAspectRatio');
    
    return normalizedSvg;
    
  } catch (error) {
    console.error('Error fixing vectorized SVG:', error);
    return svgContent; // Return original on error
  }
}

// Helper function to offset all coordinates in a path data string
function offsetPathCoordinates(pathData: string, offsetX: number, offsetY: number): string {
  try {
    // Replace all coordinate pairs in the path data
    return pathData.replace(/([ML])\s*([\d.-]+)\s*([\d.-]+)/g, (match, command, x, y) => {
      const newX = parseFloat(x) + offsetX;
      const newY = parseFloat(y) + offsetY;
      return `${command} ${newX.toFixed(2)} ${newY.toFixed(2)}`;
    }).replace(/([QC])\s*([\d.-]+)\s*([\d.-]+)\s*([\d.-]+)\s*([\d.-]+)/g, (match, command, x1, y1, x2, y2) => {
      const newX1 = parseFloat(x1) + offsetX;
      const newY1 = parseFloat(y1) + offsetY;
      const newX2 = parseFloat(x2) + offsetX;
      const newY2 = parseFloat(y2) + offsetY;
      return `${command} ${newX1.toFixed(2)} ${newY1.toFixed(2)} ${newX2.toFixed(2)} ${newY2.toFixed(2)}`;
    }).replace(/([QC])\s*([\d.-]+)\s*([\d.-]+)\s*([\d.-]+)\s*([\d.-]+)\s*([\d.-]+)\s*([\d.-]+)/g, (match, command, x1, y1, x2, y2, x3, y3) => {
      const newX1 = parseFloat(x1) + offsetX;
      const newY1 = parseFloat(y1) + offsetY;
      const newX2 = parseFloat(x2) + offsetX;
      const newY2 = parseFloat(y2) + offsetY;
      const newX3 = parseFloat(x3) + offsetX;
      const newY3 = parseFloat(y3) + offsetY;
      return `${command} ${newX1.toFixed(2)} ${newY1.toFixed(2)} ${newX2.toFixed(2)} ${newY2.toFixed(2)} ${newX3.toFixed(2)} ${newY3.toFixed(2)}`;
    });
  } catch (error) {
    console.error('Error offsetting path coordinates:', error);
    return pathData; // Return original on error
  }
}

// Specialized function for calculating bounds of vectorized SVG files from AI services
function calculateVectorizedSVGBounds(svgContent: string): { width: number; height: number; minX?: number; minY?: number; maxX?: number; maxY?: number } | null {
  try {
    console.log('🔍 Starting vectorized SVG bounds calculation');
    
    // Clean any residual corrupted elements before processing
    let cleanedContent = svgContent;
    if (cleanedContent.includes('pathnon-scaling-')) {
      console.log('🧹 Cleaning residual corrupted elements in bounds calculation');
      cleanedContent = cleanedContent.replace(/<pathnon-scaling-[^>]*>/g, '');
      cleanedContent = cleanedContent.replace(/<\/pathnon-scaling->/g, '');
    }
    
    const allCoordinates = [];
    
    // Extract coordinates from path elements with fill colors (skip stroke-only elements)
    const fillPathRegex = /<path[^>]*fill="([^"]*)"[^>]*d="([^"]*)"[^>]*>/gi;
    let pathMatch;
    let fillMatchCount = 0;
    const maxFillMatches = 100; // Reduced limit to prevent timeouts
    
    while ((pathMatch = fillPathRegex.exec(cleanedContent)) !== null && fillMatchCount < maxFillMatches) {
      fillMatchCount++;
      const fillColor = pathMatch[1];
      const pathData = pathMatch[2];
      
      // Only include paths with actual fill colors (not "none")
      if (fillColor && fillColor !== 'none' && fillColor !== 'transparent') {
        try {
          const coords = extractPathCoordinates(pathData);
          if (coords.length > 0) {
            allCoordinates.push(...coords);
          }
        } catch (coordError) {
          console.log('Error extracting coordinates from fill path, skipping');
          continue;
        }
      }
    }
    
    if (fillMatchCount >= maxFillMatches) {
      console.log(`Stopped processing fill SVG paths after ${maxFillMatches} matches to prevent infinite loop`);
    }
    
    // Also check for stroke-only paths that might contain content
    const strokePathRegex = /<path[^>]*stroke="none"[^>]*d="([^"]*)"[^>]*>/gi;
    let strokeMatch;
    let strokeMatchCount = 0;
    const maxStrokeMatches = 50; // Reduced limit to prevent timeouts
    
    while ((strokeMatch = strokePathRegex.exec(cleanedContent)) !== null && strokeMatchCount < maxStrokeMatches) {
      strokeMatchCount++;
      const pathData = strokeMatch[1];
      try {
        const coords = extractPathCoordinates(pathData);
        if (coords.length > 0) {
          allCoordinates.push(...coords);
        }
      } catch (coordError) {
        console.log('Error extracting coordinates from stroke path, skipping');
        continue;
      }
    }
    
    if (strokeMatchCount >= maxStrokeMatches) {
      console.log(`Stopped processing stroke SVG paths after ${maxStrokeMatches} matches to prevent infinite loop`);
    }
    
    if (allCoordinates.length === 0) {
      console.log('No content coordinates found in vectorized SVG, using fallback');
      return {
        width: 200,
        height: 200
      };
    }
    
    // Calculate actual content bounds
    const minX = Math.min(...allCoordinates.map(c => c.x));
    const minY = Math.min(...allCoordinates.map(c => c.y));
    const maxX = Math.max(...allCoordinates.map(c => c.x));
    const maxY = Math.max(...allCoordinates.map(c => c.y));
    
    const rawWidth = maxX - minX;
    const rawHeight = maxY - minY;
    
    // Apply universal content-focused bounds for vectorized SVGs too
    console.log(`🎯 VECTORIZED CONTENT ANALYSIS: Raw detected: ${rawWidth}×${rawHeight}px from ${allCoordinates.length} coordinates`);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Filter out edge coordinates that might be from viewBox padding
    const contentCoords = allCoordinates.filter(coord => {
      const relativeX = (coord.x - minX) / rawWidth;
      const relativeY = (coord.y - minY) / rawHeight;
      
      // Keep coordinates that aren't hugging edges
      return relativeX > 0.03 && relativeX < 0.97 && relativeY > 0.03 && relativeY < 0.97;
    });
    
    // If we filtered out significant padding, use the tighter bounds
    if (contentCoords.length > allCoordinates.length * 0.5) {
      const contentMinX = Math.min(...contentCoords.map(c => c.x));
      const contentMinY = Math.min(...contentCoords.map(c => c.y));
      const contentMaxX = Math.max(...contentCoords.map(c => c.x));
      const contentMaxY = Math.max(...contentCoords.map(c => c.y));
      
      const contentWidth = contentMaxX - contentMinX;
      const contentHeight = contentMaxY - contentMinY;
      
      // Calculate whitespace removal
      const widthReduction = ((rawWidth - contentWidth) / rawWidth * 100);
      const heightReduction = ((rawHeight - contentHeight) / rawHeight * 100);
      
      if (contentWidth > 10 && contentHeight > 10 && (widthReduction > 5 || heightReduction > 5)) {
        console.log(`🎯 VECTORIZED CONTENT-FOCUSED BOUNDS: ${rawWidth}×${rawHeight} → ${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)} (${widthReduction.toFixed(0)}%×${heightReduction.toFixed(0)}% whitespace removed)`);
        
        return {
          width: contentWidth,
          height: contentHeight,
          minX: contentMinX,
          minY: contentMinY,
          maxX: contentMaxX,
          maxY: contentMaxY
        };
      }
    }
    
    // Use original bounds if content-focused filtering didn't help
    const finalWidth = Math.max(10, rawWidth); // Minimum 10px width
    const finalHeight = Math.max(10, rawHeight); // Minimum 10px height
    
    console.log(`Vectorized SVG bounds: ${minX.toFixed(1)},${minY.toFixed(1)} to ${maxX.toFixed(1)},${maxY.toFixed(1)} = ${finalWidth}×${finalHeight} (content: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)})`);
    
    return {
      width: finalWidth,
      height: finalHeight,
      minX,
      minY,
      maxX,
      maxY
    };
    
  } catch (error) {
    console.error('Error calculating vectorized SVG bounds:', error);
    return {
      width: 200,
      height: 200
    };
  }
}

// Calculate actual content bounding box from SVG elements, excluding obvious backgrounds and font definitions
export function calculateSVGContentBounds(svgContent: string): { width: number; height: number; minX?: number; minY?: number; maxX?: number; maxY?: number } | null {
  try {
    console.log('🎯 UNIVERSAL CONTENT-FOCUSED BOUNDS CALCULATION STARTING');
    
    // Early check for extremely large files - use fallback to prevent timeouts
    if (svgContent.length > 2000000) { // 2MB+ SVG files
      console.log('SVG content extremely large (>2MB), using performance fallback');
      return {
        width: 300,
        height: 200
      };
    }
    
    // Check if this is a vectorized SVG (has vector-effect attribute, AI markers, or large viewBox)
    const isVectorizedSVG = svgContent.includes('vector-effect="non-scaling-stroke"') || 
                            svgContent.includes('data-ai-vectorized="true"') ||
                            svgContent.includes('AI_VECTORIZED_FILE');
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    const hasLargeViewBox = viewBoxMatch && viewBoxMatch[1].split(' ').some(val => parseFloat(val) > 1000);
    
    if (isVectorizedSVG && hasLargeViewBox) {
      console.log('Detected AI-vectorized SVG with large viewBox, using optimized content bounds calculation');
      return calculateVectorizedSVGBounds(svgContent);
    }

    // Check if this SVG has glyph references (text) that might be inflating the bounding box
    const hasGlyphRefs = svgContent.includes('<use') && svgContent.includes('xlink:href="#glyph-');
    const hasGlyphDefs = svgContent.includes('<g id="glyph-');
    
    if (hasGlyphRefs || hasGlyphDefs) {
      console.log('SVG contains font glyphs, using text-aware bounding box calculation');
      
      // For SVGs with text/glyphs, focus only on the actual visible content outside the defs section
      // Remove the <defs> section which contains glyph definitions that inflate bounding box
      const defsRegex = /<defs>[\s\S]*?<\/defs>/gi;
      const contentWithoutDefs = svgContent.replace(defsRegex, '');
      
      // Now find colored path elements in the actual content area
      const coloredElements = [];
      
      // Find path elements with actual colors (not white/transparent) outside of defs
      const pathRegex = /<path[^>]*fill="([^"]*)"[^>]*d="([^"]*)"[^>]*>/gi;
      let pathMatch;
      let matchCount = 0;
      const maxMatches = 100; // Reduced limit to prevent timeouts on large files
      
      while ((pathMatch = pathRegex.exec(contentWithoutDefs)) !== null && matchCount < maxMatches) {
        matchCount++;
        const fillColor = pathMatch[1];
        const pathData = pathMatch[2];
        
        // Skip transparent/none colors and pure white backgrounds (but keep white content)
        const isTransparent = fillColor === 'none' || fillColor === 'transparent';
        const isPureWhite = fillColor === '#ffffff' || fillColor === 'white' || fillColor === 'rgb(255, 255, 255)' || fillColor === 'rgb(100%, 100%, 100%)';
        
        // Skip large background rectangles that cover most of the canvas
        const isLargeBackground = pathData.includes('M 0 0') && 
                                 (pathData.includes('L 700') || pathData.includes('L 839') || pathData.includes('L 624'));
        
        // Determine if this is likely a background vs content element based on path data
        const pathLength = pathData.length;
        const hasComplexPath = pathData.includes('C') || pathData.includes('Q'); // Curves indicate content
        const isRectangularPath = pathData.match(/M[\d\s.,-]+L[\d\s.,-]+L[\d\s.,-]+L[\d\s.,-]+Z/);
        
        // Skip if it's a pure white rectangular background with no complex curves
        const isBackground = isTransparent || (isPureWhite && isRectangularPath && !hasComplexPath) || isLargeBackground;
        
        if (!isBackground && !isLargeBackground) {
          try {
            const coords = extractPathCoordinates(pathData);
            if (coords.length > 0) {
              // Filter out coordinates that span the entire canvas (likely backgrounds)
              const filteredCoords = coords.filter(coord => {
                // Exclude coordinates that suggest full-canvas coverage for text logos
                const isNearLeftEdge = coord.x <= 10;
                const isNearRightEdge = coord.x >= 800; // For A3 and similar large canvases
                const isNearTopEdge = coord.y <= 10;
                const isNearBottomEdge = coord.y >= 1100; // For A3 height
                
                // Exclude if it's a corner coordinate (likely background rectangle)
                const isCornerCoord = (isNearLeftEdge || isNearRightEdge) && (isNearTopEdge || isNearBottomEdge);
                
                // Also exclude extremely wide or tall spanning coordinates
                const isFullWidthSpan = isNearLeftEdge && isNearRightEdge;
                const isFullHeightSpan = isNearTopEdge && isNearBottomEdge;
                
                return !(isCornerCoord || isFullWidthSpan || isFullHeightSpan);
              });
              
              if (filteredCoords.length > 0) {
                coloredElements.push(...filteredCoords);
              }
            }
          } catch (coordError) {
            console.log('Error extracting coordinates from path, skipping');
            continue;
          }
        }
      }
      
      if (matchCount >= maxMatches) {
        console.log(`Stopped processing SVG paths after ${maxMatches} matches to prevent infinite loop`);
      }
      
      // If we found colored paths, use those for bounding box
      if (coloredElements.length > 0) {
        const minX = Math.min(...coloredElements.map(e => e.x));
        const minY = Math.min(...coloredElements.map(e => e.y));
        const maxX = Math.max(...coloredElements.map(e => e.x));
        const maxY = Math.max(...coloredElements.map(e => e.y));
        
        const rawWidth = maxX - minX;
        const rawHeight = maxY - minY;
        
        // UNIVERSAL CONTENT-FOCUSED BOUNDS for text/glyph SVGs (same approach as regular SVGs)
        console.log(`🎯 TEXT/GLYPH CONTENT ANALYSIS: Raw detected: ${rawWidth}×${rawHeight}px from ${coloredElements.length} coordinates`);
        
        // Apply the same intelligent content bounds detection for text SVGs
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        // STEP 1: Remove coordinates hugging the edges (likely background padding)
        const borderFilteredCoords = coloredElements.filter(coord => {
          const relativeX = (coord.x - minX) / rawWidth;
          const relativeY = (coord.y - minY) / rawHeight;
          
          // Keep coordinates that aren't on the very edges
          return relativeX > 0.05 && relativeX < 0.95 && relativeY > 0.05 && relativeY < 0.95;
        });
        
        // STEP 2: Focus on center-concentrated content (text is usually centered)
        const centerFocusedCoords = borderFilteredCoords.filter(coord => {
          const distFromCenterX = Math.abs(coord.x - centerX);
          const distFromCenterY = Math.abs(coord.y - centerY);
          
          // For text, use a slightly tighter center focus (35% instead of 40%)
          return distFromCenterX < rawWidth * 0.35 && distFromCenterY < rawHeight * 0.35;
        });
        
        // Use the best coordinate set
        const bestCoords = centerFocusedCoords.length > coloredElements.length * 0.15 
          ? centerFocusedCoords
          : borderFilteredCoords.length > coloredElements.length * 0.3 
            ? borderFilteredCoords 
            : coloredElements;
        
        if (bestCoords.length > 0 && bestCoords.length < coloredElements.length) {
          const contentMinX = Math.min(...bestCoords.map(e => e.x));
          const contentMinY = Math.min(...bestCoords.map(e => e.y));
          const contentMaxX = Math.max(...bestCoords.map(e => e.x));
          const contentMaxY = Math.max(...bestCoords.map(e => e.y));
          
          const contentWidth = contentMaxX - contentMinX;
          const contentHeight = contentMaxY - contentMinY;
          
          // Calculate whitespace removal percentage
          const widthReduction = ((rawWidth - contentWidth) / rawWidth * 100);
          const heightReduction = ((rawHeight - contentHeight) / rawHeight * 100);
          
          // Apply if we've achieved meaningful whitespace removal
          if (contentWidth > 0 && contentHeight > 0 && (widthReduction > 15 || heightReduction > 15)) {
            console.log(`🎯 TEXT CONTENT-FOCUSED BOUNDS: ${rawWidth}×${rawHeight} → ${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)} (${widthReduction.toFixed(0)}%×${heightReduction.toFixed(0)}% whitespace removed)`);
            
            return {
              width: contentWidth,
              height: contentHeight,
              minX: contentMinX,
              minY: contentMinY,
              maxX: contentMaxX,
              maxY: contentMaxY
            };
          }
        }
        
        // For text/glyph SVGs, use exact content dimensions for accuracy
        const contentWidth = rawWidth; // Use exact floating point value, no rounding
        const contentHeight = rawHeight; // Use exact floating point value, no rounding
        
        // Use exact dimensions for text-based logos for accuracy
        const finalWidth = contentWidth; // Use exact content width
        const finalHeight = contentHeight; // Use exact content height
        
        console.log(`Text-aware content bounds: ${minX.toFixed(1)},${minY.toFixed(1)} to ${maxX.toFixed(1)},${maxY.toFixed(1)} = ${finalWidth}×${finalHeight} (raw: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)})`);
        
        return {
          width: finalWidth,
          height: finalHeight,
          minX,
          minY,
          maxX,
          maxY
        };
      }
      
      // Fallback for text-heavy logos - use more generous dimensions
      console.log('Text/glyph SVG with no colored paths found, using text logo fallback');
      return {
        width: 250,  // Reasonable default for text logos
        height: 100  // Reasonable default for text logos
      };
    }
    
    // UNIVERSAL CONTENT-FOCUSED BOUNDS for all regular SVGs
    console.log('🎯 Processing regular SVG with universal content-focused bounds detection');
    const allCoordinates = [];
    
    // Extract coordinates ONLY from COLORED content elements (skip white/transparent backgrounds)
    const coloredPathRegex = /<path[^>]*(?:fill="([^"]*)"[^>]*d="([^"]*)"[^>]*|d="([^"]*)"[^>]*fill="([^"]*)"[^>]*)/gi;
    const coloredRectRegex = /<rect[^>]*(?:fill="([^"]*)"[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*|x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*fill="([^"]*)"[^>]*)/gi;
    const coloredCircleRegex = /<circle[^>]*(?:fill="([^"]*)"[^>]*cx="([^"]*)"[^>]*cy="([^"]*)"[^>]*r="([^"]*)"[^>]*|cx="([^"]*)"[^>]*cy="([^"]*)"[^>]*r="([^"]*)"[^>]*fill="([^"]*)"[^>]*)/gi;
    
    // Helper function to check if a color is likely background (only truly transparent/none)
    const isBackgroundColor = (color: string | undefined): boolean => {
      if (!color) return true;
      const normalized = color.toLowerCase().trim();
      // Only filter out completely transparent or missing fills - keep ALL colored content including white
      return normalized === 'none' || 
             normalized === 'transparent';
    };
    
    // Process ONLY colored path elements
    let pathMatch;
    let pathCount = 0;
    const maxPaths = 200;
    
    while ((pathMatch = coloredPathRegex.exec(svgContent)) !== null && pathCount < maxPaths) {
      pathCount++;
      const fill1 = pathMatch[1];
      const pathData1 = pathMatch[2];
      const pathData2 = pathMatch[3];
      const fill2 = pathMatch[4];
      
      const fillColor = fill1 || fill2;
      const pathData = pathData1 || pathData2;
      
      // Skip only transparent/none fills - keep ALL colors including white (white is part of logo content)
      if (!isBackgroundColor(fillColor) && pathData) {
        try {
          const coords = extractPathCoordinates(pathData);
          if (coords.length > 0) {
            allCoordinates.push(...coords);
          }
        } catch (coordError) {
          console.log(`Error extracting coordinates from colored path ${pathCount}, skipping`);
          continue;
        }
      }
    }
    
    // Process ONLY colored rectangles
    let rectMatch;
    while ((rectMatch = coloredRectRegex.exec(svgContent)) !== null) {
      const fill1 = rectMatch[1];
      const x1 = parseFloat(rectMatch[2] || rectMatch[6]);
      const y1 = parseFloat(rectMatch[3] || rectMatch[7]);
      const width1 = parseFloat(rectMatch[4] || rectMatch[8]);
      const height1 = parseFloat(rectMatch[5] || rectMatch[9]);
      const fill2 = rectMatch[10];
      
      const fillColor = fill1 || fill2;
      
      // Skip only transparent/none fills - keep ALL colors including white (white is part of logo content)
      if (!isBackgroundColor(fillColor) && !isNaN(x1) && !isNaN(y1) && !isNaN(width1) && !isNaN(height1)) {
        allCoordinates.push(
          { x: x1, y: y1 },
          { x: x1 + width1, y: y1 },
          { x: x1 + width1, y: y1 + height1 },
          { x: x1, y: y1 + height1 }
        );
      }
    }
    
    // Process ONLY colored circles
    let circleMatch;
    while ((circleMatch = coloredCircleRegex.exec(svgContent)) !== null) {
      const fill1 = circleMatch[1];
      const cx1 = parseFloat(circleMatch[2] || circleMatch[5]);
      const cy1 = parseFloat(circleMatch[3] || circleMatch[6]);
      const r1 = parseFloat(circleMatch[4] || circleMatch[7]);
      const fill2 = circleMatch[8];
      
      const fillColor = fill1 || fill2;
      
      // Skip only transparent/none fills - keep ALL colors including white (white is part of logo content)
      if (!isBackgroundColor(fillColor) && !isNaN(cx1) && !isNaN(cy1) && !isNaN(r1)) {
        allCoordinates.push(
          { x: cx1 - r1, y: cy1 },  // Left
          { x: cx1 + r1, y: cy1 },  // Right
          { x: cx1, y: cy1 - r1 },  // Top
          { x: cx1, y: cy1 + r1 }   // Bottom
        );
      }
    }
    
    console.log(`📊 Extracted ${allCoordinates.length} CONTENT coordinates from ${pathCount} paths (only transparent/none filtered out - white content preserved)`);
    
    if (allCoordinates.length === 0) {
      console.log('No coordinates found, using fallback dimensions');
      return {
        width: 200,
        height: 200
      };
    }
    
    // Calculate raw bounds
    const minX = Math.min(...allCoordinates.map(c => c.x));
    const minY = Math.min(...allCoordinates.map(c => c.y));
    const maxX = Math.max(...allCoordinates.map(c => c.x));
    const maxY = Math.max(...allCoordinates.map(c => c.y));
    
    const rawWidth = maxX - minX;
    const rawHeight = maxY - minY;
    
    console.log(`🎯 RAW BOUNDS DETECTED: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)}px from ${allCoordinates.length} coordinates`);
    
    // ULTRA-AGGRESSIVE DENSITY-BASED APPROACH - Find the core logo content area
    
    // Step 1: Find coordinate density clusters using smaller grid
    const gridSize = 8; // Very small grid for precise detection
    const densityMap = new Map();
    
    allCoordinates.forEach(coord => {
      const gridX = Math.floor(coord.x / gridSize);
      const gridY = Math.floor(coord.y / gridSize);
      const key = `${gridX},${gridY}`;
      densityMap.set(key, (densityMap.get(key) || 0) + 1);
    });
    
    // Step 2: Find the densest region (likely the main logo)
    let maxDensity = 0;
    let densestCells: string[] = [];
    densityMap.forEach((density, key) => {
      if (density > maxDensity) {
        maxDensity = density;
        densestCells = [key];
      } else if (density === maxDensity) {
        densestCells.push(key);
      }
    });
    
    // Step 3: Find the center of the densest region
    if (densestCells.length > 0) {
      let totalX = 0, totalY = 0;
      densestCells.forEach(key => {
        const [gridX, gridY] = key.split(',').map(Number);
        totalX += (gridX + 0.5) * gridSize;
        totalY += (gridY + 0.5) * gridSize;
      });
      
      const centerX = totalX / densestCells.length;
      const centerY = totalY / densestCells.length;
      
      // Step 4: Use a tight radius around the densest center for ultra-precise bounds
      const tightRadius = Math.min(rawWidth * 0.15, rawHeight * 0.15, 50); // Very tight radius
      
      const coreCoordinates = allCoordinates.filter(coord => {
        const distanceToCenter = Math.sqrt(
          Math.pow(coord.x - centerX, 2) + Math.pow(coord.y - centerY, 2)
        );
        return distanceToCenter <= tightRadius;
      });
      
      if (coreCoordinates.length > allCoordinates.length * 0.1) { // At least 10% of coordinates
        const coreMinX = Math.min(...coreCoordinates.map(c => c.x));
        const coreMinY = Math.min(...coreCoordinates.map(c => c.y));
        const coreMaxX = Math.max(...coreCoordinates.map(c => c.x));
        const coreMaxY = Math.max(...coreCoordinates.map(c => c.y));
        
        const coreWidth = coreMaxX - coreMinX;
        const coreHeight = coreMaxY - coreMinY;
        
        const widthReduction = ((rawWidth - coreWidth) / rawWidth) * 100;
        const heightReduction = ((rawHeight - coreHeight) / rawHeight) * 100;
        
        // Accept if we achieve significant reduction and have reasonable dimensions
        if (coreWidth > 15 && coreHeight > 15 && (widthReduction > 40 || heightReduction > 40)) {
          console.log(`🎯 CORE DENSITY BOUNDS APPLIED: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)} → ${coreWidth.toFixed(1)}×${coreHeight.toFixed(1)} (${widthReduction.toFixed(0)}%×${heightReduction.toFixed(0)}% reduction, center: ${centerX.toFixed(1)},${centerY.toFixed(1)}, radius: ${tightRadius.toFixed(1)}px)`);
          
          return {
            width: coreWidth,
            height: coreHeight,
            minX: coreMinX,
            minY: coreMinY,
            maxX: coreMaxX,
            maxY: coreMaxY
          };
        }
      }
    }
    
    // STEP 3: Enhanced adaptive center-focused filtering 
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    
    // Try multiple focus ratios to find the best content bounds - ultra-aggressive for tight logos
    const focusRatios = [0.08, 0.12, 0.18, 0.25]; // Start with ultra-tight filtering
    let bestResult = null;
    let bestReduction = 0;
    
    for (const focusRatio of focusRatios) {
      const focusRangeX = spanX * focusRatio;
      const focusRangeY = spanY * focusRatio;
      
      const centerFilteredCoords = densityFilteredCoords.filter(coord => {
        const distFromCenterX = Math.abs(coord.x - centerX);
        const distFromCenterY = Math.abs(coord.y - centerY);
        return distFromCenterX <= focusRangeX / 2 && distFromCenterY <= focusRangeY / 2;
      });
      
      // Must have sufficient coordinates to be valid (at least 5% for ultra-aggressive filtering)
      if (centerFilteredCoords.length > allCoordinates.length * 0.05) {
        const contentMinX = Math.min(...centerFilteredCoords.map(c => c.x));
        const contentMinY = Math.min(...centerFilteredCoords.map(c => c.y));
        const contentMaxX = Math.max(...centerFilteredCoords.map(c => c.x));
        const contentMaxY = Math.max(...centerFilteredCoords.map(c => c.y));
        
        const contentWidth = contentMaxX - contentMinX;
        const contentHeight = contentMaxY - contentMinY;
        
        // Calculate total reduction percentage
        const widthReduction = ((rawWidth - contentWidth) / rawWidth) * 100;
        const heightReduction = ((rawHeight - contentHeight) / rawHeight) * 100;
        const totalReduction = (widthReduction + heightReduction) / 2;
        
        // Prefer results with significant reduction (>30% total) and tight dimensions
        if (totalReduction > 30 && contentWidth > 20 && contentHeight > 15 && totalReduction > bestReduction) {
          bestResult = {
            coords: centerFilteredCoords,
            width: contentWidth,
            height: contentHeight,
            minX: contentMinX,
            minY: contentMinY,
            maxX: contentMaxX,
            maxY: contentMaxY,
            focusRatio,
            widthReduction,
            heightReduction,
            totalReduction
          };
          bestReduction = totalReduction;
        }
      }
    }
    
    // Choose the best coordinate set based on filtering effectiveness
    let bestCoords = allCoordinates;
    let filteringApplied = 'none';
    
    if (bestResult) {
      bestCoords = bestResult.coords;
      filteringApplied = `adaptive center-focused (${Math.round(bestResult.focusRatio * 100)}% span)`;
    } else if (densityFilteredCoords.length > allCoordinates.length * 0.3) {
      bestCoords = densityFilteredCoords;
      filteringApplied = 'density-based';
    } else if (edgeFilteredCoords.length > allCoordinates.length * 0.5) {
      bestCoords = edgeFilteredCoords;
      filteringApplied = 'edge-removal (5% border)';
    }
    
    // Calculate final content bounds - use pre-calculated bestResult if available
    if (bestResult) {
      console.log(`🎯 CONTENT-FOCUSED BOUNDS APPLIED: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)} → ${bestResult.width.toFixed(1)}×${bestResult.height.toFixed(1)} (${bestResult.widthReduction.toFixed(0)}%×${bestResult.heightReduction.toFixed(0)}% whitespace removed, filter: ${filteringApplied})`);
      
      return {
        width: bestResult.width,
        height: bestResult.height,
        minX: bestResult.minX,
        minY: bestResult.minY,
        maxX: bestResult.maxX,
        maxY: bestResult.maxY
      };
    }
    // Fallback for other filtering methods
    else if (bestCoords.length > 0 && bestCoords.length < allCoordinates.length) {
      const contentMinX = Math.min(...bestCoords.map(c => c.x));
      const contentMinY = Math.min(...bestCoords.map(c => c.y));
      const contentMaxX = Math.max(...bestCoords.map(c => c.x));
      const contentMaxY = Math.max(...bestCoords.map(c => c.y));
      
      const contentWidth = contentMaxX - contentMinX;
      const contentHeight = contentMaxY - contentMinY;
      
      // Calculate whitespace reduction
      const widthReduction = ((rawWidth - contentWidth) / rawWidth * 100);
      const heightReduction = ((rawHeight - contentHeight) / rawHeight * 100);
      
      // Apply content-focused bounds if we achieved meaningful whitespace removal
      if (contentWidth > 10 && contentHeight > 10 && (widthReduction > 10 || heightReduction > 10)) {
        console.log(`🎯 CONTENT-FOCUSED BOUNDS APPLIED: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)} → ${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)} (${widthReduction.toFixed(0)}%×${heightReduction.toFixed(0)}% whitespace removed, filter: ${filteringApplied})`);
        
        return {
          width: contentWidth,
          height: contentHeight,
          minX: contentMinX,
          minY: contentMinY,
          maxX: contentMaxX,
          maxY: contentMaxY
        };
      }
    }
    
    // Use original raw bounds if content filtering didn't provide significant improvement
    console.log(`🎯 Using raw bounds: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)}px (filtering ineffective: ${filteringApplied})`);
    
    return {
      width: rawWidth,
      height: rawHeight,
      minX,
      minY,
      maxX,
      maxY
    };
    
  } catch (error) {
    console.error('Error calculating SVG content bounds:', error);
    return {
      width: 200,
      height: 200
    };
  }
}
