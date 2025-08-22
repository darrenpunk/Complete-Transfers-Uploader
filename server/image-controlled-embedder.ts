/**
 * Image-Controlled PDF Embedder
 * 
 * This approach converts the original PDF to a high-quality image,
 * then embeds that image with exact dimensional control using pdf-lib.
 * This bypasses all PDF page embedding issues and gives us complete control.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ImageControlledEmbedder {
  
  /**
   * Convert PDF to image, then embed with exact control
   */
  static async createWithImageControl(
    logoPath: string,
    targetWidthMM: number = 270.28,
    targetHeightMM: number = 201.96
  ): Promise<Buffer> {
    
    const { PDFDocument } = await import('pdf-lib');
    const MM_TO_POINTS = 2.834645669;
    const A3_WIDTH = 841.89;
    const A3_HEIGHT = 1190.55;
    
    console.log(`🔄 IMAGE CONTROLLED: Processing ${logoPath}`);
    
    try {
      // Calculate exact positioning
      const targetWidthPts = targetWidthMM * MM_TO_POINTS;
      const targetHeightPts = targetHeightMM * MM_TO_POINTS;
      const centerX = (A3_WIDTH - targetWidthPts) / 2;
      const centerY = (A3_HEIGHT - targetHeightPts) / 2;
      
      console.log(`📐 IMAGE CONTROLLED: Target=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts at (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
      
      // Step 1: Convert PDF to high-quality PNG
      const pngPath = path.join(process.cwd(), 'uploads', `controlled_${Date.now()}.png`);
      
      // Use Ghostscript to create high-DPI PNG from PDF
      const pngCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -o "${pngPath}" "${logoPath}"`;
      
      console.log(`🔧 IMAGE CONTROLLED: Converting PDF to PNG at 300 DPI`);
      await execAsync(pngCmd);
      
      // Step 2: Create new PDF with exact dimensions
      const pdfDoc = await PDFDocument.create();
      
      // Add A3 pages
      const page1 = pdfDoc.addPage([A3_WIDTH, A3_HEIGHT]);
      const page2 = pdfDoc.addPage([A3_WIDTH, A3_HEIGHT]);
      
      // Step 3: Load the PNG image
      const imageBytes = fs.readFileSync(pngPath);
      const image = await pdfDoc.embedPng(imageBytes);
      
      console.log(`🔍 IMAGE CONTROLLED: PNG embedded, original size=${image.width}×${image.height}px`);
      
      // Step 4: Embed with EXACT target dimensions (this should work perfectly with images)
      const embedOptions = {
        x: centerX,
        y: centerY,
        width: targetWidthPts,
        height: targetHeightPts,
      };
      
      console.log(`🎯 IMAGE CONTROLLED: Embedding at x=${centerX.toFixed(1)}, y=${centerY.toFixed(1)}, w=${targetWidthPts.toFixed(1)}, h=${targetHeightPts.toFixed(1)}`);
      
      // Draw on both pages with exact dimensions
      page1.drawImage(image, embedOptions);
      page2.drawImage(image, embedOptions);
      
      console.log(`✅ IMAGE CONTROLLED: Image embedded with exact target dimensions`);
      
      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      
      // Cleanup
      if (fs.existsSync(pngPath)) {
        fs.unlinkSync(pngPath);
      }
      
      console.log(`✅ IMAGE CONTROLLED: PDF generated successfully - ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error(`❌ IMAGE CONTROLLED: Failed`, error);
      throw error;
    }
  }
}