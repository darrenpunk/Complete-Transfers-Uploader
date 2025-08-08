import { PDFDocument, PDFPage, degrees } from 'pdf-lib';
import path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WorkingPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class WorkingPDFGenerator {
  /**
   * WORKING PDF GENERATION - New clean approach to bypass all caching issues
   */
  async generatePDF(data: WorkingPDFData): Promise<Buffer> {
    console.log('🚀 WORKING PDF GENERATION - Clean Approach');
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

      // Process each logo with working embedding
      for (let i = 0; i < data.canvasElements.length; i++) {
        const element = data.canvasElements[i];
        
        // Find logo by ID
        const logo = data.logos.find(l => l.id === element.logoId);
        
        if (!logo) {
          console.warn(`⚠️ No logo found for element ${element.id}, logoId: ${element.logoId}`);
          continue;
        }

        console.log(`🎯 Processing logo ${i + 1}/${data.canvasElements.length}: ${logo.filename}`);
        await this.embedLogoWorking(pdfDoc, page, element, logo, data.templateSize);
      }

      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Working PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Working PDF generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`PDF generation failed: ${errorMessage}`);
    }
  }

  /**
   * Working logo embedding using direct image embedding instead of page copying
   */
  private async embedLogoWorking(
    pdfDoc: PDFDocument, 
    page: PDFPage, 
    element: any, 
    logo: any, 
    templateSize: any
  ): Promise<void> {
    try {
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      
      console.log(`🔍 Working embedding for: ${logo.filename}`);
      
      // Check if file exists
      try {
        await fs.access(logoPath);
      } catch {
        console.error(`❌ Logo file not found: ${logoPath}`);
        return;
      }

      // Use PNG conversion instead of PDF embedding to avoid the issue
      const tempPngPath = path.join(process.cwd(), 'uploads', `temp_working_${Date.now()}.png`);
      
      if (logo.mimeType === 'image/svg+xml') {
        // Convert SVG to PNG using Inkscape
        const inkscapeCmd = `inkscape --export-type=png --export-dpi=300 --export-filename="${tempPngPath}" "${logoPath}"`;
        await execAsync(inkscapeCmd);
        console.log(`🎨 SVG converted to PNG: ${tempPngPath}`);
      } else {
        // For other formats, try direct embedding first
        console.log(`🎨 Using original file: ${logoPath}`);
        await fs.copyFile(logoPath, tempPngPath);
      }

      // Embed PNG image instead of PDF page
      const imageBytes = await fs.readFile(tempPngPath);
      const image = await pdfDoc.embedPng(imageBytes);
      
      // Calculate position
      const scale = 2.834; // mm to points
      const pixelToMm = templateSize.width / templateSize.pixelWidth;
      const xInMm = element.x * pixelToMm;
      const yInMm = element.y * pixelToMm;
      const xInPoints = xInMm * scale;
      const yInPoints = yInMm * scale;
      const pageHeight = templateSize.height * scale;
      const finalY = pageHeight - yInPoints;
      
      // Calculate size
      const elementWidthMm = element.width * pixelToMm;
      const elementHeightMm = element.height * pixelToMm;
      const elementWidthPoints = elementWidthMm * scale;
      const elementHeightPoints = elementHeightMm * scale;
      
      console.log(`📐 Embedding PNG: ${elementWidthPoints.toFixed(1)}×${elementHeightPoints.toFixed(1)}pt at (${xInPoints.toFixed(1)}, ${finalY.toFixed(1)})`);
      
      // Draw image
      page.drawImage(image, {
        x: xInPoints,
        y: finalY,
        width: elementWidthPoints,
        height: elementHeightPoints,
        rotate: element.rotation ? degrees(element.rotation) : undefined,
      });
      
      console.log(`✅ Successfully embedded logo as PNG`);
      
      // Clean up temp file
      try {
        await fs.unlink(tempPngPath);
      } catch {
        // Ignore cleanup errors
      }
      
    } catch (error) {
      console.error(`❌ Failed to embed logo ${logo.filename}:`, error);
      throw error;
    }
  }
}