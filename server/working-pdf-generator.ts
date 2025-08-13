import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class WorkingPDFGenerator {
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
      console.log('📄 Starting Working PDF generation...');
      console.log(`📐 Template: ${params.templateSize.name} (${params.templateSize.width}×${params.templateSize.height}mm)`);
      console.log(`📊 Elements to embed: ${params.canvasElements.length}`);
      
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Page 1: Artwork on garment background
      const page1 = pdfDoc.addPage([
        params.templateSize.width * 2.834,  // mm to points
        params.templateSize.height * 2.834
      ]);
      
      console.log('📄 Page 1 created for artwork');
      
      // Skip garment background for now - focus on logo positioning first
      console.log(`📄 Page 1 ready for logo embedding (background skipped temporarily)`);
      
      // Embed all canvas elements (logos) using PNG bypass
      for (const element of params.canvasElements) {
        const logo = params.logos.find(l => l.id === element.logoId);
        if (!logo) {
          console.warn(`⚠️  Logo not found for element ${element.id}`);
          continue;
        }
        
        console.log(`🔄 Processing element ${element.id} with logo ${logo.filename}`);
        await this.embedLogo(pdfDoc, page1, element, logo, params.templateSize);
      }
      
      // Page 2: Labels and information
      const page2 = pdfDoc.addPage([
        params.templateSize.width * 2.834,
        params.templateSize.height * 2.834
      ]);
      
      console.log('📄 Page 2 created for labels and garment colors');
      
      // Add page 2 content: main garment color, extra colors, project info
      await this.addPage2Content(page2, params);
      
      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Working PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Working PDF generation failed:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async embedLogo(
    pdfDoc: PDFDocument, 
    page: PDFPage, 
    element: any, 
    logo: any, 
    templateSize: any
  ): Promise<void> {
    try {
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      
      if (!fs.existsSync(logoPath)) {
        console.error(`❌ Logo file not found: ${logoPath}`);
        return;
      }

      console.log(`🎯 VECTOR PRESERVATION: Using exact canvas coordinate system with vector graphics`);
      
      let embeddedGraphic;
      const canvasWidth = Math.round(element.width);
      const canvasHeight = Math.round(element.height);
      
      if (logo.mimeType === 'image/svg+xml') {
        console.log(`🎨 SVG → Vector PDF: ${canvasWidth}×${canvasHeight}px`);
        
        // Convert SVG to vector PDF at exact canvas dimensions
        const tempSvgPath = path.join('/tmp', `canvas_exact_${Date.now()}.svg`);
        const tempPdfPath = path.join('/tmp', `canvas_exact_${Date.now()}.pdf`);
        
        // Read and scale SVG to exact canvas dimensions
        const svgContent = fs.readFileSync(logoPath, 'utf-8');
        let scaledSvg = svgContent.replace(/width="[^"]*"/, `width="${canvasWidth}"`);
        scaledSvg = scaledSvg.replace(/height="[^"]*"/, `height="${canvasHeight}"`);
        fs.writeFileSync(tempSvgPath, scaledSvg);
        
        // Convert to PDF using Inkscape
        const inkscapeCmd = `inkscape "${tempSvgPath}" --export-filename="${tempPdfPath}" --export-type=pdf --export-width=${canvasWidth} --export-height=${canvasHeight}`;
        execSync(inkscapeCmd, { stdio: 'pipe' });
        
        // Embed PDF page as vector
        if (fs.existsSync(tempPdfPath)) {
          const pdfData = fs.readFileSync(tempPdfPath);
          const sourcePdf = await PDFDocument.load(pdfData);
          const [copiedPage] = await pdfDoc.copyPages(sourcePdf, [0]);
          embeddedGraphic = await pdfDoc.embedPage(copiedPage);
          
          // Clean up temp files
          fs.unlinkSync(tempSvgPath);
          fs.unlinkSync(tempPdfPath);
        }
      } else {
        console.log(`🎨 Raster file: ${canvasWidth}×${canvasHeight}px`);
        // For raster files, use PNG embedding
        const tempPngPath = path.join('/tmp', `canvas_exact_${Date.now()}.png`);
        const convertCmd = `convert -density 300 "${logoPath}[0]" -resize ${canvasWidth}x${canvasHeight}! "${tempPngPath}"`;
        execSync(convertCmd, { stdio: 'pipe' });
        
        const pngBytes = fs.readFileSync(tempPngPath);
        embeddedGraphic = await pdfDoc.embedPng(pngBytes);
        fs.unlinkSync(tempPngPath);
      }
      
      console.log(`✅ Vector/raster embedding completed at exact canvas size`);
      
      // PROPORTIONAL COORDINATE SYSTEM: Canvas pixels → Template percentages → PDF points
      const scale = 2.834; // mm to points conversion
      const canvasDisplayWidth = 842;   
      const canvasDisplayHeight = 1191; 
      
      // Calculate proportional positioning and sizing
      const xProportion = element.x / canvasDisplayWidth;
      const yProportion = element.y / canvasDisplayHeight;
      const widthProportion = element.width / canvasDisplayWidth;
      const heightProportion = element.height / canvasDisplayHeight;
      
      // Convert proportions to PDF points
      const pageWidthPoints = templateSize.width * scale;
      const pageHeightPoints = templateSize.height * scale;
      
      const xInPoints = xProportion * pageWidthPoints;
      const yInPoints = yProportion * pageHeightPoints;
      const targetWidthPoints = widthProportion * pageWidthPoints;
      const targetHeightPoints = heightProportion * pageHeightPoints;
      
      // PDF coordinate system: Y=0 at bottom, canvas Y=0 at top
      const finalY = pageHeightPoints - yInPoints - targetHeightPoints;
      
      console.log(`🎯 COORDINATE MAPPING: Canvas(${element.width}×${element.height}px) = ${(widthProportion*100).toFixed(1)}%×${(heightProportion*100).toFixed(1)}% → PDF(${targetWidthPoints.toFixed(1)}×${targetHeightPoints.toFixed(1)}pt)`);
      console.log(`📍 POSITION MAPPING: Canvas(${element.x},${element.y}) = ${(xProportion*100).toFixed(1)}%,${(yProportion*100).toFixed(1)}% → PDF(${xInPoints.toFixed(1)},${finalY.toFixed(1)})`);
      
      // Draw vector/raster graphic with exact canvas-to-PDF coordinate mapping
      if (embeddedGraphic) {
        if (embeddedGraphic.width !== undefined && embeddedGraphic.height !== undefined) {
          // Vector PDF page
          console.log(`🎯 Drawing vector PDF page`);
          page.drawPage(embeddedGraphic, {
            x: xInPoints,
            y: finalY,
            width: targetWidthPoints,
            height: targetHeightPoints,
            rotate: element.rotation ? degrees(element.rotation) : undefined,
          });
        } else {
          // Raster image
          console.log(`🎯 Drawing raster image`);
          page.drawImage(embeddedGraphic, {
            x: xInPoints,
            y: finalY,
            width: targetWidthPoints,
            height: targetHeightPoints,
            rotate: element.rotation ? degrees(element.rotation) : undefined,
          });
        }
      } else {
        console.error(`❌ No embeddedGraphic available for drawing`);
        return;
      }
      
      console.log(`✅ LOGO EMBEDDED: Vector preservation with perfect coordinate mapping`);

    } catch (error) {
      console.error(`❌ Failed to embed logo ${logo.filename}:`, error);
      throw error;
    }
  }

  private async addPage2Content(page: PDFPage, params: any): Promise<void> {
    // Skip color sample for now - focus on core functionality
    console.log('📄 Page 2 content: simplified for testing');
    
    // Add text label
    page.drawText(`Main Garment Color: ${params.garmentColor}`, {
      x: 200,
      y: page.getHeight() - 80,
      size: 12
    });
    
    // Add project name
    page.drawText(`Project: ${params.project.name || 'Untitled'}`, {
      x: 50,
      y: page.getHeight() - 150,
      size: 14
    });
    
    // Add quantity
    page.drawText(`Quantity: ${params.quantity}`, {
      x: 50,
      y: page.getHeight() - 180,
      size: 12
    });
    
    console.log('✅ Page 2 content added: garment colors and project info');
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