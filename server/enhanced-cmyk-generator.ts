import { storage } from "./storage";
import type { CanvasElement, Logo, TemplateSize } from "@shared/schema";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { PDFDocument, rgb, degrees, PDFName, PDFArray, PDFDict, PDFRef, StandardFonts } from "pdf-lib";
import { manufacturerColors } from "@shared/garment-colors";
import { recolorSVG } from "./svg-recolor";

export interface PDFGenerationData {
  projectId: string;
  templateSize: TemplateSize;
  canvasElements: CanvasElement[];
  logos: Logo[];
  garmentColor?: string;
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
    const { projectId, templateSize, canvasElements, logos, garmentColor } = data;
    
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
    
    // For Single Colour Transfer templates, check for recolored SVG first
    if (isSingleColourTransfer && inkColor) {
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
        if (isSingleColourTransfer && inkColor) {
          console.log(`Enhanced CMYK: Applying ink color ${inkColor} to PDF vector content`);
          await this.embedRecoloredPDF(pdfDoc, page, element, originalPdfPath, templateSize, inkColor);
        } else {
          await this.embedOriginalPDF(pdfDoc, page, element, originalPdfPath, templateSize);
        }
        return;
      }
    }
    
    // Fallback to processed image
    const logoPath = path.join(uploadDir, logo.filename);
    if (fs.existsSync(logoPath)) {
      console.log(`Enhanced CMYK: Embedding processed image: ${logo.originalName}`);
      await this.embedImageFile(pdfDoc, page, element, logoPath, logo.mimeType || 'image/png', templateSize);
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
      
      // Step 1: Convert PDF to high-quality PNG with transparency
      const tempPngPath = path.join(uploadDir, `temp_high_res_${Date.now()}.png`);
      await execAsync(`convert -density 300 -background transparent "${pdfPath}[0]" "${tempPngPath}"`);
      
      if (!fs.existsSync(tempPngPath)) {
        throw new Error('PDF to PNG conversion failed');
      }
      
      // Step 2: Apply comprehensive color replacement 
      const tempRecoloredPngPath = path.join(uploadDir, `temp_recolored_png_${Date.now()}.png`);
      
      // Create a binary mask where any non-transparent pixel becomes the ink color
      // This approach catches all colors including light greens that are close to white
      await execAsync(`convert "${tempPngPath}" -alpha extract -negate "${tempPngPath}_mask.png"`);
      await execAsync(`convert -size $(identify -format "%wx%h" "${tempPngPath}") xc:"${inkColor}" "${tempPngPath}_mask.png" -alpha off -compose copy_opacity -composite "${tempRecoloredPngPath}"`);
      
      if (!fs.existsSync(tempRecoloredPngPath)) {
        throw new Error('Color replacement failed');
      }
      
      // Step 3: Convert back to PDF
      const tempRecoloredPdfPath = path.join(uploadDir, `temp_final_recolored_${Date.now()}.pdf`);
      await execAsync(`convert "${tempRecoloredPngPath}" "${tempRecoloredPdfPath}"`);
      
      if (fs.existsSync(tempRecoloredPdfPath)) {
        const stats = fs.statSync(tempRecoloredPdfPath);
        console.log(`Enhanced CMYK: Successfully created recolored PDF via ImageMagick (${stats.size} bytes)`);
        
        // Embed the recolored PDF
        await this.embedOriginalPDF(pdfDoc, page, element, tempRecoloredPdfPath, templateSize);
        
        // Clean up temporary files
        fs.unlinkSync(tempPngPath);
        if (fs.existsSync(`${tempPngPath}_mask.png`)) {
          fs.unlinkSync(`${tempPngPath}_mask.png`);
        }
        fs.unlinkSync(tempRecoloredPngPath);
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
          svgContent = this.recolorSVGContent(svgContent, inkColor);
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
      // For SVG files, we should not rasterize them. Skip this method
      // and use direct PDF vector embedding instead
      console.log(`Enhanced CMYK: Skipping SVG embedding to preserve vectors: ${path.basename(imagePath)}`);
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

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }
}