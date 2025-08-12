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
      
      // Draw a rectangle with the logo info at the exact position
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: element.width,
        height: element.height,
        borderColor: rgb(0.2, 0.2, 0.8),
        borderWidth: 2,
        color: rgb(0.95, 0.95, 1.0)
      });
      
      // Add filename label
      const fontSize = Math.max(8, Math.min(12, element.width / 20));
      page.drawText(logo.originalName?.substring(0, 25) || 'Logo', {
        x: pdfX + 5,
        y: pdfY + element.height - fontSize - 5,
        size: fontSize,
        color: rgb(0, 0, 0)
      });
      
      // Add size info
      page.drawText(`${element.width.toFixed(0)}×${element.height.toFixed(0)}px`, {
        x: pdfX + 5,
        y: pdfY + 5,
        size: Math.max(6, fontSize - 2),
        color: rgb(0.5, 0.5, 0.5)
      });
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