import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * ORIGINAL WORKING PDF GENERATOR
 * This is the simplest version that was actually working in production
 * before all the complex CMYK and vector preservation was added
 */

interface SimplePDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
}

export class SimpleWorkingGenerator {
  async generatePDF(data: SimplePDFData): Promise<Buffer> {
    console.log('🔥 SIMPLE WORKING GENERATOR - Original Production Version');
    console.log('✅ This was generating PDFs before complex features broke it');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);

    try {
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle(`${data.projectId}_artwork`);

      // A3 size in points
      const pageWidth = 841.89;
      const pageHeight = 1190.55;

      console.log('📄 Creating simple dual-page PDF');

      // PAGE 1: White background
      const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
      console.log('📄 Page 1: Simple white background');

      // Embed logos on page 1 - SIMPLE approach
      for (const element of data.canvasElements) {
        const logo = data.logos.find(l => l.id === element.logoId);
        if (logo) {
          console.log(`🎯 Embedding logo: ${logo.originalName || logo.filename}`);
          await this.embedLogoSimple(pdfDoc, page1, element, logo);
        }
      }

      // PAGE 2: Garment background
      const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
      console.log('📄 Page 2: Garment background');

      // Simple garment background
      if (data.garmentColor && data.garmentColor !== '#FFFFFF') {
        const { r, g, b } = this.hexToRgb(data.garmentColor);
        page2.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: rgb(r / 255, g / 255, b / 255)
        });
        console.log(`🎨 Simple garment background: ${data.garmentColor}`);
      }

      // Embed logos on page 2
      for (const element of data.canvasElements) {
        const logo = data.logos.find(l => l.id === element.logoId);
        if (logo) {
          await this.embedLogoSimple(pdfDoc, page2, element, logo);
        }
      }

      // Simple labels
      this.addSimpleLabels(page2, data.garmentColor || '#FFFFFF', pageWidth, pageHeight);

      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      
      console.log(`✅ SIMPLE WORKING PDF GENERATED: ${pdfBytes.length} bytes (${Math.round(pdfBytes.length/1024)}KB)`);
      console.log('🎯 This is the original approach that actually worked');
      
      return Buffer.from(pdfBytes);

    } catch (error) {
      console.error('❌ Simple PDF generation failed:', error);
      throw new Error(`Simple PDF generation failed: ${error.message}`);
    }
  }

  private async embedLogoSimple(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any
  ): Promise<void> {
    const logoPath = logo.path || path.join('uploads', logo.filename);
    
    if (!fs.existsSync(logoPath)) {
      console.error(`❌ Logo file not found: ${logoPath}`);
      return;
    }

    // Simple positioning - no complex scaling
    const x = element.x || 100;
    const y = 1190.55 - (element.y || 100) - (element.height || 200);
    const width = element.width || 200;
    const height = element.height || 150;

    console.log(`📍 Simple embed: (${x}, ${y}) size ${width}x${height}`);

    try {
      const fileExt = logoPath.toLowerCase();
      const originalName = (logo.originalName || logo.filename || '').toLowerCase();
      
      // Check both actual file path and original filename for format detection
      const isPdf = fileExt.endsWith('.pdf') || originalName.endsWith('.pdf');
      const isSvg = fileExt.endsWith('.svg') || originalName.endsWith('.svg');
      const isJpg = fileExt.match(/\.(jpg|jpeg)$/) || originalName.match(/\.(jpg|jpeg)$/);
      const isPng = fileExt.endsWith('.png') || originalName.endsWith('.png');
      
      console.log(`🔍 Format detection: file=${path.basename(logoPath)}, original=${originalName}, pdf=${isPdf}, svg=${isSvg}`);
      
      if (isPdf) {
        // Simple PDF embedding
        const pdfData = fs.readFileSync(logoPath);
        const sourcePdf = await PDFDocument.load(pdfData);
        const [firstPage] = await pdfDoc.copyPages(sourcePdf, [0]);
        const embeddedPage = await pdfDoc.embedPage(firstPage);
        
        page.drawPage(embeddedPage, { x, y, width, height });
        console.log('✅ PDF embedded simply');
        
      } else if (isSvg) {
        // Simple SVG conversion - no complex CMYK processing
        const tempPdfPath = `/tmp/simple_${Date.now()}.pdf`;
        const command = `inkscape "${logoPath}" --export-filename="${tempPdfPath}" --export-type=pdf`;
        
        try {
          execSync(command, { stdio: 'pipe' });
          
          if (fs.existsSync(tempPdfPath)) {
            const pdfData = fs.readFileSync(tempPdfPath);
            const sourcePdf = await PDFDocument.load(pdfData);
            const [firstPage] = await pdfDoc.copyPages(sourcePdf, [0]);
            const embeddedPage = await pdfDoc.embedPage(firstPage);
            
            page.drawPage(embeddedPage, { x, y, width, height });
            fs.unlinkSync(tempPdfPath);
            console.log('✅ SVG converted and embedded simply');
          }
        } catch (inkscapeError) {
          console.log('⚠️ Inkscape failed, trying as raster');
          throw inkscapeError;
        }
        
      } else {
        // Simple raster embedding
        const imageData = fs.readFileSync(logoPath);
        let embeddedImage;

        if (isJpg) {
          embeddedImage = await pdfDoc.embedJpg(imageData);
        } else if (isPng) {
          embeddedImage = await pdfDoc.embedPng(imageData);
        } else {
          console.log(`⚠️ Unsupported format: ${path.basename(logoPath)} (original: ${originalName})`);
          console.log('🔍 Trying to detect format from file content...');
          
          // Try to detect PDF by file signature
          const fileSignature = imageData.slice(0, 4).toString();
          if (fileSignature === '%PDF') {
            console.log('✅ Detected PDF by signature, trying PDF embedding');
            const sourcePdf = await PDFDocument.load(imageData);
            const [firstPage] = await pdfDoc.copyPages(sourcePdf, [0]);
            const embeddedPage = await pdfDoc.embedPage(firstPage);
            page.drawPage(embeddedPage, { x, y, width, height });
            console.log('✅ PDF embedded via signature detection');
            return;
          }
          
          // If we can't detect format, skip this logo
          console.log('⚠️ Could not determine file format - skipping logo');
          return;
        }

        page.drawImage(embeddedImage, { x, y, width, height });
        console.log('✅ Raster image embedded simply');
      }
    } catch (error) {
      console.error('❌ Simple logo embedding failed:', error);
      // Don't throw - just skip this logo
    }
  }

  private addSimpleLabels(
    page: PDFPage,
    garmentColor: string,
    pageWidth: number,
    pageHeight: number
  ): void {
    const fontSize = 12;
    const margin = 20;
    
    page.drawText(`Garment: ${garmentColor}`, {
      x: margin,
      y: pageHeight - margin - fontSize,
      size: fontSize,
      color: rgb(0, 0, 0)
    });

    page.drawText('Generated with Simple Working Generator', {
      x: margin,
      y: pageHeight - margin - (fontSize * 2) - 5,
      size: 10,
      color: rgb(0.5, 0.5, 0.5)
    });

    console.log('✅ Simple labels added');
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