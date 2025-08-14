import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface GhostscriptOverlayData {
  canvasElements: any[];
  logos: { [key: string]: any };
  templateSize: any;
  garmentColor: string;
  projectName: string;
  quantity: number;
}

/**
 * Ghostscript Overlay Generator - Creates template then overlays CMYK logos using Ghostscript positioning
 */
export class GhostscriptOverlayGenerator {
  
  async generatePDF(data: GhostscriptOverlayData): Promise<Buffer> {
    console.log('🎨 Starting Ghostscript Overlay CMYK PDF Generation');
    
    try {
      // Step 1: Create individual CMYK logo PDFs with exact positioning info
      const logoOverlays: { path: string, x: number, y: number, width: number, height: number }[] = [];
      
      for (const element of data.canvasElements) {
        const logo = data.logos[element.logoId];
        if (logo) {
          const logoFile = path.join(process.cwd(), logo.url.replace('/uploads/', 'uploads/'));
          const cmykPdfPath = path.join(process.cwd(), 'uploads', `overlay_cmyk_${Date.now()}_${logo.id}.pdf`);
          
          console.log(`🔧 Creating positioned CMYK logo: ${logo.originalName}`);
          
          // Convert to CMYK PDF 
          const tempPdfPath = path.join(process.cwd(), 'uploads', `temp_overlay_${Date.now()}.pdf`);
          await execAsync(`inkscape --export-type=pdf --export-pdf-version=1.5 --export-text-to-path --export-filename="${tempPdfPath}" "${logoFile}"`);
          await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${cmykPdfPath}" "${tempPdfPath}"`);
          
          // Cleanup temp
          if (fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
          }
          
          // Convert canvas coordinates to PDF points
          const x = element.x * 2.834645669;
          const y = (data.templateSize.height - element.y - element.height) * 2.834645669;
          const width = element.width * 2.834645669;
          const height = element.height * 2.834645669;
          
          logoOverlays.push({ path: cmykPdfPath, x, y, width, height });
          console.log(`✅ CMYK logo ready for overlay: ${cmykPdfPath} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        }
      }
      
      // Step 2: Create blank template using simple Ghostscript commands
      const templatePath = await this.createSimpleTemplate(data);
      
      // Step 3: Overlay each logo using Ghostscript with positioning
      const finalPdf = await this.overlayLogosOnTemplate(templatePath, logoOverlays, data);
      
      // Step 4: Read final PDF
      const pdfBuffer = fs.readFileSync(finalPdf);
      
      // Step 5: Cleanup
      fs.unlinkSync(templatePath);
      fs.unlinkSync(finalPdf);
      logoOverlays.forEach(overlay => {
        if (fs.existsSync(overlay.path)) {
          fs.unlinkSync(overlay.path);
        }
      });
      
      console.log(`✅ Ghostscript Overlay CMYK PDF generated: ${pdfBuffer.length} bytes`);
      return pdfBuffer;
      
    } catch (error) {
      console.error('❌ Ghostscript Overlay PDF generation failed:', error);
      throw error;
    }
  }
  
  private async createSimpleTemplate(data: GhostscriptOverlayData): Promise<string> {
    const templatePath = path.join(process.cwd(), 'uploads', `simple_template_${Date.now()}.pdf`);
    
    const pageWidth = data.templateSize.width * 2.834645669;  // mm to points
    const pageHeight = data.templateSize.height * 2.834645669;
    
    // Create simple PostScript template
    const psContent = `%!PS-Adobe-3.0
%%Pages: 2
%%BoundingBox: 0 0 ${pageWidth.toFixed(0)} ${pageHeight.toFixed(0)}
%%DocumentProcessColors: Cyan Magenta Yellow Black

%%Page: 1 1
% Page 1: Empty page for logo overlay
showpage

%%Page: 2 2  
% Page 2: Garment color background
gsave
${this.getGarmentColorCMYK(data.garmentColor)} setcmykcolor
newpath
0 0 moveto
${pageWidth} 0 lineto
${pageWidth} ${pageHeight} lineto
0 ${pageHeight} lineto
closepath
fill

% Project info at bottom
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

    const psPath = path.join(process.cwd(), 'uploads', `simple_template_${Date.now()}.ps`);
    await fs.promises.writeFile(psPath, psContent);
    
    // Convert to PDF
    await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${templatePath}" "${psPath}"`);
    
    // Cleanup PostScript
    if (fs.existsSync(psPath)) {
      fs.unlinkSync(psPath);
    }
    
    console.log(`✅ Simple template created: ${templatePath}`);
    return templatePath;
  }
  
  private async overlayLogosOnTemplate(templatePath: string, logoOverlays: any[], data: GhostscriptOverlayData): Promise<string> {
    const outputPath = path.join(process.cwd(), 'uploads', `final_overlay_${Date.now()}.pdf`);
    
    if (logoOverlays.length === 0) {
      // No logos to overlay, just copy template
      fs.copyFileSync(templatePath, outputPath);
      return outputPath;
    }
    
    // Create Ghostscript command to overlay logos on both pages of template
    // Use Ghostscript's ability to position and scale PDFs during merge
    let currentPdf = templatePath;
    
    for (let i = 0; i < logoOverlays.length; i++) {
      const overlay = logoOverlays[i];
      const nextPdf = path.join(process.cwd(), 'uploads', `step_${i}_${Date.now()}.pdf`);
      
      // Create PostScript to position this logo on both pages
      const overlayPsPath = path.join(process.cwd(), 'uploads', `overlay_${i}_${Date.now()}.ps`);
      const overlayPs = `%!PS-Adobe-3.0
%%Pages: 2

%%Page: 1 1
% Include template page 1
(${currentPdf}) run
% Add positioned logo
gsave
${overlay.x} ${overlay.y} translate
${overlay.width} ${overlay.height} scale
(${overlay.path}) run
grestore
showpage

%%Page: 2 2
% Include template page 2 
(${currentPdf}) run  
% Add positioned logo
gsave
${overlay.x} ${overlay.y} translate
${overlay.width} ${overlay.height} scale
(${overlay.path}) run
grestore
showpage

%%EOF
`;
      
      await fs.promises.writeFile(overlayPsPath, overlayPs);
      
      // Convert to PDF
      await execAsync(`gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/LeaveColorUnchanged -dPDFSETTINGS=/prepress -sOutputFile="${nextPdf}" "${overlayPsPath}"`);
      
      // Cleanup
      if (fs.existsSync(overlayPsPath)) {
        fs.unlinkSync(overlayPsPath);
      }
      
      // For next iteration, use the output as input (unless it's the original template)
      if (currentPdf !== templatePath) {
        fs.unlinkSync(currentPdf);
      }
      currentPdf = nextPdf;
    }
    
    // Move final result to output path
    fs.copyFileSync(currentPdf, outputPath);
    if (currentPdf !== templatePath) {
      fs.unlinkSync(currentPdf);
    }
    
    console.log(`✅ Logos overlaid on template: ${outputPath}`);
    return outputPath;
  }
  
  private getGarmentColorCMYK(garmentColor: string): string {
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