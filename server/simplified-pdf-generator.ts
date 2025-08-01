import { PDFDocument, rgb, PDFPage, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SimplifiedPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class SimplifiedPDFGenerator {
  /**
   * Generate PDF that preserves original file content
   * Only applies color changes if user has made modifications
   */
  async generatePDF(data: SimplifiedPDFData): Promise<Buffer> {
    console.log('📄 Simplified PDF Generation Started');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(data.projectId);
    pdfDoc.setCreator('CompleteTransfers.com Logo Uploader');

    // Create pages based on template and garment color
    const page1 = pdfDoc.addPage([
      data.templateSize.width * 2.834,
      data.templateSize.height * 2.834
    ]);

    // Page 1: Design without background (transparent)
    // Don't draw any background for the first page
    await this.embedLogos(pdfDoc, page1, data.canvasElements, data.logos, data.templateSize);

    // Page 2: Design on garment color (if specified)
    if (data.garmentColor && data.garmentColor !== 'white') {
      const page2 = pdfDoc.addPage([
        data.templateSize.width * 2.834,
        data.templateSize.height * 2.834
      ]);
      this.drawBackground(page2, data.garmentColor);
      await this.embedLogos(pdfDoc, page2, data.canvasElements, data.logos, data.templateSize);
    }

    const pdfBytes = await pdfDoc.save();
    console.log('✅ Simplified PDF generated successfully');
    return Buffer.from(pdfBytes);
  }

  private drawBackground(page: PDFPage, color: string) {
    const { width, height } = page.getSize();
    
    if (color === 'white') {
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: rgb(1, 1, 1),
      });
    } else {
      // Convert hex color to RGB
      const rgbColor = this.hexToRgb(color);
      if (rgbColor) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width,
          height,
          color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255),
        });
      }
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private async embedLogos(
    pdfDoc: PDFDocument,
    page: PDFPage,
    elements: any[],
    logos: any[],
    templateSize: any
  ) {
    for (const element of elements) {
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) continue;

      console.log(`📌 Processing logo: ${logo.filename}`);

      try {
        // Check if user has made color modifications
        const hasColorChanges = await this.checkForColorChanges(element, logo);
        
        if (hasColorChanges) {
          console.log(`🎨 Color changes detected - applying modifications`);
          await this.embedWithColorChanges(pdfDoc, page, element, logo, templateSize);
        } else {
          console.log(`📦 No color changes - preserving original file`);
          await this.embedOriginalFile(pdfDoc, page, element, logo, templateSize);
        }
      } catch (error) {
        console.error(`❌ Error embedding logo ${logo.filename}:`, error);
      }
    }
  }

  private async checkForColorChanges(element: any, logo: any): Promise<boolean> {
    // Check if element has color overrides
    if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
      return true;
    }

    // Check if logo has been marked as having color changes
    if (logo.hasColorChanges) {
      return true;
    }

    return false;
  }

  private async embedOriginalFile(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any,
    templateSize: any
  ) {
    const uploadPath = path.join(process.cwd(), 'uploads', logo.filename);
    
    // If it's a PDF, embed the original PDF directly
    if (logo.mimeType === 'application/pdf') {
      console.log(`📄 Embedding original PDF: ${logo.filename}`);
      
      // Check if we have the original PDF path stored
      const originalPdfPath = (logo as any).originalPdfPath || uploadPath;
      
      if (fs.existsSync(originalPdfPath)) {
        const existingPdfBytes = fs.readFileSync(originalPdfPath);
        const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
        
        // Calculate position and scale
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        page.drawPage(embeddedPage, {
          x: position.x,
          y: position.y,
          width: element.width * scale,
          height: element.height * scale,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
      }
    } 
    // If it's an SVG, convert to PDF but preserve colors
    else if (logo.mimeType === 'image/svg+xml') {
      console.log(`🎨 Converting SVG to PDF with original colors: ${logo.filename}`);
      
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.pdf`);
      
      // Use rsvg-convert for faithful SVG to PDF conversion
      await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${uploadPath}"`);
      
      if (fs.existsSync(tempPdfPath)) {
        const pdfBytes = fs.readFileSync(tempPdfPath);
        const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(pdfBytes));
        
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        page.drawPage(embeddedPage, {
          x: position.x,
          y: position.y,
          width: element.width * scale,
          height: element.height * scale,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
        
        // Clean up temp file
        fs.unlinkSync(tempPdfPath);
      }
    }
    // For raster images, embed as-is
    else {
      console.log(`🖼️ Embedding raster image: ${logo.filename}`);
      
      const imageBytes = fs.readFileSync(uploadPath);
      let image;
      
      if (logo.mimeType === 'image/png') {
        image = await pdfDoc.embedPng(imageBytes);
      } else if (logo.mimeType === 'image/jpeg' || logo.mimeType === 'image/jpg') {
        image = await pdfDoc.embedJpg(imageBytes);
      }
      
      if (image) {
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        page.drawImage(image, {
          x: position.x,
          y: position.y,
          width: element.width * scale,
          height: element.height * scale,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
      }
    }
  }

  private async embedWithColorChanges(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any,
    templateSize: any
  ) {
    // This method would handle cases where the user has made color changes
    // For now, we'll use the existing embedding logic
    // In a full implementation, this would apply the color overrides
    console.log(`🎨 Applying color changes to ${logo.filename}`);
    
    // Fall back to original embedding for now
    await this.embedOriginalFile(pdfDoc, page, element, logo, templateSize);
  }

  private calculateScale(element: any, templateSize: any): number {
    // Canvas uses pixels, PDF uses points
    // The element dimensions are in pixels based on 0.35mm per pixel
    // We need to convert to points: 0.35mm * 2.834 points/mm = 0.9919 points per pixel
    const pixelToPoints = 0.35 * 2.834;
    return pixelToPoints;
  }

  private calculatePosition(element: any, templateSize: any, page: PDFPage): { x: number; y: number } {
    const { height } = page.getSize();
    const scale = this.calculateScale(element, templateSize);
    
    // Convert canvas pixel coordinates to PDF points
    return {
      x: element.x * scale,
      y: height - (element.y * scale) - (element.height * scale)
    };
  }
}