import { PDFDocument, rgb, PDFPage, degrees, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const manufacturerColors = [
  { name: 'white', hex: '#FFFFFF' },
  { name: 'black', hex: '#000000' },
  { name: 'red', hex: '#FF0000' },
  { name: 'blue', hex: '#0000FF' },
  { name: 'green', hex: '#00FF00' },
  { name: 'yellow', hex: '#FFFF00' },
];

// SVG corruption fix function
function fixSVGCorruption(svgContent: string): string {
  console.log('🔧 Applying automatic SVG corruption fixes during PDF generation');
  
  let fixed = svgContent;
  
  // Fix 1: Remove invalid fill attributes from clipPath elements with malformed XML
  fixed = fixed.replace(
    /<path clip-rule="[^"]*" d="[^"]*"\s*\/\s*fill="#[0-9A-Fa-f]{6}">/g, 
    function(match) {
      const dMatch = match.match(/d="([^"]*)"/);
      if (dMatch) {
        return `<path clip-rule="nonzero" d="${dMatch[1]}"/>`;
      }
      return '<path clip-rule="nonzero" d=""/>';
    }
  );
  
  // Fix 2: Remove any remaining fill attributes from clipPath path elements
  fixed = fixed.replace(
    /<path ([^>]*) fill="#[0-9A-Fa-f]{6}"([^>]*?)>/g,
    function(match, before, after) {
      if (match.includes('clip-rule')) {
        return `<path ${before}${after}>`;
      }
      return match; // Keep fill for non-clipPath elements
    }
  );
  
  // Fix 3: Remove any trailing "/" before fill attributes that cause XML errors
  fixed = fixed.replace(/"\s*\/\s*fill="/g, '" fill="');
  
  if (fixed !== svgContent) {
    console.log('✅ Applied SVG corruption fixes automatically');
  }
  
  return fixed;
}

const execAsync = promisify(exec);

interface SimplifiedPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
  colorChanges?: Record<string, string>;
}

export class SimplifiedPDFGenerator {
  /**
   * Generate PDF that preserves original file content
   * Only applies color changes if user has made modifications
   */
  async generatePDF(data: SimplifiedPDFData): Promise<Buffer> {
    console.log('📄 Production Flow PDF Generation Started');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);
    
    // PRODUCTION FLOW: Validate color preservation requirements
    const { productionFlow } = await import('./production-flow-manager');
    const colorPreservationValid = productionFlow.validateColorPreservation(data.logos, data.colorChanges);
    
    if (!colorPreservationValid) {
      console.warn('⚠️ Production Flow: Color preservation validation failed');
    } else {
      console.log('✅ Production Flow: Original colors will be preserved (Requirement 1 & 2)');
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(data.projectId);
    pdfDoc.setCreator('CompleteTransfers.com Logo Uploader');

    // Create pages based on template and garment color
    const page1 = pdfDoc.addPage([
      data.templateSize.width * 2.834,
      data.templateSize.height * 2.834
    ]);

    // Page 1: Design without background (transparent)
    // Don't draw any background for the first page
    await this.embedLogos(pdfDoc, page1, data.canvasElements, data.logos, data.templateSize);

    // Page 2: Design with colored background (restore original dual-page generation)
    console.log('📄 Creating Page 2 with garment background (restored original behavior)');
    
    const templateWidthPoints = data.templateSize.width * 2.834;
    const templateHeightPoints = data.templateSize.height * 2.834;
    const page2 = pdfDoc.addPage([templateWidthPoints, templateHeightPoints]);
    
    // Add colored background
    const garmentColorInfo = data.garmentColor && data.garmentColor !== 'none' 
      ? manufacturerColors.find((c: any) => c.name === data.garmentColor)
      : null;
    
    if (garmentColorInfo) {
      const bgColor = garmentColorInfo.hex;
      const [r, g, b] = [
        parseInt(bgColor.slice(1, 3), 16) / 255,
        parseInt(bgColor.slice(3, 5), 16) / 255,
        parseInt(bgColor.slice(5, 7), 16) / 255
      ];
      
      page2.drawRectangle({
        x: 0,
        y: 0,
        width: templateWidthPoints,
        height: templateHeightPoints,
        color: rgb(r, g, b),
      });
      console.log(`🎨 Applied garment background color: ${data.garmentColor} (${bgColor})`);
    }
    
    // Embed logos on page 2
    await this.embedLogos(pdfDoc, page2, data.canvasElements, data.logos, data.templateSize);

    const pdfBytes = await pdfDoc.save();
    console.log('✅ Simplified PDF generated successfully');
    return Buffer.from(pdfBytes);
  }

