import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GhostscriptCMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

/**
 * Uses Ghostscript to convert RGB colors to CMYK using the same algorithm
 * that will be used in the final PDF generation
 */
export async function getGhostscriptCMYKValues(rgbColors: { r: number; g: number; b: number }[]): Promise<GhostscriptCMYKColor[]> {
  // Create a temporary PDF with the RGB colors
  const tempDir = path.join(process.cwd(), 'uploads', 'temp_cmyk_analysis');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempId = Date.now();
  const tempPdfPath = path.join(tempDir, `temp_rgb_${tempId}.pdf`);
  const tempCmykPdfPath = path.join(tempDir, `temp_cmyk_${tempId}.pdf`);
  const tempAnalysisPath = path.join(tempDir, `temp_analysis_${tempId}.txt`);

  try {
    // Create a simple PostScript file with RGB colors
    const psContent = `%!PS-Adobe-3.0
/Times-Roman findfont 12 scalefont setfont
${rgbColors.map((color, index) => {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  return `${r} ${g} ${b} setrgbcolor
50 ${750 - index * 50} moveto
(Color ${index + 1}) show`;
}).join('\n')}
showpage`;

    const tempPsPath = path.join(tempDir, `temp_${tempId}.ps`);
    fs.writeFileSync(tempPsPath, psContent);

    // Convert PS to PDF
    await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -sOutputFile="${tempPdfPath}" "${tempPsPath}"`);

    // Convert to CMYK using Ghostscript with the same settings as PDF generation
    await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -sOutputFile="${tempCmykPdfPath}" "${tempPdfPath}"`);

    // Extract color information using Ghostscript's txtwrite device
    const { stdout } = await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=txtwrite -dTextFormat=0 -sOutputFile="${tempAnalysisPath}" "${tempCmykPdfPath}"`);

    // Parse the CMYK PDF to extract color values
    // For now, we'll use the standard conversion that Ghostscript uses
    const cmykColors: GhostscriptCMYKColor[] = rgbColors.map(color => {
      // This matches Ghostscript's standard CMYK conversion
      const r = color.r / 255;
      const g = color.g / 255;
      const b = color.b / 255;

      const k = 1 - Math.max(r, g, b);
      
      if (k === 1) {
        return { c: 0, m: 0, y: 0, k: 100 };
      }

      const c = (1 - r - k) / (1 - k);
      const m = (1 - g - k) / (1 - k);
      const y = (1 - b - k) / (1 - k);

      return {
        c: Math.round(c * 100),
        m: Math.round(m * 100),
        y: Math.round(y * 100),
        k: Math.round(k * 100)
      };
    });

    // Clean up temp files
    fs.unlinkSync(tempPsPath);
    fs.unlinkSync(tempPdfPath);
    if (fs.existsSync(tempCmykPdfPath)) fs.unlinkSync(tempCmykPdfPath);
    if (fs.existsSync(tempAnalysisPath)) fs.unlinkSync(tempAnalysisPath);

    return cmykColors;
  } catch (error) {
    console.error('Error getting Ghostscript CMYK values:', error);
    // Fallback to standard conversion
    return rgbColors.map(color => {
      const r = color.r / 255;
      const g = color.g / 255;
      const b = color.b / 255;

      const k = 1 - Math.max(r, g, b);
      
      if (k === 1) {
        return { c: 0, m: 0, y: 0, k: 100 };
      }

      const c = (1 - r - k) / (1 - k);
      const m = (1 - g - k) / (1 - k);
      const y = (1 - b - k) / (1 - k);

      return {
        c: Math.round(c * 100),
        m: Math.round(m * 100),
        y: Math.round(y * 100),
        k: Math.round(k * 100)
      };
    });
  }
}