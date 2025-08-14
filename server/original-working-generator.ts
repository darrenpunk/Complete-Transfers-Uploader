import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CMYKDetector } from './cmyk-detector';
import { CMYKSVGProcessor } from './cmyk-svg-processor';
import { NativeCMYKGenerator } from './native-cmyk-generator';
import { calculateSVGContentBounds } from './dimension-utils';

const execAsync = promisify(exec);

interface OriginalPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class OriginalWorkingGenerator {
  /**
   * ORIGINAL WORKING PDF GENERATION - The method that worked from the beginning
   * Based on the user's example: gyhuiy_qty1_cmyk_1754674422540.pdf
   */
  async generatePDF(data: OriginalPDFData): Promise<Buffer> {
    console.log('🚀 ORIGINAL WORKING PDF GENERATION - Back to Basics');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);
    
    // Log detailed project data for debugging
    console.log(`🔍 Project data:`, {
      projectId: data.projectId,
      templateSize: data.templateSize?.name,
      canvasElements: data.canvasElements.length,
      logos: data.logos.length,
      garmentColor: data.garmentColor
    });
    
    if (data.canvasElements.length === 0) {
      console.warn(`⚠️ No canvas elements found - generating template-only PDF`);
    }
    
    if (data.logos.length === 0) {
      console.warn(`⚠️ No logos found - PDF will only contain background/template`);
    }

