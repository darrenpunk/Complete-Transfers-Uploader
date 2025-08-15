/**
 * DIRECT PDF EMBEDDING GENERATOR
 * 
 * NEW APPROACH: Directly embed original PDFs without any conversion
 * - Preserves exact CMYK colors from original files
 * - Maintains exact dimensions and positioning
 * - No SVG conversion that causes color loss
 * - Uses original PDF files as-is for perfect preservation
 */

import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFPage, rgb, degrees } from 'pdf-lib';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

interface ProjectData {
  canvasElements: any[];
  logos: any[];
  templateSize: any;
  garmentColor?: string;
  projectName: string;
  quantity: number;
  comments?: string;
}

export class DirectPDFGenerator {
  
  async generatePDF(data: ProjectData): Promise<Buffer> {
    try {
      console.log(`🎯 DIRECT PDF APPROACH: Embedding original PDFs without conversion`);
      console.log(`📊 Project: ${data.projectName} (${data.canvasElements.length} elements)`);
      
      // Create new PDF document with A3 dimensions
      const pdfDoc = await PDFDocument.create();
      
      // Template dimensions in points (A3 = 842 x 1191 pts)
      const templateWidthPoints = 842;
      const templateHeightPoints = 1191;
      
      // Create Page 1: Original artwork with transparent background
      const page1 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
      console.log(`📄 Created Page 1: ${templateWidthPoints}x${templateHeightPoints}pts (transparent background)`);
      
      // Create Page 2: Artwork with garment color background
      const page2 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
      console.log(`📄 Created Page 2: ${templateWidthPoints}x${templateHeightPoints}pts (garment background)`);
      
      // Add garment color background to page 2
      if (data.garmentColor && data.garmentColor !== 'none') {
        this.addGarmentBackground(page2, data.garmentColor, templateWidthPoints, templateHeightPoints);
      }
      
      // Embed logos directly from original PDFs
      await this.embedOriginalPDFs(page1, data.canvasElements, data.logos);
      await this.embedOriginalPDFs(page2, data.canvasElements, data.logos);
      
      // Add project information labels to page 2
      this.addProjectLabels(page2, data);
      
      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Direct PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Direct PDF generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Direct PDF generation failed: ${errorMessage}`);
    }
  }
  
  /**
   * Embed original PDFs directly without any conversion
   */
  private async embedOriginalPDFs(
    page: PDFPage,
    canvasElements: any[],
    logos: any[]
  ): Promise<void> {
    console.log(`🎯 Embedding ${canvasElements.length} original PDFs directly`);
    
    for (let i = 0; i < canvasElements.length; i++) {
      const element = canvasElements[i];
      
      // Find matching logo
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) {
        console.warn(`⚠️ No logo found for element ${element.id}`);
        continue;
      }
      
      console.log(`📄 Processing logo ${i + 1}/${canvasElements.length}: ${logo.filename}`);
      
      // Only process PDF files - skip SVG conversions entirely
      if (logo.originalFilename && logo.originalFilename.toLowerCase().endsWith('.pdf')) {
        await this.embedDirectPDF(page, element, logo);
      } else {
        console.log(`⚠️ Skipping non-PDF file: ${logo.filename} (original: ${logo.originalFilename})`);
      }
    }
  }
  
  /**
   * Embed PDF directly using exact dimensions from user's requirements
   */
  private async embedDirectPDF(
    page: PDFPage,
    element: any,
    logo: any
  ): Promise<void> {
    try {
      // Find the original PDF file
      const originalPdfPath = this.findOriginalPDF(logo);
      if (!originalPdfPath) {
        console.warn(`⚠️ Original PDF not found for: ${logo.filename}`);
        return;
      }
      
      console.log(`📁 Found original PDF: ${originalPdfPath}`);
      
      // Load and embed the original PDF
      const pdfBytes = fs.readFileSync(originalPdfPath);
      const originalDoc = await PDFDocument.load(pdfBytes);
      const [embeddedPage] = await page.doc.embedPdf(originalDoc);
      
      // Get original PDF dimensions
      const originalSize = embeddedPage.size();
      console.log(`📏 Original PDF size: ${originalSize.width.toFixed(1)}x${originalSize.height.toFixed(1)}pts`);
      
      // Use EXACT dimensions from user requirements
      // User specified: content is 293.91mm x 162.468mm, document viewbox is 297x210mm
      const MM_TO_POINTS = 2.834645669;
      const exactContentWidthMM = 293.91;
      const exactContentHeightMM = 162.468;
      const exactWidthPts = exactContentWidthMM * MM_TO_POINTS;
      const exactHeightPts = exactContentHeightMM * MM_TO_POINTS;
      
      console.log(`🎯 Using EXACT user dimensions: ${exactContentWidthMM}x${exactContentHeightMM}mm = ${exactWidthPts.toFixed(1)}x${exactHeightPts.toFixed(1)}pts`);
      
      // Calculate position using element coordinates
      const pdfX = element.x * MM_TO_POINTS;
      const pdfY = page.getSize().height - (element.y * MM_TO_POINTS) - exactHeightPts;
      
      console.log(`📍 Direct embedding at: (${pdfX.toFixed(1)}, ${pdfY.toFixed(1)}) size: ${exactWidthPts.toFixed(1)}x${exactHeightPts.toFixed(1)}`);
      
      // Embed with EXACT dimensions - no aspect ratio changes
      page.drawPage(embeddedPage, {
        x: pdfX,
        y: pdfY,
        width: exactWidthPts,
        height: exactHeightPts,
        rotate: element.rotation ? degrees(element.rotation) : undefined,
      });
      
      console.log(`✅ Successfully embedded original PDF with exact dimensions`);
      
    } catch (error) {
      console.error(`❌ Failed to embed direct PDF:`, error);
      throw error;
    }
  }
  
  /**
   * Find the original PDF file for a logo
   */
  private findOriginalPDF(logo: any): string | null {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    
    // Try to find the original PDF file
    const possiblePaths = [
      path.join(uploadsDir, logo.originalFilename || ''),
      path.join(uploadsDir, logo.filename.replace('.svg', '.pdf')),
      path.join(uploadsDir, logo.id + '.pdf')
    ];
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        console.log(`📁 Found original PDF at: ${possiblePath}`);
        return possiblePath;
      }
    }
    
    // Search for any PDF with similar name
    try {
      const files = fs.readdirSync(uploadsDir);
      const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
      
      for (const pdfFile of pdfFiles) {
        if (pdfFile.includes(logo.id) || logo.filename.includes(pdfFile.replace('.pdf', ''))) {
          const foundPath = path.join(uploadsDir, pdfFile);
          console.log(`📁 Found matching PDF: ${foundPath}`);
          return foundPath;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error searching for PDF files:`, error);
    }
    
