import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export class UltraSimplePDFGenerator {
  
  /**
   * Generate PDF that exactly matches what's on the canvas - no complex logic
   */
  async generatePDF(
    projectName: string,
    canvasElements: any[],
    logos: any[],
    templateSize: any,
    garmentColor: string = '#FFFFFF',
    extraGarmentColors: string[] = [],
    quantity: number = 1
  ): Promise<Buffer> {
    
    console.log('🎯 ULTRA SIMPLE PDF - Direct Canvas Copy');
    console.log(`📐 Template: ${templateSize.name} (${templateSize.pixelWidth}×${templateSize.pixelHeight}px)`);
    console.log(`🎨 Elements to copy: ${canvasElements.length}`);
    
    const doc = await PDFDocument.create();
    
    // Page 1: White background with content at exact canvas positions
    const page1 = doc.addPage([templateSize.pixelWidth, templateSize.pixelHeight]);
    await this.copyCanvasToPage(page1, canvasElements, logos, templateSize);
    
    // Page 2: Garment background color with same content
    const page2 = doc.addPage([templateSize.pixelWidth, templateSize.pixelHeight]);
    this.addGarmentBackground(page2, garmentColor, templateSize);
    await this.copyCanvasToPage(page2, canvasElements, logos, templateSize);
    this.addColorInfo(page2, garmentColor, extraGarmentColors, logos);
    
    const pdfBytes = await doc.save();
    console.log(`✅ Ultra simple PDF created - ${pdfBytes.length} bytes`);
    
    return Buffer.from(pdfBytes);
  }
  
  /**
   * Copy canvas content to PDF page using exact coordinates
   */
  private async copyCanvasToPage(
    page: any,
    canvasElements: any[],
    logos: any[],
    templateSize: any
  ): Promise<void> {
    
    console.log(`📋 Copying ${canvasElements.length} elements to PDF page`);
    
    for (const element of canvasElements) {
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) {
        console.warn(`⚠️ Logo not found for element ${element.id}`);
        continue;
      }
      
      // Convert canvas Y coordinate to PDF Y coordinate (flip axis)
      const pdfX = element.x;
      const pdfY = templateSize.pixelHeight - element.y - element.height;
      
      console.log(`📍 Element: ${logo.originalName?.substring(0, 30) || 'Logo'}`);
      console.log(`    Canvas: (${element.x.toFixed(1)}, ${element.y.toFixed(1)}) ${element.width.toFixed(1)}×${element.height.toFixed(1)}`);
      console.log(`    PDF: (${pdfX.toFixed(1)}, ${pdfY.toFixed(1)}) ${element.width.toFixed(1)}×${element.height.toFixed(1)}`);
      
      // Embed the actual SVG content at exact canvas position
      await this.embedSVGAtExactPosition(page, logo, pdfX, pdfY, element.width, element.height);
    }
  }
  
  /**
   * Embed SVG content at exact position using simple conversion
   */
  private async embedSVGAtExactPosition(
    page: any,
    logo: any,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    
    try {
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      
      if (fs.existsSync(logoPath)) {
        // Convert SVG to PNG using rsvg-convert at exact dimensions
        const tempPngPath = path.join(path.dirname(logoPath), `temp_svg_${Date.now()}.png`);
        
        try {
          // Use rsvg-convert to create PNG at exact canvas dimensions
          const { execSync } = require('child_process');
          const convertCmd = `rsvg-convert "${logoPath}" -w ${Math.round(width)} -h ${Math.round(height)} -o "${tempPngPath}"`;
          execSync(convertCmd, { stdio: 'pipe' });
          
          if (fs.existsSync(tempPngPath)) {
            // Embed PNG at exact coordinates
            const imageBytes = fs.readFileSync(tempPngPath);
            const image = await page.doc.embedPng(imageBytes);
            
            page.drawImage(image, {
              x: x,
              y: y,
              width: width,
              height: height
            });
            
            // Clean up temp file
            fs.unlinkSync(tempPngPath);
            
            console.log(`✅ SVG converted and embedded at exact coordinates: (${x.toFixed(1)}, ${y.toFixed(1)})`);
          } else {
            throw new Error('PNG conversion failed');
          }
          
        } catch (conversionError) {
          console.warn(`⚠️ SVG conversion failed, using placeholder:`, conversionError);
          
          // Fallback: Draw rectangle with exact positioning info
          page.drawRectangle({
            x: x,
            y: y,
            width: width,
            height: height,
            borderColor: rgb(0.8, 0.2, 0.2),
            borderWidth: 1,
            color: rgb(0.95, 0.95, 0.95)
          });
          
          const fontSize = Math.min(10, width / 30);
          page.drawText(`SVG at (${x.toFixed(0)}, ${y.toFixed(0)})`, {
            x: x + 2,
            y: y + height/2,
            size: fontSize,
            color: rgb(0, 0, 0)
          });
        }
        
      } else {
        console.warn(`⚠️ SVG file not found: ${logoPath}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to embed SVG at position:`, error);
    }
  }
  
  /**
   * Add garment background color
   */
  private addGarmentBackground(page: any, garmentColor: string, templateSize: any): void {
    const color = this.hexToRgb(garmentColor);
    
    page.drawRectangle({
      x: 0,
      y: 0,
      width: templateSize.pixelWidth,
      height: templateSize.pixelHeight,
      color: rgb(color.r / 255, color.g / 255, color.b / 255)
    });
    
    console.log(`🎨 Applied garment background: ${garmentColor}`);
  }
  
  /**
   * Add color information
   */
  private addColorInfo(
    page: any,
    garmentColor: string,
    extraGarmentColors: string[],
    logos: any[]
  ): void {
    
    let y = 30;
    const fontSize = 10;
    
    // Garment color
    page.drawText(`Main Garment Color: ${garmentColor}`, {
      x: 30,
      y: y,
      size: fontSize,
      color: rgb(0, 0, 0)
    });
    y += 15;
    
    // Extra garment colors
    extraGarmentColors.forEach((color, index) => {
      page.drawText(`Extra Color ${index + 1}: ${color}`, {
        x: 30,
        y: y,
        size: fontSize,
        color: rgb(0, 0, 0)
      });
      y += 15;
    });
    
    // Logo color count
    logos.forEach((logo, index) => {
      const colorCount = logo.svgColors ? logo.svgColors.length : 0;
      page.drawText(`Logo ${index + 1}: ${colorCount} colors`, {
        x: 30,
        y: y,
        size: fontSize,
        color: rgb(0, 0, 0)
      });
      y += 15;
    });
  }
  
  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }
}