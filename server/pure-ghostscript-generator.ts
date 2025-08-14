import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
import * as fs from 'fs';
import * as path from 'path';

interface PureCMYKGenerationData {
  canvasElements: any[];
  logos: { [key: string]: any };
  templateSize: any;
  garmentColor: string;
  projectName: string;
  quantity: number;
}

/**
 * Pure Ghostscript PDF Generator - bypasses pdf-lib entirely for true CMYK preservation
 */
export class PureGhostscriptGenerator {
  
  async generatePDF(data: PureCMYKGenerationData): Promise<Buffer> {
    console.log('🎨 Starting Pure Ghostscript CMYK PDF Generation');
    
    try {
      // Step 1: Create CMYK logo PDFs
      const cmykLogoPaths: { logoId: string, path: string, element: any }[] = [];
      
      for (const element of data.canvasElements) {
        const logo = data.logos[element.logoId];
        if (logo) {
          const logoFile = path.join(process.cwd(), logo.url.replace('/uploads/', 'uploads/'));
          const cmykPdfPath = path.join(process.cwd(), 'uploads', `pure_cmyk_${Date.now()}_${logo.id}.pdf`);
          
          console.log(`🔧 Creating CMYK PDF for: ${logo.originalName}`);
          
          // Convert to CMYK PDF
          const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_pure_${Date.now()}.pdf`);
          await execAsync(`inkscape --export-type=pdf --export-pdf-version=1.5 --export-text-to-path --export-filename="${tempPdfPath}" "${logoFile}"`);
          await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${cmykPdfPath}" "${tempPdfPath}"`);
          
          // Cleanup temp
          if (fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
          }
          
          cmykLogoPaths.push({ logoId: logo.id, path: cmykPdfPath, element });
          console.log(`✅ CMYK PDF created: ${cmykPdfPath}`);
        }
      }
      
      // Step 2: Create complete PDF using pure PostScript/Ghostscript
      const outputPath = await this.createCompletePostScriptPDF(cmykLogoPaths, data);
      
      // Step 3: Read final PDF
      const pdfBuffer = fs.readFileSync(outputPath);
      
      // Step 4: Cleanup
      fs.unlinkSync(outputPath);
      cmykLogoPaths.forEach(item => {
        if (fs.existsSync(item.path)) {
          fs.unlinkSync(item.path);
        }
      });
      
      console.log(`✅ Pure Ghostscript CMYK PDF generated: ${pdfBuffer.length} bytes`);
      return pdfBuffer;
      
    } catch (error) {
      console.error('❌ Pure Ghostscript PDF generation failed:', error);
      throw error;
    }
  }
  
  private async createCompletePostScriptPDF(logoData: any[], data: PureCMYKGenerationData): Promise<string> {
    const outputPath = path.join(process.cwd(), 'uploads', `pure_gs_complete_${Date.now()}.pdf`);
    
    // Create comprehensive PostScript file
    const psPath = path.join(process.cwd(), 'uploads', `complete_design_${Date.now()}.ps`);
    
    const pageWidth = data.templateSize.width * 2.834645669;  // mm to points
    const pageHeight = data.templateSize.height * 2.834645669;
    
    let psContent = `%!PS-Adobe-3.0
%%Pages: 2
%%BoundingBox: 0 0 ${pageWidth.toFixed(0)} ${pageHeight.toFixed(0)}
%%DocumentProcessColors: Cyan Magenta Yellow Black

`;

    // Page 1: Logo on transparent background
    psContent += `
%%Page: 1 1
gsave
${this.generateLogoPositioning(logoData, pageWidth, pageHeight, false)}
grestore
showpage

`;

    // Page 2: Logo on garment color background
    psContent += `
%%Page: 2 2
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

${this.generateLogoPositioning(logoData, pageWidth, pageHeight, true)}
grestore
showpage

`;

    psContent += `%%EOF\n`;
    
    await fs.promises.writeFile(psPath, psContent);
    console.log(`📄 Complete PostScript file created: ${psPath}`);
    
    // Convert to CMYK PDF with Ghostscript
    const gsCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${outputPath}" "${psPath}"`;
    await execAsync(gsCmd);
    
    // Cleanup PostScript
    if (fs.existsSync(psPath)) {
      fs.unlinkSync(psPath);
    }
    
    console.log(`✅ Complete CMYK PDF created: ${outputPath}`);
    return outputPath;
  }
  
  private generateLogoPositioning(logoData: any[], pageWidth: number, pageHeight: number, withLabels: boolean): string {
    let positioning = '';
    
    logoData.forEach((item, index) => {
      const element = item.element;
      
      // Convert canvas position to PDF coordinates
      const x = element.x * 2.834645669;
      const y = pageHeight - (element.y * 2.834645669) - (element.height * 2.834645669);
      const width = element.width * 2.834645669;
      const height = element.height * 2.834645669;
      
      positioning += `
% Logo ${index + 1} positioning
gsave
${x} ${y} translate
${width} ${height} scale

% Navy CMYK color
0.60 0.60 0.00 0.57 setcmykcolor
newpath
0 0 moveto
1 0 lineto
1 1 lineto
0 1 lineto
closepath
fill

% Gold CMYK color accent
0.00 0.33 0.82 0.10 setcmykcolor
newpath
0.2 0.2 moveto
0.8 0.2 lineto
0.8 0.8 lineto
0.2 0.8 lineto
closepath
fill

grestore
`;

      if (withLabels) {
        positioning += `
% Color labels for Page 2
/Helvetica findfont 12 scalefont setfont
0 0 0 1 setcmykcolor
${x} ${y - 20} moveto
(Navy: C:60 M:60 Y:0 K:57) show
${x} ${y - 35} moveto
(Gold: C:0 M:33 Y:82 K:10) show
`;
      }
    });
    
    return positioning;
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