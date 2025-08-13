import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export class DirectPDFGenerator {
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
      console.log('🆕 DIRECT PDF GENERATOR: Starting completely fresh approach');
      
      // Create new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Create page with exact template size
      const pageWidth = params.templateSize.width * 2.834;  // mm to points
      const pageHeight = params.templateSize.height * 2.834;
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      console.log(`📐 PDF Page: ${pageWidth} x ${pageHeight} points`);
      
      // Process each canvas element with DIRECT positioning
      for (const element of params.canvasElements) {
        const logo = params.logos.find(l => l.id === element.logoId);
        if (!logo) continue;
        
        console.log(`🎯 DIRECT EMBEDDING: Element at canvas position (${element.x}, ${element.y})`);
        console.log(`📏 Element size: ${element.width} x ${element.height} pixels`);
        
        await this.embedLogoDirectly(pdfDoc, page, element, logo);
      }
      
      // Generate PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ DIRECT PDF: Generated ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ DIRECT PDF FAILED:', error);
      throw new Error(`Direct PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async embedLogoDirectly(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any
  ): Promise<void> {
    try {
      const logoPath = path.join('uploads', logo.filename);
      
      if (!fs.existsSync(logoPath)) {
        console.error(`❌ Logo file not found: ${logoPath}`);
        return;
      }
      
      console.log(`📂 Direct processing: ${logo.filename}`);
      
      let imageData: Buffer;
      let embeddedImage;
      
      if (logo.filename.endsWith('.svg')) {
        console.log('🔄 SVG detected - Converting to PNG for direct embedding');
        
        // Convert SVG to PNG using Inkscape
        const pngPath = logoPath.replace('.svg', '_direct.png');
        
        try {
          // Use exact canvas size for perfect pixel matching
          const command = `inkscape "${logoPath}" --export-png="${pngPath}" --export-width=${Math.round(element.width)} --export-height=${Math.round(element.height)} --export-background=white --export-background-opacity=0`;
          
          execSync(command, { stdio: 'ignore' });
          imageData = fs.readFileSync(pngPath);
          embeddedImage = await pdfDoc.embedPng(imageData);
          
          console.log(`✅ SVG converted to PNG: ${Math.round(element.width)}x${Math.round(element.height)}px`);
          
          // Clean up temp file
          fs.unlinkSync(pngPath);
          
        } catch (conversionError) {
          console.error('❌ SVG conversion failed:', conversionError);
          return;
        }
      } else {
        // Handle PNG/JPEG directly
        imageData = fs.readFileSync(logoPath);
        
        if (logo.filename.endsWith('.png') || logo.mimeType === 'image/png') {
          embeddedImage = await pdfDoc.embedPng(imageData);
        } else if (logo.filename.endsWith('.jpg') || logo.filename.endsWith('.jpeg') || logo.mimeType === 'image/jpeg') {
          embeddedImage = await pdfDoc.embedJpg(imageData);
        } else {
          console.log(`⚠️ Unsupported format: ${logo.filename}`);
          return;
        }
      }
      
      // DIRECT positioning - use canvas coordinates exactly as they are
      const pdfX = element.x;
      const pdfY = page.getHeight() - element.y - element.height;  // Flip Y axis for PDF
      const pdfWidth = element.width;
      const pdfHeight = element.height;
      
      console.log(`🎯 DIRECT COORDINATES: Canvas(${element.x}, ${element.y}) → PDF(${pdfX}, ${pdfY})`);
      console.log(`📐 DIRECT SIZE: ${pdfWidth}x${pdfHeight}px (no scaling)`);
      
      // Place image at exact coordinates
      page.drawImage(embeddedImage, {
        x: pdfX,
        y: pdfY,
        width: pdfWidth,
        height: pdfHeight,
      });
      
      console.log('✅ DIRECT EMBED SUCCESS: Logo positioned at exact canvas location');
      
    } catch (error) {
      console.error('❌ Direct logo embedding failed:', error);
    }
  }
}