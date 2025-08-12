import { PDFDocument, PDFPage, rgb, cmyk } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class PrintReadyPDFGenerator {
  async generatePDF(params: {
    projectId: string;
    canvasElements: any[];
    logos: any[];
    templateSize: any;
    project: any;
    garmentColor: string;
    extraGarmentColors: string[];
    quantity: number;
  }): Promise<Buffer> {
    try {
      console.log('📄 PRINT-READY PDF: Starting with original file preservation');
      
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Calculate exact page dimensions
      const pageWidth = params.templateSize.width * 2.834;  // mm to points
      const pageHeight = params.templateSize.height * 2.834;
      
      console.log(`📐 Page size: ${pageWidth} x ${pageHeight} points (${params.templateSize.name})`);
      
      // PAGE 1: Graphics on white background (as per canvas)
      const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
      console.log('📄 Page 1: Canvas reproduction (white background)');
      
      // Embed all graphics with exact canvas positioning
      for (const element of params.canvasElements) {
        const logo = params.logos.find(l => l.id === element.logoId);
        if (!logo) {
          console.warn(`⚠️ Logo not found for element ${element.id}`);
          continue;
        }
        
        console.log(`🎯 Processing: ${logo.originalName || logo.filename}`);
        console.log(`📍 Canvas position: (${element.x}, ${element.y}) size ${element.width}x${element.height}`);
        
        await this.embedOriginalGraphic(pdfDoc, page1, element, logo, pageHeight);
      }
      
      // PAGE 2: Same graphics + garment color background + labels
      const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
      console.log('📄 Page 2: With garment background and labels');
      
      // Add garment background
      await this.addGarmentBackground(page2, params.garmentColor);
      
      // Embed same graphics on page 2
      for (const element of params.canvasElements) {
        const logo = params.logos.find(l => l.id === element.logoId);
        if (logo) {
          await this.embedOriginalGraphic(pdfDoc, page2, element, logo, pageHeight);
        }
      }
      
      // Add garment color labels
      await this.addGarmentLabels(page2, params);
      
      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Print-ready PDF generated: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Print-ready PDF generation failed:', error);
      throw new Error(`Print-ready PDF failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async embedOriginalGraphic(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any,
    pageHeight: number
  ): Promise<void> {
    try {
      const originalPath = path.join('uploads', logo.filename);
      
      if (!fs.existsSync(originalPath)) {
        console.error(`❌ File not found: ${originalPath}`);
        return;
      }
      
      console.log(`📂 Processing: ${logo.filename}`);
      
      let embeddedImage;
      
      // SIMPLIFIED APPROACH - Based on working direct test
      if (logo.filename.toLowerCase().endsWith('.svg')) {
        console.log('🔧 Converting SVG to PNG...');
        const pngPath = originalPath.replace('.svg', '_embed.png');
        const command = `inkscape "${originalPath}" --export-filename="${pngPath}" --export-width=${Math.round(element.width)} --export-height=${Math.round(element.height)} --export-background=white --export-background-opacity=0`;
        
        execSync(command);
        const pngData = fs.readFileSync(pngPath);
        console.log(`✅ SVG converted: ${pngData.length} bytes`);
        
        embeddedImage = await pdfDoc.embedPng(pngData);
        fs.unlinkSync(pngPath); // cleanup
        
      } else if (logo.filename.toLowerCase().endsWith('.png')) {
        const imageData = fs.readFileSync(originalPath);
        embeddedImage = await pdfDoc.embedPng(imageData);
        
      } else if (logo.filename.toLowerCase().match(/\.(jpg|jpeg)$/)) {
        const imageData = fs.readFileSync(originalPath);
        embeddedImage = await pdfDoc.embedJpg(imageData);
        
      } else {
        console.warn(`⚠️ Unsupported format: ${logo.filename}`);
        return;
      }
      
      // Calculate PDF coordinates
      const pdfX = element.x;
      const pdfY = pageHeight - element.y - element.height;
      
      console.log(`🎯 Drawing at (${pdfX}, ${pdfY}) size ${element.width}x${element.height}`);
      
      // Draw image on PDF
      page.drawImage(embeddedImage, {
        x: pdfX,
        y: pdfY,
        width: element.width,
        height: element.height
      });
      
      console.log('✅ Graphic embedded successfully');
      
    } catch (error) {
      console.error('❌ Embedding failed:', error);
    }
  }

  private async convertSVGToPNG(svgPath: string, element: any, pdfDoc: PDFDocument): Promise<any> {
    try {
      const pngPath = svgPath.replace('.svg', '_original.png');
      
      console.log(`🔧 DEBUG: Converting SVG to PNG: ${svgPath} -> ${pngPath}`);
      
      // Convert at exact canvas dimensions to preserve sizing
      const command = `inkscape "${svgPath}" --export-filename="${pngPath}" --export-width=${Math.round(element.width)} --export-height=${Math.round(element.height)} --export-background=white --export-background-opacity=0`;
      
      console.log(`🔧 DEBUG: Inkscape command: ${command}`);
      
      try {
        execSync(command, { stdio: 'pipe' });
      } catch (inkscapeError) {
        console.error(`❌ Inkscape conversion failed: ${inkscapeError}`);
        throw inkscapeError;
      }
      
      const pngData = fs.readFileSync(pngPath);
      console.log(`✅ SVG converted: ${pngData.length} bytes at ${element.width}x${element.height}px`);
      
      if (pngData.length === 0) {
        throw new Error('PNG conversion produced empty file');
      }
      
      console.log(`🔧 DEBUG: Embedding ${pngData.length} bytes PNG into PDF document...`);
      
      // Embed PNG into the actual PDF document (not a temp one!)
      const embeddedImage = await pdfDoc.embedPng(pngData);
      console.log(`🔧 DEBUG: PNG embedded successfully, dimensions: ${embeddedImage.width}x${embeddedImage.height}`);
      
      // Clean up temporary file
      fs.unlinkSync(pngPath);
      
      return embeddedImage;
      
    } catch (error) {
      console.error('❌ SVG conversion failed:', error);
      throw error;
    }
  }

  private async embedPDFGraphic(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any,
    pageHeight: number
  ): Promise<void> {
    try {
      console.log(`📄 Embedding original PDF: ${logo.filename}`);
      
      const pdfPath = path.join('uploads', logo.filename);
      const pdfData = fs.readFileSync(pdfPath);
      
      // Import original PDF to preserve all qualities
      const originalPdf = await PDFDocument.load(pdfData);
      const [firstPage] = await pdfDoc.copyPages(originalPdf, [0]);
      
      // Scale and position the imported page to match canvas element
      const pdfX = element.x;
      const pdfY = pageHeight - element.y - element.height;
      
      console.log(`🎯 PDF positioning: (${pdfX}, ${pdfY}) size ${element.width}x${element.height}`);
      
      // This requires a different approach for PDF pages - embed as form
      const form = await pdfDoc.embedPage(firstPage);
      
      page.drawPage(form, {
        x: pdfX,
        y: pdfY,
        width: element.width,
        height: element.height
      });
      
      console.log('✅ Original PDF embedded preserving all properties');
      
    } catch (error) {
      console.error('❌ PDF embedding failed:', error);
      // Fallback to converting PDF to PNG
      await this.convertPDFToPNG(logo, element, pdfDoc, page, pageHeight);
    }
  }

  private async convertPDFToPNG(logo: any, element: any, pdfDoc: PDFDocument, page: PDFPage, pageHeight: number): Promise<void> {
    try {
      const pdfPath = path.join('uploads', logo.filename);
      const pngPath = pdfPath.replace('.pdf', '_print.png');
      
      // Convert PDF to PNG at exact canvas dimensions
      const command = `pdftoppm "${pdfPath}" -png -f 1 -l 1 -scale-to-x ${Math.round(element.width)} -scale-to-y ${Math.round(element.height)} > "${pngPath}"`;
      
      execSync(command, { stdio: 'ignore' });
      
      const pngData = fs.readFileSync(pngPath);
      const embeddedImage = await pdfDoc.embedPng(pngData);
      
      const pdfX = element.x;
      const pdfY = pageHeight - element.y - element.height;
      
      page.drawImage(embeddedImage, {
        x: pdfX,
        y: pdfY,
        width: element.width,
        height: element.height
      });
      
      fs.unlinkSync(pngPath);
      console.log('✅ PDF converted to PNG with exact dimensions');
      
    } catch (error) {
      console.error('❌ PDF to PNG conversion failed:', error);
    }
  }

  private async addGarmentBackground(page: PDFPage, garmentColor: string): Promise<void> {
    try {
      const rgbColor = this.hexToRgb(garmentColor);
      
      page.drawRectangle({
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: page.getHeight(),
        color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255)
      });
      
      console.log(`🎨 Garment background applied: ${garmentColor}`);
      
    } catch (error) {
      console.error('❌ Failed to add garment background:', error);
    }
  }

  private async addGarmentLabels(page: PDFPage, params: any): Promise<void> {
    try {
      const fontSize = 12;
      const margin = 50;
      
      // Main garment color label
      page.drawText(`Main Garment: ${params.garmentColor}`, {
        x: margin,
        y: page.getHeight() - margin - 20,
        size: fontSize,
        color: rgb(0, 0, 0)
      });
      
      // Extra garment colors
      if (params.extraGarmentColors.length > 0) {
        params.extraGarmentColors.forEach((color: string, index: number) => {
          page.drawText(`Extra Color ${index + 1}: ${color}`, {
            x: margin,
            y: page.getHeight() - margin - 40 - (index * 20),
            size: fontSize,
            color: rgb(0, 0, 0)
          });
        });
      }
      
      // Project info
      page.drawText(`Project: ${params.project.name || 'Untitled'}`, {
        x: margin,
        y: margin + 40,
        size: fontSize,
        color: rgb(0, 0, 0)
      });
      
      page.drawText(`Quantity: ${params.quantity}`, {
        x: margin,
        y: margin + 20,
        size: fontSize,
        color: rgb(0, 0, 0)
      });
      
      console.log('✅ Garment labels added to page 2');
      
    } catch (error) {
      console.error('❌ Failed to add garment labels:', error);
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }
}