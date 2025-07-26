import fs from 'fs';
import path from 'path';

export interface SVGColorInfo {
  id: string;
  originalColor: string;
  elementType: string;
  attribute: string; // 'fill', 'stroke', etc.
  selector: string; // CSS selector to identify the element
}

export function extractSVGColors(svgPath: string): SVGColorInfo[] {
  try {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const colors: SVGColorInfo[] = [];
    let colorId = 0;

    // Regular expressions to find color attributes
    const colorPatterns = [
      // fill="color"
      /fill\s*=\s*["']([^"']+)["']/gi,
      // stroke="color"
      /stroke\s*=\s*["']([^"']+)["']/gi,
      // style="fill:color" or style="stroke:color"
      /style\s*=\s*["'][^"']*(?:fill|stroke)\s*:\s*([^;"']+)[^"']*["']/gi,
    ];

    // Extract element types and their colors
    const elementMatches = svgContent.match(/<(path|rect|circle|ellipse|polygon|polyline|line|text|g)[^>]*>/gi) || [];
    
    elementMatches.forEach((elementMatch, index) => {
      const elementType = elementMatch.match(/<(\w+)/)?.[1] || 'unknown';
      
      // Check for fill colors
      const fillMatch = elementMatch.match(/fill\s*=\s*["']([^"']+)["']/i);
      if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
        colors.push({
          id: `color_${colorId++}`,
          originalColor: fillMatch[1],
          elementType,
          attribute: 'fill',
          selector: `${elementType}:nth-of-type(${index + 1})`
        });
      }

      // Check for stroke colors
      const strokeMatch = elementMatch.match(/stroke\s*=\s*["']([^"']+)["']/i);
      if (strokeMatch && strokeMatch[1] !== 'none' && strokeMatch[1] !== 'transparent') {
        colors.push({
          id: `color_${colorId++}`,
          originalColor: strokeMatch[1],
          elementType,
          attribute: 'stroke',
          selector: `${elementType}:nth-of-type(${index + 1})`
        });
      }

      // Check for style-based colors
      const styleMatch = elementMatch.match(/style\s*=\s*["']([^"']+)["']/i);
      if (styleMatch) {
        const style = styleMatch[1];
        
        // Extract fill from style
        const styleFillMatch = style.match(/fill\s*:\s*([^;]+)/i);
        if (styleFillMatch && styleFillMatch[1] !== 'none' && styleFillMatch[1] !== 'transparent') {
          colors.push({
            id: `color_${colorId++}`,
            originalColor: styleFillMatch[1].trim(),
            elementType,
            attribute: 'fill',
            selector: `${elementType}:nth-of-type(${index + 1})`
          });
        }

        // Extract stroke from style
        const styleStrokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
        if (styleStrokeMatch && styleStrokeMatch[1] !== 'none' && styleStrokeMatch[1] !== 'transparent') {
          colors.push({
            id: `color_${colorId++}`,
            originalColor: styleStrokeMatch[1].trim(),
            elementType,
            attribute: 'stroke',
            selector: `${elementType}:nth-of-type(${index + 1})`
          });
        }
      }
    });

    // Remove duplicates
    const uniqueColors = colors.filter((color, index, self) => 
      index === self.findIndex(c => c.originalColor === color.originalColor && c.attribute === color.attribute)
    );

    return uniqueColors;
  } catch (error) {
    console.error('Error extracting SVG colors:', error);
    return [];
  }
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