import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * EXACT DEPLOYED PDF GENERATOR
 * This is the exact implementation from the working deployed version
 * No experimental features, just the proven methodology
 */

interface DeployedPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
}

export class DeployedPDFGenerator {
  async generateExactDeployedPDF(data: DeployedPDFData): Promise<Buffer> {
    console.log('🎯 EXACT DEPLOYED GENERATOR - No experimental features');
    console.log(`📊 Processing: ${data.canvasElements.length} elements, ${data.logos.length} logos`);
    console.log('✅ Using proven methodology from working deployment');

    try {
      // Create PDF document exactly like deployed version
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle(`${data.projectId}_deployed_exact`);
      pdfDoc.setCreator('Deployed Artwork Generator');

      // Template dimensions (A3: 297x420mm = 841.89 x 1190.55 points)
      const pageWidth = 841.89;
      const pageHeight = 1190.55;

      console.log(`📄 EXACT: Creating ${pageWidth} x ${pageHeight} point pages`);

      // PAGE 1: White background with artwork (deployed version approach)
      const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
      console.log('📄 EXACT: Page 1 - White background with logos');

      for (const element of data.canvasElements) {
        const logo = data.logos.find(l => l.id === element.logoId);
        if (logo) {
          await this.embedLogoExactDeployedMethod(pdfDoc, page1, element, logo);
        }
      }

      // PAGE 2: Garment background with artwork (deployed version approach)
      const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
      console.log('📄 EXACT: Page 2 - Garment background with logos');

      // Add garment background exactly like deployed version
      if (data.garmentColor && data.garmentColor !== '#FFFFFF') {
        const color = this.hexToRgbExact(data.garmentColor);
        page2.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: rgb(color.r / 255, color.g / 255, color.b / 255)
        });
        console.log(`🎨 EXACT: Applied garment background: ${data.garmentColor}`);
      }

      // Embed logos on page 2 exactly like deployed version
      for (const element of data.canvasElements) {
        const logo = data.logos.find(l => l.id === element.logoId);
        if (logo) {
          await this.embedLogoExactDeployedMethod(pdfDoc, page2, element, logo);
        }
      }

      // Add labels exactly like deployed version
      this.addDeployedLabels(page2, {
        garmentColor: data.garmentColor || '#FFFFFF',
        projectName: data.projectId,
        quantity: 1
      }, pageWidth, pageHeight);

