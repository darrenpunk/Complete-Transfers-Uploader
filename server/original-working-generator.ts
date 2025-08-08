import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface OriginalPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class OriginalWorkingGenerator {
  /**
   * ORIGINAL WORKING PDF GENERATION - The method that worked from the beginning
   * Based on the user's example: gyhuiy_qty1_cmyk_1754674422540.pdf
   */
  async generatePDF(data: OriginalPDFData): Promise<Buffer> {
    console.log('🚀 ORIGINAL WORKING PDF GENERATION - Back to Basics');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);

    try {
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle(`${data.projectId}_artwork`);
      pdfDoc.setCreator('CompleteTransfers.com Logo Uploader');

      // Calculate template dimensions in points
      const templateWidthPoints = data.templateSize.width * 2.834;
      const templateHeightPoints = data.templateSize.height * 2.834;

      // PAGE 1: Artwork on transparent background
      console.log('📄 Creating Page 1: Artwork Layout');
      const page1 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
      
      // No background on page 1 - transparent
      await this.embedLogosOnPage(page1, data.canvasElements, data.logos, data.templateSize);

      // PAGE 2: Artwork on colored garment background 
      console.log('📄 Creating Page 2: Garment Background');
      const page2 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
      
      // Add garment color background to page 2
      if (data.garmentColor && data.garmentColor !== 'none') {
        this.addGarmentBackground(page2, data.garmentColor, templateWidthPoints, templateHeightPoints);
      }
      
      // Embed logos on page 2 
      await this.embedLogosOnPage(page2, data.canvasElements, data.logos, data.templateSize);

      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Original PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Original PDF generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`PDF generation failed: ${errorMessage}`);
    }
  }

  /**
   * Add garment color background
   */
  private addGarmentBackground(page: PDFPage, garmentColor: string, width: number, height: number): void {
    // Basic color mapping
    const colorMap: { [key: string]: [number, number, number] } = {
      'white': [1, 1, 1],
      'black': [0, 0, 0],
      'red': [1, 0, 0],
      'blue': [0, 0, 1],
      'green': [0, 1, 0],
      'yellow': [1, 1, 0],
      'gray': [0.5, 0.5, 0.5],
      'navy': [0, 0, 0.5],
    };

    const color = colorMap[garmentColor.toLowerCase()] || [1, 1, 1]; // Default to white
    
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(color[0], color[1], color[2]),
    });
    
    console.log(`🎨 Applied garment background: ${garmentColor}`);
  }

  /**
   * Embed logos on a page using the original working method
   */
  private async embedLogosOnPage(
    page: PDFPage, 
    canvasElements: any[], 
    logos: any[], 
    templateSize: any
  ): Promise<void> {
    for (let i = 0; i < canvasElements.length; i++) {
      const element = canvasElements[i];
      
      // Find matching logo
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) {
        console.warn(`⚠️ No logo found for element ${element.id}`);
        continue;
      }

      console.log(`🎯 Processing logo ${i + 1}/${canvasElements.length}: ${logo.filename}`);
      await this.embedSingleLogo(page, element, logo, templateSize);
    }
  }

  /**
   * Embed a single logo using the original method that worked
   */
  private async embedSingleLogo(
    page: PDFPage,
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

      // Convert SVG to PDF if needed (original working method)
      if (logo.mimeType === 'image/svg+xml') {
        await this.embedSVGLogo(page, element, logoPath, templateSize);
      } else {
        await this.embedImageLogo(page, element, logoPath, templateSize);
      }
      
    } catch (error) {
      console.error(`❌ Failed to embed logo ${logo.filename}:`, error);
    }
  }

  /**
   * Embed SVG logo using the original working method
   */
  private async embedSVGLogo(
    page: PDFPage,
    element: any,
    logoPath: string,
    templateSize: any
  ): Promise<void> {
    // Convert SVG to PDF using Inkscape (most reliable)
    const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_original_${Date.now()}.pdf`);
    
    try {
      const inkscapeCmd = `inkscape --export-type=pdf --export-filename="${tempPdfPath}" "${logoPath}"`;
      await execAsync(inkscapeCmd);
      console.log(`🎨 SVG converted to PDF: ${tempPdfPath}`);
      
      // Read the converted PDF and embed it
      const tempPdfBytes = fs.readFileSync(tempPdfPath);
      const tempPdf = await PDFDocument.load(tempPdfBytes);
      
      if (tempPdf.getPageCount() > 0) {
        const [embeddedPage] = await page.doc.embedPdf(tempPdf);
        
        // Calculate position using original working coordinates
        const position = this.calculateOriginalPosition(element, templateSize, page);
        const size = this.calculateOriginalSize(element, templateSize);
        
        // Draw the embedded page
        page.drawPage(embeddedPage, {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
        
        console.log(`✅ Successfully embedded SVG logo at (${position.x.toFixed(1)}, ${position.y.toFixed(1)})`);
      }
      
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempPdfPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Embed image logo using the original working method
   */
  private async embedImageLogo(
    page: PDFPage,
    element: any,
    logoPath: string,
    templateSize: any
  ): Promise<void> {
    const imageBytes = fs.readFileSync(logoPath);
    const image = await page.doc.embedPng(imageBytes);
    
    const position = this.calculateOriginalPosition(element, templateSize, page);
    const size = this.calculateOriginalSize(element, templateSize);
    
    page.drawImage(image, {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      rotate: element.rotation ? degrees(element.rotation) : undefined,
    });
    
    console.log(`✅ Successfully embedded image logo`);
  }

  /**
   * Calculate position using the original working method
   */
  private calculateOriginalPosition(element: any, templateSize: any, page: PDFPage): { x: number; y: number } {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // Convert canvas pixels to mm, then to points
    const pixelToMm = templateSize.width / templateSize.pixelWidth;
    const mmToPoints = 2.834;
    
    const xMm = element.x * pixelToMm;
    const yMm = element.y * pixelToMm;
    
    const xPoints = xMm * mmToPoints;
    const yPoints = yMm * mmToPoints;
    
    // PDF coordinate system: Y=0 at bottom, canvas Y=0 at top
    const finalY = pageHeight - yPoints;
    
    return { x: xPoints, y: finalY };
  }

  /**
   * Calculate size using the original working method
   */
  private calculateOriginalSize(element: any, templateSize: any): { width: number; height: number } {
    const pixelToMm = templateSize.width / templateSize.pixelWidth;
    const mmToPoints = 2.834;
    
    const widthMm = element.width * pixelToMm;
    const heightMm = element.height * pixelToMm;
    
    const widthPoints = widthMm * mmToPoints;
    const heightPoints = heightMm * mmToPoints;
    
    return { width: widthPoints, height: heightPoints };
  }
}