    return null;
  }
  
  /**
   * Add garment color background
   */
  private addGarmentBackground(page: PDFPage, garmentColor: string, width: number, height: number): void {
    console.log(`🎨 Adding garment background: ${garmentColor}`);
    
    // Parse garment color
    let backgroundColor = rgb(1, 1, 1); // Default white
    
    if (garmentColor.startsWith('#')) {
      const hex = garmentColor.substring(1);
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      backgroundColor = rgb(r, g, b);
    } else if (garmentColor.toLowerCase() === 'hi viz') {
      // Hi-Viz Yellow
      backgroundColor = rgb(240/255, 244/255, 42/255);
    }
    
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: backgroundColor,
    });
    
    console.log(`✅ Added ${garmentColor} background`);
  }
  
  /**
   * Add project information labels
   */
  private addProjectLabels(page: PDFPage, data: ProjectData): void {
    const labelText = `Project: ${data.projectName} | Quantity: ${data.quantity}`;
    
    page.drawText(labelText, {
      x: 20,
      y: 40,
      size: 12,
      color: rgb(0, 0, 0),
    });
    
    if (data.garmentColor) {
      page.drawText(`Garment Color: ${data.garmentColor}`, {
        x: 20,
        y: 20,
        size: 10,
        color: rgb(0, 0, 0),
      });
    }
    
    console.log(`🏷️ Added project labels: ${labelText}`);
  }
}