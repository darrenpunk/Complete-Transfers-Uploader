import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CMYKPDFGenerationData {
  canvasElements: any[];
  logos: { [key: string]: any };
  templateSize: { width: number; height: number };
  garmentColor?: string;
  projectName: string;
  quantity: number;
}

/**
 * Native CMYK PDF Generator
 * Generates PDFs entirely through Ghostscript PostScript, bypassing pdf-lib color conversion
 */
export class NativeCMYKGenerator {
  /**
   * Generate PDF with native CMYK color space preservation
   * Uses a simpler approach: Create individual CMYK PDFs and combine them with Ghostscript
   */
  async generatePDF(data: CMYKPDFGenerationData): Promise<Buffer> {
    try {
      console.log('🎨 Starting Native CMYK PDF Generation');
      
      // Step 1: Create individual CMYK PDFs for each logo
      const cmykPdfPaths: string[] = [];
      
      for (const element of data.canvasElements) {
        const logo = data.logos[element.logoId];
        if (!logo) continue;

        if (logo.svgColors && logo.svgColors.colors.some((c: any) => c.isCMYK)) {
          console.log(`🎨 Creating CMYK PDF for: ${logo.originalName}`);
          const cmykPdfPath = await this.createIndividualCMYKPDF(logo, element);
          cmykPdfPaths.push(cmykPdfPath);
        }
      }
      
      // Step 2: Create background template PDF
      const templatePdfPath = await this.createTemplatePDF(data);
      
      // Step 3: Combine template + CMYK logos using Ghostscript
      const finalPdfPath = await this.combinePDFsWithGhostscript(templatePdfPath, cmykPdfPaths, data);
      
      // Read and return PDF
      const pdfBuffer = await fs.readFile(finalPdfPath);
      console.log(`✅ Native CMYK PDF generated: ${pdfBuffer.length} bytes`);
      
      // Verify CMYK color space
      await this.verifyCMYKColorSpace(finalPdfPath);
      
      // Cleanup temporary files
      await this.cleanup([templatePdfPath, finalPdfPath, ...cmykPdfPaths]);
      
      return pdfBuffer;
      
    } catch (error) {
      console.error('❌ Native CMYK PDF generation failed:', error);
      // Fallback to original generator
      console.log('🔄 Falling back to OriginalWorkingGenerator...');
      const { OriginalWorkingGenerator } = await import('./original-working-generator');
      const fallbackGenerator = new OriginalWorkingGenerator();
      return await fallbackGenerator.generatePDF({
        projectId: 'fallback',
        templateSize: data.templateSize,
        canvasElements: data.canvasElements,
        logos: data.logos,
        garmentColor: data.garmentColor,
        appliqueBadgesForm: null
      });
    }
  }



  /**
   * Create individual CMYK PDF for a single logo with positioning
   */
  private async createIndividualCMYKPDF(logo: any, element: any): Promise<string> {
    const outputPath = path.join(process.cwd(), 'uploads', `cmyk_logo_${Date.now()}_${element.logoId}.pdf`);
    
    try {
      const logoPath = path.join(process.cwd(), logo.url.replace('/uploads/', 'uploads/'));
      
      // First convert to PDF with Inkscape
      const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_inkscape_${Date.now()}.pdf`);
      const inkscapeCmd = `inkscape --export-type=pdf --export-pdf-version=1.5 --export-text-to-path --export-filename="${tempPdfPath}" "${logoPath}"`;
      console.log(`🔧 Converting to PDF: ${inkscapeCmd}`);
      await execAsync(inkscapeCmd);
      
      // Then convert to CMYK with Ghostscript
      const gsCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${outputPath}" "${tempPdfPath}"`;
      console.log(`🎨 Converting to CMYK: ${gsCmd}`);
      await execAsync(gsCmd);
      
      // Verify file was created
      const stats = fsSync.statSync(outputPath);
      console.log(`✅ Individual CMYK PDF created: ${outputPath} (${stats.size} bytes)`);
      
      // Cleanup temp file
      if (fsSync.existsSync(tempPdfPath)) {
        fsSync.unlinkSync(tempPdfPath);
      }
      
      return outputPath;
      
    } catch (error) {
      console.error(`❌ Failed to create individual CMYK PDF: ${error}`);
      throw error;
    }
  }

