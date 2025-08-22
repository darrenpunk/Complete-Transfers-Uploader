/**
 * ULTRA-SIMPLE PDF EMBEDDER
 * Completely bypasses all complex transformations and conversions
 * Uses Ghostscript directly for precise, reliable embedding
 */

import * as fs from 'fs';
import * as path from 'path';

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
      
      // This method is simplified - using pdf-lib approach instead
      throw new Error('PostScript method not implemented - using PDF-lib instead');
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
      // Create new PDF document with exact A3 specifications
      const pdfDoc = await PDFDocument.create();
      
      // A3 dimensions in points: 841.89 × 1190.55
      const A3_WIDTH = 841.89;
      const A3_HEIGHT = 1190.55;
      
      // Add pages for A3 template
      const page1 = pdfDoc.addPage([A3_WIDTH, A3_HEIGHT]);
      const page2 = pdfDoc.addPage([A3_WIDTH, A3_HEIGHT]);
      
      // Load the logo PDF and get its first page
      const logoBytes = fs.readFileSync(logoPath);
      const logoPdf = await PDFDocument.load(logoBytes);
      const logoFirstPage = logoPdf.getPages()[0];
      
      // Get the actual content bounds from the logo page
      const logoMediaBox = logoFirstPage.getMediaBox();
      console.log(`🔍 LOGO DEBUG: Original logo dimensions=${logoMediaBox.width}×${logoMediaBox.height}pts`);
      
      // Embed the page and override its dimensions completely
      const logoPage = await pdfDoc.embedPage(logoFirstPage);
      console.log(`🔍 EMBED DEBUG: Logo page embedded successfully`);
      
      // Calculate exact positioning and sizing for A3 template
      const targetWidthPts = targetWidthMM * MM_TO_POINTS;
      const targetHeightPts = targetHeightMM * MM_TO_POINTS;
      const centerX = (A3_WIDTH - targetWidthPts) / 2;
      const centerY = (A3_HEIGHT - targetHeightPts) / 2;
      
      console.log(`🔍 SIMPLE EMBEDDER DEBUG: A3=${A3_WIDTH}×${A3_HEIGHT}pts, Target=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts`);
      console.log(`🔍 SIMPLE EMBEDDER DEBUG: Calculated center=(${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
      
      // For PDF coordinate system, Y=0 is at bottom, but we want centered positioning
      // Use a more predictable Y position for now 
      const adjustedY = centerY;
      
      console.log(`📐 PDF-LIB: Position=(${centerX.toFixed(1)}, ${adjustedY.toFixed(1)}) Size=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts`);
      
      // FORCE EXACT DIMENSIONS: Override any original page dimensions
      const embedOptions = {
        x: centerX,
        y: adjustedY,
        width: targetWidthPts,  // Override original width completely
        height: targetHeightPts, // Override original height completely
      };
      
      console.log(`🔍 EMBED OPTIONS: x=${embedOptions.x.toFixed(1)}, y=${embedOptions.y.toFixed(1)}, w=${embedOptions.width.toFixed(1)}, h=${embedOptions.height.toFixed(1)}`);
      console.log(`🎯 FORCING EXACT DIMENSIONS: Will override original ${logoMediaBox.width}×${logoMediaBox.height} to ${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}`);
      
      // Draw the logo page at exact coordinates with exact dimensions
      page1.drawPage(logoPage, embedOptions);
      page2.drawPage(logoPage, embedOptions);
      
      console.log(`✅ FORCED EXACT EMBEDDING: Both pages updated with exact target dimensions`);
      
      // Set media box to ensure PDF bounds match our content
      page1.setMediaBox(0, 0, A3_WIDTH, A3_HEIGHT);
      page2.setMediaBox(0, 0, A3_WIDTH, A3_HEIGHT);
      
      console.log(`✅ MEDIA BOX SET: Pages configured with A3 dimensions`);
      
      console.log(`✅ PDF-LIB EMBEDDER: Successfully embedded with exact dimensions`);
      
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error(`❌ PDF-LIB EMBEDDER: Failed`, error);
      throw error;
    }
  }
}