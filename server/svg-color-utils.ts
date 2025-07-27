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

    // Check for glyph definitions (already outlined text)
    const glyphElements = svgContent.match(/<g id="glyph-[^"]*"[^>]*>/gi) || [];
    
    if (glyphElements.length > 0) {
      // This indicates text has already been converted to paths (outlined)
      fonts.push({
        fontFamily: 'Already Outlined',
        fontSize: 'Various',
        fontWeight: 'normal',
        textContent: `${glyphElements.length} text elements already outlined as paths`,
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