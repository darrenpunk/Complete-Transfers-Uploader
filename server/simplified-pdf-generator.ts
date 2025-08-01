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
      console.log(`📦 Converting SVG to PDF with original colors (no color changes): ${logo.filename}`);
      
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.pdf`);
      
      // Check if SVG has embedded images for special handling
      const svgContent = fs.readFileSync(uploadPath, 'utf8');
      const { SVGEmbeddedImageHandler } = await import('./svg-embedded-image-handler');
      const hasEmbeddedImages = SVGEmbeddedImageHandler.hasEmbeddedImages(svgContent);
      
      if (hasEmbeddedImages) {
        console.log(`📌 SVG contains embedded images, using special handler for transparency`);
        const converted = await SVGEmbeddedImageHandler.convertToPDFWithTransparency(uploadPath, tempPdfPath);
        if (!converted) {
          // Fallback to standard conversion
          await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${uploadPath}"`);
        }
      } else {
        // Standard conversion for SVGs without embedded images
        await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${uploadPath}"`);
      }
      
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
    console.log(`🎨 Applying color changes to ${logo.filename}`);
    
    // For SVG files with color changes
    if (logo.mimeType === 'image/svg+xml') {
      console.log(`🎨 Converting SVG to PDF with color modifications: ${logo.filename}`);
      
      // First, we need to apply color changes and save the modified SVG
      const uploadPath = path.join(process.cwd(), 'uploads', logo.filename);
      const modifiedSvgPath = path.join(process.cwd(), 'uploads', `${element.id}_modified.svg`);
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.pdf`);
      
      // Apply color changes to SVG
      let svgContent = fs.readFileSync(uploadPath, 'utf8');
      
      if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
        console.log(`🎨 Applying color overrides:`, element.colorOverrides);
        
        // Get SVG color analysis for format mapping
        const svgAnalysis = logo.svgColors as any;
        let originalFormatOverrides: Record<string, string> = {};
        
        if (svgAnalysis && svgAnalysis.colors && Array.isArray(svgAnalysis.colors)) {
          Object.entries(element.colorOverrides as Record<string, string>).forEach(([standardizedColor, newColor]) => {
            // Find the matching color in the SVG analysis
            const colorInfo = svgAnalysis.colors.find((c: any) => c.originalColor === standardizedColor);
            if (colorInfo && colorInfo.originalFormat) {
              originalFormatOverrides[colorInfo.originalFormat] = newColor;
            } else {
              // Fallback to standardized color if original format not found
              originalFormatOverrides[standardizedColor] = newColor;
            }
          });
        } else {
          // Fallback if no SVG color analysis available
          originalFormatOverrides = element.colorOverrides as Record<string, string>;
        }
        
        // Apply color changes
        const { applySVGColorChanges } = await import('./svg-color-utils');
        svgContent = applySVGColorChanges(uploadPath, originalFormatOverrides);
        
        // Save the modified SVG
        fs.writeFileSync(modifiedSvgPath, svgContent);
      } else {
        // No color changes, just copy the original
        fs.copyFileSync(uploadPath, modifiedSvgPath);
      }
      
      // Check if SVG has embedded images for special handling
      const svgContent = fs.readFileSync(modifiedSvgPath, 'utf8');
      const { SVGEmbeddedImageHandler } = await import('./svg-embedded-image-handler');
      const hasEmbeddedImages = SVGEmbeddedImageHandler.hasEmbeddedImages(svgContent);
      
      if (hasEmbeddedImages) {
        console.log(`📌 SVG contains embedded images, using special handler for transparency`);
        const converted = await SVGEmbeddedImageHandler.convertToPDFWithTransparency(modifiedSvgPath, tempPdfPath);
        if (!converted) {
          // Fallback to standard conversion
          await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${modifiedSvgPath}"`);
        }
      } else {
        // Standard conversion for SVGs without embedded images
        await execAsync(`rsvg-convert -f pdf -o "${tempPdfPath}" "${modifiedSvgPath}"`);
      }
      
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
        
        // Clean up temp files
        fs.unlinkSync(tempPdfPath);
        if (fs.existsSync(modifiedSvgPath)) {
          fs.unlinkSync(modifiedSvgPath);
        }
      }
    } else {
      // For non-SVG files, use original embedding
      await this.embedOriginalFile(pdfDoc, page, element, logo, templateSize);
    }
  }

  private calculateScale(element: any, templateSize: any): number {
    // The element dimensions are already in mm from the database
    // We need to convert mm to points: 1mm = 2.834 points
    const mmToPoints = 2.834;
    return mmToPoints;
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