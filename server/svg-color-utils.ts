import fs from 'fs';
import path from 'path';
import { standardizeRgbToCmyk } from './color-standardization';

export interface SVGColorInfo {
  id: string;
  originalColor: string;
  cmykColor?: string; // CMYK representation of the color
  elementType: string;
  attribute: string; // 'fill', 'stroke', etc.
  selector: string; // CSS selector to identify the element
  converted?: boolean;
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

export function extractSVGColors(svgPath: string): SVGColorInfo[] {
  try {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const colors: SVGColorInfo[] = [];
    let colorId = 0;

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

    // Function to convert RGB to CMYK
    const rgbToCmyk = (r: number, g: number, b: number) => {
      // Normalize RGB values to 0-1
      r = r / 255;
      g = g / 255;
      b = b / 255;
      
      // Find the maximum of RGB values
      const k = 1 - Math.max(r, Math.max(g, b));
      
      if (k === 1) {
        return { c: 0, m: 0, y: 0, k: 100 };
      }
      
      const c = Math.round(((1 - r - k) / (1 - k)) * 100);
      const m = Math.round(((1 - g - k) / (1 - k)) * 100);
      const y = Math.round(((1 - b - k) / (1 - k)) * 100);
      const kPercent = Math.round(k * 100);
      
      return { c, m, y, k: kPercent };
    };

    // Function to get CMYK values from color string
    const getColorInfo = (colorString: string) => {
      let rgbColor = colorString;
      
      // Convert RGB percentage to standard RGB
      if (colorString.includes('rgb(') && colorString.includes('%')) {
        rgbColor = convertRgbPercent(colorString);
      }
      
      // Extract RGB values for CMYK conversion
      const rgbMatch = rgbColor.match(/rgb\((\d+),?\s*(\d+),?\s*(\d+)\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        // Use standardized conversion for consistent results
        const cmykColor = standardizeRgbToCmyk(r, g, b);
        
        return {
          display: rgbColor,
          cmyk: cmykColor
        };
      }
      
      // For hex colors, convert to RGB first
      if (colorString.startsWith('#')) {
        const hex = colorString.substring(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Use standardized conversion for consistent results
        const cmykColor = standardizeRgbToCmyk(r, g, b);
        
        return {
          display: `rgb(${r}, ${g}, ${b})`,
          cmyk: cmykColor
        };
      }
      
      return {
        display: colorString,
        cmyk: 'Unknown'
      };
    };

    // Extract element types and their colors
    const elementMatches = svgContent.match(/<(path|rect|circle|ellipse|polygon|polyline|line|text|g)[^>]*>/gi) || [];
    
    elementMatches.forEach((elementMatch, index) => {
      const elementType = elementMatch.match(/<(\w+)/)?.[1] || 'unknown';
      
      // Check for fill colors (including white colors)
      const fillMatch = elementMatch.match(/fill\s*=\s*["']([^"']+)["']/i);
      if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
        const colorInfo = getColorInfo(fillMatch[1]);
        colors.push({
          id: `color_${colorId++}`,
          originalColor: colorInfo.display,
          cmykColor: colorInfo.cmyk,
          elementType,
          attribute: 'fill',
          selector: `${elementType}:nth-of-type(${index + 1})`
        });
      }

      // Check for stroke colors
      const strokeMatch = elementMatch.match(/stroke\s*=\s*["']([^"']+)["']/i);
      if (strokeMatch && strokeMatch[1] !== 'none' && strokeMatch[1] !== 'transparent') {
        const colorInfo = getColorInfo(strokeMatch[1]);
        colors.push({
          id: `color_${colorId++}`,
          originalColor: colorInfo.display,
          cmykColor: colorInfo.cmyk,
          elementType,
          attribute: 'stroke',
          selector: `${elementType}:nth-of-type(${index + 1})`
        });
      }

      // Check for style-based colors
      const styleMatch = elementMatch.match(/style\s*=\s*["']([^"']+)["']/i);
      if (styleMatch) {
        const style = styleMatch[1];
        
        // Extract fill from style (including white colors)
        const styleFillMatch = style.match(/fill\s*:\s*([^;]+)/i);
        if (styleFillMatch && styleFillMatch[1] !== 'none' && styleFillMatch[1] !== 'transparent') {
          const colorInfo = getColorInfo(styleFillMatch[1].trim());
          colors.push({
            id: `color_${colorId++}`,
            originalColor: colorInfo.display,
            cmykColor: colorInfo.cmyk,
            elementType,
            attribute: 'fill',
            selector: `${elementType}:nth-of-type(${index + 1})`
          });
        }

        // Extract stroke from style
        const styleStrokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
        if (styleStrokeMatch && styleStrokeMatch[1] !== 'none' && styleStrokeMatch[1] !== 'transparent') {
          const colorInfo = getColorInfo(styleStrokeMatch[1].trim());
          colors.push({
            id: `color_${colorId++}`,
            originalColor: colorInfo.display,
            cmykColor: colorInfo.cmyk,
            elementType,
            attribute: 'stroke',
            selector: `${elementType}:nth-of-type(${index + 1})`
          });
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

// Calculate actual content bounding box from SVG elements, excluding obvious backgrounds and font definitions
export function calculateSVGContentBounds(svgContent: string): { width: number; height: number } | null {
  try {
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
      while ((pathMatch = pathRegex.exec(contentWithoutDefs)) !== null) {
        const fillColor = pathMatch[1];
        const pathData = pathMatch[2];
        
        // Skip white, transparent, or background colors
        const isBackground = fillColor === 'white' || fillColor === '#ffffff' || 
                            fillColor === 'rgb(100%, 100%, 100%)' || fillColor === 'none' ||
                            fillColor.includes('100%, 100%, 100%');
        
        // Also skip large background rectangles that cover most of the canvas
        const isLargeBackground = pathData.includes('M 0 0') && 
                                 (pathData.includes('L 700') || pathData.includes('L 839') || pathData.includes('L 624'));
        
        if (!isBackground && !isLargeBackground) {
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
        }
      }
      
      // If we found colored paths, use those for bounding box
      if (coloredElements.length > 0) {
        const minX = Math.min(...coloredElements.map(e => e.x));
        const minY = Math.min(...coloredElements.map(e => e.y));
        const maxX = Math.max(...coloredElements.map(e => e.x));
        const maxY = Math.max(...coloredElements.map(e => e.y));
        
        const rawWidth = maxX - minX;
        const rawHeight = maxY - minY;
        
        // Check if we're still getting massive bounds that suggest background contamination
        // Only apply center-focused filtering if bounds are really large (likely background contamination)
        if (rawWidth > 700 && rawHeight > 700) {
          // Try to find a better estimate by looking at the coordinate distribution
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          
          // Filter coordinates to those closer to the center (likely actual content)
          const centerCoords = coloredElements.filter(coord => {
            const distFromCenterX = Math.abs(coord.x - centerX);
            const distFromCenterY = Math.abs(coord.y - centerY);
            return distFromCenterX < rawWidth * 0.3 && distFromCenterY < rawHeight * 0.3;
          });
          
          if (centerCoords.length > 0) {
            const centerMinX = Math.min(...centerCoords.map(e => e.x));
            const centerMinY = Math.min(...centerCoords.map(e => e.y));
            const centerMaxX = Math.max(...centerCoords.map(e => e.x));
            const centerMaxY = Math.max(...centerCoords.map(e => e.y));
            
            const centerWidth = centerMaxX - centerMinX;
            const centerHeight = centerMaxY - centerMinY;
            
            if (centerWidth > 0 && centerHeight > 0 && centerWidth < rawWidth * 0.8) {
              console.log(`Using center-focused bounds for text logo: ${centerWidth.toFixed(1)}×${centerHeight.toFixed(1)} instead of ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)}`);
              
              const contentWidth = Math.max(100, Math.ceil(centerWidth + 60));
              const contentHeight = Math.max(50, Math.ceil(centerHeight + 40));
              
              // Allow larger dimensions for real content - don't cap too aggressively
              return {
                width: Math.min(contentWidth, 600), // Increased cap to allow larger real content
                height: Math.min(contentHeight, 500) // Increased cap to allow larger real content
              };
            }
          }
          
          console.log(`Detected oversized bounds for text logo (${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)}), using conservative text sizing`);
          return {
            width: 350,
            height: 120
          };
        }
        
        // For text/glyph SVGs, be more generous with the sizing since text can be more complex
        const contentWidth = Math.max(100, Math.ceil(rawWidth + 60)); // More padding for text
        const contentHeight = Math.max(50, Math.ceil(rawHeight + 40));
        
        // Apply generous limits for text-based logos to maintain readability - allow real content sizes
        const finalWidth = Math.min(contentWidth, 700); // Allow larger real content
        const finalHeight = Math.min(contentHeight, 600); // Allow larger real content
        
        console.log(`Text-aware content bounds: ${minX.toFixed(1)},${minY.toFixed(1)} to ${maxX.toFixed(1)},${maxY.toFixed(1)} = ${finalWidth}×${finalHeight} (raw: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)})`);
        
        return {
          width: finalWidth,
          height: finalHeight
        };
      }
      
      // Fallback for text-heavy logos - use more generous dimensions
      console.log('Text/glyph SVG with no colored paths found, using text logo fallback');
      return {
        width: 350,  // Increased from 250 for better text readability
        height: 120  // Increased from 80 for better text readability
      };
    }
    
    // Original logic for non-text SVGs
    const coloredElements = [];
    
    // Find path elements with actual colors (not white/transparent)
    const pathRegex = /<path[^>]*fill="([^"]*)"[^>]*d="([^"]*)"[^>]*>/gi;
    let pathMatch;
    while ((pathMatch = pathRegex.exec(svgContent)) !== null) {
      const fillColor = pathMatch[1];
      const pathData = pathMatch[2];
      
      // Skip white, transparent, or background colors
      const isBackground = fillColor === 'white' || fillColor === '#ffffff' || 
                          fillColor === 'rgb(100%, 100%, 100%)' || fillColor === 'none' ||
                          fillColor.includes('100%, 100%, 100%');
      
      if (!isBackground) {
        const coords = extractPathCoordinates(pathData);
        if (coords.length > 0) {
          coloredElements.push(...coords);
        }
      }
    }
    
    // Find elements with style-based colors
    const stylePathRegex = /<path[^>]*style="[^"]*fill:\s*([^;]+)[^"]*"[^>]*d="([^"]*)"[^>]*>/gi;
    let styleMatch;
    while ((styleMatch = stylePathRegex.exec(svgContent)) !== null) {
      const fillColor = styleMatch[1].trim();
      const pathData = styleMatch[2];
      
      const isBackground = fillColor === 'white' || fillColor === '#ffffff' || 
                          fillColor === 'rgb(100%, 100%, 100%)' || fillColor === 'none' ||
                          fillColor.includes('100%, 100%, 100%');
      
      if (!isBackground) {
        const coords = extractPathCoordinates(pathData);
        if (coords.length > 0) {
          coloredElements.push(...coords);
        }
      }
    }
    
    if (coloredElements.length === 0) {
      console.log('No colored content elements found, using conservative fallback');
      return {
        width: 350,  // Increased from 300 for better logo visibility
        height: 250  // Increased from 200 for better logo visibility
      };
    }
    
    // Calculate bounding box from colored content only
    const minX = Math.min(...coloredElements.map(e => e.x));
    const minY = Math.min(...coloredElements.map(e => e.y));
    const maxX = Math.max(...coloredElements.map(e => e.x));
    const maxY = Math.max(...coloredElements.map(e => e.y));
    
    const rawWidth = maxX - minX;
    const rawHeight = maxY - minY;
    
    // Check if we're still getting massive bounds (indicating background elements)
    if (rawWidth > 700 || rawHeight > 1000) {
      // Try to find a better estimate by looking at coordinate clustering
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      
      // Filter coordinates to exclude outliers (likely background elements)
      const filteredCoords = coloredElements.filter(coord => {
        const distFromCenterX = Math.abs(coord.x - centerX);
        const distFromCenterY = Math.abs(coord.y - centerY);
        // Keep coordinates within 40% of the total span from center
        return distFromCenterX < rawWidth * 0.4 && distFromCenterY < rawHeight * 0.4;
      });
      
      if (filteredCoords.length > coloredElements.length * 0.5) { // At least half the coordinates should be in center
        const filteredMinX = Math.min(...filteredCoords.map(e => e.x));
        const filteredMinY = Math.min(...filteredCoords.map(e => e.y));
        const filteredMaxX = Math.max(...filteredCoords.map(e => e.x));
        const filteredMaxY = Math.max(...filteredCoords.map(e => e.y));
        
        const filteredWidth = filteredMaxX - filteredMinX;
        const filteredHeight = filteredMaxY - filteredMinY;
        
        if (filteredWidth > 0 && filteredHeight > 0 && (filteredWidth < rawWidth * 0.7 || filteredHeight < rawHeight * 0.7)) {
          console.log(`Using filtered bounds: ${filteredWidth.toFixed(1)}×${filteredHeight.toFixed(1)} instead of ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)}`);
          
          const contentWidth = Math.max(80, Math.ceil(filteredWidth + 40));
          const contentHeight = Math.max(60, Math.ceil(filteredHeight + 30));
          
          return {
            width: Math.min(contentWidth, 600), // Allow larger real content
            height: Math.min(contentHeight, 500) // Allow larger real content
          };
        }
      }
      
      console.log(`Detected oversized bounds (${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)}), using conservative logo sizing`);
      return {
        width: 300,
        height: 200
      };
    }
    
    // Add reasonable padding and ensure minimum viable size
    const contentWidth = Math.max(80, Math.ceil(rawWidth + 40)); // More generous padding
    const contentHeight = Math.max(60, Math.ceil(rawHeight + 30));
    
    // Apply maximum limits to prevent oversized logos but allow reasonable sizes
    const finalWidth = Math.min(contentWidth, 500); // Back to 500 for better control
    const finalHeight = Math.min(contentHeight, 400); // Back to 400 for better control
    
    console.log(`Content bounds: ${minX.toFixed(1)},${minY.toFixed(1)} to ${maxX.toFixed(1)},${maxY.toFixed(1)} = ${finalWidth}×${finalHeight} (colored content only, raw: ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)})`);
    
    return {
      width: finalWidth,
      height: finalHeight
    };
    
  } catch (error) {
    console.error('Error calculating SVG content bounds:', error);
    return null;
  }
}

// Extract coordinates from SVG path data
function extractPathCoordinates(pathData: string): Array<{ x: number; y: number }> {
  const coords = [];
  
  // Match all number pairs in path data (M, L, C, etc. commands with coordinates)
  const numberRegex = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
  let match;
  
  while ((match = numberRegex.exec(pathData)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    
    if (!isNaN(x) && !isNaN(y)) {
      coords.push({ x, y });
    }
  }
  
  return coords;
}

export function applySVGColorChanges(svgPath: string, colorOverrides: Record<string, string>): string {
  try {
    let svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // Apply color overrides
    Object.entries(colorOverrides).forEach(([originalColor, newColor]) => {
      // Replace fill attributes
      svgContent = svgContent.replace(
        new RegExp(`fill\\s*=\\s*["']${escapeRegExp(originalColor)}["']`, 'gi'),
        `fill="${newColor}"`
      );
      
      // Replace stroke attributes
      svgContent = svgContent.replace(
        new RegExp(`stroke\\s*=\\s*["']${escapeRegExp(originalColor)}["']`, 'gi'),
        `stroke="${newColor}"`
      );
      
      // Replace style-based fills
      svgContent = svgContent.replace(
        new RegExp(`(style\\s*=\\s*["'][^"']*fill\\s*:\\s*)${escapeRegExp(originalColor)}([^"';]*)`, 'gi'),
        `$1${newColor}$2`
      );
      
      // Replace style-based strokes
      svgContent = svgContent.replace(
        new RegExp(`(style\\s*=\\s*["'][^"']*stroke\\s*:\\s*)${escapeRegExp(originalColor)}([^"';]*)`, 'gi'),
        `$1${newColor}$2`
      );
    });

    return svgContent;
  } catch (error) {
    console.error('Error applying SVG color changes:', error);
    return '';
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}