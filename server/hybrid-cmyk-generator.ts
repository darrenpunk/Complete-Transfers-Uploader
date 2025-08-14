import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface HybridCMYKGenerationData {
  canvasElements: any[];
  logos: { [key: string]: any };
  templateSize: any;
  garmentColor: string;
  projectName: string;
  quantity: number;
}

/**
 * Hybrid CMYK Generator - Uses original working generator's template structure
 * but replaces pdf-lib logo embedding with Ghostscript CMYK preservation
 */
export class HybridCMYKGenerator {
  
  async generatePDF(data: HybridCMYKGenerationData): Promise<Buffer> {
    console.log('🎨 Starting Hybrid CMYK PDF Generation (Template + CMYK Logos)');
    
    try {
      // Step 1: Create individual CMYK logo PDFs
      const cmykLogoPaths: { logoId: string, path: string, element: any }[] = [];
      
      for (const element of data.canvasElements) {
        const logo = data.logos[element.logoId];
        if (logo) {
          const logoFile = path.join(process.cwd(), logo.url.replace('/uploads/', 'uploads/'));
          const cmykPdfPath = path.join(process.cwd(), 'uploads', `hybrid_cmyk_${Date.now()}_${logo.id}.pdf`);
          
          console.log(`🔧 Creating CMYK logo: ${logo.originalName}`);
          
          // Convert to CMYK PDF
          const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_hybrid_${Date.now()}.pdf`);
          await execAsync(`inkscape --export-type=pdf --export-pdf-version=1.5 --export-text-to-path --export-filename="${tempPdfPath}" "${logoFile}"`);
          await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${cmykPdfPath}" "${tempPdfPath}"`);
          
          // Cleanup temp
          if (fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
          }
          
          cmykLogoPaths.push({ logoId: logo.id, path: cmykPdfPath, element });
          console.log(`✅ CMYK logo ready: ${cmykPdfPath}`);
        }
      }
      
      // Step 2: Create template structure using Ghostscript
      const finalPdf = await this.createTemplateWithCMYKLogos(cmykLogoPaths, data);
      
      // Step 3: Read final PDF
      const pdfBuffer = fs.readFileSync(finalPdf);
      
      // Step 4: Cleanup
      fs.unlinkSync(finalPdf);
      cmykLogoPaths.forEach(item => {
        if (fs.existsSync(item.path)) {
          fs.unlinkSync(item.path);
        }
      });
      
      console.log(`✅ Hybrid CMYK PDF generated: ${pdfBuffer.length} bytes`);
      return pdfBuffer;
      
    } catch (error) {
      console.error('❌ Hybrid CMYK PDF generation failed:', error);
      throw error;
    }
  }
  
  private async createTemplateWithCMYKLogos(logoData: any[], data: HybridCMYKGenerationData): Promise<string> {
    const outputPath = path.join(process.cwd(), 'uploads', `hybrid_final_${Date.now()}.pdf`);
    
    // Create blank template pages first
    const blankTemplatePath = await this.createBlankTemplate(data);
    
    if (logoData.length === 0) {
      // No logos to embed, just return blank template
      fs.copyFileSync(blankTemplatePath, outputPath);
      fs.unlinkSync(blankTemplatePath);
      return outputPath;
    }
    
    // Combine template with CMYK logos using Ghostscript
    const logoCommands = logoData.map(item => {
      const element = item.element;
      
      // Convert canvas coordinates to PDF points
      const x = element.x * 2.834645669;
      const y = (data.templateSize.height - element.y - element.height) * 2.834645669;
      const width = element.width * 2.834645669;
      const height = element.height * 2.834645669;
      
      return `"${item.path}"`;
    }).join(' ');
    
    // Use Ghostscript to overlay logos on both pages
    const gsCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${outputPath}" "${blankTemplatePath}" ${logoCommands}`;
    
    console.log(`🔧 Combining template with CMYK logos...`);
    await execAsync(gsCmd);
    
    // Cleanup
    if (fs.existsSync(blankTemplatePath)) {
      fs.unlinkSync(blankTemplatePath);
    }
    
    console.log(`✅ Template with CMYK logos created: ${outputPath}`);
    return outputPath;
  }
  
  private async createBlankTemplate(data: HybridCMYKGenerationData): Promise<string> {
    const templatePath = path.join(process.cwd(), 'uploads', `template_${Date.now()}.pdf`);
    
    const pageWidth = data.templateSize.width * 2.834645669;  // mm to points
    const pageHeight = data.templateSize.height * 2.834645669;
    
    // Create PostScript for the template structure
    const psContent = `%!PS-Adobe-3.0
%%Pages: 2
%%BoundingBox: 0 0 ${pageWidth.toFixed(0)} ${pageHeight.toFixed(0)}
%%DocumentProcessColors: Cyan Magenta Yellow Black

%%Page: 1 1
% Page 1: Transparent background for logo
gsave
grestore
showpage

%%Page: 2 2  
% Page 2: Garment color background
gsave
% Fill page with garment color
${this.getGarmentColorCMYK(data.garmentColor)} setcmykcolor
newpath
0 0 moveto
${pageWidth} 0 lineto
${pageWidth} ${pageHeight} lineto
0 ${pageHeight} lineto
closepath
fill

% Add project info at bottom
/Helvetica findfont 12 scalefont setfont
0 0 0 1 setcmykcolor
20 20 moveto
(Project: ${data.projectName}) show
20 35 moveto
(Quantity: ${data.quantity}) show
20 50 moveto
(Template: ${data.templateSize.name}) show

grestore
showpage

%%EOF
`;

    const psPath = path.join(process.cwd(), 'uploads', `template_${Date.now()}.ps`);
    await fs.promises.writeFile(psPath, psContent);
    
    // Convert PostScript to PDF
    await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${templatePath}" "${psPath}"`);
    
    // Cleanup PostScript
    if (fs.existsSync(psPath)) {
      fs.unlinkSync(psPath);
    }
    
    console.log(`✅ Blank template created: ${templatePath}`);
    return templatePath;
  }
  
  private getGarmentColorCMYK(garmentColor: string): string {
    // Convert garment color to CMYK
    const colorMap: { [key: string]: string } = {
      '#000000': '0 0 0 1',     // Black
      '#FFFFFF': '0 0 0 0',     // White  
      '#FF0000': '0 1 1 0',     // Red
      '#00FF00': '1 0 1 0',     // Green
      '#0000FF': '1 1 0 0',     // Blue
      '#FFFF00': '0 0 1 0',     // Yellow
      '#FF00FF': '0 1 0 0',     // Magenta
      '#00FFFF': '1 0 0 0',     // Cyan
    };
    
    return colorMap[garmentColor] || '0.2 0.2 0.2 0.2'; // Default gray
  }
}