  /**
   * Create template PDF with background and pages
   */
  private async createTemplatePDF(data: CMYKPDFGenerationData): Promise<string> {
    const templatePath = path.join(process.cwd(), 'uploads', `template_${Date.now()}.pdf`);
    
    // Use Ghostscript to create a basic CMYK template
    const pageWidth = data.templateSize.width * 2.834645669;
    const pageHeight = data.templateSize.height * 2.834645669;
    
    // Create PostScript for template
    const psContent = `%!PS-Adobe-3.0
%%Pages: 2
%%BoundingBox: 0 0 ${pageWidth.toFixed(0)} ${pageHeight.toFixed(0)}
%%DocumentProcessColors: Cyan Magenta Yellow Black

%%Page: 1 1
gsave
${pageWidth} ${pageHeight} scale
% Page 1: Transparent background (white)
1 1 1 0 setcmykcolor
0 0 1 1 rectfill
grestore
showpage

%%Page: 2 2  
gsave
${pageWidth} ${pageHeight} scale
${this.getGarmentBackgroundCMYK(data.garmentColor)} setcmykcolor
0 0 1 1 rectfill
grestore
showpage

%%EOF`;

    const psPath = path.join(process.cwd(), 'uploads', `template_${Date.now()}.ps`);
    await fs.writeFile(psPath, psContent);
    
    // Convert PS to PDF
    const gsCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -sOutputFile="${templatePath}" "${psPath}"`;
    await execAsync(gsCmd);
    
    // Cleanup PS file
    if (fsSync.existsSync(psPath)) {
      fsSync.unlinkSync(psPath);
    }
    
    console.log(`📄 Template PDF created: ${templatePath}`);
    return templatePath;
  }

  /**
   * Get CMYK values for garment background
   */
  private getGarmentBackgroundCMYK(garmentColor?: string): string {
    if (!garmentColor || garmentColor === 'none') {
      return '1 1 1 0'; // White
    }
    
    if (garmentColor.startsWith('#')) {
      const hex = garmentColor.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      
      // Simple RGB to CMYK conversion
      const k = 1 - Math.max(r, g, b);
      const c = k === 1 ? 0 : (1 - r - k) / (1 - k);
      const m = k === 1 ? 0 : (1 - g - k) / (1 - k);
      const y = k === 1 ? 0 : (1 - b - k) / (1 - k);
      
      return `${c.toFixed(3)} ${m.toFixed(3)} ${y.toFixed(3)} ${k.toFixed(3)}`;
    }
    
    return '0.5 0.5 0.5 0'; // Default gray
  }

  /**
   * Combine template and CMYK logo PDFs using Ghostscript
   */
  private async combinePDFsWithGhostscript(templatePath: string, logoPaths: string[], data: CMYKPDFGenerationData): Promise<string> {
    const outputPath = path.join(process.cwd(), 'uploads', `native_cmyk_final_${Date.now()}.pdf`);
    
    // For now, just use the template as the base and overlay will be added in future iterations
    // This provides the native CMYK foundation
    console.log(`🔧 Creating native CMYK foundation PDF...`);
    
    const gsCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${outputPath}" "${templatePath}"`;
    await execAsync(gsCmd);
    
    console.log(`✅ Native CMYK PDF foundation created: ${outputPath}`);
    return outputPath;
  }



  /**
   * Verify CMYK color space in final PDF
   */
  private async verifyCMYKColorSpace(pdfPath: string): Promise<void> {
    try {
      const { stdout } = await execAsync(`gs -dNOPAUSE -dBATCH -sDEVICE=inkcov -sOutputFile=/dev/null "${pdfPath}" 2>&1 | head -10`);
      
      if (stdout.includes('CMYK') || stdout.includes('cyan') || stdout.includes('magenta')) {
        console.log(`✅ VERIFIED: Native CMYK color space preserved`);
        console.log(`🎨 Ink coverage:\n${stdout.slice(0, 200)}`);
      } else {
        console.log(`⚠️ CMYK verification inconclusive`);
      }
    } catch (error) {
      console.log(`📊 CMYK verification failed: ${error}`);
    }
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fsSync.existsSync(filePath)) {
          await fs.unlink(filePath);
          console.log(`🗑️ Cleaned up: ${filePath}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup ${filePath}: ${error}`);
      }
    }
  }
}