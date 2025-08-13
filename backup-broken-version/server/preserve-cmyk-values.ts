import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PDFDocument, PDFName, rgb, cmyk } from 'pdf-lib';

const execAsync = promisify(exec);

interface ColorMapping {
  originalColor: string;
  cmykColor: string;
  cmykValues: { c: number; m: number; y: number; k: number };
}

/**
 * Parse CMYK string like "C:47 M:2 Y:100 K:0" into numeric values
 */
function parseCMYKString(cmykString: string): { c: number; m: number; y: number; k: number } | null {
  const match = cmykString.match(/C:(\d+)\s+M:(\d+)\s+Y:(\d+)\s+K:(\d+)/);
  if (!match) return null;
  
  const [, c, m, y, k] = match;
  return {
    c: parseInt(c, 10),
    m: parseInt(m, 10),
    y: parseInt(y, 10),
    k: parseInt(k, 10)
  };
}

/**
 * Convert SVG with CMYK color preservation directly to CMYK PDF
 */
export async function convertSVGtoCMYKPDF(
  svgPath: string,
  outputPath: string,
  colorMappings: ColorMapping[]
): Promise<boolean> {
  try {
    // First, create a PostScript color mapping file
    const psColorMapPath = path.join(path.dirname(svgPath), 'cmyk_color_map.ps');
    let psContent = `%!PS-Adobe-3.0
%%Title: CMYK Color Mapping
%%EndComments

% Override setrgbcolor to use exact CMYK values
/original-setrgbcolor /setrgbcolor load def

/setrgbcolor {
  3 copy % Duplicate R G B values
  255 mul round cvi /b exch def
  255 mul round cvi /g exch def  
  255 mul round cvi /r exch def
  
  % Check against our color mappings
  false % Flag for whether we found a match
`;

    // Add color mappings
    for (const mapping of colorMappings) {
      // Parse RGB from original color
      const rgbMatch = mapping.originalColor.match(/rgb\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/);
      if (rgbMatch && mapping.cmykValues) {
        const [, rStr, gStr, bStr] = rgbMatch;
        const r = Math.round(parseFloat(rStr));
        const g = Math.round(parseFloat(gStr));
        const b = Math.round(parseFloat(bStr));
        
        psContent += `
  % Check for RGB(${r}, ${g}, ${b}) -> CMYK(${mapping.cmykValues.c}, ${mapping.cmykValues.m}, ${mapping.cmykValues.y}, ${mapping.cmykValues.k})
  dup not {
    r ${r} eq g ${g} eq and b ${b} eq and {
      pop pop pop % Remove RGB values
      ${mapping.cmykValues.c / 100.0} ${mapping.cmykValues.m / 100.0} ${mapping.cmykValues.y / 100.0} ${mapping.cmykValues.k / 100.0} setcmykcolor
      true % Set flag
    } if
  } if
`;
      }
    }

    psContent += `
  % If no match found, use original setrgbcolor
  not {
    original-setrgbcolor
  } {
    pop % Remove flag
  } ifelse
} def

% Also override setcolor for other color specifications
/original-setcolor /setcolor load def
/setcolor {
  dup type /arraytype eq {
    dup length 3 eq {
      % RGB array
      aload pop setrgbcolor
    } {
      original-setcolor
    } ifelse
  } {
    original-setcolor
  } ifelse
} def
`;

    fs.writeFileSync(psColorMapPath, psContent);

    // Convert SVG to PDF with CMYK colorspace using the color mapping
    const tempPdfPath = outputPath.replace('.pdf', '_temp.pdf');
    
    // First convert SVG to PDF
    await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${svgPath}"`);
    
    // Then apply CMYK conversion with our custom color mapping
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
      psColorMapPath,
      tempPdfPath
    ].join(' ');
    
    await execAsync(gsCommand);
    
    // Clean up temp files
    if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
    if (fs.existsSync(psColorMapPath)) fs.unlinkSync(psColorMapPath);
    
    return fs.existsSync(outputPath);
    
  } catch (error) {
    console.error('Error in CMYK conversion:', error);
    return false;
  }
}

/**
 * Prepare SVG content with exact color values for CMYK preservation
 */
export function prepareSVGForCMYKConversion(
  svgContent: string,
  colorAnalysis: any[]
): { content: string; mappings: ColorMapping[] } {
  let modifiedContent = svgContent;
  const mappings: ColorMapping[] = [];
  
  // Process each color that has CMYK values
  for (const color of colorAnalysis) {
    if (color.converted && color.cmykColor) {
      const cmykValues = parseCMYKString(color.cmykColor);
      if (cmykValues) {
        mappings.push({
          originalColor: color.originalFormat || color.originalColor,
          cmykColor: color.cmykColor,
          cmykValues
        });
      }
    }
  }
  
  return { content: modifiedContent, mappings };
}