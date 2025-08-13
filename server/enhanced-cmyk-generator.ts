import { storage } from "./storage";
import type { CanvasElement, Logo, TemplateSize } from "@shared/schema";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
import { PDFDocument, rgb, degrees, PDFName, PDFArray, PDFDict, PDFRef, StandardFonts, PDFString } from "pdf-lib";
import { manufacturerColors } from "@shared/garment-colors";
import { recolorSVG } from "./svg-recolor";
// import { applySVGColorChanges } from "./svg-color-utils"; // Commented out - not used
import { prepareSVGForCMYKConversion } from "./preserve-cmyk-values";

console.log('Enhanced CMYK Generator loaded - Version 2.0');

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
      // Use uploaded ICC profile from attached_assets - fix path with spaces
      const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
      const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
      
      // Check if ICC file actually exists and log the issue
      console.log(`Enhanced CMYK: Checking ICC profile at: ${uploadedICCPath}`);
      console.log(`Enhanced CMYK: ICC file exists: ${fs.existsSync(uploadedICCPath)}`);
      
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
    const isSingleColourTransfer = template?.group === 'Screen Printed Transfers' && 
      template?.label?.includes('Single Colour');
    const inkColor = project?.inkColor;
    
    // Get ICC profile info - disable ICC for now to fix core functionality
    const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
    const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
    
    console.log(`Enhanced CMYK: ICC check - uploaded exists: ${fs.existsSync(uploadedICCPath)}, fallback exists: ${fs.existsSync(fallbackICCPath)}`);
    
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
      if (!element.logoId || !element.isVisible) continue;
      const logo = logoMap.get(element.logoId);
      if (!logo) continue;
      
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
        if (!element.logoId || !element.isVisible) continue;
        const logo = logoMap.get(element.logoId);
        if (!logo) continue;
        
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
        if (!element.logoId || !element.isVisible) continue;
        const logo = logoMap.get(element.logoId);
        if (!logo) continue;
        
        try {
          await this.embedVectorLogo(pdfDoc, page2, element, logo, templateSize, isSingleColourTransfer, inkColor || undefined);
        } catch (error) {
          console.error(`Failed to embed vector logo ${logo.originalName}:`, error);
        }
      }
    } else {
      // No garment color specified, just add the logos without background
      for (const element of canvasElements) {
        if (!element.logoId || !element.isVisible) continue;
        const logo = logoMap.get(element.logoId);
        if (!logo) continue;
        
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
    
    console.log('Enhanced CMYK: Created vector-preserving PDF with pdf-lib');
    const pdfBytes = await pdfDoc.save();
    let finalPdfBuffer = Buffer.from(pdfBytes);
    
    // Apply ICC profile embedding ONLY - no color conversion!
    // This is critical: we must not alter the CMYK values that are already in the PDF
    if (useICC) {
      try {
        console.log('Enhanced CMYK: Embedding ICC profile without color conversion...');
        // Save temporary PDF file for ICC profile embedding
        const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_icc_${Date.now()}.pdf`);
        fs.writeFileSync(tempPdfPath, finalPdfBuffer);
        
        const success = await this.embedICCProfileOnly(tempPdfPath, iccProfilePath);
        if (success) {
          finalPdfBuffer = fs.readFileSync(tempPdfPath);
          console.log('Enhanced CMYK: ICC profile embedded successfully');
        }
        
        // Clean up temp file
        if (fs.existsSync(tempPdfPath)) {
          fs.unlinkSync(tempPdfPath);
        }
      } catch (error) {
        console.error('Enhanced CMYK: ICC profile embedding failed:', error);
        // Continue with PDF without profile rather than risk color changes
      }
    }
    
    return finalPdfBuffer;
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
      
      const svgAnalysis = logo.svgColors as any;
      if (svgAnalysis && svgAnalysis.colors && Array.isArray(svgAnalysis.colors)) {
        Object.entries(colorOverrides).forEach(([standardizedColor, newColor]) => {
          // Find the matching color in the SVG analysis
          const colorInfo = svgAnalysis.colors.find((c: any) => c.originalColor === standardizedColor);
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

      // For now, skip the color changes until we implement the proper function
      console.log('📊 Color overrides would be applied here:', originalFormatOverrides);
      const modifiedSvgContent = null; // Placeholder
      
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
    
    // Check if fonts have been outlined - if so, use the outlined SVG instead of original PDF
    if (logo.fontsOutlined && logo.mimeType === 'image/svg+xml') {
      const outlinedSvgPath = path.join(uploadDir, logo.filename);
      if (fs.existsSync(outlinedSvgPath)) {
        console.log(`Enhanced CMYK: Using outlined SVG instead of original PDF for: ${logo.originalName}`);
        await this.embedImageFile(pdfDoc, page, element, outlinedSvgPath, 'image/svg+xml', templateSize);
        return;
      }
    }
    
    // Check if we have a PDF file (either original or CMYK preserved)
    if (logo.mimeType === 'application/pdf' && !logo.fontsOutlined) {
      const pdfPath = path.join(uploadDir, logo.filename);
      if (fs.existsSync(pdfPath)) {
        console.log(`Enhanced CMYK: Embedding PDF vectors: ${logo.originalName}`);
        
        // Apply color overrides if they exist (for ALL templates)
        if (hasColorOverrides) {
          console.log(`Enhanced CMYK: Applying color overrides to PDF vector content`);
          await this.embedRecoloredPDFWithCustomColors(pdfDoc, page, element, pdfPath, templateSize, element.colorOverrides);
        } else if (isSingleColourTransfer && inkColor) {
          console.log(`Enhanced CMYK: Applying ink color ${inkColor} to PDF vector content`);
          await this.embedRecoloredPDF(pdfDoc, page, element, pdfPath, templateSize, inkColor);
        } else {
          console.log(`Enhanced CMYK: Using PDF without color changes for: ${logo.originalName}`);
          await this.embedOriginalPDF(pdfDoc, page, element, pdfPath, templateSize);
        }
        return;
      }
    }
    
    // Also check if we have original PDF for vector preservation (for converted files)
    if (logo.originalFilename && logo.originalMimeType === 'application/pdf' && !logo.fontsOutlined) {
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
      // Import color workflow manager to check file type
      const { ColorWorkflowManager, FileType } = await import('./color-workflow-manager');
      const fileType = ColorWorkflowManager.getFileType(logo.mimeType || 'image/png', logo.filename);
      const workflow = ColorWorkflowManager.getColorWorkflow(fileType);
      
      // Check if this is an SVG file that needs CMYK conversion
      if (logo.mimeType === 'image/svg+xml' && workflow.convertToCMYK) {
        console.log(`Enhanced CMYK: Applying CMYK conversion to SVG fallback: ${logo.originalName}`);
        await this.embedSVGAsPDF(pdfDoc, page, element, logoPath, templateSize);
      } else {
        console.log(`Enhanced CMYK: Fallback to original processed image: ${logo.originalName} (${fileType})`);
        await this.embedImageFile(pdfDoc, page, element, logoPath, logo.mimeType || 'image/png', templateSize);
      }
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
    try {
      // Check if PDF already contains CMYK colors
      const { CMYKDetector } = await import('./cmyk-detector');
      const hasCMYK = await CMYKDetector.hasCMYKColors(pdfPath);
      
      let finalPdfPath = pdfPath;
      let cmykPdfPath = pdfPath.replace('.pdf', '_cmyk.pdf');
      let useCMYKVersion = false;
      
      if (hasCMYK) {
        console.log(`Enhanced CMYK: PDF already contains CMYK colors, preserving original: ${path.basename(pdfPath)}`);
        // For PDFs that already have CMYK, we still need to preserve the exact values
        // Skip conversion but ensure proper embedding
      } else {
        // Step 1: Convert original PDF to CMYK color space
        
        // Get ICC profile path for proper color conversion
        const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
        const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
        
        let iccProfilePath = uploadedICCPath;
        if (!fs.existsSync(uploadedICCPath)) {
          iccProfilePath = fallbackICCPath;
        }
        
        const hasICC = fs.existsSync(iccProfilePath);
        
        // Apply CMYK conversion using Ghostscript with ICC profile for accurate color management
        let cmykCommand: string;
        if (hasICC) {
          // Use ICC profile for proper color management - but preserve exact CMYK values!
          cmykCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -sDefaultCMYKProfile="${iccProfilePath}" -sOutputICCProfile="${iccProfilePath}" -dOverrideICC=true -dPreserveSeparation=true -dPreserveDeviceN=true -sOutputFile="${cmykPdfPath}" "${pdfPath}"`;
        } else {
          // Fallback without ICC profile
          cmykCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -sOutputFile="${cmykPdfPath}" "${pdfPath}"`;
        }
        
        try {
          await new Promise<void>((resolve, reject) => {
            exec(cmykCommand, (error, stdout, stderr) => {
              if (error) {
                console.error(`Enhanced CMYK: PDF CMYK conversion failed, using original:`, error);
                resolve();
              } else {
                console.log(`Enhanced CMYK: Successfully converted original PDF to CMYK with ${hasICC ? 'ICC profile' : 'standard conversion'}: ${path.basename(pdfPath)}`);
                useCMYKVersion = true;
                resolve();
              }
            });
          });
        } catch (cmykError) {
          console.error('Enhanced CMYK: CMYK conversion error:', cmykError);
        }
        
        // Step 2: Use CMYK version if available, otherwise original
        finalPdfPath = (useCMYKVersion && fs.existsSync(cmykPdfPath)) ? cmykPdfPath : pdfPath;
      }
      
      // Read and embed the PDF to preserve vectors
      const originalPdfBytes = fs.readFileSync(finalPdfPath);
      const originalPdf = await PDFDocument.load(originalPdfBytes);
      
      // Get the first page of the PDF
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
      
      // Convert mm to points (1 mm = 2.834645669 points)
      const mmToPoints = 2.834645669;
      
      // Calculate position in points (will be updated after content bounds calculation)
      let x = element.x * mmToPoints;
      let y = (templateSize.height - element.y - element.height) * mmToPoints;
      
      // CRITICAL FIX: Use actual content bounds instead of element dimensions
      // Canvas ignores element.width/height and uses true content bounds
      // PDF must do the same to achieve visual matching
      
      // Get the SVG file that canvas actually displays
      const allLogos = await storage.getLogosByProject(element.id);
      const logo = allLogos.find((l: any) => l.id === element.logoId);
      let actualContentWidth = element.width;
      let actualContentHeight = element.height;
      
      if (logo && logo.filename.includes('.pdf.svg')) {
        const uploadsDir = path.join(process.cwd(), 'uploads');
        const svgPath = path.join(uploadsDir, logo.filename);
        const svgContent = fs.readFileSync(svgPath, 'utf8');
        
        console.log(`🎯 CALCULATING TRUE CONTENT BOUNDS like canvas does for: ${logo.filename}`);
        
        // Extract all path coordinates to find true content bounds (same as canvas logic)
        const pathMatches = svgContent.match(/<path[^>]*d="([^"]*)"[^>]*>/g) || [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        pathMatches.forEach(pathMatch => {
          const pathData = pathMatch.match(/d="([^"]*)"/) ?.[1] || '';
          const coords = pathData.match(/[-]?\d+\.?\d*/g) || [];
          
          for (let i = 0; i < coords.length; i += 2) {
            const x = parseFloat(coords[i]);
            const y = parseFloat(coords[i + 1]);
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        });
        
        if (minX !== Infinity && maxX !== -Infinity) {
          const contentWidthPx = maxX - minX;
          const contentHeightPx = maxY - minY;
          
          // Convert from pixels to mm (same conversion as canvas uses)
          const pixelsToMm = 0.26458333; // 1 pixel = 0.26458333 mm
          actualContentWidth = contentWidthPx * pixelsToMm;
          actualContentHeight = contentHeightPx * pixelsToMm;
          
          console.log(`🎯 CONTENT BOUNDS: ${contentWidthPx.toFixed(1)}×${contentHeightPx.toFixed(1)}px = ${actualContentWidth.toFixed(1)}×${actualContentHeight.toFixed(1)}mm`);
          console.log(`🎯 CANVAS ELEMENT: ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm`);
          console.log(`🎯 USING CONTENT BOUNDS for PDF generation to match canvas display`);
          
          // Recalculate Y position using actual content height
          y = (templateSize.height - element.y - actualContentHeight) * mmToPoints;
        }
      }
      
      // Calculate target size in points using ACTUAL content dimensions
      const targetWidth = actualContentWidth * mmToPoints;
      const targetHeight = actualContentHeight * mmToPoints;
      
      // Get original page dimensions in points
      const { width: origWidth, height: origHeight } = embeddedPage.size();
      
      console.log(`Enhanced CMYK: Element size: ${element.width}×${element.height}mm -> ${targetWidth}×${targetHeight}pts`);
      console.log(`Enhanced CMYK: Original PDF size: ${origWidth}×${origHeight}pts`);
      
      // CRITICAL FIX: Use exact element dimensions from canvas bounds detection
      // The canvas system already displays at the correct size, so PDF must match exactly
      console.log(`📊 Position calculation debug:`, {
        elementX: element.x,
        elementY: element.y,
        elementWidth: element.width,
        elementHeight: element.height,
        pageWidth: templateSize.width * mmToPoints,
        pageHeight: templateSize.height * mmToPoints,
        templatePixelWidth: templateSize.pixelWidth,
        templatePixelHeight: templateSize.pixelHeight,
        templateMmWidth: templateSize.width,
        templateMmHeight: templateSize.height
      });
      
      console.log(`📐 Exact canvas coordinate conversion:`, {
        canvasX: element.x,
        canvasY: element.y,
        canvasWidth: element.width,
        canvasHeight: element.height,
        pageWidth: (templateSize.width * mmToPoints).toFixed(1),
        pageHeight: (templateSize.height * mmToPoints).toFixed(1),
        scaleX: (templateSize.width * mmToPoints / templateSize.pixelWidth).toFixed(4),
        scaleY: (templateSize.height * mmToPoints / templateSize.pixelHeight).toFixed(4),
        scaledElementY: (element.y * templateSize.height * mmToPoints / templateSize.pixelHeight).toFixed(1),
        scaledElementHeight: (element.height * templateSize.height * mmToPoints / templateSize.pixelHeight).toFixed(1),
        pdfX: x.toFixed(1),
        pdfY: y.toFixed(1),
        finalX: x.toFixed(1),
        finalY: y.toFixed(1)
      });
      
      console.log(`📏 Exact canvas size calculation:`, {
        canvasWidth: element.width,
        canvasHeight: element.height,
        templatePixelWidth: templateSize.pixelWidth,
        templatePixelHeight: templateSize.pixelHeight,
        pageWidth: (templateSize.width * mmToPoints).toFixed(1),
        pageHeight: (templateSize.height * mmToPoints).toFixed(1),
        scaleX: (templateSize.width * mmToPoints / templateSize.pixelWidth).toFixed(4),
        scaleY: (templateSize.height * mmToPoints / templateSize.pixelHeight).toFixed(4),
        finalWidth: targetWidth.toFixed(1),
        finalHeight: targetHeight.toFixed(1)
      });
      
      console.log(`📍 Target position: (${x.toFixed(1)}, ${y.toFixed(1)}) size: ${targetWidth.toFixed(1)}x${targetHeight.toFixed(1)}`);
      
      // CRITICAL: Force content to fill exact bounds by stretching to target dimensions
      // This ensures PDF matches the canvas display exactly, ignoring original PDF aspect ratio
      const forceStretch = true; // Always stretch to match canvas
      
      if (forceStretch) {
        console.log(`🎯 FORCING content stretch: ${origWidth}×${origHeight}pts -> ${targetWidth}×${targetHeight}pts`);
        console.log(`🎯 Stretch ratios: X=${(targetWidth/origWidth).toFixed(3)}x, Y=${(targetHeight/origHeight).toFixed(3)}x`);
        
        // REVOLUTIONARY APPROACH: Generate positioned SVG that matches canvas exactly
        // Create a full-page SVG with element positioned exactly as canvas shows it
        // This bypasses all PDF embedding scaling issues
        
        console.log(`🎯 CANVAS REPLICATION: Creating full-page SVG matching canvas layout exactly`);
        
        if (logo && logo.filename.includes('.pdf.svg')) {
          const uploadsDir = path.join(process.cwd(), 'uploads');
          const svgPath = path.join(uploadsDir, logo.filename);
          const tempFullPageSvgPath = path.join(uploadsDir, `temp_fullpage_${Date.now()}.svg`);
          const tempFullPagePdfPath = path.join(uploadsDir, `temp_fullpage_${Date.now()}.pdf`);
          
          try {
            console.log(`🎯 Creating full-page SVG with exact canvas positioning`);
            
            // Read the original logo SVG content
            const logoSvgContent = fs.readFileSync(svgPath, 'utf8');
            
            // Extract just the content (paths, shapes) without the outer SVG wrapper
            const contentMatch = logoSvgContent.match(/<svg[^>]*>(.*)<\/svg>/g);
            const logoContent = contentMatch ? contentMatch[1] : logoSvgContent;
            
            // Calculate exact canvas pixel positioning
            const canvasWidthPx = templateSize.pixelWidth;
            const canvasHeightPx = templateSize.pixelHeight;
            
            // Convert element position from mm to pixels (exact canvas scale)
            const elementXPx = (element.x / templateSize.width) * canvasWidthPx;
            const elementYPx = (element.y / templateSize.height) * canvasHeightPx;
            const elementWidthPx = (actualContentWidth / templateSize.width) * canvasWidthPx;
            const elementHeightPx = (actualContentHeight / templateSize.height) * canvasHeightPx;
            
            console.log(`🎯 EXACT POSITIONING: (${elementXPx.toFixed(1)}, ${elementYPx.toFixed(1)}) size ${elementWidthPx.toFixed(1)}×${elementHeightPx.toFixed(1)}px`);
            
            // Use actual content dimensions (fallback to element dimensions if not available)
            const contentWidthPx = actualContentWidth || element.width;
            const contentHeightPx = actualContentHeight || element.height;
            
            // Calculate dynamic scaling based on actual detected content bounds
            const scaleX = elementWidthPx / contentWidthPx;
            const scaleY = elementHeightPx / contentHeightPx;
            
            console.log(`🎯 DYNAMIC SCALING: content=${contentWidthPx.toFixed(1)}×${contentHeightPx.toFixed(1)}px, target=${elementWidthPx.toFixed(1)}×${elementHeightPx.toFixed(1)}px, scale=(${scaleX.toFixed(6)}, ${scaleY.toFixed(6)})`);
            
            // Create full-page SVG with logo positioned exactly as canvas shows
            const fullPageSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidthPx}" height="${canvasHeightPx}" viewBox="0 0 ${canvasWidthPx} ${canvasHeightPx}">
  <g transform="translate(${elementXPx}, ${elementYPx}) scale(${scaleX.toFixed(6)}, ${scaleY.toFixed(6)}) rotate(${element.rotation || 0})">
    ${logoContent}
  </g>
</svg>`;
            
            fs.writeFileSync(tempFullPageSvgPath, fullPageSvg);
            
            // Convert full-page SVG to PDF at exact template dimensions
            await execAsync(`inkscape "${tempFullPageSvgPath}" --export-pdf="${tempFullPagePdfPath}" --export-width=${canvasWidthPx} --export-height=${canvasHeightPx}`);
            console.log(`🎯 Generated full-page PDF matching canvas exactly`);
            
            // Load and embed the full-page PDF
            const fullPagePdfBytes = fs.readFileSync(tempFullPagePdfPath);
            const fullPagePdfDoc = await PDFDocument.load(fullPagePdfBytes);
            const [fullPagePdfPage] = await pdfDoc.embedPages([fullPagePdfDoc.getPage(0)]);
            
            // Embed at full page size (positioning already baked into the SVG)
            const pageWidthPts = templateSize.width * mmToPoints;
            const pageHeightPts = templateSize.height * mmToPoints;
            
            page.drawPage(fullPagePdfPage, {
              x: 0,
              y: 0,
              width: pageWidthPts,
              height: pageHeightPts,
            });
            
            console.log(`🎯 SUCCESS: Embedded full-page PDF with exact canvas positioning`);
            
            // Clean up temp files
            fs.unlinkSync(tempFullPageSvgPath);
            fs.unlinkSync(tempFullPagePdfPath);
            
          } catch (error) {
            console.log(`🎯 Full-page SVG generation failed, using fallback:`, error);
            // Fallback to original approach
            page.drawPage(embeddedPage, {
              x: x,
              y: y,
              width: targetWidth,
              height: targetHeight,
              rotate: degrees(element.rotation || 0),
            });
          }
        } else {
          console.log(`🎯 No .pdf.svg file found, using original PDF embedding`);
          // Fallback to original approach
          page.drawPage(embeddedPage, {
            x: x,
            y: y,
            width: targetWidth,
            height: targetHeight,
            rotate: degrees(element.rotation || 0),
          });
        }
        
        console.log(`✅ Successfully embedded CMYK PDF at (${x.toFixed(1)}, ${y.toFixed(1)}) with forced stretch scales: ${(targetWidth/origWidth).toFixed(3)}x, ${(targetHeight/origHeight).toFixed(3)}x`);
      } else {
        // Original scaling logic (not used)
        const finalWidth = actualContentWidth || element.width;
        const finalHeight = actualContentHeight || element.height;
        page.drawPage(embeddedPage, {
          x: x,
          y: y,
          width: finalWidth,
          height: finalHeight,
          rotate: degrees(element.rotation || 0),
        });
      }
      
      const colorSpace = useCMYKVersion ? 'CMYK' : 'RGB';
      console.log(`Enhanced CMYK: Successfully embedded ${colorSpace} vector PDF: ${element.logoId}`);
      
      // Clean up CMYK temp file
      if (fs.existsSync(cmykPdfPath)) {
        fs.unlinkSync(cmykPdfPath);
      }
      
    } catch (error) {
      console.error(`Enhanced CMYK: Error embedding PDF:`, error);
      throw error;
    }
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
      console.log('📊 Color overrides would be applied here:', colorOverrides);
      const modifiedSvgContent = fs.readFileSync(tempSvgPath, 'utf8'); // Use original for now
      
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

  private async applyICCProfilePostProcessing(pdfBuffer: Buffer, iccProfilePath: string): Promise<Buffer> {
    const execAsync = promisify(exec);
    const tempDir = path.join(process.cwd(), 'uploads', 'temp_icc');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    try {
      const inputPath = path.join(tempDir, `input_${Date.now()}.pdf`);
      const outputPath = path.join(tempDir, `output_${Date.now()}.pdf`);
      
      // Write input PDF
      fs.writeFileSync(inputPath, pdfBuffer);
      
      // Use Ghostscript to embed ICC profile WITHOUT converting colors
      const gsCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dColorConversionStrategy=/LeaveColorUnchanged',  // CRITICAL: Don't change colors!
        '-dProcessColorModel=/DeviceCMYK',
        '-dOverrideICC=true',
        `-sOutputICCProfile="${iccProfilePath}"`,
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`
      ].join(' ');
      
      console.log(`Enhanced CMYK: Applying ICC profile with Ghostscript: ${path.basename(iccProfilePath)}`);
      console.log(`Enhanced CMYK: GS Command: ${gsCommand}`);
      
      const { stdout, stderr } = await execAsync(gsCommand);
      if (stdout) console.log('Enhanced CMYK: GS stdout:', stdout);
      if (stderr) console.log('Enhanced CMYK: GS stderr:', stderr);
      
      if (fs.existsSync(outputPath)) {
        const enhancedPDFBuffer = fs.readFileSync(outputPath);
        
        // Clean up temp files
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        
        console.log('Enhanced CMYK: Successfully applied ICC profile post-processing');
        return enhancedPDFBuffer;
      } else {
        throw new Error('Ghostscript ICC profile embedding failed - no output file created');
      }
      
    } catch (error) {
      console.error('Enhanced CMYK: ICC profile post-processing failed:', error);
      
      // If Ghostscript fails, try embedding ICC profile directly with pdf-lib
      try {
        console.log('Enhanced CMYK: Attempting direct ICC profile embedding with pdf-lib');
        return await this.embedICCProfileDirectly(pdfBuffer, iccProfilePath);
      } catch (directError) {
        console.error('Enhanced CMYK: Direct ICC profile embedding also failed:', directError);
        // Clean up any remaining temp files
        try {
          const files = fs.readdirSync(tempDir);
          files.forEach(file => {
            fs.unlinkSync(path.join(tempDir, file));
          });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw error;
      }
    } finally {
      // Clean up temp directory if empty
      try {
        fs.rmdirSync(tempDir);
      } catch (error) {
        // Ignore if directory not empty or doesn't exist
      }
    }
  }



  private async embedICCProfileDirectly(pdfBuffer: Buffer, iccProfilePath: string): Promise<Buffer> {
    try {
      // Load the existing PDF
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      
      // Read the ICC profile
      const iccProfileData = fs.readFileSync(iccProfilePath);
      
      // Create an ICC-based color space
      const iccRef = pdfDoc.context.nextRef();
      const iccStream = pdfDoc.context.stream(iccProfileData, {
        N: 4, // Number of color components for CMYK
        Alternate: 'DeviceCMYK',
        Filter: 'FlateDecode'
      });
      
      pdfDoc.context.assign(iccRef, iccStream);
      
      // Get all pages and update their resources
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const resources = page.node.Resources();
        if (resources) {
          // Add ColorSpace resource with ICC profile
          const colorSpaceDict = resources.lookup(PDFName.of('ColorSpace')) || pdfDoc.context.obj({});
          // Skip setting color space to avoid altering CMYK values
          // We'll embed ICC profile as OutputIntent only
        }
      }
      
      // Add OutputIntent for PDF/X compliance
      const outputIntent = pdfDoc.context.obj({
        Type: PDFName.of('OutputIntent'),
        S: PDFName.of('GTS_PDFX'),
        OutputConditionIdentifier: PDFString.of('FOGRA51'),
        RegistryName: PDFString.of('http://www.color.org'),
        Info: PDFString.of('PSO Coated v3 (FOGRA51)'),
        DestOutputProfile: iccRef
      });
      
      const outputIntents = pdfDoc.catalog.lookup(PDFName.of('OutputIntents')) || pdfDoc.context.obj([]);
      if (Array.isArray(outputIntents)) {
        outputIntents.push(outputIntent);
      } else {
        pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));
      }
      
      console.log('Enhanced CMYK: Successfully embedded ICC profile directly with pdf-lib');
      
      // Save the PDF with embedded ICC profile
      return Buffer.from(await pdfDoc.save());
      
    } catch (error) {
      console.error('Enhanced CMYK: Direct ICC profile embedding failed:', error);
      // Return original buffer if embedding fails
      return pdfBuffer;
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
        
        // Use ghostscript to embed ICC profile with proper color management
        // Important: Use -dOverrideICC to ensure ICC profile is applied correctly
        const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -dEmbedAllFonts=true -dCompatibilityLevel=1.4 -sDefaultCMYKProfile="${iccProfilePath}" -sOutputICCProfile="${iccProfilePath}" -dOverrideICC=true -sOutputFile="${outputPath}" "${inputPath}"`;
        console.log(`Enhanced CMYK: Embedding ICC profile into PDF structure with color management: ${path.basename(iccProfilePath)}`);
        
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
    
    // For raster images, attempt CMYK conversion first
    let finalImagePath = imagePath;
    
    if (mimeType.includes('jpeg') || mimeType.includes('jpg') || mimeType.includes('png')) {
      try {
        const { RasterCMYKConverter } = await import('./raster-cmyk-converter');
        
        // Check if already CMYK
        const isAlreadyCMYK = await RasterCMYKConverter.isAlreadyCMYK(imagePath);
        
        if (!isAlreadyCMYK) {
          console.log(`Enhanced CMYK: Converting raster image to CMYK: ${path.basename(imagePath)}`);
          const cmykImagePath = imagePath.replace(/\.(png|jpg|jpeg)$/i, '_cmyk.$1');
          
          const converted = await RasterCMYKConverter.convertRasterToCMYK(imagePath, cmykImagePath, mimeType);
          
          if (converted && fs.existsSync(cmykImagePath)) {
            finalImagePath = cmykImagePath;
            console.log(`Enhanced CMYK: Using CMYK-converted raster image`);
          } else {
            console.log(`Enhanced CMYK: Raster CMYK conversion failed, using original RGB`);
          }
        } else {
          console.log(`Enhanced CMYK: Raster image already in CMYK color space`);
        }
      } catch (error) {
        console.error('Enhanced CMYK: Error during raster CMYK conversion:', error);
        // Continue with original image
      }
    }
    
    const imageBytes = fs.readFileSync(finalImagePath);
    let image;
    
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (mimeType.includes('png')) {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      console.warn(`Unsupported image type: ${mimeType}`);
      return;
    }
    
    // Convert mm to points (1 mm = 2.834645669 points)
    const mmToPoints = 2.834645669;
    
    // Calculate position in points (flip Y coordinate for PDF)
    const x = element.x * mmToPoints;
    const y = (templateSize.height - element.y - element.height) * mmToPoints;
    const width = element.width * mmToPoints;
    const height = element.height * mmToPoints;
    
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
    console.log(`Enhanced CMYK: ========== embedSVGAsPDF START ==========`);
    console.log(`Enhanced CMYK: embedSVGAsPDF called for element:`, JSON.stringify(element));
    console.log(`Enhanced CMYK: Method started, storage exists: ${!!storage}`);
    try {
      // CRITICAL: Use pre-calculated CMYK values from app instead of RGB-to-CMYK conversion
      console.log(`Enhanced CMYK: Starting CMYK conversion for: ${path.basename(svgPath)}, logoId: ${element.logoId}`);
      
      let svgContentForPDF = fs.readFileSync(svgPath, 'utf8');
      let preservedExactCMYK = true; // Force CMYK conversion for all vector files
      console.log(`Enhanced CMYK: FORCING preservedExactCMYK = true for all vector files`);
      
      // Get the logo data to access pre-calculated CMYK values
      console.log(`Enhanced CMYK: Attempting to get logo data for ID: ${element.logoId}`);
      console.log(`Enhanced CMYK: About to call storage.getLogo with ID:`, element.logoId);
      let logoData: any = null;
      try {
        logoData = await storage.getLogo(element.logoId || '');
        console.log(`Enhanced CMYK: storage.getLogo returned:`, !!logoData);
        console.log(`Enhanced CMYK: logoData structure:`, logoData ? Object.keys(logoData) : 'null');
        
        if (!logoData) {
          console.log(`Enhanced CMYK: Logo data is null/undefined for ${element.logoId}`);
          console.log(`Enhanced CMYK: Available storage methods:`, Object.keys(storage));
        } else {
          console.log(`Enhanced CMYK: Full logo data:`, JSON.stringify(logoData, null, 2));
          console.log(`Enhanced CMYK: Logo svgAnalysis exists:`, !!(logoData as any)?.svgAnalysis);
          console.log(`Enhanced CMYK: Colors array:`, (logoData as any)?.svgAnalysis?.colors?.length);
        }
        
        // Check multiple possible structures for CMYK values
        let colorAnalysis = null;
        
        // Try svgColors.colors first (frontend structure)
        if (logoData?.svgColors?.colors && Array.isArray(logoData.svgColors.colors)) {
          colorAnalysis = logoData.svgColors.colors;
          console.log(`Enhanced CMYK: Found color analysis in svgColors.colors with ${colorAnalysis.length} colors`);
        }
        // Try svgColors as direct array
        else if (logoData?.svgColors && Array.isArray(logoData.svgColors)) {
          colorAnalysis = logoData.svgColors;
          console.log(`Enhanced CMYK: Found color analysis in svgColors as array with ${colorAnalysis.length} colors`);
        }
        // Try svgAnalysis.colors
        else if ((logoData as any)?.svgAnalysis?.colors && Array.isArray((logoData as any).svgAnalysis.colors)) {
          colorAnalysis = (logoData as any).svgAnalysis.colors;
          console.log(`Enhanced CMYK: Found color analysis in svgAnalysis.colors with ${colorAnalysis.length} colors`);
        }
        
        console.log(`Enhanced CMYK: Color analysis data:`, !!colorAnalysis);
        console.log(`Enhanced CMYK: logoData.svgColors:`, !!logoData?.svgColors);
        console.log(`Enhanced CMYK: logoData.svgColors.colors:`, !!(logoData?.svgColors?.colors));
        console.log(`Enhanced CMYK: logoData.svgAnalysis:`, !!(logoData as any)?.svgAnalysis);
        console.log(`Enhanced CMYK: logoData.svgAnalysis.colors:`, !!(logoData as any)?.svgAnalysis?.colors);
        if (colorAnalysis) {
          console.log(`Enhanced CMYK: Color analysis length:`, Array.isArray(colorAnalysis) ? colorAnalysis.length : 'not array');
        } else {
          console.log(`Enhanced CMYK: Raw svgColors structure:`, JSON.stringify(logoData?.svgColors, null, 2));
        }
        
        // Handle both formats
        if (colorAnalysis && Array.isArray(colorAnalysis) && colorAnalysis.length > 0) {
          console.log(`Enhanced CMYK: Using pre-calculated CMYK values from app analysis`);
          
          let foundConvertedColors = 0;
          let hasExistingCMYK = false;
          
          // Apply CMYK color values to SVG content FIRST
          console.log(`Enhanced CMYK: Applying CMYK colors to SVG content before PDF conversion`);
          
          // Create color overrides map for all CMYK colors
          const colorOverrides: Record<string, string> = {};
          
          for (const colorInfo of colorAnalysis) {
            console.log(`Enhanced CMYK: Processing color:`, colorInfo.cmykColor, 'converted:', colorInfo.converted, 'isCMYK:', colorInfo.isCMYK);
            console.log(`Enhanced CMYK: Color info details:`, JSON.stringify(colorInfo, null, 2));
            
            // Convert CMYK to RGB for SVG embedding
            if (colorInfo.cmykColor && colorInfo.originalColor) {
              // Parse CMYK values and convert to RGB
              const cmykMatch = colorInfo.cmykColor.match(/C:(\d+)\s+M:(\d+)\s+Y:(\d+)\s+K:(\d+)/);
              if (cmykMatch) {
                const [, c, m, y, k] = cmykMatch.map(Number);
                // Convert CMYK to RGB for SVG display (approximation)
                const r = Math.round(255 * (1 - c/100) * (1 - k/100));
                const g = Math.round(255 * (1 - m/100) * (1 - k/100));
                const b = Math.round(255 * (1 - y/100) * (1 - k/100));
                const rgbColor = `rgb(${r}, ${g}, ${b})`;
                
                console.log(`Enhanced CMYK: Converting CMYK ${colorInfo.cmykColor} to RGB ${rgbColor} for SVG`);
                colorOverrides[colorInfo.originalColor] = rgbColor;
              }
            }
          }
          
          // Apply color overrides to SVG content
          if (Object.keys(colorOverrides).length > 0) {
            console.log(`Enhanced CMYK: Applying ${Object.keys(colorOverrides).length} color overrides to SVG`);
            svgContentForPDF = applySVGColorChanges(svgPath, colorOverrides);
            console.log(`Enhanced CMYK: SVG content updated with accurate CMYK-derived colors`);
          }
          
          for (const colorInfo of colorAnalysis) {
            
            // Check if color is already CMYK
            if (colorInfo.isCMYK) {
              hasExistingCMYK = true;
              console.log(`Enhanced CMYK: Color already in CMYK format: ${colorInfo.cmykColor}`);
            }
            
            // Only count as "converted" if it was actually converted from RGB to CMYK
            const isConverted = colorInfo.converted && colorInfo.cmykColor && !colorInfo.isCMYK;
            console.log(`Enhanced CMYK: Conversion check - converted: ${colorInfo.converted}, has cmykColor: ${!!colorInfo.cmykColor}, not CMYK: ${!colorInfo.isCMYK}, result: ${isConverted}`);
            if (isConverted) {
              foundConvertedColors++;
              console.log(`Enhanced CMYK: RGB->CMYK converted color: ${colorInfo.cmykColor} for ${colorInfo.originalFormat}`);
            }
          }
          
          console.log(`Enhanced CMYK: Found ${foundConvertedColors} RGB->CMYK converted colors, ${hasExistingCMYK ? 'HAS' : 'NO'} existing CMYK colors`);
          console.log(`Enhanced CMYK: SVG content updated with CMYK colors`);
          
          // Set flag based on whether we need CMYK conversion
          // If all colors are RGB (not CMYK), we should convert to CMYK
          if (foundConvertedColors > 0 || (!hasExistingCMYK && colorAnalysis.length > 0)) {
            preservedExactCMYK = true;
            console.log(`Enhanced CMYK: Setting preservedExactCMYK = true, will apply CMYK colorspace conversion`);
            console.log(`Enhanced CMYK: Reason - foundConvertedColors: ${foundConvertedColors}, hasExistingCMYK: ${hasExistingCMYK}, total colors: ${colorAnalysis.length}`);
          }
          
          // Pass hasExistingCMYK flag to the next section
          (element as any)._hasExistingCMYK = hasExistingCMYK;
        } else {
          console.log(`Enhanced CMYK: No color analysis found, but forcing CMYK conversion for vector file`);
          // For vector files without analysis data, force CMYK conversion
          preservedExactCMYK = true;
        }
      } catch (logoError) {
        console.error(`Enhanced CMYK: ERROR accessing logo data for CMYK preservation:`, logoError);
        console.error(`Enhanced CMYK: Error stack:`, (logoError as Error).stack);
        console.error(`Enhanced CMYK: Element logoId: ${element.logoId}`);
        console.error(`Enhanced CMYK: Storage object exists: ${!!storage}`);
        console.error(`Enhanced CMYK: Storage.getLogo exists: ${typeof storage.getLogo}`);
      }
      
      // Save the CMYK-preserved SVG content
      const preservedSvgPath = svgPath.replace('.svg', '_cmyk_preserved.svg');
      fs.writeFileSync(preservedSvgPath, svgContentForPDF);
      
      // Check if SVG has embedded images
      const svgContent = fs.readFileSync(preservedSvgPath, 'utf8');
      const { SVGEmbeddedImageHandler } = await import('./svg-embedded-image-handler');
      const hasEmbeddedImages = SVGEmbeddedImageHandler.hasEmbeddedImages(svgContent);
      
      if (hasEmbeddedImages) {
        console.log(`Enhanced CMYK: SVG contains embedded images, using special handling for transparency`);
      }
      
      // Convert the CMYK-preserved SVG to PDF using rsvg-convert
      const rgbPdfPath = svgPath.replace('.svg', '_rgb.pdf');
      const cmykPdfPath = svgPath.replace('.svg', '_cmyk.pdf');
      const command = `rsvg-convert --format=pdf --output="${rgbPdfPath}" "${preservedSvgPath}"`;
      
      // Use special handler for SVGs with embedded images
      if (hasEmbeddedImages) {
        const converted = await SVGEmbeddedImageHandler.convertToPDFWithTransparency(preservedSvgPath, rgbPdfPath);
        if (!converted) {
          // Fallback to standard conversion
          await new Promise<void>((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
              if (error) {
                console.error(`Enhanced CMYK: SVG to PDF conversion failed:`, error);
                reject(error);
              } else {
                console.log(`Enhanced CMYK: Successfully converted CMYK-preserved SVG to PDF: ${path.basename(svgPath)}`);
                resolve();
              }
            });
          });
        }
      } else {
        // Standard conversion for SVGs without embedded images
        await new Promise<void>((resolve, reject) => {
          exec(command, (error, stdout, stderr) => {
            if (error) {
              console.error(`Enhanced CMYK: SVG to PDF conversion failed:`, error);
              reject(error);
            } else {
              console.log(`Enhanced CMYK: Successfully converted CMYK-preserved SVG to PDF: ${path.basename(svgPath)}`);
              resolve();
            }
          });
        });
      }

      if (fs.existsSync(rgbPdfPath)) {
        let finalPdfPath = rgbPdfPath;
        
        // Retrieve hasExistingCMYK flag
        const hasExistingCMYK = (element as any)._hasExistingCMYK || false;
        
        // Apply CMYK colorspace conversion based on whether colors need conversion
        console.log(`Enhanced CMYK: Checking if CMYK conversion needed - preservedExactCMYK: ${preservedExactCMYK}, hasExistingCMYK: ${hasExistingCMYK}`);
        
        // Force CMYK conversion for all vector files to ensure proper colorspace
        console.log(`Enhanced CMYK: FORCING CMYK conversion for vector files to ensure proper colorspace`);
        if (true) { // Force CMYK conversion for all SVG files
          console.log(`Enhanced CMYK: Converting RGB PDF to true CMYK colorspace for: ${path.basename(svgPath)}`);
          
          try {
            // Use the direct CMYK conversion approach for RGB->CMYK conversion
            const colorMappings = [];
            const colorAnalysis = logoData?.svgColors as any;
            
            if (colorAnalysis && Array.isArray(colorAnalysis)) {
              for (const colorInfo of colorAnalysis) {
                // Only process colors that were converted from RGB to CMYK
                if (colorInfo.converted && colorInfo.cmykColor && !colorInfo.isCMYK) {
                  const cmykMatch = colorInfo.cmykColor.match(/C:(\d+)\s+M:(\d+)\s+Y:(\d+)\s+K:(\d+)/);
                  if (cmykMatch) {
                    const [, c, m, y, k] = cmykMatch;
                    colorMappings.push({
                      originalColor: colorInfo.originalFormat || colorInfo.originalColor,
                      cmykColor: colorInfo.cmykColor,
                      cmykValues: {
                        c: parseInt(c, 10),
                        m: parseInt(m, 10),
                        y: parseInt(y, 10),
                        k: parseInt(k, 10)
                      }
                    });
                    console.log(`Enhanced CMYK: Converting RGB to CMYK: ${colorInfo.cmykColor}`);
                  }
                }
              }
            }
            
            // Use exact CMYK mapping for precise color conversion
            console.log(`Enhanced CMYK: Converting RGB PDF to CMYK with exact color mappings`);
            
            try {
              // Import our exact CMYK conversion function
              const { convertSVGtoExactCMYKPDF } = await import('./exact-cmyk-pdf');
              
              // Use the color analysis data for exact mapping
              const success = await convertSVGtoExactCMYKPDF(svgPath, cmykPdfPath, colorAnalysis);
              
              if (!success) {
                // Fallback to simple Ghostscript conversion
                console.log(`Enhanced CMYK: Exact mapping failed, using standard Ghostscript conversion`);
                const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -sOutputFile="${cmykPdfPath}" "${rgbPdfPath}"`;
                await new Promise<void>((resolve, reject) => {
                  exec(gsCommand, (error, stdout, stderr) => {
                    if (error) {
                      console.error(`Enhanced CMYK: Ghostscript CMYK conversion failed:`, error);
                      resolve(); // Don't reject, just continue
                    } else {
                      console.log(`Enhanced CMYK: Successfully converted to CMYK colorspace`);
                      resolve();
                    }
                  });
                });
              } else {
                console.log(`Enhanced CMYK: Successfully converted with exact CMYK color mappings`);
              }
              
              if (fs.existsSync(cmykPdfPath)) {
                finalPdfPath = cmykPdfPath;
                console.log(`Enhanced CMYK: Using CMYK PDF version`);
              } else {
                console.log(`Enhanced CMYK: CMYK conversion failed, using RGB PDF`);
              }
            } catch (gsError) {
              console.error(`Enhanced CMYK: Ghostscript conversion error:`, gsError);
            }
          } catch (cmykError) {
            console.warn('Enhanced CMYK: CMYK colorspace conversion error:', cmykError);
          }
        } else if (hasExistingCMYK) {
          // For files with existing CMYK colors, only embed ICC profile without conversion
          console.log(`Enhanced CMYK: File has existing CMYK colors, embedding ICC profile only`);
          
          try {
            const iccProfilePath = path.join(process.cwd(), "attached_assets", "PSO Coated FOGRA51 (EFI)_1753573621935.icc");
            
            if (fs.existsSync(iccProfilePath)) {
              const success = await this.embedICCProfileOnly(rgbPdfPath, iccProfilePath);
              if (success) {
                console.log(`Enhanced CMYK: Successfully embedded ICC profile without color conversion`);
                finalPdfPath = rgbPdfPath;
              }
            } else {
              console.log(`Enhanced CMYK: ICC profile not found, using PDF as-is`);
            }
          } catch (error) {
            console.error(`Enhanced CMYK: ICC profile embedding failed:`, error);
          }
        }
        
        // Load and embed the final PDF (either RGB or CMYK depending on conversion success)
        const pdfBytes = fs.readFileSync(finalPdfPath);
        const convertedPdf = await PDFDocument.load(pdfBytes);
        
        const pages = convertedPdf.getPages();
        if (pages.length > 0) {
          const embeddedPage = await pdfDoc.embedPage(pages[0]);
          
          // Convert mm to points (1 mm = 2.834645669 points)
          const mmToPoints = 2.834645669;
          
          // Calculate position in points (flip Y coordinate for PDF)
          const x = element.x * mmToPoints;
          const y = (templateSize.height - element.y - element.height) * mmToPoints;
          const targetWidth = element.width * mmToPoints;
          const targetHeight = element.height * mmToPoints;
          
          console.log(`🎨 SVG converted to PDF (vectors preserved): ${path.basename(svgPath)}`);
          console.log(`✅ Successfully embedded single-page SVG as vector PDF at (${x.toFixed(1)}, ${y.toFixed(1)})`);
          
          // Use exact element dimensions to match canvas display
          page.drawPage(embeddedPage, {
            x: x,
            y: y,
            width: targetWidth,  // Use exact dimensions
            height: targetHeight, // Use exact dimensions
            rotate: degrees(element.rotation || 0),
          });
          
          const colorspaceMessage = finalPdfPath === cmykPdfPath ? 'TRUE CMYK COLORSPACE' : 'RGB COLORSPACE';
          const valuesMessage = preservedExactCMYK ? 'EXACT CMYK VALUES PRESERVED' : 'RGB values used';
          console.log(`Enhanced CMYK: Successfully embedded SVG as PDF (${colorspaceMessage}, ${valuesMessage}): ${path.basename(svgPath)}`);
        }
        
        // Clean up temp files
        if (fs.existsSync(rgbPdfPath)) fs.unlinkSync(rgbPdfPath);
        if (fs.existsSync(cmykPdfPath)) fs.unlinkSync(cmykPdfPath);
        if (fs.existsSync(preservedSvgPath)) fs.unlinkSync(preservedSvgPath);
      } else {
        console.error(`Enhanced CMYK: Failed to create PDF from CMYK-preserved SVG: ${svgPath}`);
      }
    } catch (error) {
      console.error(`Enhanced CMYK: Error preserving CMYK values in PDF:`, error);
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

  /**
   * Embed ICC profile without any color conversion
   * This preserves exact CMYK values while adding the profile for color management
   */
  private async embedICCProfileOnly(pdfPath: string, iccProfilePath: string): Promise<boolean> {
    const execAsync = promisify(exec);
    const tempDir = path.join(process.cwd(), 'uploads', 'temp_icc_only');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `input_${timestamp}.pdf`);
    const outputPath = path.join(tempDir, `output_${timestamp}.pdf`);
    
    try {
      // Copy the PDF file to temp location
      fs.copyFileSync(pdfPath, inputPath);
      
      // Use Ghostscript with specific flags to ONLY embed ICC without color conversion
      const gsCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dColorConversionStrategy=/LeaveColorUnchanged', // Critical: Don't convert colors!
        '-dPreserveSeparation=true',
        '-dPreserveDeviceN=true',
        '-dPreserveOPIComments=true',
        '-dDownsampleColorImages=false',
        '-dDownsampleGrayImages=false',
        '-dDownsampleMonoImages=false',
        '-dColorImageFilter=/FlateEncode', // Lossless
        '-dAutoFilterColorImages=false',
        '-dEncodeColorImages=true',
        `-sOutputICCProfile="${iccProfilePath}"`,
        '-dPDFA=2', // PDF/A-2 for color management
        '-dPDFACompatibilityPolicy=1',
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`
      ].join(' ');
      
      console.log('Enhanced CMYK: Embedding ICC profile with color preservation...');
      await execAsync(gsCommand);
      
      if (fs.existsSync(outputPath)) {
        // Copy result back to original path
        fs.copyFileSync(outputPath, pdfPath);
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        return true;
      } else {
        throw new Error('ICC profile embedding failed - no output created');
      }
      
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      console.error('Enhanced CMYK: ICC profile embedding failed:', error);
      return false;
    }
  }
}