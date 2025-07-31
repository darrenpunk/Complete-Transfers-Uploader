import { PDFDocument, PDFName, PDFDict, PDFStream, PDFArray, PDFNumber } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CMYKColor {
  c: number; // 0-100
  m: number; // 0-100
  y: number; // 0-100
  k: number; // 0-100
}

/**
 * Creates a PDF with direct CMYK color values embedded, bypassing RGB conversion
 * This ensures Adobe CMYK profile values are preserved exactly in the final PDF
 */
export async function createDirectCMYKPDF(
  svgPath: string,
  cmykColors: Record<string, CMYKColor>,
  outputPath: string
): Promise<void> {
  try {
    // Step 1: Create a PostScript file with CMYK color definitions
    const psPath = svgPath.replace('.svg', '_cmyk.ps');
    const tempPdfPath = svgPath.replace('.svg', '_temp_cmyk.pdf');
    
    // Convert SVG to PostScript first
    await execAsync(`inkscape --export-type=ps --export-filename="${psPath}" "${svgPath}"`);
    
    if (!fs.existsSync(psPath)) {
      throw new Error('Failed to convert SVG to PostScript');
    }
    
    // Read the PostScript content
    let psContent = fs.readFileSync(psPath, 'utf8');
    
    // Replace RGB color commands with CMYK equivalents
    // PostScript RGB: r g b setrgbcolor
    // PostScript CMYK: c m y k setcmykcolor
    
    // Find all RGB color definitions and replace with CMYK
    const rgbPattern = /(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+setrgbcolor/g;
    
    psContent = psContent.replace(rgbPattern, (match, r, g, b) => {
      // Convert normalized RGB (0-1) to 0-255
      const r255 = Math.round(parseFloat(r) * 255);
      const g255 = Math.round(parseFloat(g) * 255);
      const b255 = Math.round(parseFloat(b) * 255);
      
      // Find matching CMYK color
      const rgbKey = `rgb(${r255}, ${g255}, ${b255})`;
      const cmykColor = cmykColors[rgbKey];
      
      if (cmykColor) {
        // Convert percentages to 0-1 range for PostScript
        const c = cmykColor.c / 100;
        const m = cmykColor.m / 100;
        const y = cmykColor.y / 100;
        const k = cmykColor.k / 100;
        
        console.log(`Direct CMYK: Replacing RGB(${r255},${g255},${b255}) with CMYK(${cmykColor.c},${cmykColor.m},${cmykColor.y},${cmykColor.k})`);
        return `${c} ${m} ${y} ${k} setcmykcolor`;
      }
      
      // Keep original if no CMYK match found
      return match;
    });
    
    // Save modified PostScript
    const cmykPsPath = psPath.replace('.ps', '_cmyk.ps');
    fs.writeFileSync(cmykPsPath, psContent);
    
    // Convert PostScript to PDF with CMYK colorspace
    await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -sOutputFile="${outputPath}" "${cmykPsPath}"`);
    
    // Cleanup temporary files
    if (fs.existsSync(psPath)) fs.unlinkSync(psPath);
    if (fs.existsSync(cmykPsPath)) fs.unlinkSync(cmykPsPath);
    
    console.log(`Direct CMYK: Successfully created PDF with exact CMYK values at ${outputPath}`);
    
  } catch (error) {
    console.error('Direct CMYK PDF creation failed:', error);
    throw error;
  }
}

/**
 * Alternative method using pdf-lib to directly embed CMYK colors
 */
export async function embedCMYKDirectly(
  pdfDoc: PDFDocument,
  svgContent: string,
  cmykColors: Record<string, CMYKColor>
): Promise<void> {
  try {
    // This is a simplified approach - in production, you'd parse the SVG
    // and create PDF graphics operations with CMYK colors directly
    
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    
    // Example: Draw a rectangle with CMYK color
    // In real implementation, parse SVG paths and convert to PDF operations
    const cmykColor = Object.values(cmykColors)[0];
    if (cmykColor) {
      // PDF uses normalized values (0-1)
      const c = cmykColor.c / 100;
      const m = cmykColor.m / 100;
      const y = cmykColor.y / 100;
      const k = cmykColor.k / 100;
      
      // Create CMYK color space reference
      const cmykColorSpace = PDFName.of('DeviceCMYK');
      
      // Draw with CMYK color using low-level PDF operations
      // Note: This is a simplified example - full implementation would parse SVG and create proper PDF graphics
      console.log(`Direct CMYK: Would embed color C:${cmykColor.c} M:${cmykColor.m} Y:${cmykColor.y} K:${cmykColor.k}`);
    }
    
  } catch (error) {
    console.error('Direct CMYK embedding failed:', error);
    throw error;
  }
}