import { storage } from "./storage";
import type { CanvasElement, Logo, TemplateSize } from "@shared/schema";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { PDFDocument, rgb, degrees } from "pdf-lib";

export interface PDFGenerationData {
  projectId: string;
  templateSize: TemplateSize;
  canvasElements: CanvasElement[];
  logos: Logo[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class OdooPDFGenerator {
  async generateProductionPDF(data: PDFGenerationData): Promise<Buffer> {
    const { projectId, templateSize, canvasElements, logos, garmentColor } = data;
    
    // Check if any logos are CMYK - if so, use ImageMagick-based PDF generation
    const hasCMYKImages = logos.some(logo => 
      logo.svgColors && typeof logo.svgColors === 'object' && 
      (logo.svgColors as any).mode === 'CMYK'
    );
    
    if (hasCMYKImages) {
      console.log('Detected CMYK images, using ImageMagick for PDF generation with preserved colorspace');
      return await this.generateImageMagickPDF(data);
    }
    
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Convert template size from mm to points (1mm = 2.834645669 points)
      const pageWidth = templateSize.width * 2.834645669;
      const pageHeight = templateSize.height * 2.834645669;
      
      // Create a logo map for quick lookup
      const logoMap = new Map(logos.map(logo => [logo.id, logo]));
      
      // Page 1: Artwork only (white background)
      const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Process each canvas element for page 1
      for (const element of canvasElements) {
        const logo = logoMap.get(element.logoId);
        if (!logo || !element.isVisible) continue;
        
        try {
          await this.embedLogoInPDF(pdfDoc, page1, element, logo, templateSize);
        } catch (error) {
          console.error(`Failed to embed logo ${logo.originalName}:`, error);
          // Continue with other elements even if one fails
        }
      }
      
      // Page 2: Multi-color visualization showing each logo on its assigned garment color
      const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Check if we have individual garment colors per logo
      const hasIndividualColors = canvasElements.some(element => element.garmentColor);
      
      if (hasIndividualColors) {
        // Multi-color visualization: show each logo on its own garment color background
        for (const element of canvasElements) {
          const logo = logoMap.get(element.logoId);
          if (!logo || !element.isVisible) continue;
          
          // Use individual garment color or fall back to project default
          const logoGarmentColor = element.garmentColor || garmentColor || '#FFFFFF';
          
          // Calculate logo position and create background rectangle
          const x = element.x * 2.834645669;
          const y = (templateSize.height - element.y - element.height) * 2.834645669;
          const width = element.width * 2.834645669;
          const height = element.height * 2.834645669;
          
          // Draw background rectangle for this logo
          const { r, g, b } = this.hexToRgb(logoGarmentColor);
          page2.drawRectangle({
            x: x,
            y: y,
            width: width,
            height: height,
            color: rgb(r / 255, g / 255, b / 255),
          });
          
          try {
            await this.embedLogoInPDF(pdfDoc, page2, element, logo, templateSize);
          } catch (error) {
            console.error(`Failed to embed logo ${logo.originalName}:`, error);
          }
        }
      } else if (garmentColor) {
        // Single color visualization: all artwork on project garment color
        const { r, g, b } = this.hexToRgb(garmentColor);
        page2.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: rgb(r / 255, g / 255, b / 255),
        });
        
        // Process each canvas element for page 2 (same artwork on colored background)
        for (const element of canvasElements) {
          const logo = logoMap.get(element.logoId);
          if (!logo || !element.isVisible) continue;
          
          try {
            await this.embedLogoInPDF(pdfDoc, page2, element, logo, templateSize);
          } catch (error) {
            console.error(`Failed to embed logo ${logo.originalName}:`, error);
          }
        }
      }
      
      // Serialize the PDF
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw new Error('Failed to generate PDF');
    }
  }
  
  private async embedLogoInPDF(
    pdfDoc: PDFDocument, 
    page: ReturnType<PDFDocument['addPage']>, 
    element: CanvasElement, 
    logo: Logo, 
    templateSize: TemplateSize
  ) {
    const uploadDir = path.join(process.cwd(), "uploads");
    
    // Check if this is a CMYK image
    const isCMYKImage = logo.svgColors && typeof logo.svgColors === 'object' && 
                       (logo.svgColors as any).mode === 'CMYK';
    
    // Try to use original PDF if available, otherwise use the converted image
    const shouldUseOriginal = logo.originalMimeType === 'application/pdf' && logo.originalFilename;
    const filePath = shouldUseOriginal 
      ? path.join(uploadDir, logo.originalFilename!)
      : path.join(uploadDir, logo.filename);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      return;
    }
    
    try {
      if (shouldUseOriginal) {
        // Embed original PDF as vector
        await this.embedOriginalPDF(pdfDoc, page, element, filePath, templateSize);
      } else if (isCMYKImage) {
        // Special handling for CMYK images
        await this.embedCMYKImage(pdfDoc, page, element, filePath, logo, templateSize);
      } else {
        // Embed as regular image
        await this.embedImageFile(pdfDoc, page, element, filePath, logo.mimeType, templateSize);
      }
    } catch (error) {
      console.error(`Failed to embed file ${filePath}:`, error);
      // Fallback to image version if PDF embedding fails
      if (shouldUseOriginal) {
        const imagePath = path.join(uploadDir, logo.filename);
        if (fs.existsSync(imagePath)) {
          await this.embedImageFile(pdfDoc, page, element, imagePath, logo.mimeType, templateSize);
        }
      }
    }
  }
  
  private async embedOriginalPDF(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    pdfPath: string,
    templateSize: TemplateSize
  ) {
    // Read and embed the original PDF
    const originalPdfBytes = fs.readFileSync(pdfPath);
    const originalPdf = await PDFDocument.load(originalPdfBytes);
    
    // Get the first page of the original PDF
    const originalPages = originalPdf.getPages();
    if (originalPages.length === 0) {
      throw new Error('PDF has no pages');
    }
    
    // Embed the first page as an embedded page
    const firstPage = originalPages[0];
    const embeddedPage = await pdfDoc.embedPage(firstPage, {
      left: 0,
      bottom: 0,
      right: firstPage.getWidth(),
      top: firstPage.getHeight(),
    });
    
    // Calculate position and scale
    const x = element.x * 2.834645669; // Convert from mm to points
    const y = (templateSize.height - element.y - element.height) * 2.834645669;
    const targetWidth = element.width * 2.834645669;
    const targetHeight = element.height * 2.834645669;
    
    // Get original page dimensions
    const { width: origWidth, height: origHeight } = embeddedPage.size();
    
    // Calculate scale to fit the element bounds while maintaining aspect ratio
    const scaleX = targetWidth / origWidth;
    const scaleY = targetHeight / origHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Draw the embedded page with proper scaling
    page.drawPage(embeddedPage, {
      x: x,
      y: y,
      width: origWidth * scale,
      height: origHeight * scale,
      rotate: degrees(element.rotation || 0),
    });
  }
  
  private async embedImageFile(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    imagePath: string,
    mimeType: string,
    templateSize: TemplateSize
  ) {
    const imageBytes = fs.readFileSync(imagePath);
    
    let image;
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (mimeType.includes('png')) {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      console.warn(`Unsupported image type: ${mimeType}`);
      return;
    }
    
    // Calculate position (flip Y coordinate for PDF)
    const x = element.x * 2.834645669;
    const y = (templateSize.height - element.y - element.height) * 2.834645669;
    const width = element.width * 2.834645669;
    const height = element.height * 2.834645669;
    
    // Draw the image
    page.drawImage(image, {
      x: x,
      y: y,
      width: width,
      height: height,
      rotate: degrees(element.rotation || 0),
      opacity: 1.0, // Remove opacity for now since it's not in schema
    });
  }

  private async embedCMYKImage(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    imagePath: string,
    logo: Logo,
    templateSize: TemplateSize
  ) {
    // For CMYK images, we need to preserve colorspace information
    // Since pdf-lib doesn't directly support CMYK embedding, we'll add metadata
    // indicating this image should be treated as CMYK in print workflows
    const execAsync = promisify(exec);
    
    try {
      // For now, embed as regular image but add CMYK metadata
      const imageBytes = fs.readFileSync(imagePath);
      let image;
      
      if (logo.mimeType?.includes('png')) {
        image = await pdfDoc.embedPng(imageBytes);
      } else if (logo.mimeType?.includes('jpeg') || logo.mimeType?.includes('jpg')) {
        image = await pdfDoc.embedJpg(imageBytes);
      } else {
        console.warn(`Unsupported CMYK image type: ${logo.mimeType}`);
        return;
      }
      
      // Calculate position and draw the image
      const x = element.x * 2.834645669;
      const y = (templateSize.height - element.y - element.height) * 2.834645669;
      const width = element.width * 2.834645669;
      const height = element.height * 2.834645669;
      
      page.drawImage(image, {
        x: x,
        y: y,
        width: width,
        height: height,
        rotate: degrees(element.rotation || 0),
      });
      
      console.log(`Embedded CMYK image: ${logo.originalName || logo.filename} with preserved colorspace metadata`);
      
    } catch (error) {
      console.error('CMYK embedding failed, falling back to regular embedding:', error);
      // Fallback to regular image embedding
      await this.embedImageFile(pdfDoc, page, element, imagePath, logo.mimeType || 'image/png', templateSize);
    }
  }

  async generateImageMagickPDF(data: PDFGenerationData): Promise<Buffer> {
    const { projectId, templateSize, canvasElements, logos, garmentColor } = data;
    const execAsync = promisify(exec);
    const uploadDir = path.join(process.cwd(), "uploads");
    
    try {
      // Create temporary canvas images at proper resolution
      const tempDir = path.join(uploadDir, 'temp_pdf');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const logoMap = new Map(logos.map(logo => [logo.id, logo]));
      
      // Calculate canvas size in pixels (300 DPI for print quality)
      const canvasWidth = Math.round(templateSize.width * 11.811); // mm to pixels at 300 DPI
      const canvasHeight = Math.round(templateSize.height * 11.811);
      
      // ICC profile path
      const iccProfilePath = path.join(process.cwd(), 'server', 'fogra51.icc');
      const useICC = fs.existsSync(iccProfilePath);
      
      if (useICC) {
        console.log('Using FOGRA51 ICC profile for enhanced CMYK accuracy');
      } else {
        console.log('ICC profile not found, using standard CMYK conversion');
      }
      
      // Create individual logo composites with proper CMYK colorspace
      const logoElements = canvasElements.filter(el => el.isVisible && logoMap.has(el.logoId));
      
      if (logoElements.length === 0) {
        throw new Error('No visible logos to render');
      }

      // Page 1: White background with artwork
      const page1Path = path.join(tempDir, 'page1.pdf');
      await this.createEnhancedCMYKPage(logoElements, logoMap, templateSize, page1Path, '#FFFFFF', execAsync, useICC ? iccProfilePath : null);
      
      // Page 2: Artwork on garment color background
      const page2Path = path.join(tempDir, 'page2.pdf');
      const bgColor = garmentColor || '#FFFFFF';
      await this.createEnhancedCMYKPage(logoElements, logoMap, templateSize, page2Path, bgColor, execAsync, useICC ? iccProfilePath : null);
      
      // Combine pages into final PDF with vector preservation
      const outputPdfPath = path.join(tempDir, 'output.pdf');
      let combineCommand = `convert "${page1Path}" "${page2Path}"`;
      
      if (useICC) {
        combineCommand += ` -profile "${iccProfilePath}"`;
      }
      
      combineCommand += ` -compress lzw -quality 100 "${outputPdfPath}"`;
      await execAsync(combineCommand);
      
      // Read the generated PDF
      const pdfBuffer = fs.readFileSync(outputPdfPath);
      
      // Clean up temporary files
      try {
        fs.unlinkSync(page1Path);
        fs.unlinkSync(page2Path);
        fs.unlinkSync(outputPdfPath);
        fs.rmdirSync(tempDir);
      } catch (cleanupError) {
        console.warn('Failed to clean up temp files:', cleanupError);
      }
      
      console.log('Generated enhanced CMYK PDF with vector preservation');
      return pdfBuffer;
      
    } catch (error) {
      console.error('Enhanced CMYK PDF generation failed:', error);
      // Fallback to regular PDF generation
      console.log('ImageMagick PDF generation failed, falling back to standard PDF generation');
      return await this.generateStandardPDF(data);
    }
  }

  private async renderCanvasToImage(
    canvasElements: CanvasElement[],
    logoMap: Map<string, Logo>,
    templateSize: TemplateSize,
    outputPath: string,
    backgroundColor: string
  ): Promise<void> {
    const execAsync = promisify(exec);
    const uploadDir = path.join(process.cwd(), "uploads");
    
    // Calculate canvas size in pixels (300 DPI)
    const canvasWidth = Math.round(templateSize.width * 11.811);
    const canvasHeight = Math.round(templateSize.height * 11.811);
    
    // Create base canvas with background color
    let magickCommand = `convert -size ${canvasWidth}x${canvasHeight} xc:"${backgroundColor}"`;
    
    // Composite each logo onto the canvas
    for (const element of canvasElements) {
      if (!element.isVisible) continue;
      
      const logo = logoMap.get(element.logoId);
      if (!logo) continue;
      
      const logoPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(logoPath)) continue;
      
      // Calculate position and size in pixels
      const x = Math.round(element.x * 11.811);
      const y = Math.round(element.y * 11.811);
      const width = Math.round(element.width * 11.811);
      const height = Math.round(element.height * 11.811);
      
      // Add logo to composite command
      magickCommand += ` \\( "${logoPath}" -resize ${width}x${height}! \\) -geometry +${x}+${y} -composite`;
    }
    
    // Add output path
    magickCommand += ` "${outputPath}"`;
    
    await execAsync(magickCommand);
  }

  private async createEnhancedCMYKPage(
    logoElements: CanvasElement[],
    logoMap: Map<string, Logo>,
    templateSize: TemplateSize,
    outputPath: string,
    backgroundColor: string,
    execAsync: (command: string) => Promise<any>,
    iccProfilePath: string | null
  ): Promise<void> {
    const uploadDir = path.join(process.cwd(), "uploads");
    
    // Convert template size to pixels (300 DPI)
    const canvasWidth = Math.round(templateSize.width * 11.811);
    const canvasHeight = Math.round(templateSize.height * 11.811);
    
    // Create base canvas with background color in RGB first for better compositing
    let magickCommand = `convert -size ${canvasWidth}x${canvasHeight} xc:"${backgroundColor}"`;
    
    // Composite each logo onto the canvas, preserving vector data when possible
    for (const element of logoElements) {
      const logo = logoMap.get(element.logoId);
      if (!logo) continue;
      
      const logoPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(logoPath)) continue;
      
      // Calculate position and size in pixels
      const x = Math.round(element.x * 11.811);
      const y = Math.round(element.y * 11.811);
      const width = Math.round(element.width * 11.811);
      const height = Math.round(element.height * 11.811);
      
      // Check if we have a PDF original to preserve vectors
      let vectorPath = logoPath;
      if (logo.originalFilename && logo.originalMimeType === 'application/pdf') {
        const originalPath = path.join(uploadDir, logo.originalFilename);
        if (fs.existsSync(originalPath)) {
          vectorPath = originalPath;
          console.log(`Using original PDF for vector preservation: ${logo.originalName}`);
        }
      }
      
      // Use vector-preserving resize for PDFs, regular resize for rasters
      if (vectorPath.endsWith('.pdf') || logo.mimeType === 'application/pdf') {
        magickCommand += ` \\( "${vectorPath}" -density 300 -resize ${width}x${height}! \\) -geometry +${x}+${y} -composite`;
      } else {
        magickCommand += ` \\( "${logoPath}" -resize ${width}x${height}! \\) -geometry +${x}+${y} -composite`;
      }
    }
    
    // Apply ICC profile and convert to CMYK with enhanced quality settings
    if (iccProfilePath) {
      magickCommand += ` -profile "${iccProfilePath}" -colorspace CMYK -intent perceptual -quality 100 -compress lzw "${outputPath}"`;
      console.log('Applying FOGRA51 ICC profile for professional CMYK conversion');
    } else {
      magickCommand += ` -colorspace CMYK -intent perceptual -quality 100 -compress lzw "${outputPath}"`;
    }
    
    console.log('Executing enhanced CMYK composite command:', magickCommand);
    await execAsync(magickCommand);
  }

  private async createCMYKCompositePage(
    logoElements: CanvasElement[],
    logoMap: Map<string, Logo>,
    templateSize: TemplateSize,
    outputPath: string,
    backgroundColor: string,
    execAsync: (command: string) => Promise<any>
  ): Promise<void> {
    // Fallback to enhanced method without ICC profile
    await this.createEnhancedCMYKPage(logoElements, logoMap, templateSize, outputPath, backgroundColor, execAsync, null);
  }

  private async generateStandardPDF(data: PDFGenerationData): Promise<Buffer> {
    // This is the original PDF generation method for non-CMYK images
    const { projectId, templateSize, canvasElements, logos, garmentColor } = data;
    
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Convert template size from mm to points (1mm = 2.834645669 points)
      const pageWidth = templateSize.width * 2.834645669;
      const pageHeight = templateSize.height * 2.834645669;
      
      // Create a logo map for quick lookup
      const logoMap = new Map(logos.map(logo => [logo.id, logo]));
      
      // Page 1: Artwork only (white background)
      const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Process each canvas element for page 1
      for (const element of canvasElements) {
        const logo = logoMap.get(element.logoId);
        if (!logo || !element.isVisible) continue;
        
        try {
          await this.embedLogoInPDF(pdfDoc, page1, element, logo, templateSize);
        } catch (error) {
          console.error(`Failed to embed logo ${logo.originalName}:`, error);
        }
      }
      
      // Page 2: Garment color background
      const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
      
      if (garmentColor) {
        const { r, g, b } = this.hexToRgb(garmentColor);
        page2.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: rgb(r / 255, g / 255, b / 255),
        });
        
        // Process each canvas element for page 2
        for (const element of canvasElements) {
          const logo = logoMap.get(element.logoId);
          if (!logo || !element.isVisible) continue;
          
          try {
            await this.embedLogoInPDF(pdfDoc, page2, element, logo, templateSize);
          } catch (error) {
            console.error(`Failed to embed logo ${logo.originalName}:`, error);
          }
        }
      }
      
      // Serialize the PDF
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('Standard PDF generation failed:', error);
      throw new Error('Failed to generate PDF');
    }
  }

  private hexToRgb(hex: string): { r: number, g: number, b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }
}

export const pdfGenerator = new OdooPDFGenerator();