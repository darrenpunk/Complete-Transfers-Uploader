import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * True CMYK PDF Generator using PostScript and direct CMYK commands
 * This bypasses SVG conversion issues by generating native CMYK PostScript
 */
export class NativeCMYKGenerator {
  
  /**
   * Generate a true CMYK PDF by creating PostScript with native CMYK commands
   */
  static async generateCMYKPDF(
    svgPath: string, 
    svgColors: any, 
    outputPath: string,
    width: number,
    height: number
  ): Promise<void> {
    
    console.log(`🎨 NATIVE CMYK GENERATION: Creating true CMYK PDF`);
    
    // Read the original SVG content
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    
    // Create PostScript header with CMYK color space
    let psContent = `%!PS-Adobe-3.0
%%BoundingBox: 0 0 ${Math.round(width)} ${Math.round(height)}
%%DocumentData: Clean7Bit
%%ColorSpace: CMYK
%%Creator: Native CMYK Generator
%%EndComments

/DeviceCMYK setcolorspace

% Define CMYK color setting procedure
/setcmykcolor {
  4 -1 roll % c m y k -> m y k c
  3 -1 roll % m y k c -> y k c m  
  2 -1 roll % y k c m -> k c m y
  1 -1 roll % k c m y -> c m y k
  setcolor
} def

`;

    // Parse SVG and extract path commands with CMYK colors
    const pathRegex = /<path[^>]*d="([^"]*)"[^>]*fill="([^"]*)"[^>]*\/>/g;
    let match;
    
    console.log(`🎨 Extracting paths from SVG with CMYK color mapping...`);
    
    while ((match = pathRegex.exec(svgContent)) !== null) {
      const pathData = match[1];
      const fillColor = match[2];
      
      // Find corresponding CMYK color
      const cmykColorInfo = svgColors?.colors?.find((color: any) => 
        color.originalColor === fillColor || 
        color.originalColor.includes(fillColor.replace('rgb(', '').replace(')', ''))
      );
      
      if (cmykColorInfo?.cmykColor) {
        const cmykMatch = cmykColorInfo.cmykColor.match(/C:(\d+)\s+M:(\d+)\s+Y:(\d+)\s+K:(\d+)/);
        if (cmykMatch) {
          const [, c, m, y, k] = cmykMatch;
          
          // Convert CMYK percentages to PostScript values (0-1)
          const cVal = (parseFloat(c) / 100).toFixed(3);
          const mVal = (parseFloat(m) / 100).toFixed(3);
          const yVal = (parseFloat(y) / 100).toFixed(3);
          const kVal = (parseFloat(k) / 100).toFixed(3);
          
          // Add PostScript path with true CMYK color - EXACT preservation from original file
          psContent += `
% EXACT CMYK from original file: C:${c} M:${m} Y:${y} K:${k}${cmykColorInfo.isExactMatch ? ' (Pantone Match)' : ' (Approximation)'}
${cVal} ${mVal} ${yVal} ${kVal} setcmykcolor
newpath
${this.convertSVGPathToPostScript(pathData)}
fill
`;
          
          console.log(`🎯 EXACT CMYK preserved in PDF: C:${c} M:${m} Y:${y} K:${k} ${cmykColorInfo.isExactMatch ? '(Pantone Match)' : '(Approximation)'}`);
        }
      }
    }
    
    psContent += `
showpage
%%EOF`;
    
    // Write PostScript file
    const psPath = outputPath.replace('.pdf', '.ps');
    fs.writeFileSync(psPath, psContent);
    
    // Convert PostScript to PDF with strict CMYK preservation
    const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dUseCIEColor=false -sOutputFile="${outputPath}" "${psPath}"`;
    
    try {
      execSync(gsCommand, { stdio: 'pipe' });
      console.log(`✅ Native CMYK PDF generated: ${outputPath}`);
      
      // Clean up PostScript file
      fs.unlinkSync(psPath);
      
    } catch (error) {
      console.error(`❌ Ghostscript CMYK conversion failed:`, error);
      throw error;
    }
  }
  
  /**
   * Convert SVG path data to PostScript commands
   */
  private static convertSVGPathToPostScript(svgPath: string): string {
    // Basic SVG to PostScript path conversion
    // This is a simplified version - in production you'd need full SVG path parser
    let psPath = svgPath
      .replace(/M\s*([0-9.-]+)\s*,?\s*([0-9.-]+)/g, '$1 $2 moveto')
      .replace(/L\s*([0-9.-]+)\s*,?\s*([0-9.-]+)/g, '$1 $2 lineto')
      .replace(/C\s*([0-9.-]+)\s*,?\s*([0-9.-]+)\s*([0-9.-]+)\s*,?\s*([0-9.-]+)\s*([0-9.-]+)\s*,?\s*([0-9.-]+)/g, '$1 $2 $3 $4 $5 $6 curveto')
      .replace(/Z/gi, 'closepath');
    
    return psPath;
  }
}