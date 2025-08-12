import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export class FinalSimplePDFGenerator {
  
  /**
   * Generate PDF that exactly duplicates canvas content 
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
    
    console.log('🎯 FINAL SIMPLE PDF - Exact Canvas Duplication');
    console.log(`Template: ${templateSize.name} (${templateSize.pixelWidth}×${templateSize.pixelHeight}px)`);
    console.log(`Canvas elements: ${canvasElements.length}`);
    
    const doc = await PDFDocument.create();
    
    // Page 1: Pure white background with content at exact canvas positions
    const page1 = doc.addPage([templateSize.pixelWidth, templateSize.pixelHeight]);
    await this.duplicateCanvasOnPage(page1, canvasElements, logos, templateSize);
    
    // Page 2: Garment background with same exact content
    const page2 = doc.addPage([templateSize.pixelWidth, templateSize.pixelHeight]);
    this.fillGarmentBackground(page2, garmentColor, templateSize);
    await this.duplicateCanvasOnPage(page2, canvasElements, logos, templateSize);
    this.addColorLabels(page2, garmentColor, extraGarmentColors, logos);
    
    const pdfBytes = await doc.save();
    console.log(`✅ Final simple PDF generated - ${pdfBytes.length} bytes`);
    
    return Buffer.from(pdfBytes);
  }
  
  /**
   * Duplicate canvas content exactly on PDF page
   */
  private async duplicateCanvasOnPage(
    page: any,
    canvasElements: any[],
    logos: any[],
    templateSize: any
  ): Promise<void> {
    
    for (const element of canvasElements) {
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) continue;
      
      // Convert canvas Y to PDF Y (flip Y-axis)
      const pdfX = element.x;
      const pdfY = templateSize.pixelHeight - element.y - element.height;
      
      console.log(`📍 Canvas: (${element.x.toFixed(1)}, ${element.y.toFixed(1)}) → PDF: (${pdfX.toFixed(1)}, ${pdfY.toFixed(1)})`);
      console.log(`📐 Size: ${element.width.toFixed(1)}×${element.height.toFixed(1)}px`);
      
      // Try to embed the actual SVG content
      const success = await this.embedActualSVG(page, logo, pdfX, pdfY, element.width, element.height);
      
      if (!success) {
        // If SVG embedding fails, use a clear visual indicator at exact position
        this.drawPositionMarker(page, pdfX, pdfY, element.width, element.height, logo);
      }
    }
  }
  
  /**
   * Embed actual SVG content with high quality PNG conversion (fallback until vector works)
   */
  private async embedActualSVG(
    page: any,
    logo: any,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<boolean> {
    
    try {
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      
      if (!fs.existsSync(logoPath)) {
        console.warn(`SVG file not found: ${logoPath}`);
        return false;
      }
      
      console.log(`🔍 EMBEDDING SVG WITH HIGH QUALITY for ${logoPath}`);
      const svgContent = fs.readFileSync(logoPath, 'utf8');
      
      // Get SVG's original dimensions for best quality
      const widthMatch = svgContent.match(/width="([^"]+)"/);
      const heightMatch = svgContent.match(/height="([^"]+)"/);
      
      let svgWidth = width;
      let svgHeight = height;
      
      if (widthMatch && heightMatch) {
        const originalWidth = parseFloat(widthMatch[1]);
        const originalHeight = parseFloat(heightMatch[1]);
        
        if (originalWidth > 0 && originalHeight > 0) {
          svgWidth = originalWidth;
          svgHeight = originalHeight;
          console.log(`✅ Using SVG original dimensions: ${originalWidth}×${originalHeight}`);
        }
      }
      
      // Convert SVG to high-resolution PNG to preserve quality and colors
      const tempPngPath = path.join('/tmp', `svg_hq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`);
      
      try {
        // Use Inkscape for highest quality conversion at exact canvas size
        // This preserves colors and provides crisp output
        const inkscapeCmd = `inkscape "${logoPath}" --export-type=png --export-filename="${tempPngPath}" --export-width=${Math.round(width)} --export-height=${Math.round(height)} --export-dpi=300`;
        execSync(inkscapeCmd, { stdio: 'pipe' });
        
        if (fs.existsSync(tempPngPath)) {
          const imageBytes = fs.readFileSync(tempPngPath);
          const image = await page.doc.embedPng(imageBytes);
          
          // Draw at exact canvas position and size
          page.drawImage(image, {
            x: x,
            y: y,
            width: width,
            height: height
          });
          
          // Clean up
          fs.unlinkSync(tempPngPath);
          
          console.log(`✅ SVG embedded as HIGH-QUALITY PNG at exact position: (${x.toFixed(1)}, ${y.toFixed(1)})`);
          return true;
        }
        
      } catch (conversionError) {
        console.warn(`Inkscape conversion failed:`, (conversionError as Error).message || conversionError);
        // Try cleanup
        if (fs.existsSync(tempPngPath)) {
          fs.unlinkSync(tempPngPath);
        }
        
        // Fallback to ImageMagick if Inkscape fails
        try {
          const magickCmd = `convert "${logoPath}" -resize ${Math.round(width)}x${Math.round(height)}! -quality 100 "${tempPngPath}"`;
          execSync(magickCmd, { stdio: 'pipe' });
          
          if (fs.existsSync(tempPngPath)) {
            const imageBytes = fs.readFileSync(tempPngPath);
            const image = await page.doc.embedPng(imageBytes);
            
            page.drawImage(image, {
              x: x,
              y: y,
              width: width,
              height: height
            });
            
            fs.unlinkSync(tempPngPath);
            
            console.log(`✅ SVG embedded as PNG (ImageMagick fallback) at exact position: (${x.toFixed(1)}, ${y.toFixed(1)})`);
            return true;
          }
        } catch (fallbackError) {
          console.warn(`ImageMagick fallback failed:`, (fallbackError as Error).message || fallbackError);
          if (fs.existsSync(tempPngPath)) {
            fs.unlinkSync(tempPngPath);
          }
        }
      }
      
      return false;
      
    } catch (error) {
      console.error(`Failed to embed SVG:`, (error as Error).message || error);
      return false;
    }
  }
  
  /**
   * Draw position marker to show exact canvas coordinates
   */
  private drawPositionMarker(
    page: any,
    x: number,
    y: number,
    width: number,
    height: number,
    logo: any
  ): void {
    
    // Draw border showing exact position
    page.drawRectangle({
      x: x,
      y: y,
      width: width,
      height: height,
      borderColor: rgb(0.9, 0.1, 0.1),
      borderWidth: 2,
      color: rgb(0.98, 0.98, 0.98)
    });
    
    // Add position text
    const fontSize = Math.max(8, Math.min(12, width / 25));
    
    page.drawText(`Position: (${x.toFixed(0)}, ${y.toFixed(0)})`, {
      x: x + 5,
      y: y + height - fontSize - 5,
      size: fontSize,
      color: rgb(0, 0, 0)
    });
    
    page.drawText(`Size: ${width.toFixed(0)}×${height.toFixed(0)}`, {
      x: x + 5,
      y: y + 5,
      size: fontSize - 1,
      color: rgb(0.4, 0.4, 0.4)
    });
    
    console.log(`📍 Position marker drawn at exact coordinates: (${x.toFixed(1)}, ${y.toFixed(1)})`);
  }
  
  /**
   * Fill page with garment background color
   */
  private fillGarmentBackground(page: any, garmentColor: string, templateSize: any): void {
    const color = this.hexToRgb(garmentColor);
    
    page.drawRectangle({
      x: 0,
      y: 0,
      width: templateSize.pixelWidth,
      height: templateSize.pixelHeight,
      color: rgb(color.r / 255, color.g / 255, color.b / 255)
    });
    
    console.log(`🎨 Garment background applied: ${garmentColor}`);
  }
  
  /**
   * Add color information labels
   */
  private addColorLabels(
    page: any,
    garmentColor: string,
    extraGarmentColors: string[],
    logos: any[]
  ): void {
    
    let y = 40;
    const fontSize = 10;
    
    // Main garment color
    page.drawText(`Main Garment: ${garmentColor}`, {
      x: 40,
      y: y,
      size: fontSize,
      color: rgb(0, 0, 0)
    });
    y += 15;
    
    // Extra colors
    extraGarmentColors.forEach((color, index) => {
      page.drawText(`Extra ${index + 1}: ${color}`, {
        x: 40,
        y: y,
        size: fontSize,
        color: rgb(0, 0, 0)
      });
      y += 15;
    });
    
    // Logo info
    logos.forEach((logo, index) => {
      const colorCount = logo.svgColors?.length || 0;
      page.drawText(`Logo ${index + 1}: ${colorCount} colors from ${logo.originalName?.substring(0, 20) || 'file'}`, {
        x: 40,
        y: y,
        size: fontSize - 1,
        color: rgb(0, 0, 0)
      });
      y += 15;
    });
  }
  
  /**
   * Convert hex to RGB
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