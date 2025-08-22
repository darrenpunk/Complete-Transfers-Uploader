import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ColorData {
  type: 'CMYK' | 'RGB' | 'PANTONE';
  values: number[];
  name?: string;
}

interface ExtractedColors {
  colors: ColorData[];
  colorSpace: string;
}

export class ColorExtractionProcessor {
  /**
   * Extract color information from original PDF using Ghostscript
   */
  static async extractColorsFromPDF(pdfPath: string): Promise<ExtractedColors> {
    console.log(`🎨 EXTRACTING COLORS: Analyzing original PDF for color data: ${pdfPath}`);
    
    try {
      // Extract color information using Ghostscript
      const { stdout } = await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=txtwrite -sOutputFile=- "${pdfPath}" | head -50`);
      
      // Also extract colorspace info
      const colorSpaceCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=inkcov "${pdfPath}" 2>&1`;
      const { stdout: colorSpaceInfo } = await execAsync(colorSpaceCmd);
      
      console.log(`🔍 COLOR ANALYSIS: PDF colorspace info extracted`);
      
      // Parse color information (simplified approach for now)
      const colors: ColorData[] = [];
      
      // Check if CMYK content exists
      if (colorSpaceInfo.includes('CMYK') || colorSpaceInfo.includes('%')) {
        // Extract CMYK values from ink coverage
        const cmykMatches = colorSpaceInfo.match(/(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+CMYK/);
        if (cmykMatches) {
          colors.push({
            type: 'CMYK',
            values: [
              parseFloat(cmykMatches[1]),
              parseFloat(cmykMatches[2]), 
              parseFloat(cmykMatches[3]),
              parseFloat(cmykMatches[4])
            ]
          });
        }
      }
      
      return {
        colors,
        colorSpace: colorSpaceInfo.includes('CMYK') ? 'CMYK' : 'RGB'
      };
      
    } catch (error) {
      console.error(`❌ COLOR EXTRACTION: Failed to extract colors from PDF:`, error);
      return {
        colors: [],
        colorSpace: 'RGB'
      };
    }
  }

  /**
   * Apply extracted colors to tight content SVG
   */
  static async applyColorsToSVG(svgPath: string, extractedColors: ExtractedColors): Promise<string> {
    console.log(`🎨 APPLYING COLORS: Transferring colors from PDF to tight content SVG`);
    
    try {
      let svgContent = fs.readFileSync(svgPath, 'utf8');
      
      // If we have CMYK colors, convert them to CSS format and apply
      if (extractedColors.colors.length > 0 && extractedColors.colorSpace === 'CMYK') {
        for (const color of extractedColors.colors) {
          if (color.type === 'CMYK') {
            // Convert CMYK to RGB for SVG (simplified conversion)
            const [c, m, y, k] = color.values;
            const r = Math.round(255 * (1 - c/100) * (1 - k/100));
            const g = Math.round(255 * (1 - m/100) * (1 - k/100));
            const b = Math.round(255 * (1 - y/100) * (1 - k/100));
            
            const rgbColor = `rgb(${r}, ${g}, ${b})`;
            
            // Replace existing colors with extracted colors
            // This is a simplified approach - you may need more sophisticated color matching
            svgContent = svgContent.replace(/fill="[^"]*"/g, `fill="${rgbColor}"`);
            svgContent = svgContent.replace(/stroke="[^"]*"/g, `stroke="${rgbColor}"`);
            
            console.log(`✅ COLOR APPLIED: CMYK(${c}, ${m}, ${y}, ${k}) -> ${rgbColor}`);
          }
        }
      }
      
      // Add CMYK metadata to SVG for PDF conversion
      if (extractedColors.colorSpace === 'CMYK') {
        svgContent = svgContent.replace(
          '<svg',
          '<svg data-colorspace="CMYK" data-preserve-colors="true"'
        );
      }
      
      return svgContent;
      
    } catch (error) {
      console.error(`❌ COLOR APPLICATION: Failed to apply colors to SVG:`, error);
      return fs.readFileSync(svgPath, 'utf8');
    }
  }

  /**
   * Robust color transfer: Extract from PDF and apply to tight content SVG
   */
  static async transferColorsFromPDFToSVG(originalPdfPath: string, tightContentSvgPath: string): Promise<string> {
    console.log(`🎯 ROBUST COLOR TRANSFER: Preserving colors from PDF while maintaining SVG dimensions`);
    
    try {
      // Step 1: Extract colors from original PDF
      const extractedColors = await this.extractColorsFromPDF(originalPdfPath);
      console.log(`📊 EXTRACTED: ${extractedColors.colors.length} colors from original PDF (${extractedColors.colorSpace})`);
      
      // Step 2: Apply colors to tight content SVG
      const recoloredSvgContent = await this.applyColorsToSVG(tightContentSvgPath, extractedColors);
      
      // Step 3: Save the recolored SVG
      const outputPath = tightContentSvgPath.replace('.svg', '_color-preserved.svg');
      fs.writeFileSync(outputPath, recoloredSvgContent);
      
      console.log(`✅ COLOR TRANSFER COMPLETE: Saved color-preserved SVG to ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      console.error(`❌ ROBUST COLOR TRANSFER: Failed:`, error);
      return tightContentSvgPath; // Fallback to original
    }
  }
}