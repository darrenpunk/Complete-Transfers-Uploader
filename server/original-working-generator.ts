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
    
    // Log detailed project data for debugging
    console.log(`🔍 Project data:`, {
      projectId: data.projectId,
      templateSize: data.templateSize?.name,
      canvasElements: data.canvasElements.length,
      logos: data.logos.length,
      garmentColor: data.garmentColor
    });
    
    if (data.canvasElements.length === 0) {
      console.warn(`⚠️ No canvas elements found - generating template-only PDF`);
    }
    
    if (data.logos.length === 0) {
      console.warn(`⚠️ No logos found - PDF will only contain background/template`);
    }

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

      // PAGE 2: Artwork on colored garment background with labels
      console.log('📄 Creating Page 2: Garment Background + Color Labels');
      const page2 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
      
      // Add garment color background to page 2 (like user's working PDFs)
      if (data.garmentColor && data.garmentColor !== 'none') {
        this.addGarmentBackground(page2, data.garmentColor, templateWidthPoints, templateHeightPoints);
      } else {
        // Default white background if no garment color specified
        page2.drawRectangle({
          x: 0,
          y: 0,
          width: templateWidthPoints,
          height: templateHeightPoints,
          color: rgb(1, 1, 1),
        });
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
   * Add garment color background and labels (matching user's working PDF format)
   */
  private addGarmentBackground(page: PDFPage, garmentColor: string, width: number, height: number): void {
    // Import actual garment colors from the system
    const garmentColors = this.getGarmentColorData();
    const colorInfo = garmentColors.find(c => c.name.toLowerCase() === garmentColor.toLowerCase());
    
    if (colorInfo) {
      // Convert hex to RGB
      const hex = colorInfo.hex;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: height,
        color: rgb(r, g, b),
      });
      
      // Add garment color label and CMYK values (bottom of page like in user examples)
      this.addGarmentColorLabels(page, [colorInfo], width, height);
      
      console.log(`🎨 Applied garment background: ${garmentColor} (${hex})`);
    } else {
      // Default to white if color not found
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: height,
        color: rgb(1, 1, 1),
      });
      console.log(`⚠️ Color not found, using white background for: ${garmentColor}`);
    }
  }

  /**
   * Add garment color labels and CMYK values (like in user's working PDFs)
   */
  private addGarmentColorLabels(page: PDFPage, colors: any[], width: number, height: number): void {
    // Add labels at bottom of page matching user's format
    let labelText = 'Garment Colors: ';
    
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      if (i > 0) labelText += '   ';
      labelText += `${color.name}`;
    }
    
    // Add color hex values on next line
    let hexText = '';
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      if (i > 0) hexText += '   ';
      hexText += color.hex;
    }
    
    // Draw labels at bottom of page
    page.drawText(labelText, {
      x: 20,
      y: 40,
      size: 12,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(hexText, {
      x: 20,
      y: 20,
      size: 10,
      color: rgb(0, 0, 0),
    });
    
    console.log(`🏷️ Added garment color labels: ${labelText}`);
  }

  /**
   * Get garment color data (basic set matching common colors)
   */
  private getGarmentColorData() {
    return [
      { name: 'White', hex: '#FFFFFF', cmyk: { c: 0, m: 0, y: 0, k: 0 } },
      { name: 'Black', hex: '#171816', cmyk: { c: 78, m: 68, y: 62, k: 91 } },
      { name: 'Hi Viz', hex: '#F0F42A', cmyk: { c: 5, m: 0, y: 95, k: 0 } },
      { name: 'Red', hex: '#762009', cmyk: { c: 18, m: 95, y: 68, k: 56 } },
      { name: 'Green', hex: '#3C8A35', cmyk: { c: 71, m: 0, y: 100, k: 15 } },
      { name: 'Navy', hex: '#263147', cmyk: { c: 95, m: 72, y: 15, k: 67 } },
      { name: 'Gray', hex: '#BCBFBB', cmyk: { c: 8, m: 5, y: 7, k: 16 } },
    ];
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
    if (canvasElements.length === 0) {
      console.log(`📄 No canvas elements to embed on this page`);
      return;
    }
    
    if (logos.length === 0) {
      console.warn(`⚠️ No logos available to embed`);
      return;
    }
    
    console.log(`🎯 Embedding ${canvasElements.length} elements on page`);
    
    for (let i = 0; i < canvasElements.length; i++) {
      const element = canvasElements[i];
      
      // Find matching logo
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) {
        console.warn(`⚠️ No logo found for element ${element.id} (logoId: ${element.logoId})`);
        console.log(`🔍 Available logos:`, logos.map(l => `${l.id}:${l.filename}`).join(', '));
        continue;
      }

      console.log(`🎯 Processing logo ${i + 1}/${canvasElements.length}: ${logo.filename} (ID: ${logo.id})`);
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
        const size = this.calculateOriginalSize(element, templateSize, page);
        
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
    const size = this.calculateOriginalSize(element, templateSize, page);
    
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
    
    console.log(`📊 Position calculation debug:`, {
      elementX: element.x,
      elementY: element.y,
      elementWidth: element.width,
      elementHeight: element.height,
      pageWidth,
      pageHeight,
      templatePixelWidth: templateSize.pixelWidth,
      templatePixelHeight: templateSize.pixelHeight,
      templateMmWidth: templateSize.width,
      templateMmHeight: templateSize.height
    });
    
    // Convert canvas coordinates to PDF points directly
    // Canvas coordinate system: (0,0) at top-left
    // PDF coordinate system: (0,0) at bottom-left
    
    // Scale factor from canvas pixels to PDF points
    const scaleX = pageWidth / templateSize.pixelWidth;
    const scaleY = pageHeight / templateSize.pixelHeight;
    
    // Convert canvas position to PDF position
    const pdfX = element.x * scaleX;
    // Flip Y coordinate: canvas Y=0 at top, PDF Y=0 at bottom
    const pdfY = pageHeight - (element.y * scaleY) - (element.height * scaleY);
    
    console.log(`📐 Coordinate conversion:`, {
      canvasX: element.x,
      canvasY: element.y,
      scaleX: scaleX.toFixed(4),
      scaleY: scaleY.toFixed(4),
      pdfX: pdfX.toFixed(1),
      pdfY: pdfY.toFixed(1)
    });
    
    return { x: pdfX, y: pdfY };
  }

  /**
   * Calculate size using the original working method
   */
  private calculateOriginalSize(element: any, templateSize: any, page: PDFPage): { width: number; height: number } {
    // Use the same scale factors as position calculation for consistency
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    const scaleX = pageWidth / templateSize.pixelWidth;
    const scaleY = pageHeight / templateSize.pixelHeight;
    
    const width = element.width * scaleX;
    const height = element.height * scaleY;
    
    console.log(`📏 Size calculation:`, {
      elementWidth: element.width,
      elementHeight: element.height,
      scaleX: scaleX.toFixed(4),
      scaleY: scaleY.toFixed(4),
      finalWidth: width.toFixed(1),
      finalHeight: height.toFixed(1)
    });
    
    return { width, height };
  }
}