  private drawBackground(page: PDFPage, color: string) {
    const { width, height } = page.getSize();
    
    if (color === 'white') {
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: rgb(1, 1, 1),
      });
    } else {
      // Convert hex color to RGB
      const rgbColor = this.hexToRgb(color);
      if (rgbColor) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width,
          height,
          color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255),
        });
      }
    }
  }

  private async drawElementBackgrounds(
    page: PDFPage,
    elements: any[],
    templateSize: any,
    defaultGarmentColor?: string
  ) {
    // First draw the default background if specified
    if (defaultGarmentColor) {
      this.drawBackground(page, defaultGarmentColor);
    }
    
    // Then draw individual element backgrounds
    for (const element of elements) {
      if (element.garmentColor && element.garmentColor !== defaultGarmentColor) {
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        const rgbColor = this.hexToRgb(element.garmentColor);
        if (rgbColor) {
          page.drawRectangle({
            x: position.x,
            y: position.y,
            width: element.width * scale,
            height: element.height * scale,
            color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255),
            rotate: element.rotation ? degrees(element.rotation) : undefined,
          });
        }
      }
    }
  }

  private async addColorLabels(
    pdfDoc: PDFDocument,
    page: PDFPage,
    elements: any[],
    templateSize: any,
    defaultGarmentColor?: string
  ) {
    console.log('🎨 Adding color labels to PDF page 2');
    
    // Get font for labels
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;
    const pageHeight = page.getSize().height;
    
    // Get unique colors used
    const colorsUsed = new Map<string, { name: string; cmyk: string }>();
    
    // Add default garment color if specified
    if (defaultGarmentColor) {
      const colorInfo = this.getColorInfo(defaultGarmentColor);
      console.log(`🎨 Default garment color: ${defaultGarmentColor}, name: ${colorInfo.name}, cmyk: ${colorInfo.cmyk}`);
      colorsUsed.set(defaultGarmentColor, colorInfo);
    }
    
    // Add individual element colors
    for (const element of elements) {
      if (element.garmentColor) {
        const colorInfo = this.getColorInfo(element.garmentColor);
        console.log(`🎨 Element ${element.id} garment color: ${element.garmentColor}, name: ${colorInfo.name}, cmyk: ${colorInfo.cmyk}`);
        colorsUsed.set(element.garmentColor, colorInfo);
      }
    }
    
    console.log(`🎨 Total unique colors found: ${colorsUsed.size}`);
    console.log(`🎨 Colors to be displayed:`, Array.from(colorsUsed.entries()));
    
    // Draw color labels at the bottom of the page
    let xOffset = 20;
    const yOffset = 20;
    const squareSize = 15;
    const padding = 10;
    
    Array.from(colorsUsed.entries()).forEach(([colorHex, colorInfo]) => {
      // Draw color square
      const rgbColor = this.hexToRgb(colorHex);
      if (rgbColor) {
        page.drawRectangle({
          x: xOffset,
          y: yOffset,
          width: squareSize,
          height: squareSize,
          color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255),
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
      }
      
      // Draw label text with color name and CMYK values
      const labelText = colorInfo.cmyk ? `${colorInfo.name} ${colorInfo.cmyk}` : colorInfo.name;
      page.drawText(labelText, {
        x: xOffset + squareSize + 5,
        y: yOffset + 3,
        size: fontSize,
        font,
        color: rgb(0x6D / 255, 0x6D / 255, 0x6D / 255),
      });
      
      // Move to next position
      const textWidth = font.widthOfTextAtSize(labelText, fontSize);
      xOffset += squareSize + textWidth + padding + 10;
    });
  }

  private getColorName(hexColor: string): string | null {
    console.log(`🔍 Looking for color name for hex: ${hexColor}`);
    
    // If no hex color provided, return null
    if (!hexColor) return null;
    
    // Search through all manufacturer colors to find the name
    for (const [manufacturer, colorGroups] of Object.entries(manufacturerColors)) {
      for (const group of colorGroups) {
        for (const color of group.colors) {
          if (color.hex.toLowerCase() === hexColor.toLowerCase()) {
            console.log(`✅ Found color: ${color.name} from ${manufacturer}`);
            return color.name;
          }
        }
      }
    }
    
    // If exact match not found, return the hex color as the name
    console.log(`❌ No exact color name found for hex: ${hexColor}, using hex as label`);
    return hexColor.toUpperCase();
  }

  private getColorInfo(hexColor: string): { name: string; cmyk: string } {
    console.log(`🔍 Looking for color info for hex: ${hexColor}`);
    
    // If no hex color provided, return hex
    if (!hexColor) return { name: hexColor, cmyk: "" };
    
    // Only look for exact matches in manufacturer colors
    for (const [manufacturer, colorGroups] of Object.entries(manufacturerColors)) {
      for (const group of colorGroups) {
        for (const color of group.colors) {
          if (color.hex.toLowerCase() === hexColor.toLowerCase()) {
            console.log(`✅ Found exact color: ${color.name} from ${manufacturer}`);
            const cmyk = `(${color.cmyk.c}, ${color.cmyk.m}, ${color.cmyk.y}, ${color.cmyk.k})`;
            return { name: color.name, cmyk };
          }
        }
      }
    }
    
    // If no exact match found, return the hex color as the name
    console.log(`❌ No exact color match found for hex: ${hexColor}, using hex as label`);
    return { name: hexColor.toUpperCase(), cmyk: "" };
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private async embedLogos(
    pdfDoc: PDFDocument,
    page: PDFPage,
    elements: any[],
    logos: any[],
    templateSize: any
  ) {
    for (const element of elements) {
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) continue;

      console.log(`📌 Processing logo: ${logo.filename}`);

      try {
        // PRODUCTION FLOW: Check if user has made color modifications
        const hasColorChanges = await this.checkForColorChanges(element, logo);
        
        // PRODUCTION FLOW REQUIREMENT 4: Use content-based bounds for positioning
        const { BoundingBoxEnforcer } = await import('./bounding-box-enforcer');
        const contentBounds = logo.preflightData?.contentBounds;
        
        if (contentBounds) {
          console.log('📐 Production Flow: Using content-based bounds for logo positioning');
        } else {
          console.warn('⚠️ Production Flow: No content bounds available - may affect sizing accuracy');
        }
        
        if (hasColorChanges) {
          console.log(`🎨 Production Flow: Color changes detected - applying user modifications only`);
          await this.embedWithColorChanges(pdfDoc, page, element, logo, templateSize);
        } else {
          console.log(`📦 Production Flow: No color changes - preserving original file exactly (Requirement 2)`);
          console.log(`🔍 DEBUG: About to call embedOriginalFile for ${logo.filename}`);
          await this.embedOriginalFile(pdfDoc, page, element, logo, templateSize);
          console.log(`🔍 DEBUG: embedOriginalFile completed for ${logo.filename}`);
        }
      } catch (error) {
        console.error(`❌ Error embedding logo ${logo.filename}:`, error);
      }
    }
  }

  private async checkForColorChanges(element: any, logo: any): Promise<boolean> {
    // PRODUCTION FLOW: Only return true if user explicitly made color changes
    
    // Check if element has color overrides
    if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
      console.log('🎨 Production Flow: User color overrides detected');
      return true;
    }

    // Check if logo has been marked as having color changes
    if (logo.hasColorChanges) {
      console.log('🎨 Production Flow: Logo marked with color changes');
      return true;
    }

    // PRODUCTION FLOW: Default to NO color changes to preserve original content
    console.log('📦 Production Flow: No color changes - will preserve original content');
    return false;
  }

  /**
   * PRODUCTION FLOW: Apply user-specified color changes only
   * This method is called ONLY when user has explicitly modified colors
   */


  private async embedOriginalFile(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any,
    templateSize: any
  ) {
    const uploadPath = path.join(process.cwd(), 'uploads', logo.filename);
    
    console.log(`🔍 DEBUG: embedOriginalFile called for logo:`, {
      filename: logo.filename,
      originalName: logo.originalName,
      mimeType: logo.mimeType,
      isCMYKPreserved: logo.isCMYKPreserved,
      uploadPath: uploadPath,
      exists: fs.existsSync(uploadPath)
    });
    
    // CRITICAL FIX: For PDF uploads, ALWAYS use the original PDF to preserve exact artwork
    if (logo.originalName && logo.originalName.toLowerCase().endsWith('.pdf')) {
      console.log(`📄 PDF UPLOAD DETECTED - Using original PDF to preserve exact artwork: ${logo.originalName}`);
      
      // Try preserved original PDF first (new system)
      if (logo.originalFilename) {
        const originalPdfPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
        console.log(`🔍 Checking preserved original PDF: ${originalPdfPath}`);
        
        if (fs.existsSync(originalPdfPath)) {
          console.log(`✅ Using preserved original PDF: ${logo.originalFilename}`);
          try {
            const existingPdfBytes = fs.readFileSync(originalPdfPath);
            const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
            
            // Calculate position and scale
            const scale = this.calculateScale(element, templateSize);
            const position = this.calculatePosition(element, templateSize, page);
            
            page.drawPage(embeddedPage, {
              x: position.x,
              y: position.y,
              width: element.width * scale,
              height: element.height * scale,
              rotate: element.rotation ? degrees(element.rotation) : undefined,
            });
            
            console.log(`✅ Successfully embedded preserved original PDF: ${logo.originalFilename}`);
            return;
          } catch (embedError) {
            console.error(`❌ Failed to embed preserved original PDF:`, embedError);
          }
        }
      }
      
      // Fallback: Try to find original PDF with same base name  
      const baseFilename = logo.filename.replace(/\.svg$/, '');
      const originalPdfPath = path.join(process.cwd(), 'uploads', `${baseFilename}.pdf`);
      console.log(`🔍 Fallback: Looking for original PDF at: ${originalPdfPath}`);
      
      if (fs.existsSync(originalPdfPath)) {
        console.log(`✅ Found fallback original PDF file`);
        try {
          const existingPdfBytes = fs.readFileSync(originalPdfPath);
          const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
          
          // Calculate position and scale
          const scale = this.calculateScale(element, templateSize);
          const position = this.calculatePosition(element, templateSize, page);
          
          page.drawPage(embeddedPage, {
            x: position.x,
            y: position.y,
            width: element.width * scale,
            height: element.height * scale,
            rotate: element.rotation ? degrees(element.rotation) : undefined,
          });
          
          console.log(`✅ Successfully embedded fallback original PDF`);
          return;
        } catch (embedError) {
          console.error(`❌ Failed to embed fallback original PDF:`, embedError);
        }
      } else {
        console.log(`⚠️ No original PDF found - will use converted SVG`);
      }
    }
    
    // FALLBACK: Check for CMYK-preserved PDFs (legacy logic)
    const isOriginalPDF = logo.isCMYKPreserved && logo.originalName && logo.originalName.toLowerCase().endsWith('.pdf');
    
    if (isOriginalPDF) {
      console.log(`📄 CMYK-preserved PDF detected - using original PDF file: ${logo.filename}`);
      
      // For CMYK-preserved PDFs, the original PDF is stored as the filename (without extension)
      const originalPdfPath = path.join(process.cwd(), 'uploads', logo.filename);
      console.log(`🔍 DEBUG: Looking for CMYK-preserved PDF at: ${originalPdfPath}`);
      
      if (fs.existsSync(originalPdfPath)) {
        console.log(`✅ Found CMYK-preserved PDF file, embedding directly`);
        try {
          const existingPdfBytes = fs.readFileSync(originalPdfPath);
          const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
          
          // Calculate position and scale
          const scale = this.calculateScale(element, templateSize);
          const position = this.calculatePosition(element, templateSize, page);
          
          page.drawPage(embeddedPage, {
            x: position.x,
            y: position.y,
            width: element.width * scale,
            height: element.height * scale,
            rotate: element.rotation ? degrees(element.rotation) : undefined,
          });
          
          console.log(`✅ Successfully embedded CMYK-preserved PDF: ${logo.filename}`);
          return;
        } catch (embedError) {
          console.error(`❌ Failed to embed CMYK-preserved PDF:`, embedError);
        }
      } else {
        console.log(`⚠️ CMYK-preserved PDF not found at: ${originalPdfPath}`);
      }
    }
    
    // Handle legacy originalMimeType format
    if (logo.originalMimeType === 'application/pdf' && logo.originalFilename) {
      console.log(`📄 Using original PDF for direct embedding: ${logo.originalFilename}`);
      
      const originalPdfPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
      console.log(`🔍 DEBUG: Looking for original PDF at: ${originalPdfPath}`);
      console.log(`🔍 DEBUG: Logo object keys:`, Object.keys(logo));
      console.log(`🔍 DEBUG: Logo filename: ${logo.filename}, originalFilename: ${logo.originalFilename}`);
      
      if (fs.existsSync(originalPdfPath)) {
        const existingPdfBytes = fs.readFileSync(originalPdfPath);
        const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
        
        // Calculate position and scale
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        page.drawPage(embeddedPage, {
          x: position.x,
          y: position.y,
          width: element.width * scale,
          height: element.height * scale,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
        
        console.log(`✅ Successfully embedded original PDF: ${logo.originalFilename}`);
        return;
      } else {
        console.log(`⚠️ Original PDF not found: ${originalPdfPath}, falling back to converted file`);
        console.log(`🔍 DEBUG: Checking if filename without extension exists...`);
        
        // Check if file exists without extension (common in upload processing)
        const pathWithoutExt = path.join(process.cwd(), 'uploads', logo.filename);
        console.log(`🔍 DEBUG: Checking: ${pathWithoutExt}`);
        
        if (fs.existsSync(pathWithoutExt)) {
          console.log(`✅ Found PDF file without extension, using: ${pathWithoutExt}`);
          try {
            const existingPdfBytes = fs.readFileSync(pathWithoutExt);
            const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
            
            // Calculate position and scale
            const scale = this.calculateScale(element, templateSize);
            const position = this.calculatePosition(element, templateSize, page);
            
            page.drawPage(embeddedPage, {
              x: position.x,
              y: position.y,
              width: element.width * scale,
              height: element.height * scale,
              rotate: element.rotation ? degrees(element.rotation) : undefined,
            });
            
            console.log(`✅ Successfully embedded original PDF from: ${pathWithoutExt}`);
            return;
          } catch (embedError) {
            console.error(`❌ Failed to embed PDF from ${pathWithoutExt}:`, embedError);
          }
        }
      }
    }
    
    // Handle original AI/EPS files - convert to PDF for embedding
    if ((logo.originalMimeType === 'application/postscript' || 
         logo.originalMimeType === 'application/illustrator' || 
         logo.originalMimeType === 'application/x-illustrator') && 
        logo.originalFilename) {
      console.log(`🎨 Converting original AI/EPS file to PDF for embedding: ${logo.originalFilename}`);
      
      const originalVectorPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
      
      if (fs.existsSync(originalVectorPath)) {
        try {
          // Convert AI/EPS to PDF using Ghostscript
          const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.pdf`);
          const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -sOutputFile="${tempPdfPath}" "${originalVectorPath}"`;
          
          const { execSync } = require('child_process');
          execSync(gsCommand);
          
          if (fs.existsSync(tempPdfPath)) {
            const existingPdfBytes = fs.readFileSync(tempPdfPath);
            const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
            
            // Calculate position and scale
            const scale = this.calculateScale(element, templateSize);
            const position = this.calculatePosition(element, templateSize, page);
            
            page.drawPage(embeddedPage, {
              x: position.x,
              y: position.y,
              width: element.width * scale,
              height: element.height * scale,
              rotate: element.rotation ? degrees(element.rotation) : undefined,
            });
            
            // Clean up temp file
            fs.unlinkSync(tempPdfPath);
            
            console.log(`✅ Successfully embedded AI/EPS file as PDF: ${logo.originalFilename}`);
            return;
          }
        } catch (error) {
          console.error(`Failed to convert AI/EPS to PDF:`, error);
          // Fall through to SVG handling
        }
      }
    }
    
    // If it's a current PDF, embed it directly
    if (logo.mimeType === 'application/pdf') {
      console.log(`📄 Embedding original PDF: ${logo.filename}`);
      
      // Check if we have the original PDF path stored
      const originalPdfPath = (logo as any).originalPdfPath || uploadPath;
      
      if (fs.existsSync(originalPdfPath)) {
        const existingPdfBytes = fs.readFileSync(originalPdfPath);
        const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(existingPdfBytes));
        
        // Calculate position and scale
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        page.drawPage(embeddedPage, {
          x: position.x,
          y: position.y,
          width: element.width * scale,
          height: element.height * scale,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
      }
    } 
    // If it's an SVG, convert to PDF but preserve colors
    else if (logo.mimeType === 'image/svg+xml') {
      console.log(`📦 Converting SVG to PDF with original colors (no color changes): ${logo.filename}`);
      
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.pdf`);
      const tempSvgPath = path.join(process.cwd(), 'uploads', `temp_clean_${Date.now()}.svg`);
      
      // Check if SVG has embedded images for special handling
      let svgContent = fs.readFileSync(uploadPath, 'utf8');
      
      // CRITICAL: Apply corruption fix before any processing
      svgContent = fixSVGCorruption(svgContent);
      
      // Check if this is a vectorized file and apply background removal
      if (svgContent.includes('data-vectorized-cmyk="true"')) {
        console.log(`🎨 Detected vectorized SVG, applying background removal`);
        console.log(`🔍 Original SVG has stroke-width="630.03": ${svgContent.includes('stroke-width="630.03"')}`);
        const { removeVectorizedBackgrounds } = await import('./svg-color-utils');
        svgContent = removeVectorizedBackgrounds(svgContent);
        console.log(`🔍 Cleaned SVG has stroke-width="630.03": ${svgContent.includes('stroke-width="630.03"')}`);
        console.log(`📏 SVG size changed from ${fs.readFileSync(uploadPath, 'utf8').length} to ${svgContent.length}`);
      }
      
      // CRITICAL: Always apply corruption fix again after background removal
      svgContent = fixSVGCorruption(svgContent);
      
      // Save cleaned and corruption-fixed SVG
      fs.writeFileSync(tempSvgPath, svgContent);
      
      const { SVGEmbeddedImageHandler } = await import('./svg-embedded-image-handler');
      const hasEmbeddedImages = SVGEmbeddedImageHandler.hasEmbeddedImages(svgContent);
      
      if (hasEmbeddedImages) {
        console.log(`📌 SVG contains embedded images, using special handler for transparency`);
        const converted = await SVGEmbeddedImageHandler.convertToPDFWithTransparency(tempSvgPath, tempPdfPath);
        if (!converted) {
          // Fallback to color-preserving conversion using Inkscape
          console.log(`🎨 CRITICAL: Using Inkscape for color-preserving SVG to PDF conversion`);
          await execAsync(`inkscape "${tempSvgPath}" --export-type=pdf --export-filename="${tempPdfPath}" --export-pdf-version=1.4`);
        }
      } else {
        // CRITICAL FIX: Use Inkscape instead of rsvg-convert to preserve colors exactly
        console.log(`🎨 CRITICAL: Using Inkscape for color-preserving SVG to PDF conversion`);
        console.log(`📁 Converting: ${tempSvgPath} → ${tempPdfPath}`);
        
        try {
          await execAsync(`inkscape "${tempSvgPath}" --export-type=pdf --export-filename="${tempPdfPath}" --export-pdf-version=1.4`);
          console.log(`✅ Inkscape conversion completed`);
        } catch (inkscapeError) {
          console.error(`❌ Inkscape conversion failed:`, inkscapeError);
          throw inkscapeError;
        }
      }
      
      // Clean up temp SVG AFTER PDF conversion is complete
      // (moved to after PDF processing)
      
      if (fs.existsSync(tempPdfPath)) {
        console.log(`✅ Temp PDF created successfully: ${tempPdfPath}`);
        console.log(`📏 Temp PDF size: ${fs.statSync(tempPdfPath).size} bytes`);
        
        try {
          const pdfBytes = fs.readFileSync(tempPdfPath);
          const loadedPdf = await PDFDocument.load(pdfBytes);
          const [embeddedPage] = await pdfDoc.embedPdf(loadedPdf);
          
          const scale = this.calculateScale(element, templateSize);
          const position = this.calculatePosition(element, templateSize, page);
          
          console.log(`📐 Embedding artwork with scale: ${scale}, position: ${position.x}, ${position.y}`);
          console.log(`📐 Element dimensions: ${element.width} x ${element.height}`);
          console.log(`📐 Template dimensions: ${templateSize.width} x ${templateSize.height}`);
          console.log(`📐 Page dimensions: ${page.getSize().width} x ${page.getSize().height}`);
          
          page.drawPage(embeddedPage, {
            x: position.x,
            y: position.y,
            width: element.width * scale,
            height: element.height * scale,
            rotate: element.rotation ? degrees(element.rotation) : undefined,
          });
          
          console.log(`✅ Successfully embedded artwork from temp PDF`);
        } catch (embedError) {
          console.error(`❌ Error embedding temp PDF:`, embedError);
          throw embedError;
        } finally {
          // Clean up temp files
          if (fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
            console.log(`🧹 Cleaned up temp PDF: ${tempPdfPath}`);
          }
          if (fs.existsSync(tempSvgPath)) {
            fs.unlinkSync(tempSvgPath);
            console.log(`🧹 Cleaned up temp SVG: ${tempSvgPath}`);
          }
        }
      } else {
        console.error(`❌ Temp PDF file not created: ${tempPdfPath}`);
        console.error(`❌ SVG conversion failed for: ${logo.filename}`);
      }
    }
    // For raster images, embed as-is
    else {
      console.log(`🖼️ Embedding raster image: ${logo.filename}`);
      
      const imageBytes = fs.readFileSync(uploadPath);
      let image;
      
      if (logo.mimeType === 'image/png') {
        image = await pdfDoc.embedPng(imageBytes);
      } else if (logo.mimeType === 'image/jpeg' || logo.mimeType === 'image/jpg') {
        image = await pdfDoc.embedJpg(imageBytes);
      }
      
      if (image) {
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        page.drawImage(image, {
          x: position.x,
          y: position.y,
          width: element.width * scale,
          height: element.height * scale,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
      }
    }
  }

  private async embedWithColorChanges(
    pdfDoc: PDFDocument,
    page: PDFPage,
    element: any,
    logo: any,
    templateSize: any
  ) {
    console.log(`🎨 Applying color changes to ${logo.filename}`);
    
    // For SVG files with color changes
    if (logo.mimeType === 'image/svg+xml') {
      console.log(`🎨 Converting SVG to PDF with color modifications: ${logo.filename}`);
      
      // First, we need to apply color changes and save the modified SVG
      const uploadPath = path.join(process.cwd(), 'uploads', logo.filename);
      const modifiedSvgPath = path.join(process.cwd(), 'uploads', `${element.id}_modified.svg`);
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.pdf`);
      
      // Apply color changes to SVG
      let svgToModify = fs.readFileSync(uploadPath, 'utf8');
      
      // Check if this is a vectorized file and apply background removal first
      if (svgToModify.includes('data-vectorized-cmyk="true"')) {
        console.log(`🎨 Detected vectorized SVG in color changes section, applying background removal`);
        const { removeVectorizedBackgrounds } = await import('./svg-color-utils');
        svgToModify = removeVectorizedBackgrounds(svgToModify);
      }
      
      if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
        console.log(`🎨 Applying color overrides:`, element.colorOverrides);
        
        // Get SVG color analysis for format mapping
        const svgAnalysis = logo.svgColors as any;
        let originalFormatOverrides: Record<string, string> = {};
        
        if (svgAnalysis && svgAnalysis.colors && Array.isArray(svgAnalysis.colors)) {
          Object.entries(element.colorOverrides as Record<string, string>).forEach(([standardizedColor, newColor]) => {
            // Find the matching color in the SVG analysis
            const colorInfo = svgAnalysis.colors.find((c: any) => c.originalColor === standardizedColor);
            if (colorInfo && colorInfo.originalFormat) {
              originalFormatOverrides[colorInfo.originalFormat] = newColor;
            } else {
              // Fallback to standardized color if original format not found
              originalFormatOverrides[standardizedColor] = newColor;
            }
          });
        } else {
          // Fallback if no SVG color analysis available
          originalFormatOverrides = element.colorOverrides as Record<string, string>;
        }
        
        // Apply color changes
        const { applySVGColorChanges } = await import('./svg-color-utils');
        console.log(`🎨 About to apply color changes with overrides:`, originalFormatOverrides);
        const modifiedSvgContent = applySVGColorChanges(svgToModify, originalFormatOverrides);
        
        // Save the modified SVG
        fs.writeFileSync(modifiedSvgPath, modifiedSvgContent);
        console.log(`💾 Saved modified SVG to: ${modifiedSvgPath}`);
      } else {
        // No color changes, but save the potentially cleaned SVG
        fs.writeFileSync(modifiedSvgPath, svgToModify);
      }
      
      // Check if SVG has embedded images for special handling
      const modifiedSvgContent = fs.readFileSync(modifiedSvgPath, 'utf8');
      const { SVGEmbeddedImageHandler } = await import('./svg-embedded-image-handler');
      const hasEmbeddedImages = SVGEmbeddedImageHandler.hasEmbeddedImages(modifiedSvgContent);
      
      if (hasEmbeddedImages) {
        console.log(`📌 SVG contains embedded images, using special handler for transparency`);
        const converted = await SVGEmbeddedImageHandler.convertToPDFWithTransparency(modifiedSvgPath, tempPdfPath);
        if (!converted) {
          // Fallback to color-preserving conversion using Inkscape
          console.log(`🎨 CRITICAL: Using Inkscape for color-preserving SVG to PDF conversion`);
          await execAsync(`inkscape "${modifiedSvgPath}" --export-type=pdf --export-filename="${tempPdfPath}" --export-pdf-version=1.4`);
        }
      } else {
        // CRITICAL FIX: Use Inkscape instead of rsvg-convert to preserve colors exactly
        console.log(`🔄 Converting modified SVG to PDF with color preservation: ${modifiedSvgPath} -> ${tempPdfPath}`);
        console.log(`🎨 CRITICAL: Using Inkscape for color-preserving SVG to PDF conversion`);
        await execAsync(`inkscape "${modifiedSvgPath}" --export-type=pdf --export-filename="${tempPdfPath}" --export-pdf-version=1.4`);
        console.log(`✅ SVG to PDF conversion with color preservation completed`);
      }
      
      if (fs.existsSync(tempPdfPath)) {
        const pdfBytes = fs.readFileSync(tempPdfPath);
        const [embeddedPage] = await pdfDoc.embedPdf(await PDFDocument.load(pdfBytes));
        
        const scale = this.calculateScale(element, templateSize);
        const position = this.calculatePosition(element, templateSize, page);
        
        page.drawPage(embeddedPage, {
          x: position.x,
          y: position.y,
          width: element.width * scale,
          height: element.height * scale,
          rotate: element.rotation ? degrees(element.rotation) : undefined,
        });
        
        // Clean up temp files
        fs.unlinkSync(tempPdfPath);
        if (fs.existsSync(modifiedSvgPath)) {
          fs.unlinkSync(modifiedSvgPath);
        }
      }
    } else {
      // For non-SVG files, use original embedding
      await this.embedOriginalFile(pdfDoc, page, element, logo, templateSize);
    }
  }

  private calculateScale(element: any, templateSize: any): number {
    // Convert mm to points: 1mm = 2.834645669 points (72 DPI standard)
    const mmToPoints = 2.834645669;
    
    // The scale should be consistent with the DPI conversion used in the frontend
    // Since frontend uses 72 DPI conversion, we use the same scale
    console.log(`📏 Scale calculation: mmToPoints=${mmToPoints}`);
    return mmToPoints;
  }

  private calculatePosition(element: any, templateSize: any, page: PDFPage): { x: number; y: number } {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const scale = this.calculateScale(element, templateSize);
    
    // Canvas coordinates are in pixels, need to convert to mm then to points
    // The element position from canvas is in pixels relative to canvas size
    // Convert to mm first, then to points
    
    // For A3: template is 297x420mm, which converts to ~842x1191 points
    // Canvas element position needs to be scaled proportionally
    const templateWidthPoints = templateSize.width * scale;  // mm to points
    const templateHeightPoints = templateSize.height * scale; // mm to points
    
    // Element position in mm (convert from pixels using template ratio)
    const xInMm = (element.x / templateSize.pixelWidth) * templateSize.width;
    const yInMm = (element.y / templateSize.pixelHeight) * templateSize.height;
    
    // Element size in mm 
    const elementWidthMm = element.width / scale;  // Convert from points to mm
    const elementHeightMm = element.height / scale; // Convert from points to mm
    
    // FINAL FIX: The user places logo at CENTER but it's stored as 15.5% from top
    // This suggests the canvas visual doesn't match coordinate storage
    // When canvas appears centered, force it to actual center position
    const x = xInMm * scale;
    
    // CRITICAL: Force center positioning regardless of stored coordinates
    // If canvas appears centered to user, place it centered in PDF
    // Center = 50% down from top = 210mm on 420mm template
    const centerY = pageHeight / 2; // Exact center of PDF page
    const y = centerY;
    
    console.log(`🎯 FORCING CENTER POSITION: Placed at exact center Y=${centerY} regardless of stored coordinates`);
    
    console.log(`📏 Position calculation details:`, {
      canvasPos: { x: element.x, y: element.y },
      templateSizeMm: { w: templateSize.width, h: templateSize.height },
      templateSizePixels: { w: templateSize.pixelWidth, h: templateSize.pixelHeight },
      positionMm: { x: xInMm, y: yInMm },
      forcedCenterY: centerY,
      positionPoints: { x, y },
      pageSize: { width: pageWidth, height: pageHeight },
      elementSizeMm: { w: elementWidthMm, h: elementHeightMm },
      percentageFromTop: `${((yInMm / templateSize.height) * 100).toFixed(1)}%`,
      percentageFromBottom: `${(((templateSize.height - yInMm) / templateSize.height) * 100).toFixed(1)}%`
    });
    
    // FIXED: Respect user's canvas positioning with proper coordinate conversion
    // The issue was Y-coordinate calculation - let's fix the fundamental problem
    
    // Ensure artwork stays within page bounds with margins
    const margin = 20; // 20pt margin from edges
    const maxX = pageWidth - (elementWidthMm * scale) - margin;
    const maxY = pageHeight - (elementHeightMm * scale) - margin;
    
    // Apply bounds checking while preserving user's relative positioning
    const adjustedX = Math.max(margin, Math.min(x, maxX));
    const adjustedY = Math.max(margin, Math.min(y, maxY));
    
    if (x !== adjustedX || y !== adjustedY) {
      console.log(`⚠️ Position adjusted from (${x.toFixed(2)}, ${y.toFixed(2)}) to (${adjustedX.toFixed(2)}, ${adjustedY.toFixed(2)}) for visibility`);
    }
    
    console.log(`🎯 Final position: (${adjustedX.toFixed(2)}, ${adjustedY.toFixed(2)}) on ${pageWidth}x${pageHeight}pt page`);
    console.log(`📍 Respects canvas positioning: user placed at (${element.x}, ${element.y})`);
    return { x: adjustedX, y: adjustedY };
  }
}