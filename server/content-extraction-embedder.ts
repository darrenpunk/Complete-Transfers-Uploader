/**
 * Content Extraction PDF Embedder
 * 
 * Instead of embedding entire PDF pages (which pdf-lib handles poorly),
 * this extracts the actual content and redraws it with exact control.
 * This gives us perfect dimensional accuracy.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ContentExtractionEmbedder {
  
  /**
   * Extract content from PDF and rebuild with exact dimensions
   */
  static async createWithExtractedContent(
    logoPath: string,
    targetWidthMM: number = 270.28,
    targetHeightMM: number = 201.96
  ): Promise<Buffer> {
    
    const MM_TO_POINTS = 2.834645669;
    const A3_WIDTH = 841.89;
    const A3_HEIGHT = 1190.55;
    
    console.log(`🔄 CONTENT EXTRACTION: Processing ${logoPath}`);
    
    try {
      // Calculate exact positioning
      const targetWidthPts = targetWidthMM * MM_TO_POINTS;
      const targetHeightPts = targetHeightMM * MM_TO_POINTS;
      const centerX = (A3_WIDTH - targetWidthPts) / 2;
      const centerY = (A3_HEIGHT - targetHeightPts) / 2;
      
      console.log(`📐 CONTENT EXTRACTION: Target=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts at (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
      
      // Use Ghostscript to extract and rebuild with exact dimensions
      const outputPath = path.join(process.cwd(), 'uploads', `extracted_${Date.now()}.pdf`);
      
      // Fixed Ghostscript command to extract content and place at exact coordinates
      const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -o "${outputPath}" -c "<</PageSize [${A3_WIDTH} ${A3_HEIGHT}]>> setpagedevice" -c "${centerX} ${centerY} translate ${targetWidthPts} ${targetHeightPts} scale" -f "${logoPath}" -c "showpage" -c "${centerX} ${centerY} translate ${targetWidthPts} ${targetHeightPts} scale" -f "${logoPath}" -c "showpage"`;
      
      console.log(`🔧 CONTENT EXTRACTION: Running Ghostscript extraction`);
      await execAsync(gsCmd);
      
      // Read the generated PDF
      const pdfBuffer = fs.readFileSync(outputPath);
      
      // Cleanup
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      
      console.log(`✅ CONTENT EXTRACTION: PDF rebuilt successfully - ${pdfBuffer.length} bytes`);
      
      return pdfBuffer;
      
    } catch (error) {
      console.error(`❌ CONTENT EXTRACTION: Failed`, error);
      throw error;
    }
  }
}