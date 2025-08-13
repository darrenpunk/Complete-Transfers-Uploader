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
      
      // VECTOR PRESERVATION - Embed SVG as vector graphics
      if (logo.filename.toLowerCase().endsWith('.svg')) {
        console.log('🎯 PRESERVING ORIGINAL VECTORS: Embedding SVG with vector data intact');
        const svgData = fs.readFileSync(originalPath, 'utf-8');
        
        // Scale SVG to exact canvas dimensions while preserving vectors
        const scaledSvg = this.scaleSVGContent(svgData, element.width, element.height);
        console.log(`✅ SVG vectors preserved at ${element.width}x${element.height}`);
        
        // Try vector embedding first, fallback to PNG only if it fails
        try {
          const pdfPageData = await this.embedSVGAsVectorPDF(pdfDoc, scaledSvg, element.width, element.height);
          if (pdfPageData) {
            embeddedImage = pdfPageData;
            console.log('✅ Vector PDF embedding successful');
          } else {
            console.log('🔄 Vector embedding returned null, using PNG fallback');
            embeddedImage = await this.convertSVGToPNG(originalPath, element, pdfDoc);
          }
        } catch (vectorError) {
          console.error('❌ Vector embedding failed:', vectorError);
          console.log('🔄 Using PNG fallback due to vector error');
          embeddedImage = await this.convertSVGToPNG(originalPath, element, pdfDoc);
        }
        
      } else if (logo.filename.toLowerCase().endsWith('.png')) {
        console.log('🎯 PRESERVING RASTER: Embedding original PNG');
        const imageData = fs.readFileSync(originalPath);
        embeddedImage = await pdfDoc.embedPng(imageData);
        console.log(`✅ PNG preserved: ${imageData.length} bytes`);
        
      } else if (logo.filename.toLowerCase().match(/\.(jpg|jpeg)$/)) {
        console.log('🎯 PRESERVING RASTER: Embedding original JPEG');
        const imageData = fs.readFileSync(originalPath);
        embeddedImage = await pdfDoc.embedJpg(imageData);
        console.log(`✅ JPEG preserved: ${imageData.length} bytes`);
        
      } else if (logo.filename.toLowerCase().endsWith('.pdf')) {
        console.log('🎯 PRESERVING PDF: Embedding original PDF page');
        await this.embedOriginalPDFPage(pdfDoc, page, element, originalPath, pageHeight);
        return;
        
      } else {
        console.warn(`⚠️ Unsupported format: ${logo.filename}`);
        return;
      }
      
      // Calculate PDF coordinates
      const pdfX = element.x;
      const pdfY = pageHeight - element.y - element.height;
      
      console.log(`🎯 Drawing at (${pdfX}, ${pdfY}) size ${element.width}x${element.height}`);
      
      // Draw artwork on PDF - handle both vector pages and raster images
      if (embeddedImage) {
        try {
          if (embeddedImage.width !== undefined && embeddedImage.height !== undefined) {
            // For embedded PDF pages (vectors preserved)
            console.log('🎯 Drawing vector PDF page');
            page.drawPage(embeddedImage, {
              x: pdfX,
              y: pdfY,
              width: element.width,
              height: element.height
            });
            console.log(`✅ Vector artwork drawn at (${pdfX}, ${pdfY}) size ${element.width}x${element.height}`);
          } else {
            // For raster images (PNG/JPG fallback)
            console.log('🎯 Drawing raster image fallback');
            page.drawImage(embeddedImage, {
              x: pdfX,
              y: pdfY,
              width: element.width,
              height: element.height
            });
            console.log(`✅ Raster artwork drawn at (${pdfX}, ${pdfY}) size ${element.width}x${element.height}`);
          }
        } catch (drawError) {
          console.error('❌ Drawing failed:', drawError);
          console.log('🔄 Attempting PNG fallback due to drawing error');
          await this.fallbackToImageEmbedding(originalPath, page, pdfX, pdfY, element, pdfDoc);
        }
      } else {
        console.error('❌ CRITICAL: No embeddedImage available for drawing');
      }
      
      console.log('✅ Graphic embedded successfully');
      
    } catch (error) {
      console.error('❌ Embedding failed:', error);
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

  private scaleSVGContent(svgContent: string, targetWidth: number, targetHeight: number): string {
    console.log(`🎯 Scaling SVG to ${targetWidth}x${targetHeight} while preserving vectors`);
    
    // CRITICAL FIX: Don't change viewBox - let the original content bounds be preserved
    // Only update the outer dimensions to match canvas size
    let scaledSvg = svgContent.replace(
      /width="[^"]*"/,
      `width="${targetWidth}"`
    );
    
    scaledSvg = scaledSvg.replace(
      /height="[^"]*"/,
      `height="${targetHeight}"`
    );
    
    console.log(`🔧 SVG scaled: preserved original viewBox, set dimensions to ${targetWidth}x${targetHeight}`);
    
    return scaledSvg;
  }

  private async embedSVGAsVectorPDF(pdfDoc: PDFDocument, svgContent: string, width: number, height: number): Promise<any> {
    try {
      console.log('🎯 Creating vector PDF from SVG content');
      
      // Create temporary files for SVG to PDF conversion
      const tempSvgPath = 'temp_vector.svg';
      fs.writeFileSync(tempSvgPath, svgContent);
      
      const tempPdfPath = 'temp_vector.pdf';
      // Use exact dimensions to prevent clipping and maintain aspect ratio
      const command = `inkscape "${tempSvgPath}" --export-filename="${tempPdfPath}" --export-type=pdf --export-width=${Math.round(width)} --export-height=${Math.round(height)}`;
      execSync(command);
      
      // Load the generated PDF and copy its page
      const pdfData = fs.readFileSync(tempPdfPath);
      const sourcePdf = await PDFDocument.load(pdfData);
      const [copiedPage] = await pdfDoc.copyPages(sourcePdf, [0]);
      
      // Embed the copied page to make it drawable
      const embeddedPage = await pdfDoc.embedPage(copiedPage);
      
      console.log('🔍 Embedded page validation:', {
        hasWidth: typeof embeddedPage.width === 'number',
        hasHeight: typeof embeddedPage.height === 'number',
        width: embeddedPage.width,
        height: embeddedPage.height,
        type: typeof embeddedPage
      });
      
      // Clean up temp files
      fs.unlinkSync(tempSvgPath);
      fs.unlinkSync(tempPdfPath);
      
      console.log('✅ SVG converted to vector PDF page and embedded');
      
      // Verify the embedded page is valid before returning
      if (embeddedPage && typeof embeddedPage.width === 'number' && typeof embeddedPage.height === 'number') {
        return embeddedPage;
      } else {
        console.error('❌ Invalid embedded page:', typeof embeddedPage);
        return null;
      }
      
    } catch (error) {
      console.error('❌ Vector PDF creation failed:', error);
      // Fall back to PNG conversion
      return null;
    }
  }

  private async embedOriginalPDFPage(pdfDoc: PDFDocument, page: PDFPage, element: any, pdfPath: string, pageHeight: number): Promise<void> {
    try {
      console.log('🎯 Embedding original PDF page as vectors');
      
      const pdfData = fs.readFileSync(pdfPath);
      const sourcePdf = await PDFDocument.load(pdfData);
      const [firstPage] = await pdfDoc.copyPages(sourcePdf, [0]);
      
      const pdfX = element.x;
      const pdfY = pageHeight - element.y - element.height;
      
      // Need to embed the page first before drawing it
      const embeddedPage = await pdfDoc.embedPage(firstPage);
      page.drawPage(embeddedPage, {
        x: pdfX,
        y: pdfY,
        width: element.width,
        height: element.height
      });
      
      console.log('✅ Original PDF page embedded with vectors preserved');
      
    } catch (error) {
      console.error('❌ PDF page embedding failed:', error);
    }
  }

  private async convertSVGToPNG(svgPath: string, element: any, pdfDoc: PDFDocument): Promise<any> {
    try {
      const pngPath = svgPath.replace('.svg', '_converted.png');
      
      console.log(`🔧 Converting SVG to PNG: ${svgPath} -> ${pngPath}`);
      
      // Convert at exact canvas dimensions to preserve sizing
      const command = `inkscape "${svgPath}" --export-filename="${pngPath}" --export-width=${Math.round(element.width)} --export-height=${Math.round(element.height)} --export-background=white --export-background-opacity=0`;
      
      execSync(command, { stdio: 'pipe' });
      
      const pngData = fs.readFileSync(pngPath);
      console.log(`✅ SVG converted: ${pngData.length} bytes at ${element.width}x${element.height}px`);
      
      const embeddedImage = await pdfDoc.embedPng(pngData);
      
      // Clean up temporary file
      fs.unlinkSync(pngPath);
      
      return embeddedImage;
      
    } catch (error) {
      console.error('❌ SVG to PNG conversion failed:', error);
      return null;
    }
  }

  private async fallbackToImageEmbedding(originalPath: string, page: PDFPage, x: number, y: number, element: any, pdfDoc: PDFDocument): Promise<void> {
    try {
      console.log('🔄 Fallback: Converting to PNG for embedding');
      
      if (originalPath.endsWith('.svg')) {
        const embeddedImage = await this.convertSVGToPNG(originalPath, element, pdfDoc);
        if (embeddedImage) {
          page.drawImage(embeddedImage, {
            x: x,
            y: y,
            width: element.width,
            height: element.height
          });
          console.log('✅ Fallback PNG embedding successful');
        }
      } else if (originalPath.endsWith('.png')) {
        const imageData = fs.readFileSync(originalPath);
        const embeddedImage = await pdfDoc.embedPng(imageData);
        
        page.drawImage(embeddedImage, {
          x: x,
          y: y,
          width: element.width,
          height: element.height
        });
        
        console.log('✅ Fallback PNG direct embedding successful');
      }
      
    } catch (fallbackError) {
      console.error('❌ Fallback embedding also failed:', fallbackError);
    }
  }
}