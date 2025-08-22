/**
 * DIRECT PDF GENERATOR
 * Simple, reliable approach that eliminates complex transformations
 * and focuses on direct, accurate PDF embedding
 */

import * as fs from 'fs';
import * as path from 'path';
import { execAsync } from './utils';

interface DirectEmbedOptions {
  elementX: number;
  elementY: number; 
  elementWidth: number;
  elementHeight: number;
  logoFilePath: string;
  templatePageSize: { width: number; height: number };
}

export class DirectPDFGenerator {
  
  /**
   * Direct approach: Use original PDF when possible, minimal transformations
   */
  static async embedLogoDirect(options: DirectEmbedOptions): Promise<Buffer> {
    const { elementX, elementY, elementWidth, elementHeight, logoFilePath, templatePageSize } = options;
    
    console.log(`🎯 DIRECT APPROACH: Embedding logo without complex transformations`);
    console.log(`📐 Element: x=${elementX}mm, y=${elementY}mm, size=${elementWidth}×${elementHeight}mm`);
    console.log(`📄 Template: ${templatePageSize.width}×${templatePageSize.height}pts`);
    
    // Convert mm to points (1mm = 2.834645669 points)
    const MM_TO_POINTS = 2.834645669;
    const xPts = elementX * MM_TO_POINTS;
    const yPts = elementY * MM_TO_POINTS;
    const widthPts = elementWidth * MM_TO_POINTS;  
    const heightPts = elementHeight * MM_TO_POINTS;
    
    // Center the logo on the template
    const centerX = (templatePageSize.width - widthPts) / 2;
    const centerY = (templatePageSize.height - heightPts) / 2;
    
    console.log(`🎯 DIRECT CENTERING: Center position=${centerX.toFixed(1)}, ${centerY.toFixed(1)}pts`);
    
    try {
      // Use Ghostscript to directly embed the logo into a template
      const outputPath = path.join(process.cwd(), 'uploads', `direct_output_${Date.now()}.pdf`);
      
      // Create a simple PostScript file that embeds the logo
      const psContent = `
%!PS-Adobe-3.0
%%BoundingBox: 0 0 ${templatePageSize.width} ${templatePageSize.height}
%%Pages: 1
%%Page: 1 1
save
${centerX} ${centerY} translate
${widthPts} ${heightPts} scale
(${logoFilePath}) run
restore
showpage
%%EOF
`;
      
      const psPath = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.ps`);
      fs.writeFileSync(psPath, psContent);
      
      // Convert PS to PDF using Ghostscript
      const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -o "${outputPath}" "${psPath}"`;
      await execAsync(gsCmd);
      
      console.log(`✅ DIRECT GENERATION: PDF created successfully`);
      
      // Clean up temp file
      fs.unlinkSync(psPath);
      
      return fs.readFileSync(outputPath);
      
    } catch (error) {
      console.error(`❌ DIRECT GENERATION: Failed`, error);
      throw error;
    }
  }
  
  /**
   * Simplified SVG to PDF conversion with minimal transformations
   */
  static async convertSVGDirectly(svgPath: string, targetWidth: number, targetHeight: number): Promise<string> {
    console.log(`🔄 DIRECT SVG CONVERSION: ${svgPath} to ${targetWidth}×${targetHeight}pts`);
    
    const outputPath = svgPath.replace('.svg', '_direct.pdf');
    
    try {
      // Use Inkscape with exact dimensions, no scaling
      const inkscapeCmd = `inkscape --export-type=pdf --export-width=${targetWidth} --export-height=${targetHeight} --export-filename="${outputPath}" "${svgPath}"`;
      await execAsync(inkscapeCmd);
      
      console.log(`✅ DIRECT SVG CONVERSION: Successful`);
      return outputPath;
      
    } catch (error) {
      console.error(`❌ DIRECT SVG CONVERSION: Failed`, error);
      throw error;
    }
  }
  
  /**
   * Use original file directly when possible to preserve all attributes
   */
  static async useOriginalWhenPossible(originalPath: string, targetDimensions: { width: number; height: number }): Promise<string> {
    if (!fs.existsSync(originalPath)) {
      throw new Error(`Original file not found: ${originalPath}`);
    }
    
    const ext = path.extname(originalPath).toLowerCase();
    
    if (ext === '.pdf') {
      console.log(`✅ DIRECT USE: Using original PDF without conversion`);
      return originalPath;
    }
    
    if (ext === '.svg') {
      console.log(`🔄 DIRECT USE: Converting SVG with exact dimensions`);
      return await this.convertSVGDirectly(originalPath, targetDimensions.width, targetDimensions.height);
    }
    
    throw new Error(`Unsupported file type for direct use: ${ext}`);
  }
}