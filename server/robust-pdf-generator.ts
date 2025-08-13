import { PDFDocument, PDFPage, rgb, degrees } from 'pdf-lib';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface RobustPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class RobustPDFGenerator {
  /**
   * Completely rewritten PDF generation using a robust, cache-free approach
   * Single responsibility: Generate one page with logos at exact canvas positions
   */
  async generatePDF(data: RobustPDFData): Promise<Buffer> {
    console.log('🚀 ROBUST PDF GENERATION - New Approach');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);

    try {
      // Create new PDF document
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle(`${data.projectId}_artwork`);
      pdfDoc.setCreator('CompleteTransfers.com Logo Uploader');

      // Create single page with template dimensions
      const pageWidth = data.templateSize.width * 2.834; // mm to points
      const pageHeight = data.templateSize.height * 2.834;
      
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      console.log(`📄 Created ${pageWidth}x${pageHeight}pt page`);

      console.log(`🔍 DEBUG: Processing ${data.canvasElements.length} canvas elements`);
      console.log(`🔍 DEBUG: Available ${data.logos.length} logos`);
      
      // Process each logo with robust embedding
      for (let i = 0; i < data.canvasElements.length; i++) {
        const element = data.canvasElements[i];
        
        console.log(`🔍 Element ${i}: ID=${element.id}, logoId=${element.logoId}, logoFilename=${element.logoFilename}`);
        console.log(`🔍 Available logos:`, data.logos.map(l => `ID=${l.id}, filename=${l.filename}`));
        
        // Try multiple ways to find the logo with detailed logging
        let logo = data.logos.find(l => l.id === element.logoId);
        if (!logo) {
          console.log(`🔍 No match on logoId, trying filename...`);
          logo = data.logos.find(l => l.filename === element.logoFilename);
        }
        if (!logo && data.logos.length === 1) {
          console.log(`🔍 Using fallback to single available logo`);
          logo = data.logos[0];
        }
        
        if (!logo) {
          console.error(`❌ CRITICAL: No logo found for element after all attempts`);
          continue;
        }

        console.log(`🎯 Processing logo ${i + 1}/${data.canvasElements.length}: ${logo.filename} (ID: ${logo.id})`);
        await this.embedLogoRobust(pdfDoc, page, element, logo, data.templateSize);
      }

      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Robust PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Robust PDF generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`PDF generation failed: ${errorMessage}`);
    }
  }

  /**
   * Robust logo embedding with simplified coordinate calculation
   */
  private async embedLogoRobust(
    pdfDoc: PDFDocument, 
    page: PDFPage, 
    element: any, 
    logo: any, 
    templateSize: any
  ): Promise<void> {
    try {
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      
      // Check if file exists
      try {
        await fs.access(logoPath);
      } catch {
        console.error(`❌ Logo file not found: ${logoPath}`);
        return;
      }

      // Convert SVG to PDF using Inkscape (most reliable method)
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_robust_${Date.now()}.pdf`);
      
      if (logo.mimeType === 'image/svg+xml') {
        // Use Inkscape for SVG conversion
        const inkscapeCmd = `inkscape --export-type=pdf --export-filename="${tempPdfPath}" "${logoPath}"`;
        await execAsync(inkscapeCmd);
        console.log(`🎨 SVG converted to PDF: ${tempPdfPath}`);
      } else {
        // For other formats, copy the file
        await fs.copyFile(logoPath, tempPdfPath);
      }

      // Read converted PDF and embed as page
      const tempPdfBytes = await fs.readFile(tempPdfPath);
      const tempPdf = await PDFDocument.load(tempPdfBytes);
      
      // Check if PDF has pages
      if (tempPdf.getPageCount() === 0) {
        console.error(`❌ Converted PDF has no pages: ${tempPdfPath}`);
        return;
      }
      
      const [embeddedPage] = await pdfDoc.copyPages(tempPdf, [0]);
      
      if (!embeddedPage) {
        console.error(`❌ Failed to copy page from PDF: ${tempPdfPath}`);
        return;
      }

      // Calculate position - SIMPLIFIED APPROACH
      // Use direct canvas coordinates with proper scaling
      const scale = 2.834; // mm to points conversion
      
      // Canvas coordinates are in pixels, convert to mm first
      const pixelToMm = templateSize.width / templateSize.pixelWidth; // mm per pixel
      const xInMm = element.x * pixelToMm;
      const yInMm = element.y * pixelToMm;
      
      // Convert mm to points for PDF
      const xInPoints = xInMm * scale;
      const yInPoints = yInMm * scale;
      
      // PDF coordinate system: Y=0 at bottom, canvas Y=0 at top
      const pageHeight = templateSize.height * scale;
      const finalY = pageHeight - yInPoints; // Flip Y coordinate
      
      console.log(`📍 Position calculation:`);
      console.log(`  Canvas: (${element.x}, ${element.y}) pixels`);
      console.log(`  MM: (${xInMm.toFixed(2)}, ${yInMm.toFixed(2)}) mm`);
      console.log(`  PDF: (${xInPoints.toFixed(2)}, ${finalY.toFixed(2)}) points`);

      // Scale the embedded page to match element size
      const elementWidthMm = element.width * pixelToMm;
      const elementHeightMm = element.height * pixelToMm;
      const elementWidthPoints = elementWidthMm * scale;
      const elementHeightPoints = elementHeightMm * scale;

      // Get original page size to calculate scale factor
      const originalSize = embeddedPage.getSize();
      
      if (!originalSize || originalSize.width <= 0 || originalSize.height <= 0) {
        console.error(`❌ Invalid page dimensions: ${originalSize?.width}×${originalSize?.height}`);
        return;
      }
      
      const scaleX = elementWidthPoints / originalSize.width;
      const scaleY = elementHeightPoints / originalSize.height;
      const uniformScale = Math.min(scaleX, scaleY); // Maintain aspect ratio

      // Embed the logo with bounds checking
      const finalWidth = originalSize.width * uniformScale;
      const finalHeight = originalSize.height * uniformScale;
      
      console.log(`📐 Embedding: ${finalWidth.toFixed(1)}×${finalHeight.toFixed(1)}pt at (${xInPoints.toFixed(1)}, ${finalY.toFixed(1)})`);
      
      try {
        page.drawPage(embeddedPage, {
          x: xInPoints,
          y: finalY,
          width: finalWidth,
          height: finalHeight,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
        console.log(`✅ Successfully embedded logo`);
      } catch (drawError) {
        console.error(`❌ Failed to draw page:`, drawError);
        throw drawError;
      }

      console.log(`✅ Logo embedded successfully at (${xInPoints.toFixed(2)}, ${finalY.toFixed(2)})`);

      // Clean up temp file
      try {
        await fs.unlink(tempPdfPath);
      } catch {
        // Ignore cleanup errors
      }

    } catch (error) {
      console.error(`❌ Failed to embed logo ${logo.filename}:`, error);
      throw error;
    }
  }
}