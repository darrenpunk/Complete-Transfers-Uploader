import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Creates a custom Ghostscript color conversion PostScript that uses our Adobe CMYK values
 */
export async function createAdobeCMYKConversionScript(
  colorMappings: Array<{ rgb: string; cmyk: { c: number; m: number; y: number; k: number } }>
): Promise<string> {
  // Create a PostScript color redefinition that maps RGB to our specific CMYK values
  let psScript = `%!PS-Adobe-3.0
%%Title: Adobe CMYK Color Conversion
%%Creator: CompleteTransfers Color Management System
%%EndComments

% Define custom RGB to CMYK conversion using Adobe profile values
/setrgbcolor {
  % Get RGB values from stack
  3 copy % Duplicate R G B values
  
  % Convert to 0-255 range for comparison
  255 mul round cvi /b exch def
  255 mul round cvi /g exch def  
  255 mul round cvi /r exch def
  
  % Check each color mapping
`;

  // Add each color mapping
  for (const mapping of colorMappings) {
    // Parse RGB values
    const rgbMatch = mapping.rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      
      psScript += `
  % Check for RGB(${r}, ${g}, ${b})
  r ${r} eq g ${g} eq and b ${b} eq and {
    % Pop original RGB values
    pop pop pop
    % Push Adobe CMYK values
    ${mapping.cmyk.c / 100} ${mapping.cmyk.m / 100} ${mapping.cmyk.y / 100} ${mapping.cmyk.k / 100}
    setcmykcolor
  } {
`;
    }
  }
  
  // Close all the if statements and add default behavior
  psScript += `
    % Default: use standard conversion
    % Pop the copies we made
    pop pop pop
    % Use original setrgbcolor
    systemdict /setrgbcolor get exec
`;
  
  // Close all the else blocks
  for (let i = 0; i < colorMappings.length; i++) {
    psScript += `  } ifelse\n`;
  }
  
  psScript += `} def\n`;
  
  return psScript;
}

/**
 * Applies Adobe CMYK conversion to a PDF using custom PostScript
 */
export async function applyAdobeCMYKConversion(
  inputPdfPath: string,
  outputPdfPath: string,
  colorMappings: Array<{ rgb: string; cmyk: { c: number; m: number; y: number; k: number } }>
): Promise<void> {
  try {
    // Create custom conversion script
    const conversionScript = await createAdobeCMYKConversionScript(colorMappings);
    
    // Save script to temp file
    const scriptPath = inputPdfPath.replace('.pdf', '_adobe_cmyk.ps');
    fs.writeFileSync(scriptPath, conversionScript);
    
    // Apply conversion using Ghostscript with our custom script
    const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -sOutputFile="${outputPdfPath}" "${scriptPath}" "${inputPdfPath}"`;
    
    console.log('Direct CMYK: Applying Adobe CMYK conversion with custom PostScript');
    await execAsync(gsCommand);
    
    // Clean up temp file
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
    
    console.log('Direct CMYK: Successfully applied Adobe CMYK values to PDF');
  } catch (error) {
    console.error('Direct CMYK: Failed to apply Adobe conversion:', error);
    throw error;
  }
}