    try {
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle(`${data.projectId}_artwork`);
      pdfDoc.setCreator('CompleteTransfers.com Logo Uploader');

      // Calculate template dimensions in points
      const templateWidthPoints = data.templateSize.width * 2.834;
      const templateHeightPoints = data.templateSize.height * 2.834;

      // PAGE 1: Artwork on transparent background
      console.log('📄 Creating Page 1: Artwork Layout');
      const page1 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
      
      // No background on page 1 - transparent
      await this.embedLogosOnPage(page1, data.canvasElements, data.logos, data.templateSize);

      // PAGE 2: Artwork on colored garment background with labels
      console.log('📄 Creating Page 2: Garment Background + Color Labels');
      const page2 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
      
      // Add garment color background to page 2 (like user's working PDFs)
      if (data.garmentColor && data.garmentColor !== 'none') {
        this.addGarmentBackground(page2, data.garmentColor, templateWidthPoints, templateHeightPoints);
      } else {
        // Default white background if no garment color specified
        page2.drawRectangle({
          x: 0,
          y: 0,
          width: templateWidthPoints,
          height: templateHeightPoints,
          color: rgb(1, 1, 1),
        });
      }
      
      // Embed logos on page 2 
      await this.embedLogosOnPage(page2, data.canvasElements, data.logos, data.templateSize);

      // Generate final PDF
      const pdfBytes = await pdfDoc.save();
      console.log(`✅ Original PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Original PDF generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`PDF generation failed: ${errorMessage}`);
    }
  }

  /**
   * Add garment color background and labels (matching user's working PDF format)
   */
  private addGarmentBackground(page: PDFPage, garmentColor: string, width: number, height: number): void {
    console.log(`🎨 Adding garment background for color: "${garmentColor}"`);
    
    // Import actual garment colors from the system
    const garmentColors = this.getGarmentColorData();
    
    // Try multiple matching strategies
    let colorInfo = garmentColors.find(c => c.name.toLowerCase() === garmentColor.toLowerCase());
    
    if (!colorInfo) {
      // Try matching hex color directly
      colorInfo = garmentColors.find(c => c.hex.toLowerCase() === garmentColor.toLowerCase());
    }
    
    if (!colorInfo && garmentColor.startsWith('#')) {
      // If it's a hex color, use it directly
      const hex = garmentColor;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: height,
        color: rgb(r, g, b),
      });
      
      console.log(`🎨 Applied hex garment background: ${garmentColor} - RGB(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)})`);
      return;
    }
    
    if (colorInfo) {
      // Convert hex to RGB
      const hex = colorInfo.hex;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: height,
        color: rgb(r, g, b),
      });
      
      // Add garment color label and CMYK values (bottom of page like in user examples)
      this.addGarmentColorLabels(page, [colorInfo], width, height);
      
      console.log(`🎨 Applied garment background: ${colorInfo.name} (${hex}) - RGB(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)})`);
    } else {
      // Default to light gray if color not found
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: height,
        color: rgb(0.9, 0.9, 0.9),
      });
      console.log(`⚠️ Color "${garmentColor}" not found in garment colors, using light gray background`);
      console.log(`📋 Available colors: ${garmentColors.map(c => c.name).slice(0, 5).join(', ')}...`);
    }
  }

  /**
   * Add garment color labels and CMYK values (like in user's working PDFs)
   */
  private addGarmentColorLabels(page: PDFPage, colors: any[], width: number, height: number): void {
    // Add labels at bottom of page matching user's format
    let labelText = 'Garment Colors: ';
    
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      if (i > 0) labelText += '   ';
      labelText += `${color.name}`;
    }
    
    // Add color hex values on next line
    let hexText = '';
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      if (i > 0) hexText += '   ';
      hexText += color.hex;
    }
    
    // Draw labels at bottom of page
    page.drawText(labelText, {
      x: 20,
      y: 40,
      size: 12,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(hexText, {
      x: 20,
      y: 20,
      size: 10,
      color: rgb(0, 0, 0),
    });
    
    console.log(`🏷️ Added garment color labels: ${labelText}`);
  }

  /**
   * Get garment color data (basic set matching common colors)
   */
  private getGarmentColorData() {
    return [
      { name: 'White', hex: '#FFFFFF', cmyk: { c: 0, m: 0, y: 0, k: 0 } },
      { name: 'Black', hex: '#171816', cmyk: { c: 78, m: 68, y: 62, k: 91 } },
      { name: 'Hi Viz', hex: '#F0F42A', cmyk: { c: 5, m: 0, y: 95, k: 0 } },
      { name: 'Red', hex: '#762009', cmyk: { c: 18, m: 95, y: 68, k: 56 } },
      { name: 'Green', hex: '#3C8A35', cmyk: { c: 71, m: 0, y: 100, k: 15 } },
      { name: 'Navy', hex: '#263147', cmyk: { c: 95, m: 72, y: 15, k: 67 } },
      { name: 'Gray', hex: '#BCBFBB', cmyk: { c: 8, m: 5, y: 7, k: 16 } },
    ];
  }

  /**
   * Embed logos on a page using the original working method
   */
  private async embedLogosOnPage(
    page: PDFPage, 
    canvasElements: any[], 
    logos: any[], 
    templateSize: any
  ): Promise<void> {
    if (canvasElements.length === 0) {
      console.log(`📄 No canvas elements to embed on this page`);
      return;
    }
    
    if (logos.length === 0) {
      console.warn(`⚠️ No logos available to embed`);
      return;
    }
    
    console.log(`🎯 Embedding ${canvasElements.length} elements on page`);
    
    for (let i = 0; i < canvasElements.length; i++) {
      const element = canvasElements[i];
      
      // Find matching logo
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) {
        console.warn(`⚠️ No logo found for element ${element.id} (logoId: ${element.logoId})`);
        console.log(`🔍 Available logos:`, logos.map(l => `${l.id}:${l.filename}`).join(', '));
        continue;
      }

      console.log(`🎯 Processing logo ${i + 1}/${canvasElements.length}: ${logo.filename} (ID: ${logo.id})`);
      await this.embedSingleLogo(page, element, logo, templateSize);
    }
  }

  /**
   * Embed a single logo using the original method that worked
   */
  private async embedSingleLogo(
    page: PDFPage,
    element: any,
    logo: any,
    templateSize: any
  ): Promise<void> {
    try {
      // IMPORTANT: We no longer use original PDF embedding for multi-logo PDFs
      // The SVG conversion already preserves CMYK colors correctly through:
      // 1. NativeCMYKGenerator for exact CMYK preservation
      // 2. CMYKSVGProcessor fallback for enhanced CMYK processing
      // 3. Inkscape + Ghostscript pipeline for color space conversion
      //
      // Using the original PDF would embed the entire page with multiple logos,
      // causing distortion and scaling issues. The SVG version has the correct
      // single-logo bounds and maintains color fidelity.
      
      console.log(`🎨 Using SVG with color preservation for: ${logo.filename}`);
      
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      
      // Check if file exists
      if (!fs.existsSync(logoPath)) {
        console.error(`❌ Logo file not found: ${logoPath}`);
        return;
      }

      // Handle different file types
      if (logo.mimeType === 'application/pdf') {
        await this.embedOriginalPDF(page, element, logoPath, templateSize);
      } else if (logo.mimeType === 'image/svg+xml') {
        // Pass logo data to embedSVGLogo for CMYK analysis
        const elementWithLogo = { ...element, logo };
        await this.embedSVGLogo(page, elementWithLogo, logoPath, templateSize);
      } else {
        await this.embedImageLogo(page, element, logoPath, templateSize);
      }
      
    } catch (error) {
      console.error(`❌ Failed to embed logo ${logo.filename}:`, error);
    }
  }

  /**
   * Embed original PDF directly to preserve CMYK colors - ASPECT RATIO FIX
   */
  private async embedOriginalPDF(
    page: PDFPage,
    element: any,
    pdfPath: string,
    templateSize: any
  ): Promise<void> {
    try {
      console.log(`📄 Embedding original PDF with CMYK preservation: ${path.basename(pdfPath)}`);
      
      // Read the original PDF file
      const pdfBytes = fs.readFileSync(pdfPath);
      const sourcePdfDoc = await PDFDocument.load(pdfBytes);
      
      // Get the first page from the source PDF
      const sourcePages = sourcePdfDoc.getPages();
      if (sourcePages.length === 0) {
        console.error(`❌ Source PDF has no pages: ${pdfPath}`);
        return;
      }
      
      const sourcePage = sourcePages[0];
      const { width: originalWidth, height: originalHeight } = sourcePage.getSize();
      
      // Embed the source page into our target document
      const [embeddedPage] = await page.doc.embedPdf(sourcePdfDoc);
      
      // Calculate position
      const position = this.calculateOriginalPosition(element, templateSize, page);
      
      // CRITICAL: Use canvas dimensions directly without aspect ratio adjustment
      // This matches what the user sees on the canvas
      const targetSize = this.calculateOriginalSize(element, templateSize, page);
      
      console.log(`📊 DIRECT CANVAS EMBEDDING:`, {
        canvasElementSize: `${element.width.toFixed(1)}x${element.height.toFixed(1)}mm`,
        targetPDFSize: `${targetSize.width.toFixed(1)}x${targetSize.height.toFixed(1)}pts`,
        description: 'Using exact canvas dimensions to match user positioning'
      });
      
      console.log(`📍 Embedding original PDF at position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}) size: ${targetSize.width.toFixed(1)}x${targetSize.height.toFixed(1)}`);
      
      // Embed using exact canvas dimensions
      page.drawPage(embeddedPage, {
        x: position.x,
        y: position.y,
        width: targetSize.width,
        height: targetSize.height,
        rotate: element.rotation ? degrees(element.rotation) : undefined,
      });
      
      console.log(`✅ Successfully embedded original PDF with aspect ratio preservation: ${path.basename(pdfPath)}`);
      
    } catch (error) {
      console.error(`❌ Failed to embed original PDF:`, error);
      throw error;
    }
  }

  /**
   * Embed SVG logo with CMYK color preservation
   */
  private async embedSVGLogo(
    page: PDFPage,
    element: any,
    logoPath: string,
    templateSize: any
  ): Promise<void> {
    try {
      // Read the SVG to check if it contains multi-page content
      const svgContent = fs.readFileSync(logoPath, 'utf8');
      
      console.log(`🔍 Analyzing SVG for multi-page content and CMYK colors...`);
      
      // Check if this SVG contains CMYK colors from logo analysis
      const logo = element.logo || {};
      const svgColors = logo.svgColors;
      
      console.log(`🔍 SVG Colors Debug:`, {
        hasLogo: !!logo,
        hasSvgColors: !!svgColors,
        svgColorsType: typeof svgColors,
        colorsArray: svgColors?.colors ? `${svgColors.colors.length} colors` : 'no colors array'
      });
      
      const hasCMYKColors = svgColors && 
        Array.isArray(svgColors.colors) && 
        svgColors.colors.some((color: any) => color.isCMYK === true);
      
      console.log(`🎨 CMYK Analysis: ${hasCMYKColors ? 'CMYK colors detected' : 'No CMYK colors detected'}`);
      
      // Check if this SVG contains dual-page content (height > 1000px indicates 2-page SVG)
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
      let needsPageExtraction = false;
      
      if (viewBoxMatch) {
        const viewBox = viewBoxMatch[1].split(' ');
        const svgHeight = parseFloat(viewBox[3]);
        if (svgHeight > 1000) {
          needsPageExtraction = true;
          console.log(`📄 Multi-page SVG detected (height: ${svgHeight}px) - extracting single page content`);
        }
      }
      
      // Calculate position and size
      const position = this.calculateOriginalPosition(element, templateSize, page);
      const size = this.calculateOriginalSize(element, templateSize, page);
      
      console.log(`📍 Target position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}) size: ${size.width.toFixed(1)}x${size.height.toFixed(1)}`);
      
      let finalSvgPath = logoPath;
      
      if (needsPageExtraction) {
        // Create a single-page version of the SVG by filtering out the bottom half content
        const singlePageSvg = this.extractSinglePageFromSVG(svgContent);
        const tempSvgPath = path.join(process.cwd(), 'uploads', `temp_single_page_${Date.now()}.svg`);
        fs.writeFileSync(tempSvgPath, singlePageSvg);
        finalSvgPath = tempSvgPath;
        console.log(`✂️ Created single-page SVG: ${tempSvgPath}`);
      }
      
      // Convert SVG to PDF with CMYK preservation if needed
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_svg_${Date.now()}.pdf`);
      
      if (hasCMYKColors) {
        console.log(`🎨 Using enhanced CMYK preservation pipeline`);
        
        // Use enhanced CMYK processing for reliable color preservation
        console.log(`🎨 Processing SVG with ${svgColors?.colors?.length || 0} CMYK colors detected`);
        
        // Enhanced CMYK processing - this handles RGB to CMYK conversion properly
        const cmykProcessedSvgPath = await CMYKSVGProcessor.processSVGForCMYKPreservation(finalSvgPath, svgColors);
        
        // Use Inkscape with CMYK-specific settings
        const inkscapeCmd = `inkscape --export-type=pdf --export-pdf-version=1.7 --export-text-to-path --export-dpi=300 --export-filename="${tempPdfPath}" "${cmykProcessedSvgPath}"`;
        await execAsync(inkscapeCmd);
        
        // Post-process with Ghostscript for true CMYK color space
        const tempGsPath = path.join(process.cwd(), 'uploads', `temp_gs_${Date.now()}.pdf`);
        const gsCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dAutoFilterColorImages=false -dAutoFilterGrayImages=false -dDownsampleColorImages=false -dDownsampleGrayImages=false -dPreserveSeparation=true -dPreserveDeviceN=true -dUseCIEColor=false -sOutputFile="${tempGsPath}" "${tempPdfPath}"`;
        await execAsync(gsCmd);
        
        fs.copyFileSync(tempGsPath, tempPdfPath);
        fs.unlinkSync(tempGsPath);
        
        // DEBUGGING: Keep CMYK processed files for inspection
        console.log(`🔍 CMYK processed SVG: ${cmykProcessedSvgPath}`);
        
        // Comment out for debugging
        // if (fs.existsSync(cmykProcessedSvgPath)) {
        //   fs.unlinkSync(cmykProcessedSvgPath);
        // }
        
        console.log(`🎨 Enhanced CMYK processing completed: ${tempPdfPath}`);
      } else {
        // Use standard Inkscape conversion for RGB/non-CMYK content
        const inkscapeCmd = `inkscape --export-type=pdf --export-pdf-version=1.5 --export-text-to-path --export-filename="${tempPdfPath}" "${finalSvgPath}"`;
        await execAsync(inkscapeCmd);
        console.log(`🎨 SVG converted to PDF (standard conversion): ${tempPdfPath}`);
      }
      
      // Read and embed the PDF
      const pdfBytes = fs.readFileSync(tempPdfPath);
      const tempDoc = await PDFDocument.load(pdfBytes);
      const [embeddedPage] = await page.doc.embedPdf(tempDoc);
      
      // Get the actual temp PDF dimensions
      const tempPageSize = embeddedPage.size();
      console.log(`📏 Temp PDF dimensions: ${tempPageSize.width.toFixed(1)}x${tempPageSize.height.toFixed(1)} pts`);
      
      // The temp PDF contains the logo at its original size, we need to scale and position it
      // Draw the embedded PDF with calculated position and size
      page.drawPage(embeddedPage, {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        rotate: element.rotation ? degrees(element.rotation) : undefined,
      });
      
      console.log(`✅ Successfully embedded SVG as vector PDF with ${hasCMYKColors ? 'CMYK preservation' : 'standard conversion'} at (${position.x.toFixed(1)}, ${position.y.toFixed(1)})`);
      
      // DEBUGGING: Keep temp files for inspection
      console.log(`🔍 DEBUG: Keeping temp files for inspection:`);
      console.log(`🔍 Temp PDF: ${tempPdfPath}`);
      if (needsPageExtraction && finalSvgPath !== logoPath) {
        console.log(`🔍 Temp SVG: ${finalSvgPath}`);
      }
      
      // Check if the generated PDF has content
      try {
        const pdfStats = fs.statSync(tempPdfPath);
        console.log(`📊 Generated PDF size: ${pdfStats.size} bytes`);
        
        // Try to read PDF content to see if it has actual content
        const pdfBuffer = fs.readFileSync(tempPdfPath);
        const pdfContentPreview = pdfBuffer.toString('ascii', 0, 200);
        console.log(`📄 PDF content preview: ${pdfContentPreview.replace(/[^\x20-\x7E]/g, '.')}`);
      } catch (error) {
        console.error(`❌ Failed to inspect generated PDF:`, error);
      }
      
      // Comment out cleanup for debugging
      // try {
      //   fs.unlinkSync(tempPdfPath);
      //   if (needsPageExtraction && finalSvgPath !== logoPath) {
      //     fs.unlinkSync(finalSvgPath);
      //   }
      // } catch {
      //   // Ignore cleanup errors
      // }
      
    } catch (error) {
      console.error(`❌ Failed to embed SVG logo:`, error);
      throw error;
    }
  }

  /**
   * Embed image logo using the original working method - ASPECT RATIO FIX
   */
  private async embedImageLogo(
    page: PDFPage,
    element: any,
    logoPath: string,
    templateSize: any
  ): Promise<void> {
    const imageBytes = fs.readFileSync(logoPath);
    const image = await page.doc.embedPng(imageBytes);
    
    const position = this.calculateOriginalPosition(element, templateSize, page);
    
    // Use canvas element dimensions directly - preserves user's intended size
    const targetSize = this.calculateOriginalSize(element, templateSize, page);
    
    console.log(`📍 Embedding image at position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}) size: ${targetSize.width.toFixed(1)}x${targetSize.height.toFixed(1)}`);
    
    page.drawImage(image, {
      x: position.x,
      y: position.y,
      width: targetSize.width,
      height: targetSize.height,
      rotate: element.rotation ? degrees(element.rotation) : undefined,
    });
    
    console.log(`✅ Successfully embedded image logo with preserved aspect ratio`);
  }

  /**
   * Calculate position using the original working method - FIXED SCALING  
   */
  private calculateOriginalPosition(element: any, templateSize: any, page: PDFPage): { x: number; y: number } {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const MM_TO_POINTS = 2.834645669;
    
    console.log(`📊 Position calculation debug:`, {
      elementX: element.x,
      elementY: element.y,
      elementWidth: element.width,
      elementHeight: element.height,
      pageWidth,
      pageHeight,
      templateMmWidth: templateSize.width,
      templateMmHeight: templateSize.height
    });
    
    // Convert coordinates from millimeters to PDF points directly
    // Canvas coordinate system: (0,0) at top-left
    // PDF coordinate system: (0,0) at bottom-left
    
    // Convert element position directly from millimeters to points
    const pdfX = element.x * MM_TO_POINTS;
    
    // PDF Y coordinate is from bottom, canvas Y is from top
    // So we need to flip: PDF_Y = PageHeight - Canvas_Y - Element_Height
    const elementHeightPoints = element.height * MM_TO_POINTS;
    const elementYPoints = element.y * MM_TO_POINTS;
    const pdfY = pageHeight - elementYPoints - elementHeightPoints;
    
    console.log(`📐 Direct MM to Points coordinate conversion:`, {
      canvasXmm: element.x,
      canvasYmm: element.y,
      elementHeightMM: element.height,
      mmToPoints: MM_TO_POINTS,
      pageHeightPoints: pageHeight.toFixed(1),
      elementXPoints: pdfX.toFixed(1),
      elementYPoints: elementYPoints.toFixed(1),
      elementHeightPoints: elementHeightPoints.toFixed(1),
      pdfY: pdfY.toFixed(1),
      finalX: pdfX.toFixed(1),
      finalY: pdfY.toFixed(1)
    });
    
    return { x: pdfX, y: pdfY };
  }

  /**
   * Calculate size using canvas element dimensions - PRESERVES USER'S INTENDED SIZE
   */
  private calculateOriginalSize(element: any, templateSize: any, page: PDFPage): { width: number; height: number } {
    const MM_TO_POINTS = 2.834645669;
    
    // ALWAYS use canvas element dimensions - this preserves user's intended size and positioning
    const width = element.width * MM_TO_POINTS;
    const height = element.height * MM_TO_POINTS;
    
    console.log(`📏 Using canvas element dimensions for output (preserves user intent):`, {
      elementWidthMM: element.width,
      elementHeightMM: element.height,
      mmToPoints: MM_TO_POINTS,
      finalWidthPoints: width.toFixed(1),
      finalHeightPoints: height.toFixed(1),
      finalWidthMM: (width / MM_TO_POINTS).toFixed(1),
      finalHeightMM: (height / MM_TO_POINTS).toFixed(1)
    });
    
    return { width, height };
  }

  /**
   * Extract single page content from a multi-page SVG by analyzing actual content bounds
   */
  private extractSinglePageFromSVG(svgContent: string): string {
    try {
      // For now, return the original SVG to avoid clipping issues
      // The duplicate removal will be handled by better coordinate filtering
      console.log(`✂️ Preserving original SVG to avoid clipping - duplicate filtering will handle overlaps`);
      
      // Parse viewBox to get dimensions for logging
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
      if (viewBoxMatch) {
        const [x, y, width, height] = viewBoxMatch[1].split(' ').map(Number);
        console.log(`📐 Original SVG dimensions: ${width}x${height}px`);
      }
      
      // Instead of cutting the SVG, we'll rely on proper positioning to handle duplicates
      return svgContent;
      
    } catch (error) {
      console.warn(`⚠️ Failed to extract single page from SVG:`, error);
      return svgContent; // Return original on error
    }
  }

  /**
   * Filter SVG paths to remove elements in the bottom half
   */
  private filterSVGPathsByYPosition(svgContent: string, maxY: number): string {
    try {
      // Find all path elements and filter them based on their y-coordinates
      const pathPattern = /<path[^>]*d="[^"]*"[^>]*\/>/g;
      let filteredSvg = svgContent;
      
      const paths = svgContent.match(pathPattern);
      if (!paths) {
        return svgContent;
      }
      
      let removedPaths = 0;
      
      paths.forEach(path => {
        // Extract y-coordinates from the path data
        const dAttribute = path.match(/d="([^"]+)"/)?.[1];
        if (!dAttribute) return;
        
        // Look for Y coordinates in the path data (simplified approach)
        const yCoords = dAttribute.match(/(\d+\.?\d*)/g)
          ?.map(Number)
          ?.filter((_, index) => index % 2 === 1) // Take every second number (Y coords)
          ?.filter(y => !isNaN(y));
        
        if (yCoords && yCoords.length > 0) {
          // If any Y coordinate is in the bottom half, remove this path
          const minY = Math.min(...yCoords);
          if (minY > maxY) {
            filteredSvg = filteredSvg.replace(path, '');
            removedPaths++;
          }
        }
      });
      
      console.log(`🗑️ Removed ${removedPaths} paths from bottom half of SVG`);
      
      return filteredSvg;
      
    } catch (error) {
      console.warn(`⚠️ Failed to filter SVG paths:`, error);
      return svgContent;
    }
  }
}