      // Generate PDF exactly like deployed version
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ EXACT DEPLOYED PDF: ${pdfBytes.length} bytes (${Math.round(pdfBytes.length/1024)}KB)`);
      
      return Buffer.from(pdfBytes);

    } catch (error) {
      console.error('❌ EXACT: Deployed PDF generation failed:', error);
      throw new Error(`Exact deployed PDF generation failed: ${error.message}`);
    }
  }

  private async embedLogoExactDeployedMethod(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any
  ): Promise<void> {
    try {
      console.log(`🎯 EXACT: Embedding logo ${logo.originalName || logo.filename}`);
      console.log(`📍 EXACT: Position (${element.x}, ${element.y}) size ${element.width}x${element.height}`);

      const logoPath = logo.path;
      
      if (!fs.existsSync(logoPath)) {
        console.error(`❌ EXACT: Logo file not found: ${logoPath}`);
        return;
      }

      // Use exact deployed version coordinate calculation
      const pdfX = element.x;
      const pdfY = 1190.55 - element.y - element.height; // Flip Y coordinate for PDF
      const pdfWidth = element.width;
      const pdfHeight = element.height;

      console.log(`🎯 EXACT: PDF coords (${pdfX}, ${pdfY}) size ${pdfWidth}x${pdfHeight}`);

      // Handle file types exactly like deployed version
      if (logo.originalName?.toLowerCase().endsWith('.pdf') || logoPath.endsWith('.pdf')) {
        // PDF file: Extract and embed exactly like deployed version
        await this.embedPDFExactDeployedMethod(pdfDoc, page, logoPath, pdfX, pdfY, pdfWidth, pdfHeight);
      } else if (logo.originalName?.toLowerCase().endsWith('.svg') || logoPath.endsWith('.svg')) {
        // SVG file: Convert exactly like deployed version
        await this.embedSVGExactDeployedMethod(pdfDoc, page, logoPath, pdfX, pdfY, pdfWidth, pdfHeight);
      } else {
        // Raster images: Embed directly exactly like deployed version
        await this.embedRasterExactDeployedMethod(pdfDoc, page, logoPath, pdfX, pdfY, pdfWidth, pdfHeight);
      }

      console.log('✅ EXACT: Logo embedded successfully');

    } catch (error) {
      console.error('❌ EXACT: Logo embedding failed:', error);
      // No fallbacks - fail fast like deployed version
      throw error;
    }
  }

  private async embedPDFExactDeployedMethod(
    pdfDoc: PDFDocument,
    page: PDFPage,
    pdfPath: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    try {
      console.log('📄 EXACT: Embedding PDF file');
      const pdfData = fs.readFileSync(pdfPath);
      const sourcePdf = await PDFDocument.load(pdfData);
      const [firstPage] = await pdfDoc.copyPages(sourcePdf, [0]);
      const embeddedPage = await pdfDoc.embedPage(firstPage);

      page.drawPage(embeddedPage, { x, y, width, height });
      console.log('✅ EXACT: PDF embedded as vector');
    } catch (error) {
      console.error('❌ EXACT: PDF embedding failed:', error);
      throw error;
    }
  }

  private async embedSVGExactDeployedMethod(
    pdfDoc: PDFDocument,
    page: PDFPage,
    svgPath: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    try {
      console.log('🎨 EXACT: Converting SVG to PDF');
      const tempPdfPath = path.join('/tmp', `deployed_${Date.now()}.pdf`);
      
      // Exact deployed version Inkscape command
      const command = `inkscape "${svgPath}" --export-filename="${tempPdfPath}" --export-type=pdf`;
      execSync(command, { stdio: 'pipe' });

      if (fs.existsSync(tempPdfPath)) {
        await this.embedPDFExactDeployedMethod(pdfDoc, page, tempPdfPath, x, y, width, height);
        fs.unlinkSync(tempPdfPath); // Clean up
        console.log('✅ EXACT: SVG converted and embedded as vector PDF');
      } else {
        throw new Error('SVG to PDF conversion failed');
      }
    } catch (error) {
      console.error('❌ EXACT: SVG embedding failed:', error);
      throw error;
    }
  }

  private async embedRasterExactDeployedMethod(
    pdfDoc: PDFDocument,
    page: PDFPage,
    imagePath: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    try {
      console.log('🖼️ EXACT: Embedding raster image');
      const imageData = fs.readFileSync(imagePath);
      let embeddedImage;

      if (imagePath.toLowerCase().match(/\.(jpg|jpeg)$/)) {
        embeddedImage = await pdfDoc.embedJpg(imageData);
      } else {
        embeddedImage = await pdfDoc.embedPng(imageData);
      }

      page.drawImage(embeddedImage, { x, y, width, height });
      console.log('✅ EXACT: Raster image embedded');
    } catch (error) {
      console.error('❌ EXACT: Raster embedding failed:', error);
      throw error;
    }
  }

  private addDeployedLabels(
    page: PDFPage,
    params: { garmentColor: string; projectName: string; quantity: number },
    pageWidth: number,
    pageHeight: number
  ): void {
    try {
      const fontSize = 12;
      const margin = 20;
      
      // Labels exactly like deployed version
      page.drawText(`Garment: ${params.garmentColor}`, {
        x: margin,
        y: pageHeight - margin - fontSize,
        size: fontSize,
        color: rgb(0, 0, 0)
      });

      page.drawText(`Project: ${params.projectName}`, {
        x: margin,
        y: pageHeight - margin - (fontSize * 2) - 5,
        size: fontSize,
        color: rgb(0, 0, 0)
      });

      page.drawText(`Quantity: ${params.quantity}`, {
        x: margin,
        y: pageHeight - margin - (fontSize * 3) - 10,
        size: fontSize,
        color: rgb(0, 0, 0)
      });

      console.log('✅ EXACT: Deployed labels added');
    } catch (error) {
      console.error('❌ EXACT: Failed to add labels:', error);
    }
  }

  private hexToRgbExact(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }
}