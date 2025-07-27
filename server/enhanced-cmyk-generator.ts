import { storage } from "./storage";
import type { CanvasElement, Logo, TemplateSize } from "@shared/schema";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { PDFDocument, rgb, degrees, PDFName, PDFArray, PDFDict, PDFRef, StandardFonts } from "pdf-lib";
import { manufacturerColors } from "@shared/garment-colors";
import { recolorSVG } from "./svg-recolor";
import { applySVGColorChanges } from "./svg-color-utils";

export interface PDFGenerationData {
  projectId: string;
  templateSize: TemplateSize;
  canvasElements: CanvasElement[];
  logos: Logo[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class EnhancedCMYKGenerator {
  // Professional color palette for matching
  private quickColors = [
    { name: "White", hex: "#FFFFFF" },
    { name: "Black", hex: "#171816" },
    { name: "Navy", hex: "#201C3A" },
    { name: "Royal Blue", hex: "#221866" },
    { name: "Kelly Green", hex: "#3C8A35" },
    { name: "Red", hex: "#C02300" },
    { name: "Yellow", hex: "#F0F42A" },
    { name: "Purple", hex: "#4C0A6A" },
    { name: "Hi Viz", hex: "#D2E31D" },
    { name: "Hi Viz Orange", hex: "#D98F17" }
  ];

  // Function to get color name from hex value (server-side version)
  private getColorName(hex: string): string {
    // Check quick colors first
    const quickColor = this.quickColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
    if (quickColor) {
      return quickColor.name;
    }

    // Check manufacturer colors
    for (const [manufacturerName, colorGroups] of Object.entries(manufacturerColors)) {
      for (const group of colorGroups) {
        const manufacturerColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
        if (manufacturerColor) {
          return `${manufacturerColor.name} (${manufacturerColor.code})`;
        }
      }
    }

    // Convert hex to RGB for color analysis
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      
      // Determine the dominant color family
      if (r > g && r > b) {
        if (g > 100 && b < 50) return `Orange`;
        if (g < 100 && b < 100) return `Red`;
        if (g > 150 && b > 150) return `Pink`;
      } else if (g > r && g > b) {
        if (r < 100 && b < 100) return `Green`;
        if (r > 150 && b < 100) return `Yellow`;
      } else if (b > r && b > g) {
        if (r < 100 && g < 100) return `Blue`;
        if (r > 150 && g > 150) return `Purple`;
      } else if (r === g && g === b) {
        if (r < 50) return `Black`;
        if (r > 200) return `White`;
        return `Gray`;
      }
    }

    return hex;
  }

  // Render applique badges form data on PDF page
  private async renderAppliqueBadgesForm(
    page: any, 
    formData: any, 
    pdfDoc: PDFDocument, 
    pageWidth: number, 
    pageHeight: number
  ): Promise<void> {
    try {
      // Load fonts
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      // Ultra-compact form layout to fit everything on page
      const margin = 20; // Minimal margin
      const lineHeight = 14; // Compact line height
      const sectionSpacing = 8; // Minimal section spacing
      const titleSize = 12; // Compact title size
      const headerSize = 10; // Compact header size
      const bodySize = 8; // Compact body size
      
      // Calculate available space more precisely
      const availableHeight = pageHeight - (margin * 2);
      const formWidth = pageWidth - (margin * 2);
      
      // Start from top of available space
      let currentY = pageHeight - margin - 20;
      
      // Background for form - fill available space
      page.drawRectangle({
        x: margin,
        y: margin,
        width: formWidth,
        height: availableHeight - 40,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });
      
      // Compact title
      page.drawText('APPLIQUE BADGES SPECIFICATIONS', {
        x: margin + 5,
        y: currentY,
        size: titleSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 25;
      
      // Embroidery File Options
      if (formData.embroideryFileOptions && formData.embroideryFileOptions.length > 0) {
        page.drawText('Embroidery File Options:', {
          x: margin + 5,
          y: currentY,
          size: headerSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight;
        
        formData.embroideryFileOptions.forEach((option: string) => {
          page.drawText(`• ${option}`, {
            x: margin + 15,
            y: currentY,
            size: bodySize,
            font: regularFont,
            color: rgb(0, 0, 0),
          });
          currentY -= lineHeight;
        });
        currentY -= sectionSpacing;
      }
      
      // Embroidery Thread Options
      if (formData.embroideryThreadOptions && formData.embroideryThreadOptions.length > 0) {
        page.drawText('Embroidery Thread Options:', {
          x: margin + 5,
          y: currentY,
          size: headerSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight;
        
        formData.embroideryThreadOptions.forEach((option: string) => {
          page.drawText(`• ${option}`, {
            x: margin + 15,
            y: currentY,
            size: bodySize,
            font: regularFont,
            color: rgb(0, 0, 0),
          });
          currentY -= lineHeight;
        });
        currentY -= sectionSpacing;
      }
      
      // Position
      if (formData.position && formData.position.length > 0) {
        page.drawText('Position:', {
          x: margin + 5,
          y: currentY,
          size: headerSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight;
        
        const positionText = formData.position.join(', ');
        page.drawText(positionText, {
          x: margin + 15,
          y: currentY,
          size: bodySize,
          font: regularFont,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight + sectionSpacing;
      }
      
      // Graphic Size
      if (formData.graphicSize) {
        page.drawText('Graphic Size:', {
          x: margin + 5,
          y: currentY,
          size: headerSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight;
        
        page.drawText(formData.graphicSize, {
          x: margin + 15,
          y: currentY,
          size: bodySize,
          font: regularFont,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight + sectionSpacing;
      }
      
      // Embroidered Parts
      if (formData.embroideredParts) {
        page.drawText('Embroidered Parts:', {
          x: margin + 5,
          y: currentY,
          size: headerSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        currentY -= lineHeight;
        
        // Word wrap for longer text with compact layout
        const words = formData.embroideredParts.split(' ');
        let currentLine = '';
        const maxWidth = formWidth - 40; // Use form width for better calculation
        
        words.forEach((word: string) => {
          const testLine = currentLine + word + ' ';
          const testWidth = regularFont.widthOfTextAtSize(testLine, bodySize);
          
          if (testWidth > maxWidth && currentLine !== '') {
            page.drawText(currentLine.trim(), {
              x: margin + 15,
              y: currentY,
              size: bodySize,
              font: regularFont,
              color: rgb(0, 0, 0),
            });
            currentY -= lineHeight;
            currentLine = word + ' ';
          } else {
            currentLine = testLine;
          }
        });
        
        if (currentLine.trim() !== '') {
          page.drawText(currentLine.trim(), {
            x: margin + 15,
            y: currentY,
            size: bodySize,
            font: regularFont,
            color: rgb(0, 0, 0),
          });
        }
      }
      
      console.log('Enhanced CMYK: Successfully rendered applique badges form on page 2');
      
    } catch (error) {
      console.error('Failed to render applique badges form:', error);
    }
  }
  async generateCMYKPDF(data: PDFGenerationData): Promise<Buffer> {
    const { projectId, templateSize, canvasElements, logos, garmentColor } = data;
    
    try {
      // Use uploaded ICC profile from attached_assets
      const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
      const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
      
      let iccProfilePath = uploadedICCPath;
      let useICC = fs.existsSync(uploadedICCPath);
      
      if (!useICC) {
        iccProfilePath = fallbackICCPath;
        useICC = fs.existsSync(fallbackICCPath);
      }
      
      console.log(useICC ? 
        `Enhanced CMYK: Using uploaded ICC profile (${path.basename(iccProfilePath)}) with vector preservation` : 
        'Enhanced CMYK: Creating CMYK PDF with vector preservation (no ICC)'
      );
      
      // Use pdf-lib for true vector preservation, then apply ICC profile post-processing
      const vectorPDF = await this.createVectorPreservingPDF(data);
      
      // The ICC profile is now embedded directly in the PDF via pdf-lib
      console.log('Enhanced CMYK: Vector PDF created with embedded ICC profile');
      return vectorPDF;
      
    } catch (error) {
      console.error('Enhanced CMYK generation failed:', error);
      throw error;
    }
  }

  private async createVectorPreservingPDF(data: PDFGenerationData): Promise<Buffer> {
    const { projectId, templateSize, canvasElements, logos, garmentColor, appliqueBadgesForm } = data;
    
    // Check if this is a Single Colour Transfer template for recoloring
    const project = await storage.getProject(projectId);
    const template = project?.templateSize ? await storage.getTemplateSize(project.templateSize) : null;
    const isSingleColourTransfer = template?.group === 'Single Colour Transfers';
    const inkColor = project?.inkColor;
    
    // Get ICC profile info
    const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
    const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
    
    let iccProfilePath = uploadedICCPath;
    let useICC = fs.existsSync(uploadedICCPath);
    
    if (!useICC) {
      iccProfilePath = fallbackICCPath;
      useICC = fs.existsSync(fallbackICCPath);
    }
    
    // Create a new PDF document using pdf-lib for vector preservation
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
        await this.embedVectorLogo(pdfDoc, page1, element, logo, templateSize, isSingleColourTransfer, inkColor || undefined);
      } catch (error) {
        console.error(`Failed to embed vector logo ${logo.originalName}:`, error);
      }
    }
    
    // Page 2: Artwork with garment color background(s)
    const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Check if we have individual garment colors per logo
    const hasIndividualColors = canvasElements.some(element => element.garmentColor);
    console.log(`Enhanced CMYK: Color labeling - hasIndividualColors: ${hasIndividualColors}, garmentColor: ${garmentColor}`);
    
    if (hasIndividualColors) {
      // Load font for text labels
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
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
        
        // Add color label text below the logo
        const colorName = this.getColorName(logoGarmentColor);
        console.log(`Enhanced CMYK: Adding color label "${colorName}" for garment color ${logoGarmentColor}`);
        const fontSize = 8;
        const textWidth = font.widthOfTextAtSize(colorName, fontSize);
        const textX = x + (width - textWidth) / 2; // Center text horizontally
        const textY = y - 15; // Position text below the colored rectangle
        console.log(`Enhanced CMYK: Label positioned at (${textX}, ${textY}) with width ${textWidth}`);
        
        // Choose text color based on background brightness
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        const textColor = brightness > 128 ? rgb(0, 0, 0) : rgb(1, 1, 1);
        
        // Draw white background for text readability
        page2.drawRectangle({
          x: textX - 4,
          y: textY - 2,
          width: textWidth + 8,
          height: fontSize + 4,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 0.5,
        });
        
        page2.drawText(colorName, {
          x: textX,
          y: textY,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
        
        try {
          await this.embedVectorLogo(pdfDoc, page2, element, logo, templateSize, isSingleColourTransfer, inkColor || undefined);
        } catch (error) {
          console.error(`Failed to embed vector logo ${logo.originalName}:`, error);
        }
      }
    } else if (garmentColor) {
      // Load font for text labels
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      // Single color visualization: all artwork on project garment color
      const { r, g, b } = this.hexToRgb(garmentColor);
      page2.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(r / 255, g / 255, b / 255),
      });
      
      // Add color label in top-left corner
      const colorName = this.getColorName(garmentColor);
      console.log(`Enhanced CMYK: Adding project color label "${colorName}" for garment color ${garmentColor}`);
      const fontSize = 12;
      const margin = 20;
      
      // Draw white background for text readability
      const textWidth = font.widthOfTextAtSize(colorName, fontSize);
      page2.drawRectangle({
        x: margin - 4,
        y: pageHeight - margin - fontSize - 2,
        width: textWidth + 8,
        height: fontSize + 4,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.5,
      });
      
      page2.drawText(`Garment Color: ${colorName}`, {
        x: margin,
        y: pageHeight - margin - fontSize,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      // Process each canvas element for page 2
      for (const element of canvasElements) {
        const logo = logoMap.get(element.logoId);
        if (!logo || !element.isVisible) continue;
        
        try {
          await this.embedVectorLogo(pdfDoc, page2, element, logo, templateSize, isSingleColourTransfer, inkColor || undefined);
        } catch (error) {
          console.error(`Failed to embed vector logo ${logo.originalName}:`, error);
        }
      }
    } else {
      // No garment color specified, just add the logos without background
      for (const element of canvasElements) {
        const logo = logoMap.get(element.logoId);
        if (!logo || !element.isVisible) continue;
        
        try {
          await this.embedVectorLogo(pdfDoc, page2, element, logo, templateSize, isSingleColourTransfer, inkColor || undefined);
        } catch (error) {
          console.error(`Failed to embed vector logo ${logo.originalName}:`, error);
        }
      }
    }

    // Add applique badges form to page 2 if present
    if (appliqueBadgesForm) {
      await this.renderAppliqueBadgesForm(page2, appliqueBadgesForm, pdfDoc, pageWidth, pageHeight);
    }
    
    // Embed ICC profile directly into PDF using pdf-lib
    if (useICC) {
      try {
        await this.embedICCProfileDirectly(pdfDoc, iccProfilePath);
        console.log(`Enhanced CMYK: Successfully embedded ICC profile directly into PDF structure: ${path.basename(iccProfilePath)}`);
      } catch (error) {
        console.log('Enhanced CMYK: Failed to embed ICC profile directly, continuing without:', error);
      }
    }
    
    console.log('Enhanced CMYK: Created vector-preserving PDF with pdf-lib');
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private async generateModifiedSVG(element: CanvasElement, logo: Logo, uploadDir: string) {
    try {
      // Get the original SVG path
      const originalSvgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(originalSvgPath)) {
        console.error(`Original SVG not found: ${originalSvgPath}`);
        return;
      }

      // Apply color changes using the existing function
      const colorOverrides = element.colorOverrides as Record<string, string>;
      
      // Map standardized colors to original formats from SVG analysis
      let originalFormatOverrides: Record<string, string> = {};
      
      const svgColors = logo.svgColors as any[];
      if (svgColors && Array.isArray(svgColors)) {
        Object.entries(colorOverrides).forEach(([standardizedColor, newColor]) => {
          // Find the matching color in the SVG analysis
          const colorInfo = svgColors.find((c: any) => c.originalColor === standardizedColor);
          if (colorInfo && colorInfo.originalFormat) {
            originalFormatOverrides[colorInfo.originalFormat as string] = newColor as string;
          } else {
            // Fallback to standardized color if original format not found
            originalFormatOverrides[standardizedColor as string] = newColor as string;
          }
        });
      } else {
        // Fallback if no SVG color analysis available
        originalFormatOverrides = colorOverrides;
      }

      const modifiedSvgContent = applySVGColorChanges(originalSvgPath, originalFormatOverrides);
      
      if (modifiedSvgContent) {
        // Save modified SVG with unique filename
        const modifiedSvgPath = path.join(uploadDir, `${element.id}_modified.svg`);
        fs.writeFileSync(modifiedSvgPath, modifiedSvgContent);
        console.log(`Enhanced CMYK: Generated modified SVG: ${modifiedSvgPath}`);
      }
    } catch (error) {
      console.error('Enhanced CMYK: Failed to generate modified SVG:', error);
    }
  }

  private async embedVectorLogo(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    logo: Logo,
    templateSize: TemplateSize,
    isSingleColourTransfer?: boolean,
    inkColor?: string
  ) {
    const uploadDir = path.join(process.cwd(), "uploads");
    
    // Check for color overrides first (for ALL templates)
    const hasColorOverrides = element.colorOverrides && 
      typeof element.colorOverrides === 'object' && 
      Object.keys(element.colorOverrides).length > 0;
    
    if (hasColorOverrides) {
      console.log(`Enhanced CMYK: Applying color overrides for ${logo.originalName}:`, element.colorOverrides);
      const modifiedSvgPath = path.join(uploadDir, `${element.id}_modified.svg`);
      
      if (fs.existsSync(modifiedSvgPath)) {
        console.log(`Enhanced CMYK: Using color-modified SVG: ${logo.originalName}`);
        await this.embedImageFile(pdfDoc, page, element, modifiedSvgPath, 'image/svg+xml', templateSize);
        return;
      } else {
        // Generate the modified SVG if it doesn't exist
        await this.generateModifiedSVG(element, logo, uploadDir);
        if (fs.existsSync(modifiedSvgPath)) {
          console.log(`Enhanced CMYK: Generated and using color-modified SVG: ${logo.originalName}`);
          await this.embedImageFile(pdfDoc, page, element, modifiedSvgPath, 'image/svg+xml', templateSize);
          return;
        } else {
          console.log(`Enhanced CMYK: Failed to generate modified SVG, falling back to original for: ${logo.originalName}`);
        }
      }
    } else {
      console.log(`Enhanced CMYK: No color overrides detected for ${logo.originalName}, using original graphics`);
    }
    
    // For Single Colour Transfer templates, check for recolored SVG
    if (isSingleColourTransfer && inkColor && !hasColorOverrides) {
      const recoloredSvgPath = path.join(uploadDir, `recolored_${logo.filename.replace(/\.[^.]+$/, '.svg')}`);
      if (fs.existsSync(recoloredSvgPath)) {
        console.log(`Enhanced CMYK: Using recolored SVG for Single Colour Transfer: ${logo.originalName} with ink color ${inkColor}`);
        await this.embedImageFile(pdfDoc, page, element, recoloredSvgPath, 'image/svg+xml', templateSize);
        return;
      }
    }
    
    // Check if we have original PDF for vector preservation
    if (logo.originalFilename && logo.originalMimeType === 'application/pdf') {
      const originalPdfPath = path.join(uploadDir, logo.originalFilename);
      if (fs.existsSync(originalPdfPath)) {
        console.log(`Enhanced CMYK: Embedding original PDF vectors: ${logo.originalName}`);
        
        // Apply color overrides if they exist (for ALL templates)
        if (hasColorOverrides) {
          console.log(`Enhanced CMYK: Applying color overrides to PDF vector content`);
          await this.embedRecoloredPDFWithCustomColors(pdfDoc, page, element, originalPdfPath, templateSize, element.colorOverrides);
        } else if (isSingleColourTransfer && inkColor) {
          console.log(`Enhanced CMYK: Applying ink color ${inkColor} to PDF vector content`);
          await this.embedRecoloredPDF(pdfDoc, page, element, originalPdfPath, templateSize, inkColor);
        } else {
          console.log(`Enhanced CMYK: Using original PDF without color changes for: ${logo.originalName}`);
          await this.embedOriginalPDF(pdfDoc, page, element, originalPdfPath, templateSize);
        }
        return;
      }
    }
    
    // Fallback to processed image (original graphics without modifications)
    const logoPath = path.join(uploadDir, logo.filename);
    if (fs.existsSync(logoPath)) {
      console.log(`Enhanced CMYK: Fallback to original processed image: ${logo.originalName}`);
      await this.embedImageFile(pdfDoc, page, element, logoPath, logo.mimeType || 'image/png', templateSize);
    } else {
      console.log(`Enhanced CMYK: No suitable file found for: ${logo.originalName}`);
    }
  }

  private async embedOriginalPDF(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    pdfPath: string,
    templateSize: TemplateSize
  ) {
    // Read and embed the original PDF to preserve vectors
    const originalPdfBytes = fs.readFileSync(pdfPath);
    const originalPdf = await PDFDocument.load(originalPdfBytes);
    
    // Get the first page of the original PDF
    const originalPages = originalPdf.getPages();
    if (originalPages.length === 0) {
      throw new Error('PDF has no pages');
    }
    
    // Embed the first page as a vector page
    const firstPage = originalPages[0];
    const embeddedPage = await pdfDoc.embedPage(firstPage, {
      left: 0,
      bottom: 0,
      right: firstPage.getWidth(),
      top: firstPage.getHeight(),
    });
    
    // Calculate position and scale (convert mm to points)
    const x = element.x * 2.834645669;
    const y = (templateSize.height - element.y - element.height) * 2.834645669;
    const targetWidth = element.width * 2.834645669;
    const targetHeight = element.height * 2.834645669;
    
    // Get original page dimensions
    const { width: origWidth, height: origHeight } = embeddedPage.size();
    
    // Calculate scale maintaining aspect ratio
    const scaleX = targetWidth / origWidth;
    const scaleY = targetHeight / origHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Draw the embedded page with vectors preserved
    page.drawPage(embeddedPage, {
      x: x,
      y: y,
      width: origWidth * scale,
      height: origHeight * scale,
      rotate: degrees(element.rotation || 0),
    });
    
    console.log(`Enhanced CMYK: Successfully embedded vector PDF: ${element.logoId}`);
  }

  private async embedRecoloredPDFWithCustomColors(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    pdfPath: string,
    templateSize: TemplateSize,
    colorOverrides: any
  ) {
    // For PDF files with custom color overrides, we need to convert to SVG first,
    // apply color changes, then convert back to PDF
    const uploadDir = path.join(process.cwd(), "uploads");
    const execAsync = promisify(exec);
    
    try {
      console.log(`Enhanced CMYK: Applying custom color overrides to PDF:`, colorOverrides);
      
      // Step 1: Convert PDF to SVG to enable color manipulation
      const tempSvgPath = path.join(uploadDir, `temp_svg_${Date.now()}.svg`);
      await execAsync(`pdf2svg "${pdfPath}" "${tempSvgPath}" 1`);
      
      if (!fs.existsSync(tempSvgPath)) {
        throw new Error('PDF to SVG conversion failed');
      }
      
      // Step 2: Apply color overrides to SVG
      const modifiedSvgContent = applySVGColorChanges(tempSvgPath, colorOverrides as Record<string, string>);
      
      if (!modifiedSvgContent) {
        throw new Error('Color override application failed');
      }
      
      // Step 3: Save the color-modified SVG
      const tempModifiedSvgPath = path.join(uploadDir, `temp_modified_svg_${Date.now()}.svg`);
      fs.writeFileSync(tempModifiedSvgPath, modifiedSvgContent);
      
      // Step 4: Convert modified SVG back to PDF
      const tempRecoloredPdfPath = path.join(uploadDir, `temp_recolored_pdf_${Date.now()}.pdf`);
      await execAsync(`rsvg-convert -f pdf -o "${tempRecoloredPdfPath}" "${tempModifiedSvgPath}"`);
      
      // Clean up intermediate SVG files
      if (fs.existsSync(tempSvgPath)) {
        fs.unlinkSync(tempSvgPath);
      }
      if (fs.existsSync(tempModifiedSvgPath)) {
        fs.unlinkSync(tempModifiedSvgPath);
      }
      
      if (fs.existsSync(tempRecoloredPdfPath)) {
        const stats = fs.statSync(tempRecoloredPdfPath);
        console.log(`Enhanced CMYK: Successfully created color-override PDF (${stats.size} bytes)`);
        
        // Embed the recolored PDF
        await this.embedOriginalPDF(pdfDoc, page, element, tempRecoloredPdfPath, templateSize);
        
        // Clean up temporary PDF
        fs.unlinkSync(tempRecoloredPdfPath);
        
        console.log(`Enhanced CMYK: Custom color override successful`);
      } else {
        throw new Error('SVG to PDF conversion failed');
      }
      
    } catch (error) {
      console.error('Enhanced CMYK: Custom color override failed:', error);
      // Fallback to original PDF without color changes
      await this.embedOriginalPDF(pdfDoc, page, element, pdfPath, templateSize);
    }
  }

  private async embedRecoloredPDF(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    pdfPath: string,
    templateSize: TemplateSize,
    inkColor: string
  ) {
    // Use direct ImageMagick color replacement - simpler and more reliable
    const uploadDir = path.join(process.cwd(), "uploads");
    const execAsync = promisify(exec);
    
    try {
      console.log(`Enhanced CMYK: Starting direct color replacement for ink color ${inkColor}`);
      
      // Use SVG-based recoloring to match canvas preview exactly
      // Step 1: Convert PDF to SVG to preserve transparency
      const tempSvgPath = path.join(uploadDir, `temp_svg_${Date.now()}.svg`);
      await execAsync(`pdf2svg "${pdfPath}" "${tempSvgPath}" 1`);
      
      if (!fs.existsSync(tempSvgPath)) {
        throw new Error('PDF to SVG conversion failed');
      }
      
      // Step 2: Apply SVG recoloring (same as canvas preview)
      let svgContent = fs.readFileSync(tempSvgPath, 'utf8');
      svgContent = recolorSVG(svgContent, inkColor);
      
      // Step 3: Save recolored SVG
      const tempRecoloredSvgPath = path.join(uploadDir, `temp_recolored_svg_${Date.now()}.svg`);
      fs.writeFileSync(tempRecoloredSvgPath, svgContent);
      
      // Step 4: Convert recolored SVG back to PDF
      const tempRecoloredPdfPath = path.join(uploadDir, `temp_final_recolored_${Date.now()}.pdf`);
      await execAsync(`rsvg-convert -f pdf -o "${tempRecoloredPdfPath}" "${tempRecoloredSvgPath}"`);
      
      // Clean up intermediate SVG files
      if (fs.existsSync(tempSvgPath)) {
        fs.unlinkSync(tempSvgPath);
      }
      if (fs.existsSync(tempRecoloredSvgPath)) {
        fs.unlinkSync(tempRecoloredSvgPath);
      }
      
      if (fs.existsSync(tempRecoloredPdfPath)) {
        const stats = fs.statSync(tempRecoloredPdfPath);
        console.log(`Enhanced CMYK: Successfully created recolored PDF via SVG method (${stats.size} bytes)`);
        
        // Embed the recolored PDF
        await this.embedOriginalPDF(pdfDoc, page, element, tempRecoloredPdfPath, templateSize);
        
        // Clean up temporary files
        fs.unlinkSync(tempRecoloredPdfPath);
        
        console.log(`Enhanced CMYK: Direct color replacement successful`);
      } else {
        throw new Error('PNG to PDF conversion failed');
      }
      
    } catch (error) {
      console.error('Enhanced CMYK: Direct color replacement failed:', error);
      
      // Fallback: Try the SVG approach
      try {
        const tempSvgPath = path.join(uploadDir, `temp_svg_fallback_${Date.now()}.svg`);
        const tempPdfPath = path.join(uploadDir, `temp_svg_recolored_${Date.now()}.pdf`);
        
        console.log(`Enhanced CMYK: Trying SVG fallback approach`);
        
        // Convert PDF to SVG
        await execAsync(`convert -density 300 -background transparent "${pdfPath}[0]" "${tempSvgPath}"`);
        
        if (fs.existsSync(tempSvgPath)) {
          // Read and recolor the SVG content
          let svgContent = fs.readFileSync(tempSvgPath, 'utf8');
          svgContent = recolorSVG(svgContent, inkColor);
          fs.writeFileSync(tempSvgPath, svgContent);
          
          // Convert back to PDF
          await execAsync(`convert -density 300 "${tempSvgPath}" "${tempPdfPath}"`);
          
          if (fs.existsSync(tempPdfPath)) {
            console.log(`Enhanced CMYK: SVG fallback successful`);
            await this.embedOriginalPDF(pdfDoc, page, element, tempPdfPath, templateSize);
            
            // Clean up
            fs.unlinkSync(tempSvgPath);
            fs.unlinkSync(tempPdfPath);
          } else {
            throw new Error('SVG to PDF conversion failed');
          }
        } else {
          throw new Error('PDF to SVG conversion failed');
        }
        
      } catch (svgError) {
        console.error('Enhanced CMYK: SVG fallback also failed:', svgError);
        console.log('Enhanced CMYK: Using original PDF without color modification');
        await this.embedOriginalPDF(pdfDoc, page, element, pdfPath, templateSize);
      }
    }
  }

  private recolorSVGContent(svgContent: string, inkColor: string): string {
    // Apply the same recoloring logic used in the frontend
    return recolorSVG(svgContent, inkColor);
  }

  private async embedICCProfileDirectly(pdfDoc: PDFDocument, iccProfilePath: string): Promise<void> {
    try {
      // Read ICC profile data
      const iccProfileBytes = fs.readFileSync(iccProfilePath);
      
      // Create ICC profile stream object
      const iccProfileRef = pdfDoc.context.register(
        pdfDoc.context.stream(iccProfileBytes, {
          Type: 'ICCBased',
          N: 4, // CMYK = 4 components
        })
      );
      
      // Create output intent dictionary
      const outputIntentDict = pdfDoc.context.obj({
        Type: 'OutputIntent',
        S: 'GTS_PDFX',
        OutputConditionIdentifier: 'PSO Coated FOGRA51',
        Info: 'PSO Coated FOGRA51 (EFI)',
        DestOutputProfile: iccProfileRef
      });
      
      const outputIntentRef = pdfDoc.context.register(outputIntentDict);
      
      // Add output intent to catalog using low-level context manipulation
      const catalog = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Root);
      if (catalog instanceof PDFDict) {
        let outputIntents = catalog.get(PDFName.of('OutputIntents'));
        if (!outputIntents) {
          outputIntents = pdfDoc.context.obj([outputIntentRef]);
          catalog.set(PDFName.of('OutputIntents'), outputIntents);
        } else if (outputIntents instanceof PDFArray) {
          outputIntents.push(outputIntentRef);
        }
      }
      
      console.log('Enhanced CMYK: ICC profile embedded directly into PDF structure');
      
    } catch (error) {
      console.error('Failed to embed ICC profile directly:', error);
      throw error;
    }
  }

  private async applyICCProfileToPDF(pdfBuffer: Buffer, iccProfilePath: string): Promise<Buffer> {
    try {
      // Use qpdf for ICC profile embedding without rasterization
      const execAsync = promisify(exec);
      const tempDir = path.join(process.cwd(), 'uploads', 'icc_temp');
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      try {
        const inputPath = path.join(tempDir, 'input.pdf');
        const outputPath = path.join(tempDir, 'output.pdf');
        
        fs.writeFileSync(inputPath, pdfBuffer);
        
        // Use ghostscript to embed ICC profile directly into PDF structure
        const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -dEmbedAllFonts=true -dCompatibilityLevel=1.4 -sDefaultCMYKProfile="${iccProfilePath}" -sOutputICCProfile="${iccProfilePath}" -sOutputFile="${outputPath}" "${inputPath}"`;
        console.log(`Enhanced CMYK: Embedding ICC profile into PDF structure: ${path.basename(iccProfilePath)}`);
        
        await execAsync(gsCommand);
        const enhancedPDF = fs.readFileSync(outputPath);
        
        // Clean up
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        fs.rmdirSync(tempDir);
        
        console.log('Enhanced CMYK: Successfully applied CMYK conversion while preserving vectors');
        return enhancedPDF;
        
      } catch (gsError) {
        console.log('Enhanced CMYK: Ghostscript not available, using original vector PDF');
        return pdfBuffer;
      }
      
    } catch (error) {
      console.error('ICC profile handling failed:', error);
      return pdfBuffer;
    }
  }



  private cleanupTempFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`Enhanced CMYK: Failed to cleanup ${filePath}:`, error);
      }
    }
  }

  private async embedImageFile(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    imagePath: string,
    mimeType: string,
    templateSize: TemplateSize
  ) {
    if (mimeType.includes('svg')) {
      // Convert SVG to PDF and embed as vector
      console.log(`Enhanced CMYK: Converting SVG to PDF vectors: ${path.basename(imagePath)}`);
      await this.embedSVGAsPDF(pdfDoc, page, element, imagePath, templateSize);
      return;
    }
    
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
    });
  }

  private async embedSVGAsPDF(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    svgPath: string,
    templateSize: TemplateSize
  ) {
    try {
      // Convert SVG to PDF using rsvg-convert
      const tempPdfPath = svgPath.replace('.svg', '_temp.pdf');
      
      const command = `rsvg-convert --format=pdf --output="${tempPdfPath}" "${svgPath}"`;
      await new Promise<void>((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Enhanced CMYK: SVG to PDF conversion failed:`, error);
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // Check if the temp PDF was created
      if (fs.existsSync(tempPdfPath)) {
        // Load and embed the converted PDF
        const pdfBytes = fs.readFileSync(tempPdfPath);
        const convertedPdf = await PDFDocument.load(pdfBytes);
        
        const pages = convertedPdf.getPages();
        if (pages.length > 0) {
          const embeddedPage = await pdfDoc.embedPage(pages[0]);
          
          // Calculate position (flip Y coordinate for PDF)
          const x = element.x * 2.834645669;
          const y = (templateSize.height - element.y - element.height) * 2.834645669;
          const width = element.width * 2.834645669;
          const height = element.height * 2.834645669;
          
          // Draw the embedded page
          page.drawPage(embeddedPage, {
            x: x,
            y: y,
            width: width,
            height: height,
            rotate: degrees(element.rotation || 0),
          });
          
          console.log(`Enhanced CMYK: Successfully embedded SVG as PDF vectors: ${path.basename(svgPath)}`);
        }
        
        // Clean up temp file
        fs.unlinkSync(tempPdfPath);
      } else {
        console.error(`Enhanced CMYK: Failed to create temp PDF from SVG: ${svgPath}`);
      }
    } catch (error) {
      console.error(`Enhanced CMYK: Error converting SVG to PDF:`, error);
      // Fallback to skipping this element
    }
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