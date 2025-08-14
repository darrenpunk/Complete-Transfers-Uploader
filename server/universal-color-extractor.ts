import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ColorValue {
  format: string; // 'cmyk', 'rgb', 'hex'
  values: number[]; // CMYK: [c, m, y, k], RGB: [r, g, b]
  originalString: string; // Original color declaration from file
  elementSelector?: string; // CSS selector for the element
}

export interface ExtractedColors {
  colors: ColorValue[];
  colorSpace: 'CMYK' | 'RGB' | 'sRGB' | 'MIXED';
  hasEmbeddedProfile: boolean;
  preserveOriginal: boolean;
}

/**
 * Universal Color Extractor - Extracts exact original colors from ANY artwork file
 * Supports: SVG, PDF, AI, EPS files with embedded CMYK/RGB values
 */
export class UniversalColorExtractor {
  
  /**
   * Extract all colors from any supported file format
   */
  static async extractColors(filePath: string, mimeType: string): Promise<ExtractedColors> {
    console.log(`🎨 UNIVERSAL COLOR EXTRACTION: ${path.basename(filePath)} (${mimeType})`);
    
    const extension = path.extname(filePath).toLowerCase();
    
    try {
      switch (mimeType) {
        case 'image/svg+xml':
          return await this.extractFromSVG(filePath);
        case 'application/pdf':
          return await this.extractFromPDF(filePath);
        case 'application/postscript':
        case 'application/illustrator':
          return await this.extractFromAI(filePath);
        default:
          console.log(`⚠️ Unsupported file type for color extraction: ${mimeType}`);
          return this.createFallbackResult();
      }
    } catch (error) {
      console.error('❌ Color extraction failed:', error);
      return this.createFallbackResult();
    }
  }

  /**
   * Extract colors from SVG files - most detailed extraction
   */
  private static async extractFromSVG(filePath: string): Promise<ExtractedColors> {
    const svgContent = fs.readFileSync(filePath, 'utf8');
    const colors: ColorValue[] = [];
    let colorSpace: 'CMYK' | 'RGB' | 'sRGB' | 'MIXED' = 'RGB';
    let hasCMYK = false;
    let hasRGB = false;

    // Extract CMYK colors from device-cmyk() functions
    const cmykPattern = /device-cmyk\s*\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*\)/gi;
    let cmykMatch;
    while ((cmykMatch = cmykPattern.exec(svgContent)) !== null) {
      const [fullMatch, c, m, y, k] = cmykMatch;
      colors.push({
        format: 'cmyk',
        values: [parseFloat(c) * 100, parseFloat(m) * 100, parseFloat(y) * 100, parseFloat(k) * 100],
        originalString: fullMatch,
        elementSelector: this.findElementSelector(svgContent, cmykMatch.index)
      });
      hasCMYK = true;
      console.log(`✓ Found CMYK: device-cmyk(${c}, ${m}, ${y}, ${k}) → C:${Math.round(parseFloat(c) * 100)} M:${Math.round(parseFloat(m) * 100)} Y:${Math.round(parseFloat(y) * 100)} K:${Math.round(parseFloat(k) * 100)}`);
    }

