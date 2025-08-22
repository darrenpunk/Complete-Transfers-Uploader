/**
 * Direct Ghostscript PDF Embedder
 * 
 * Completely bypasses pdf-lib page embedding which has dimensional issues.
 * Uses Ghostscript directly to create PDF with exact dimensions and positioning.
 * This approach gives us complete control over the final PDF structure.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DirectGhostscriptEmbedder {
  
  /**
   * Create PDF using Ghostscript with exact positioning and dimensions
   */
  static async createDirectPDF(
    logoPath: string,
    targetWidthMM: number = 270.28,
    targetHeightMM: number = 201.96
  ): Promise<Buffer> {
    
    const MM_TO_POINTS = 2.834645669;
    const A3_WIDTH = 841.89;
    const A3_HEIGHT = 1190.55;
    
    console.log(`🔄 DIRECT GHOSTSCRIPT: Processing ${logoPath}`);
    
    try {
      // Calculate exact positioning
      const targetWidthPts = targetWidthMM * MM_TO_POINTS;
      const targetHeightPts = targetHeightMM * MM_TO_POINTS;
      const centerX = (A3_WIDTH - targetWidthPts) / 2;
      const centerY = (A3_HEIGHT - targetHeightPts) / 2;
      
      console.log(`📐 DIRECT GS: Target=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts at (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
      
      // Create PostScript commands for exact embedding
      const psCommands = `
%!PS-Adobe-3.0
%%BoundingBox: 0 0 ${A3_WIDTH} ${A3_HEIGHT}
%%Pages: 2
%%Page: 1 1

% Save graphics state
gsave

% Position and scale the logo exactly
${centerX} ${centerY} translate
${targetWidthPts} ${targetHeightPts} scale

% Embed the original PDF at exact position and size
(${logoPath}) run

% Restore graphics state
grestore

% Show page
showpage

%%Page: 2 2

% Save graphics state
gsave

% Position and scale the logo exactly (same on both pages)
${centerX} ${centerY} translate
${targetWidthPts} ${targetHeightPts} scale

% Embed the original PDF at exact position and size
(${logoPath}) run

% Restore graphics state
grestore

% Show page
showpage

%%EOF
`;
      
      // Write PostScript to temporary file
      const psPath = path.join(process.cwd(), 'uploads', `direct_${Date.now()}.ps`);
      fs.writeFileSync(psPath, psCommands);
      
      const outputPath = path.join(process.cwd(), 'uploads', `direct_output_${Date.now()}.pdf`);
      
      // Use Ghostscript to convert PS to PDF with exact specifications
      const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -g${Math.round(A3_WIDTH*4)}x${Math.round(A3_HEIGHT*4)} -r300 -o "${outputPath}" "${psPath}"`;
      
      console.log(`🔧 DIRECT GS: Running Ghostscript command`);
      await execAsync(gsCmd);
      
      // Read the generated PDF
      const pdfBuffer = fs.readFileSync(outputPath);
      
      // Cleanup temporary files
      if (fs.existsSync(psPath)) {
        fs.unlinkSync(psPath);
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      
      console.log(`✅ DIRECT GHOSTSCRIPT: PDF generated successfully - ${pdfBuffer.length} bytes`);
      
      return pdfBuffer;
      
    } catch (error) {
      console.error(`❌ DIRECT GHOSTSCRIPT: Failed`, error);
      throw error;
    }
  }
}