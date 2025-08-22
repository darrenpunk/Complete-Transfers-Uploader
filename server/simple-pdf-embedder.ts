/**
 * ULTRA-SIMPLE PDF EMBEDDER
 * Completely bypasses all complex transformations and conversions
 * Uses Ghostscript directly for precise, reliable embedding
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SimplePDFEmbedder {
  
  /**
   * Use Ghostscript to directly embed a logo into a template with exact dimensions
   */
  static async embedLogoDirectly(
    logoPath: string,
    templateWidth: number = 841.89, // A3 width in points
    templateHeight: number = 1190.55, // A3 height in points  
    targetWidthMM: number = 270.28,
    targetHeightMM: number = 201.96
  ): Promise<Buffer> {
    
    const MM_TO_POINTS = 2.834645669;
    const targetWidthPts = targetWidthMM * MM_TO_POINTS;
    const targetHeightPts = targetHeightMM * MM_TO_POINTS;
    
    // Perfect centering calculation
    const centerX = (templateWidth - targetWidthPts) / 2;
    const centerY = (templateHeight - targetHeightPts) / 2;
    
    console.log(`🎯 SIMPLE EMBEDDER: Logo=${logoPath}`);
    console.log(`📐 EXACT POSITIONING: Center=(${centerX.toFixed(1)}, ${centerY.toFixed(1)}) Size=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts`);
    
    const outputPath = path.join(process.cwd(), 'uploads', `simple_output_${Date.now()}.pdf`);
    
    try {
      // Create PostScript command that embeds logo with exact dimensions and positioning
      const psCommands = `
        %!PS-Adobe-3.0
        %%BoundingBox: 0 0 ${templateWidth} ${templateHeight}
        %%Pages: 2
        
        % Page 1 - Main template with logo
        %%Page: 1 1
        gsave
        ${centerX} ${centerY} translate
        ${targetWidthPts} ${targetHeightPts} scale
        0 0 1 1 rectclip
        (${logoPath}) run
        grestore
        showpage
        
        % Page 2 - Duplicate for printing
        %%Page: 2 2  
        gsave
        ${centerX} ${centerY} translate
        ${targetWidthPts} ${targetHeightPts} scale
        0 0 1 1 rectclip
        (${logoPath}) run
        grestore
        showpage
        
        %%EOF
      `;
      
      const psPath = path.join(process.cwd(), 'uploads', `simple_${Date.now()}.ps`);
      fs.writeFileSync(psPath, psCommands);
      
      // Use Ghostscript to convert PS to PDF with exact specifications
      const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -o "${outputPath}" "${psPath}"`;
      
      await execAsync(gsCmd);
      console.log(`✅ SIMPLE EMBEDDER: PDF generated successfully`);
      
      // Cleanup
      if (fs.existsSync(psPath)) {
        fs.unlinkSync(psPath);
      }
      
      return fs.readFileSync(outputPath);
      
    } catch (error) {
      console.error(`❌ SIMPLE EMBEDDER: Failed`, error);
      throw error;
    }
  }
  
  /**
   * Alternative approach using pdf-lib for direct manipulation
   */
  static async embedUsingPDFLib(
    logoPath: string,
    targetWidthMM: number = 270.28,
    targetHeightMM: number = 201.96
  ): Promise<Buffer> {
    
    const { PDFDocument, degrees } = await import('pdf-lib');
    const MM_TO_POINTS = 2.834645669;
    
    console.log(`🔄 PDF-LIB EMBEDDER: Processing ${logoPath}`);
    
    try {
      // Create new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Add pages for A3 template
      const page1 = pdfDoc.addPage([841.89, 1190.55]);
      const page2 = pdfDoc.addPage([841.89, 1190.55]);
      
      // Load the logo PDF
      const logoBytes = fs.readFileSync(logoPath);
      const logoPdf = await PDFDocument.load(logoBytes);
      const logoPage = await pdfDoc.embedPage(logoPdf.getPages()[0]);
      
      // Calculate exact positioning and sizing
      const targetWidthPts = targetWidthMM * MM_TO_POINTS;
      const targetHeightPts = targetHeightMM * MM_TO_POINTS;
      const centerX = (841.89 - targetWidthPts) / 2;
      const centerY = (1190.55 - targetHeightPts) / 2;
      
      console.log(`📐 PDF-LIB: Position=(${centerX.toFixed(1)}, ${centerY.toFixed(1)}) Size=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts`);
      
      // Embed on both pages with exact dimensions
      const embedOptions = {
        x: centerX,
        y: centerY,
        width: targetWidthPts,
        height: targetHeightPts,
      };
      
      page1.drawPage(logoPage, embedOptions);
      page2.drawPage(logoPage, embedOptions);
      
      console.log(`✅ PDF-LIB EMBEDDER: Successfully embedded with exact dimensions`);
      
      return await pdfDoc.save();
      
    } catch (error) {
      console.error(`❌ PDF-LIB EMBEDDER: Failed`, error);
      throw error;
    }
  }
}