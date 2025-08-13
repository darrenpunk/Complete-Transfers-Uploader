import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { Logo, CanvasElement, TemplateSize } from '@shared/schema';

export interface SimpleWorkingPDFData {
  projectId: string;
  templateSize: TemplateSize;
  canvasElements: CanvasElement[];
  logos: Logo[];
  garmentColor?: string;
}

/**
 * SimpleWorkingGenerator - The Original Simple Approach That Actually Worked
 * 
 * This is the original implementation before complex CMYK/vector processing broke everything.
 * It uses basic PDF embedding without experimental features.
 */
export class SimpleWorkingGenerator {
  async generatePDF(data: SimpleWorkingPDFData): Promise<Buffer> {
    console.log('🚀 SIMPLE WORKING GENERATOR - Original Approach');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);
    console.log('✅ No complex CMYK processing, no experimental features');
    
    const pdfDoc = await PDFDocument.create();
    const templateWidth = data.templateSize.width * 2.834;  // mm to points
    const templateHeight = data.templateSize.height * 2.834; // mm to points
    
    console.log(`📄 Creating dual-page PDF: ${templateWidth.toFixed(3)} x ${templateHeight.toFixed(3)} points`);

    // Page 1: White background with artwork
    console.log('📄 Page 1: White background with artwork');
    const page1 = pdfDoc.addPage([templateWidth, templateHeight]);
    
    // Embed logos on page 1
    for (const element of data.canvasElements) {
      const logo = data.logos.find(l => l.id === element.logoId);
      if (logo) {
        await this.embedSimpleLogo(pdfDoc, page1, logo, element);
      }
    }

    // Page 2: Garment background with artwork and labels
    console.log('📄 Page 2: Garment background with artwork and labels');
    const page2 = pdfDoc.addPage([templateWidth, templateHeight]);
    
    // Apply garment color background
    const garmentColor = data.garmentColor || '#FFFFFF';
    console.log(`🎨 Garment background applied: ${garmentColor}`);
    const [r, g, b] = this.hexToRgb(garmentColor);
    page2.drawRectangle({
      x: 0,
      y: 0,
      width: templateWidth,
      height: templateHeight,
      color: rgb(r / 255, g / 255, b / 255),
    });
    
    // Embed logos on page 2
    for (const element of data.canvasElements) {
      const logo = data.logos.find(l => l.id === element.logoId);
      if (logo) {
        await this.embedSimpleLogo(pdfDoc, page2, logo, element);
      }
    }

    // Add simple labels to page 2
    await this.addSimpleLabels(pdfDoc, page2, templateWidth, templateHeight);

    const pdfBytes = await pdfDoc.save();
    console.log(`✅ SIMPLE WORKING PDF GENERATED: ${pdfBytes.length} bytes (${Math.round(pdfBytes.length/1024)}KB)`);
    console.log('🎯 Original simple approach with basic logo embedding');
    
    return Buffer.from(pdfBytes);
  }

  private async embedSimpleLogo(pdfDoc: PDFDocument, page: PDFPage, logo: Logo, element: CanvasElement): Promise<void> {
    const logoPath = path.join('uploads', logo.filename);
    
    if (!fs.existsSync(logoPath)) {
      console.log(`⚠️ Logo file not found: ${logoPath}`);
      return;
    }

    const x = element.x || 0;
    const y = element.y || 0;
    const width = element.width || 150;
    const height = element.height || 150;

    console.log(`🎯 Embedding logo: ${logo.filename}`);
    console.log(`📍 Canvas position: (${x}, ${y}) size ${width}x${height}`);
    console.log(`🎯 PDF coordinates: (${x.toFixed(1)}, ${y.toFixed(1)}) size ${width.toFixed(1)}x${height.toFixed(1)}`);

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
        const existingPdfBytes = fs.readFileSync(logoPath);
        const sourcePdf = await PDFDocument.load(existingPdfBytes);
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
            const convertedPdfBytes = fs.readFileSync(tempPdfPath);
            const convertedPdf = await PDFDocument.load(convertedPdfBytes);
            const [convertedPage] = await pdfDoc.copyPages(convertedPdf, [0]);
            const embeddedPage = await pdfDoc.embedPage(convertedPage);
            
            page.drawPage(embeddedPage, { x, y, width, height });
            console.log('✅ SVG embedded as vector PDF');
            
            // Cleanup
            fs.unlinkSync(tempPdfPath);
          }
        } catch (conversionError) {
          console.log('⚠️ SVG conversion failed, skipping logo');
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

        if (embeddedImage) {
          page.drawImage(embeddedImage, { x, y, width, height });
          console.log('✅ Raster image embedded simply');
        }
      }
      
    } catch (error) {
      console.error('❌ Simple logo embedding failed:', error);
    }
  }

  private async addSimpleLabels(pdfDoc: PDFDocument, page: PDFPage, width: number, height: number): Promise<void> {
    try {
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Simple label positioning
      const labelY = 40;
      const labelSize = 12;
      
      page.drawText('GARMENT PREVIEW', {
        x: 50,
        y: labelY,
        size: labelSize,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
      });
      
      console.log('✅ Simple labels added successfully');
    } catch (error) {
      console.log('⚠️ Label addition failed:', error);
    }
  }

  private hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result 
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [255, 255, 255];
  }
}