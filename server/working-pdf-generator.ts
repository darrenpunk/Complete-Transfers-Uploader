import { PDFDocument, degrees } from 'pdf-lib';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkingPDFData {
  projectId: string;
  canvasElements: any[];
  logos: any[];
  templateSize: any;
  garmentColor?: string;
  extraGarmentColors?: string[];
  quantity?: number;
}

/**
 * Simplified PDF generator that works correctly with vector embedding
 */
export class WorkingPDFGenerator {
  
  async generatePDF(data: WorkingPDFData): Promise<Buffer> {
    console.log('🔧 WORKING PDF GENERATOR - Simplified Approach');
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

      // Process each logo
      for (let i = 0; i < data.canvasElements.length; i++) {
        const element = data.canvasElements[i];
        
        // Find matching logo
        let logo = data.logos.find(l => l.id === element.logoId);
        if (!logo && data.logos.length === 1) {
          logo = data.logos[0]; // Use single available logo
        }
        
        if (!logo) {
          console.error(`❌ No logo found for element ${element.id}`);
          continue;
        }

        console.log(`🎯 Processing logo: ${logo.filename}`);
        await this.embedLogo(pdfDoc, page, element, logo, data.templateSize);
      }

      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Working PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Working PDF generation failed:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async embedLogo(
    pdfDoc: PDFDocument, 
    page: any, 
    element: any, 
    logo: any, 
    templateSize: any
  ): Promise<void> {
    try {
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      
      // Check if file exists
      if (!fs.existsSync(logoPath)) {
        console.error(`❌ Logo file not found: ${logoPath}`);
        return;
      }

      // Convert SVG to PDF using Inkscape
      const tempPdfPath = path.join('/tmp', `working_${Date.now()}.pdf`);
      
      if (logo.mimeType === 'image/svg+xml') {
        // Use Inkscape for SVG conversion - simplified command
        const inkscapeCmd = `inkscape --export-type=pdf --export-filename="${tempPdfPath}" "${logoPath}"`;
        execSync(inkscapeCmd, { stdio: 'pipe' });
        console.log(`🎨 SVG converted to PDF: ${tempPdfPath}`);
      } else {
        // For other formats, copy the file
        fs.copyFileSync(logoPath, tempPdfPath);
      }

      // Read and validate the converted PDF
      const tempPdfBytes = fs.readFileSync(tempPdfPath);
      const tempPdfDoc = await PDFDocument.load(tempPdfBytes);
      
      // Critical validation
      if (tempPdfDoc.getPageCount() === 0) {
        console.error(`❌ Converted PDF has no pages: ${tempPdfPath}`);
        fs.unlinkSync(tempPdfPath);
        return;
      }
      
      // Load source PDF and embed its page - this is the correct approach
      console.log('🔄 Loading source PDF and embedding page...');
      const sourcePdf = tempPdfDoc;
      const sourcePages = sourcePdf.getPages();
      
      if (sourcePages.length === 0) {
        console.error(`❌ Source PDF has no pages: ${tempPdfPath}`);
        fs.unlinkSync(tempPdfPath);
        return;
      }
      
      console.log(`📋 Found ${sourcePages.length} source pages`);
      const embeddedPage = await pdfDoc.embedPage(sourcePages[0]);
      console.log('📋 Embedded page type:', typeof embeddedPage);
      console.log('📋 Embedded page constructor:', embeddedPage ? embeddedPage.constructor.name : 'null');
      
      if (!embeddedPage || typeof embeddedPage !== 'object') {
        console.error(`❌ Failed to embed page: ${tempPdfPath}`);
        fs.unlinkSync(tempPdfPath);
        return;
      }
      
      const copiedPage = embeddedPage;

      // Simple position calculation
      const scale = 2.834; // mm to points conversion
      const pixelToMm = templateSize.width / templateSize.pixelWidth;
      const xInMm = element.x * pixelToMm;
      const yInMm = element.y * pixelToMm;
      
      const xInPoints = xInMm * scale;
      const yInPoints = yInMm * scale;
      
      // PDF coordinate system: Y=0 at bottom, canvas Y=0 at top
      const pageHeight = templateSize.height * scale;
      const finalY = pageHeight - yInPoints;
      
      // Get original page size for scaling from embedded PDF page
      const originalSize = { width: copiedPage.width, height: copiedPage.height };
      
      if (!originalSize || originalSize.width <= 0 || originalSize.height <= 0) {
        console.error(`❌ Invalid page dimensions: ${originalSize?.width}×${originalSize?.height}`);
        fs.unlinkSync(tempPdfPath);
        return;
      }
      
      const elementWidthMm = element.width * pixelToMm;
      const elementHeightMm = element.height * pixelToMm;
      const elementWidthPoints = elementWidthMm * scale;
      const elementHeightPoints = elementHeightMm * scale;
      
      const scaleX = elementWidthPoints / originalSize.width;
      const scaleY = elementHeightPoints / originalSize.height;
      const uniformScale = Math.min(scaleX, scaleY);

      const finalWidth = originalSize.width * uniformScale;
      const finalHeight = originalSize.height * uniformScale;
      
      console.log(`📐 Embedding: ${finalWidth.toFixed(1)}×${finalHeight.toFixed(1)}pt at (${xInPoints.toFixed(1)}, ${finalY.toFixed(1)})`);
      
      // Final validation before drawing
      console.log('🎯 Pre-draw validation:');
      console.log('🎯 copiedPage type:', typeof copiedPage);
      console.log('🎯 copiedPage constructor:', copiedPage ? copiedPage.constructor.name : 'null');
      console.log('🎯 copiedPage value:', copiedPage);
      
      // Draw the embedded page using correct drawPage API
      page.drawPage(copiedPage, {
        x: xInPoints,
        y: finalY,
        width: finalWidth,
        height: finalHeight,
        rotate: element.rotation ? degrees(element.rotation) : undefined,
      });
      
      console.log(`✅ Logo embedded successfully`);

      // Clean up temp file
      fs.unlinkSync(tempPdfPath);

    } catch (error) {
      console.error(`❌ Failed to embed logo ${logo.filename}:`, error);
      throw error;
    }
  }
}