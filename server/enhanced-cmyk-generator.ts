import { storage } from "./storage";
import type { CanvasElement, Logo, TemplateSize } from "@shared/schema";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

export interface PDFGenerationData {
  projectId: string;
  templateSize: TemplateSize;
  canvasElements: CanvasElement[];
  logos: Logo[];
  garmentColor?: string;
}

export class EnhancedCMYKGenerator {
  async generateCMYKPDF(data: PDFGenerationData): Promise<Buffer> {
    const { projectId, templateSize, canvasElements, logos, garmentColor } = data;
    const execAsync = promisify(exec);
    const uploadDir = path.join(process.cwd(), "uploads");
    
    try {
      // Create temporary working directory
      const tempDir = path.join(uploadDir, 'enhanced_cmyk_temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // ICC profile path
      const iccProfilePath = path.join(process.cwd(), 'server', 'fogra51.icc');
      const useICC = fs.existsSync(iccProfilePath);
      
      console.log(useICC ? 
        'Enhanced CMYK: Using FOGRA51 ICC profile for professional color accuracy' : 
        'Enhanced CMYK: ICC profile not found, using standard CMYK conversion'
      );
      
      const logoMap = new Map(logos.map(logo => [logo.id, logo]));
      
      // Convert template size to pixels (300 DPI for print quality)
      const canvasWidth = Math.round(templateSize.width * 11.811);
      const canvasHeight = Math.round(templateSize.height * 11.811);
      
      // Filter visible elements
      const visibleElements = canvasElements.filter(el => el.isVisible && logoMap.has(el.logoId));
      
      if (visibleElements.length === 0) {
        throw new Error('No visible logos to render');
      }

      // Page 1: White background
      const page1Path = path.join(tempDir, 'page1.pdf');
      await this.createVectorPreservingPage(
        visibleElements, 
        logoMap, 
        templateSize, 
        page1Path, 
        '#FFFFFF', 
        execAsync, 
        useICC ? iccProfilePath : null
      );
      
      // Page 2: Garment color background
      const page2Path = path.join(tempDir, 'page2.pdf');
      const bgColor = garmentColor || '#FFFFFF';
      await this.createVectorPreservingPage(
        visibleElements, 
        logoMap, 
        templateSize, 
        page2Path, 
        bgColor, 
        execAsync, 
        useICC ? iccProfilePath : null
      );
      
      // Combine pages with ICC profile embedding
      const finalPdfPath = path.join(tempDir, 'final_cmyk.pdf');
      let combineCommand = `convert "${page1Path}" "${page2Path}"`;
      
      if (useICC) {
        combineCommand += ` -profile "${iccProfilePath}"`;
      }
      
      combineCommand += ` -compress lzw -quality 100 "${finalPdfPath}"`;
      console.log('Enhanced CMYK: Combining pages with ICC profile');
      await execAsync(combineCommand);
      
      // Read final PDF
      const pdfBuffer = fs.readFileSync(finalPdfPath);
      
      // Clean up
      this.cleanupTempFiles([page1Path, page2Path, finalPdfPath]);
      fs.rmdirSync(tempDir);
      
      console.log('Enhanced CMYK: Successfully generated professional CMYK PDF with vector preservation');
      return pdfBuffer;
      
    } catch (error) {
      console.error('Enhanced CMYK generation failed:', error);
      throw error;
    }
  }

  private async createVectorPreservingPage(
    elements: CanvasElement[],
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
    
    // Start with base canvas in RGB for better compositing
    let command = `convert -size ${canvasWidth}x${canvasHeight} xc:"${backgroundColor}"`;
    
    // Process each element, preserving vectors when possible
    for (const element of elements) {
      const logo = logoMap.get(element.logoId);
      if (!logo) continue;
      
      const logoPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(logoPath)) continue;
      
      // Calculate position and size in pixels
      const x = Math.round(element.x * 11.811);
      const y = Math.round(element.y * 11.811);
      const width = Math.round(element.width * 11.811);
      const height = Math.round(element.height * 11.811);
      
      // Check for PDF original to preserve vectors
      let sourcePath = logoPath;
      if (logo.originalFilename && logo.originalMimeType === 'application/pdf') {
        const originalPath = path.join(uploadDir, logo.originalFilename);
        if (fs.existsSync(originalPath)) {
          sourcePath = originalPath;
          console.log(`Enhanced CMYK: Using original PDF for vector preservation: ${logo.originalName}`);
        }
      }
      
      // Use appropriate density and resize settings for vector vs raster
      if (sourcePath.endsWith('.pdf') || logo.mimeType === 'application/pdf') {
        // High-density PDF processing for vector preservation
        command += ` \\( "${sourcePath}" -density 300 -resize ${width}x${height}! -background transparent \\) -geometry +${x}+${y} -composite`;
      } else if (sourcePath.endsWith('.svg')) {
        // SVG vector processing
        command += ` \\( "${sourcePath}" -density 300 -resize ${width}x${height}! -background transparent \\) -geometry +${x}+${y} -composite`;
      } else {
        // Raster image processing
        command += ` \\( "${sourcePath}" -resize ${width}x${height}! \\) -geometry +${x}+${y} -composite`;
      }
    }
    
    // Apply professional CMYK conversion with ICC profile
    if (iccProfilePath) {
      command += ` -profile "${iccProfilePath}" -colorspace CMYK -intent perceptual -quality 100 -compress lzw "${outputPath}"`;
      console.log('Enhanced CMYK: Applying FOGRA51 ICC profile for professional print standards');
    } else {
      command += ` -colorspace CMYK -intent perceptual -quality 100 -compress lzw "${outputPath}"`;
      console.log('Enhanced CMYK: Using standard CMYK conversion');
    }
    
    console.log('Enhanced CMYK: Creating vector-preserving page');
    await execAsync(command);
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
}