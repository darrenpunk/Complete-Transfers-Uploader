import fs from 'fs';
import path from 'path';
import { PDFCMYKExtractor } from './pdf-cmyk-extractor';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ColorValue {
  format: string;
  values: number[];
  originalString: string;
  elementSelector?: string;
}

export interface ExtractedColors {
  colors: ColorValue[];
  colorSpace: 'CMYK' | 'RGB' | 'sRGB' | 'MIXED';
  hasEmbeddedProfile: boolean;
  preserveOriginal: boolean;
}

export class UniversalColorExtractor {
  
  static async extractColors(filePath: string, mimeType: string): Promise<ExtractedColors> {
    console.log(`🎨 Color extraction: ${path.basename(filePath)} (${mimeType})`);
    
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
          return this.createFallbackResult();
      }
    } catch (error) {
      console.error('❌ Color extraction failed:', error);
      return this.createFallbackResult();
    }
  }

  private static async extractFromSVG(filePath: string): Promise<ExtractedColors> {
    const svgContent = fs.readFileSync(filePath, 'utf8');
    const colors: ColorValue[] = [];
    let hasCMYK = false;
    let hasRGB = false;

    const cmykPattern = /device-cmyk\s*\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*\)/gi;
    let cmykMatch;
    while ((cmykMatch = cmykPattern.exec(svgContent)) !== null) {
      const [fullMatch, c, m, y, k] = cmykMatch;
      colors.push({
        format: 'cmyk',
        values: [parseFloat(c) * 100, parseFloat(m) * 100, parseFloat(y) * 100, parseFloat(k) * 100],
        originalString: fullMatch
      });
      hasCMYK = true;
    }

    const hasCMYKMarkers = svgContent.includes('data-vectorized-cmyk="true"') || 
                          svgContent.includes('data-original-cmyk-pdf="true"') ||
                          svgContent.includes('CMYK');

    if (hasCMYKMarkers) {
      hasCMYK = true;
      
      const uniqueRGBColors = new Map<string, {count: number, color: ColorValue}>();
      const rgbPattern = /fill="rgb\(([\d.]+)%?,?\s*([\d.]+)%?,?\s*([\d.]+)%?\)"/gi;
      let rgbMatch;
      
      while ((rgbMatch = rgbPattern.exec(svgContent)) !== null) {
        const [fullMatch, r, g, b] = rgbMatch;
        const rPercent = parseFloat(r);
        const gPercent = parseFloat(g);
        const bPercent = parseFloat(b);
        
        const roundedKey = `${rPercent.toFixed(2)},${gPercent.toFixed(2)},${bPercent.toFixed(2)}`;
        
        const values = this.parseRGBValues(`${r}%, ${g}%, ${b}%`);
        if (values) {
          if (uniqueRGBColors.has(roundedKey)) {
            uniqueRGBColors.get(roundedKey)!.count++;
          } else {
            const cmykValues = this.rgbToCMYKApprox(values[0], values[1], values[2]);
            
            uniqueRGBColors.set(roundedKey, {
              count: 1,
              color: {
                format: 'cmyk',
                values: cmykValues,
                originalString: fullMatch
              }
            });
          }
        }
      }
      
      const significantColors = Array.from(uniqueRGBColors.entries())
        .filter(([key, data]) => data.count >= 2)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8)
        .map(([key, data]) => data.color);
      
      colors.push(...significantColors);
      
      console.log(`🎯 CMYK file: ${uniqueRGBColors.size} unique RGB colors, kept ${significantColors.length} significant`);
      
      return {
        colors,
        colorSpace: 'CMYK',
        hasEmbeddedProfile: true,
        preserveOriginal: true
      };
    }

    const rgbPatterns = [
      /fill="rgb\(([^)]+)\)"/gi,
      /stroke="rgb\(([^)]+)\)"/gi,
      /fill\s*:\s*rgb\(([^)]+)\)/gi,
      /stroke\s*:\s*rgb\(([^)]+)\)/gi,
    ];

    const seenRGB = new Set<string>();
    for (const pattern of rgbPatterns) {
      let rgbMatch;
      while ((rgbMatch = pattern.exec(svgContent)) !== null) {
        const [fullMatch, rgbValues] = rgbMatch;
        const values = this.parseRGBValues(rgbValues);
        if (values) {
          const key = values.join(',');
          if (!seenRGB.has(key)) {
            seenRGB.add(key);
            colors.push({
              format: 'rgb',
              values: values,
              originalString: fullMatch
            });
            hasRGB = true;
          }
        }
      }
    }

    const hexPattern = /(?:fill|stroke)="(#[0-9a-fA-F]{6})"/gi;
    const seenHex = new Set<string>();
    let hexMatch;
    while ((hexMatch = hexPattern.exec(svgContent)) !== null) {
      const [fullMatch, hexValue] = hexMatch;
      if (!seenHex.has(hexValue)) {
        seenHex.add(hexValue);
        const rgbValues = this.hexToRgb(hexValue);
        if (rgbValues) {
          colors.push({
            format: 'hex',
            values: [rgbValues.r, rgbValues.g, rgbValues.b],
            originalString: fullMatch
          });
          hasRGB = true;
        }
      }
    }

    let colorSpace: 'CMYK' | 'RGB' | 'sRGB' | 'MIXED' = 'RGB';
    if (hasCMYK && hasRGB) {
      colorSpace = 'MIXED';
    } else if (hasCMYK) {
      colorSpace = 'CMYK';
    }

    console.log(`🎯 SVG Color Analysis: ${colors.length} unique colors, colorSpace: ${colorSpace}`);

    return {
      colors,
      colorSpace,
      hasEmbeddedProfile: hasCMYK,
      preserveOriginal: true
    };
  }

  private static async extractFromPDF(filePath: string): Promise<ExtractedColors> {
    try {
      const pdfCMYKColors = await PDFCMYKExtractor.extractCMYKFromPDF(filePath);
      
      if (pdfCMYKColors.length > 0) {
        console.log(`✅ Found ${pdfCMYKColors.length} CMYK colors in PDF`);
        
        const colors: ColorValue[] = pdfCMYKColors.map((color, index) => ({
          format: 'cmyk',
          values: [color.c, color.m, color.y, color.k],
          originalString: `CMYK(${color.c.toFixed(0)}, ${color.m.toFixed(0)}, ${color.y.toFixed(0)}, ${color.k.toFixed(0)})`,
          elementSelector: `pdf-color-${index}`
        }));
        
        return {
          colors,
          colorSpace: 'CMYK',
          hasEmbeddedProfile: true,
          preserveOriginal: true
        };
      }
      
      console.log('⚠️ No direct CMYK found, falling back to SVG analysis');
      return await this.extractFromPDFViaSVG(filePath);
      
    } catch (error) {
      console.log('❌ PDF CMYK extraction failed:', error);
      return this.createFallbackResult();
    }
  }

  private static async extractFromPDFViaSVG(filePath: string): Promise<ExtractedColors> {
    const svgPath = filePath.replace('.pdf', '.svg');
    
    try {
      await execAsync(`gs -dNODISPLAY -dBATCH -dNOPAUSE -sDEVICE=svg -sOutputFile="${svgPath}" "${filePath}"`);
      
      if (fs.existsSync(svgPath)) {
        const result = await this.extractFromSVG(svgPath);
        fs.unlinkSync(svgPath);
        return result;
      }
    } catch (error) {
      console.log('⚠️ PDF-to-SVG conversion failed:', error);
    }
    
    return this.createFallbackResult();
  }

  private static async extractFromAI(filePath: string): Promise<ExtractedColors> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const colors: ColorValue[] = [];
      
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

  private static parseRGBValues(rgbString: string): number[] | null {
    if (rgbString.includes('%')) {
      const percentages = rgbString.split(',').map(s => parseFloat(s.trim().replace('%', '')));
      if (percentages.length === 3) {
        return [
          Math.round(percentages[0] * 2.55),
          Math.round(percentages[1] * 2.55),
          Math.round(percentages[2] * 2.55)
        ];
      }
    }
    
    const values = rgbString.split(',').map(s => parseInt(s.trim()));
    if (values.length === 3 && values.every(v => v >= 0 && v <= 255)) {
      return values;
    }
    
    return null;
  }

  private static hexToRgb(hex: string): { r: number, g: number, b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private static rgbToCMYKApprox(r: number, g: number, b: number): number[] {
    const rNorm = r / 255;
    const gNorm = g / 255; 
    const bNorm = b / 255;
    
    const k = 1 - Math.max(rNorm, Math.max(gNorm, bNorm));
    
    if (k === 1) {
      return [0, 0, 0, 100];
    }
    
    const c = (1 - rNorm - k) / (1 - k);
    const m = (1 - gNorm - k) / (1 - k);
    const y = (1 - bNorm - k) / (1 - k);
    
    return [
      Math.round(c * 100),
      Math.round(m * 100), 
      Math.round(y * 100),
      Math.round(k * 100)
    ];
  }

  private static createFallbackResult(): ExtractedColors {
    return {
      colors: [],
      colorSpace: 'RGB',
      hasEmbeddedProfile: false,
      preserveOriginal: false
    };
  }

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