    // Extract RGB colors from fill and stroke attributes (including percentage format)
    const rgbPatterns = [
      /fill="rgb\(([^)]+)\)"/gi,
      /stroke="rgb\(([^)]+)\)"/gi,
      /fill\s*:\s*rgb\(([^)]+)\)/gi,
      /stroke\s*:\s*rgb\(([^)]+)\)/gi,
      // Look for RGB colors in style attributes
      /fill="rgb\(([^)]+)\)"/gi,
      /stroke="rgb\(([^)]+)\)"/gi
    ];

    for (const pattern of rgbPatterns) {
      let rgbMatch;
      while ((rgbMatch = pattern.exec(svgContent)) !== null) {
        const [fullMatch, rgbValues] = rgbMatch;
        const values = this.parseRGBValues(rgbValues);
        if (values) {
          colors.push({
            format: 'rgb',
            values: values,
            originalString: fullMatch,
            elementSelector: this.findElementSelector(svgContent, rgbMatch.index)
          });
          hasRGB = true;
          console.log(`✓ Found RGB: ${fullMatch} → R:${values[0]} G:${values[1]} B:${values[2]}`);
        }
      }
    }

    // Extract hex colors
    const hexPattern = /(?:fill|stroke)="(#[0-9a-fA-F]{6})"/gi;
    let hexMatch;
    while ((hexMatch = hexPattern.exec(svgContent)) !== null) {
      const [fullMatch, hexValue] = hexMatch;
      const rgbValues = this.hexToRgb(hexValue);
      if (rgbValues) {
        colors.push({
          format: 'hex',
          values: [rgbValues.r, rgbValues.g, rgbValues.b],
          originalString: fullMatch,
          elementSelector: this.findElementSelector(svgContent, hexMatch.index)
        });
        hasRGB = true;
        console.log(`✓ Found HEX: ${hexValue} → R:${rgbValues.r} G:${rgbValues.g} B:${rgbValues.b}`);
      }
    }

    // Determine color space
    if (hasCMYK && hasRGB) {
      colorSpace = 'MIXED';
    } else if (hasCMYK) {
      colorSpace = 'CMYK';
    } else {
      colorSpace = 'RGB';
    }

    console.log(`🎯 SVG Color Analysis Complete: ${colors.length} colors found, colorSpace: ${colorSpace}`);

    return {
      colors,
      colorSpace,
      hasEmbeddedProfile: hasCMYK,
      preserveOriginal: true
    };
  }

  /**
   * Extract colors from PDF files using Ghostscript
   */
  private static async extractFromPDF(filePath: string): Promise<ExtractedColors> {
    console.log(`📄 Extracting colors from PDF: ${filePath}`);
    
    try {
      // Use Ghostscript to analyze color information
      const { stdout } = await execAsync(`gs -dNODISPLAY -dBATCH -dNOPAUSE -sDEVICE=nullpage -c "
        /findcolors {
          currentpagedevice /ImagingBBox known {
            dup type /dicttype eq {
              /ColorSpace known {
                dup /ColorSpace get == flush
              } if
            } if
          } if
        } def
        (${filePath}) (r) file runpdfbegin
        1 1 pdfpagecount {
          pdfgetpage findcolors
        } for
        quit" 2>/dev/null || echo "RGB"`);

      const colorSpace = stdout.includes('DeviceCMYK') ? 'CMYK' : 'RGB';
      
      // For now, return basic detection - would need more sophisticated parsing for full extraction
      return {
        colors: [],
        colorSpace: colorSpace as any,
        hasEmbeddedProfile: colorSpace === 'CMYK',
        preserveOriginal: true
      };
    } catch (error) {
      console.log('📄 PDF color analysis failed, assuming RGB');
      return {
        colors: [],
        colorSpace: 'RGB',
        hasEmbeddedProfile: false,
        preserveOriginal: true
      };
    }
  }

  /**
   * Extract colors from AI/EPS files
   */
  private static async extractFromAI(filePath: string): Promise<ExtractedColors> {
    console.log(`🎨 Extracting colors from AI/EPS: ${filePath}`);
    
    try {
      // Read AI/EPS file content (they're text-based PostScript)
      const content = fs.readFileSync(filePath, 'utf8');
      const colors: ColorValue[] = [];
      
      // Look for CMYK color definitions in PostScript
      const cmykPattern = /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+k/gi;
      let cmykMatch;
      while ((cmykMatch = cmykPattern.exec(content)) !== null) {
        const [fullMatch, c, m, y, k] = cmykMatch;
        colors.push({
          format: 'cmyk',
          values: [parseFloat(c) * 100, parseFloat(m) * 100, parseFloat(y) * 100, parseFloat(k) * 100],
          originalString: fullMatch
        });
      }

      // Look for RGB color definitions
      const rgbPattern = /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+rg/gi;
      let rgbMatch;
      while ((rgbMatch = rgbPattern.exec(content)) !== null) {
        const [fullMatch, r, g, b] = rgbMatch;
        colors.push({
          format: 'rgb',
          values: [Math.round(parseFloat(r) * 255), Math.round(parseFloat(g) * 255), Math.round(parseFloat(b) * 255)],
          originalString: fullMatch
        });
      }

      const colorSpace = colors.some(c => c.format === 'cmyk') ? 'CMYK' : 'RGB';

      return {
        colors,
        colorSpace: colorSpace as any,
        hasEmbeddedProfile: colorSpace === 'CMYK',
        preserveOriginal: true
      };
    } catch (error) {
      console.error('AI/EPS extraction failed:', error);
      return this.createFallbackResult();
    }
  }

  /**
   * Parse RGB values from various formats
   */
  private static parseRGBValues(rgbString: string): number[] | null {
    // Handle percentage format: "92.939758%, 10.978699%, 14.118958%"
    if (rgbString.includes('%')) {
      const percentages = rgbString.split(',').map(s => parseFloat(s.trim().replace('%', '')));
      if (percentages.length === 3) {
        return [
          Math.round(percentages[0] * 2.55), // Convert % to 0-255
          Math.round(percentages[1] * 2.55),
          Math.round(percentages[2] * 2.55)
        ];
      }
    }
    
    // Handle 0-255 format: "237, 28, 36"
    const values = rgbString.split(',').map(s => parseInt(s.trim()));
    if (values.length === 3 && values.every(v => v >= 0 && v <= 255)) {
      return values;
    }
    
    return null;
  }

  /**
   * Convert hex to RGB
   */
  private static hexToRgb(hex: string): { r: number, g: number, b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * Find the CSS selector for an element containing a color
   */
  private static findElementSelector(svgContent: string, colorIndex: number): string {
    const beforeColor = svgContent.substring(0, colorIndex);
    const lastElementMatch = beforeColor.match(/<(path|rect|circle|ellipse|polygon|text)[^>]*$/);
    if (lastElementMatch) {
      const elementType = lastElementMatch[1];
      const elementCount = (beforeColor.match(new RegExp(`<${elementType}`, 'g')) || []).length;
      return `${elementType}:nth-of-type(${elementCount})`;
    }
    return 'unknown';
  }

  /**
   * Create fallback result when extraction fails
   */
  private static createFallbackResult(): ExtractedColors {
    return {
      colors: [],
      colorSpace: 'RGB',
      hasEmbeddedProfile: false,
      preserveOriginal: false
    };
  }

  /**
   * Format color for display in UI
   */
  static formatColorForDisplay(color: ColorValue): string {
    switch (color.format) {
      case 'cmyk':
        return `C:${Math.round(color.values[0])} M:${Math.round(color.values[1])} Y:${Math.round(color.values[2])} K:${Math.round(color.values[3])}`;
      case 'rgb':
        return `R:${color.values[0]} G:${color.values[1]} B:${color.values[2]}`;
      case 'hex':
        return `#${color.values.map(v => v.toString(16).padStart(2, '0')).join('')}`;
      default:
        return 'Unknown';
    }
  }
}