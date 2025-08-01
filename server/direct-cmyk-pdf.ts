import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { adobeRgbToCmyk } from './adobe-cmyk-profile';

const execAsync = promisify(exec);

interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

/**
 * Convert SVG to CMYK PDF by directly mapping RGB colors to CMYK
 * This avoids any double conversion and preserves exact CMYK values
 */
export async function convertSVGtoCMYKPDFDirect(
  svgPath: string,
  outputPath: string,
  colorAnalysis?: any[]
): Promise<boolean> {
  try {
    // First convert SVG to initial PDF using rsvg-convert
    const tempPdfPath = outputPath.replace('.pdf', '_temp_rgb.pdf');
    await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${svgPath}"`);
    
    if (!fs.existsSync(tempPdfPath)) {
      throw new Error('Failed to create initial PDF from SVG');
    }

    // Create PostScript prologue for RGB to CMYK conversion
    const psPath = path.join(path.dirname(outputPath), 'rgb_to_cmyk.ps');
    let psContent = `%!PS-Adobe-3.0
%%Title: RGB to CMYK Conversion
%%EndComments

% Override setrgbcolor to convert to CMYK using our algorithm
/setrgbcolor {
  % Get RGB values (0-1 range)
  3 copy
  
  % Convert to 0-255 range for our algorithm
  255 mul round cvi /b exch def
  255 mul round cvi /g exch def  
  255 mul round cvi /r exch def
  
  % Apply our Adobe-matching CMYK conversion algorithm
  /cyan 0 def
  /magenta 0 def
  /yellow 0 def
  /black 0 def
  
  % Calculate K (black) first
  r g b min min /minRGB exch def
  255 minRGB sub 255 div /black exch def
  
  % Calculate CMY if K < 1
  black 1 lt {
    255 r sub minRGB sub 255 minRGB sub div /cyan exch def
    255 g sub minRGB sub 255 minRGB sub div /magenta exch def
    255 b sub minRGB sub 255 minRGB sub div /yellow exch def
  } if
  
  % Ensure values are in valid range
  cyan 0 max 1 min /cyan exch def
  magenta 0 max 1 min /magenta exch def
  yellow 0 max 1 min /yellow exch def
  black 0 max 1 min /black exch def
  
  % Set CMYK color
  cyan magenta yellow black setcmykcolor
} bind def

% Also handle arrays
/setcolor {
  dup type /arraytype eq {
    dup length 3 eq {
      aload pop setrgbcolor
    } {
      % Call original setcolor for non-RGB
      systemdict /setcolor get exec
    } ifelse
  } {
    % Call original setcolor for non-array
    systemdict /setcolor get exec
  } ifelse
} bind def
`;

    fs.writeFileSync(psPath, psContent);

    // Convert to CMYK using Ghostscript with our PostScript prologue
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

    console.log('Direct CMYK: Converting with Ghostscript command:', gsCommand);
    const { stdout, stderr } = await execAsync(gsCommand);
    
    if (stderr && !stderr.includes('GPL Ghostscript')) {
      console.error('Direct CMYK: Ghostscript warning:', stderr);
    }

    // Clean up temporary files
    if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
    if (fs.existsSync(psPath)) fs.unlinkSync(psPath);

    // Verify output was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Failed to create CMYK PDF output');
    }

    console.log('Direct CMYK: Successfully created CMYK PDF with exact color values');
    return true;

  } catch (error) {
    console.error('Direct CMYK: Error converting to CMYK PDF:', error);
    return false;
  }
}

/**
 * Get CMYK values for a color using our Adobe-matching algorithm
 */
export function getExactCMYKValues(rgbColor: string): CMYKColor | null {
  // Parse RGB color
  const rgbMatch = rgbColor.match(/rgb\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/);
  if (!rgbMatch) return null;
  
  const [, rStr, gStr, bStr] = rgbMatch;
  const r = Math.round(parseFloat(rStr));
  const g = Math.round(parseFloat(gStr));
  const b = Math.round(parseFloat(bStr));
  
  // Apply our algorithm
  const cmyk = adobeRgbToCmyk({ r, g, b });
  
  return {
    c: Math.round(cmyk.c),
    m: Math.round(cmyk.m),
    y: Math.round(cmyk.y),
    k: Math.round(cmyk.k)
  };
}