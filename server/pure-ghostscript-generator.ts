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
    
    if (logoData.length === 0) {
      throw new Error('No CMYK logos to embed');
    }
    
    // For now, just return the first logo's CMYK PDF directly
    // This preserves exact CMYK colors without any conversion
    const firstLogo = logoData[0];
    
    console.log(`📄 Using direct CMYK logo: ${firstLogo.path}`);
    
    // Copy the CMYK PDF to output location
    const logoBuffer = fs.readFileSync(firstLogo.path);
    fs.writeFileSync(outputPath, logoBuffer);
    
    console.log(`✅ Direct CMYK PDF preserved: ${outputPath} (${logoBuffer.length} bytes)`);
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
% Embed actual CMYK PDF logo ${index + 1}
gsave
${x} ${y} translate
${width} ${height} scale
% Include the actual CMYK PDF content
(${item.path}) run
grestore
`;

      if (withLabels) {
        positioning += `
% Color labels for Page 2
/Helvetica findfont 12 scalefont setfont
0 0 0 1 setcmykcolor
${x} ${y - 20} moveto
(CMYK Logo: ${index + 1}) show
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