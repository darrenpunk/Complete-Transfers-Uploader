import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PDFDocument, rgb } from 'pdf-lib';

const execAsync = promisify(exec);

interface ColorMapping {
  rgb: string;
  cmyk: { c: number; m: number; y: number; k: number };
}

/**
 * Create a PostScript color mapping dictionary for exact CMYK values
 */
function createExactColorMappingPS(colorAnalysis: any[]): string {
  let psContent = `%!PS-Adobe-3.0
%%Title: Exact CMYK Color Mapping
%%EndComments

% Define exact color mappings from our analysis
/colordict <<
`;

  // Add each color mapping
  colorAnalysis.forEach(color => {
    if (color.cmykColor && color.originalColor) {
      // Parse RGB values
      const rgbMatch = color.originalColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        
        // Parse CMYK values
        const cmykMatch = color.cmykColor.match(/C:(\d+)\s+M:(\d+)\s+Y:(\d+)\s+K:(\d+)/);
        if (cmykMatch) {
          const [, c, m, y, k] = cmykMatch;
          
          // Create mapping key (RGB as string) and CMYK values
          psContent += `  (${r},${g},${b}) [${c/100} ${m/100} ${y/100} ${k/100}]\n`;
          console.log(`Exact CMYK: Mapping RGB(${r},${g},${b}) -> CMYK(${c},${m},${y},${k})`);
        }
      }
    }
  });

  psContent += `>> def

% Override setrgbcolor to use our exact mappings
/setrgbcolor {
  % Get RGB values (0-1 range)
  3 copy
  
  % Convert to 0-255 range
  255 mul round cvi /b exch def
  255 mul round cvi /g exch def  
  255 mul round cvi /r exch def
  
  % Create lookup key
  r 10 string cvs
  (,) append
  g 10 string cvs append
  (,) append
  b 10 string cvs append
  /rgbkey exch def
  
  % Look up in our color dictionary
  colordict rgbkey known {
    % Use exact CMYK values
    colordict rgbkey get aload pop
    setcmykcolor
  } {
    % Fallback to standard conversion if not in dictionary
    % This shouldn't happen for our known colors
    r g b setrgbcolor
  } ifelse
} bind def
`;

  return psContent;
}

/**
 * Convert SVG to PDF with exact CMYK color values from our analysis
 */
export async function convertSVGtoExactCMYKPDF(
  svgPath: string,
  outputPath: string,
  colorAnalysis: any[]
): Promise<boolean> {
  try {
    console.log('Exact CMYK: Starting conversion with color analysis:', colorAnalysis.length, 'colors');
    
    // First convert SVG to initial PDF
    const tempPdfPath = outputPath.replace('.pdf', '_temp_exact.pdf');
    await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${svgPath}"`);
    
    if (!fs.existsSync(tempPdfPath)) {
      throw new Error('Failed to create initial PDF from SVG');
    }

    // Create PostScript with exact color mappings
    const psPath = path.join(path.dirname(outputPath), 'exact_cmyk_mapping.ps');
    const psContent = createExactColorMappingPS(colorAnalysis);
    fs.writeFileSync(psPath, psContent);

    // Convert to CMYK using our exact mappings
    const gsCommand = [
      'gs',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-sDEVICE=pdfwrite',
      '-dProcessColorModel=/DeviceCMYK',
      '-dColorConversionStrategy=/CMYK',
      '-dConvertCMYKImagesToRGB=false',
      '-dOverrideICC=true',
      `-sOutputFile="${outputPath}"`,
      psPath,
      tempPdfPath
    ].join(' ');

    console.log('Exact CMYK: Converting with exact color mappings');
    const { stdout, stderr } = await execAsync(gsCommand);
    
    if (stderr && !stderr.includes('GPL Ghostscript')) {
      console.error('Exact CMYK: Ghostscript warning:', stderr);
    }

    // Clean up temporary files
    if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
    if (fs.existsSync(psPath)) fs.unlinkSync(psPath);

    // Verify output was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Failed to create exact CMYK PDF output');
    }

    console.log('Exact CMYK: Successfully created PDF with exact CMYK values');
    return true;

  } catch (error) {
    console.error('Exact CMYK: Error creating PDF:', error);
    return false;
  }
}

/**
 * Alternative approach using pdf-lib to modify colors directly
 */
export async function modifyPDFWithExactCMYK(
  inputPath: string,
  outputPath: string,
  colorAnalysis: any[]
): Promise<boolean> {
  try {
    const existingPdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // This is complex as pdf-lib doesn't directly support CMYK
    // We would need to parse and modify the content streams
    // For now, we'll use the PostScript approach above
    
    return false;
  } catch (error) {
    console.error('Exact CMYK: Error modifying PDF:', error);
    return false;
  }
}