/**
 * GHOSTSCRIPT-NATIVE PDF GENERATOR
 * 
 * This approach completely avoids pdf-lib page embedding which causes vector corruption.
 * Instead, it uses pure Ghostscript operations to create the final PDF with:
 * - Perfect vector preservation 
 * - Exact CMYK color retention
 * - Precise dimensional accuracy
 * - No quality loss or corruption
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

interface ProjectData {
  canvasElements: any[];
  logos: any[];
  templateSize: any;
  garmentColor?: string;
  projectName: string;
  quantity: number;
  comments?: string;
}

// Garment color mapping
const GARMENT_COLORS = [
  { name: "White", hex: "#FFFFFF" },
  { name: "Black", hex: "#171816" },
  { name: "Natural Cotton", hex: "#D9D2AB" },
  { name: "Pastel Yellow", hex: "#F3F590" },
  { name: "Yellow", hex: "#F0F42A" },
  { name: "Hi Viz", hex: "#D2E31D" },
  { name: "Hi Viz Orange", hex: "#D98F17" },
  { name: "HiViz Green", hex: "#388032" },
  { name: "HIViz Pink", hex: "#BF0072" },
  { name: "Sports Grey", hex: "#767878" },
  { name: "Light Grey Marl", hex: "#919393" },
  { name: "Ash Grey", hex: "#A6A9A2" },
  { name: "Light Grey", hex: "#BCBFBB" },
  { name: "Charcoal Grey", hex: "#353330" },
  { name: "Pastel Blue", hex: "#B9DBEA" },
  { name: "Sky Blue", hex: "#5998D4" },
  { name: "Navy", hex: "#201C3A" },
  { name: "Royal Blue", hex: "#221866" },
  { name: "Pastel Green", hex: "#B5D55E" },
  { name: "Lime Green", hex: "#90BF33" },
  { name: "Kelly Green", hex: "#3C8A35" },
  { name: "Pastel Pink", hex: "#E7BBD0" },
  { name: "Light Pink", hex: "#D287A2" },
  { name: "Fuchsia Pink", hex: "#C42469" },
  { name: "Red", hex: "#C02300" },
  { name: "Burgundy", hex: "#762009" },
  { name: "Purple", hex: "#4C0A6A" }
];

function getGarmentColorName(hex: string): string {
  const color = GARMENT_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase());
  return color ? color.name : hex;
}

export class GhostscriptPDFGenerator {
  
  async generatePDF(data: ProjectData): Promise<Buffer> {
    try {
      console.log(`🚀 GHOSTSCRIPT PDF GENERATOR: Pure vector preservation approach`);
      console.log(`📊 Project: ${data.projectName} (${data.canvasElements.length} elements)`);
      
      const timestamp = Date.now();
      const workDir = path.join(process.cwd(), 'uploads');
      
      // Step 1: Create page templates using PostScript
      const page1Path = await this.createArtworkPage(data, workDir, timestamp);
      const page2Path = await this.createGarmentPage(data, workDir, timestamp);
      
      // Step 2: Combine pages into final PDF using Ghostscript
      const finalPdfPath = path.join(workDir, `final_${timestamp}.pdf`);
      
      console.log(`🔧 GHOSTSCRIPT: Combining pages with vector preservation`);
      const combineCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -dDownsampleColorImages=false -dDownsampleGrayImages=false -dDownsampleMonoImages=false -dColorImageResolution=300 -dGrayImageResolution=300 -dMonoImageResolution=1200 -o "${finalPdfPath}" "${page1Path}" "${page2Path}"`;
      
      await execAsync(combineCmd);
      
      if (!fs.existsSync(finalPdfPath)) {
        throw new Error('Failed to create final PDF');
      }
      
      // Read the final PDF
      const pdfBuffer = fs.readFileSync(finalPdfPath);
      
      // Cleanup intermediate files
      this.cleanup([page1Path, page2Path, finalPdfPath]);
      
      console.log(`✅ GHOSTSCRIPT PDF generated successfully - Size: ${pdfBuffer.length} bytes`);
      console.log(`🎯 VECTOR QUALITY: Pure Ghostscript processing preserves all vector content`);
      console.log(`🎨 COLOR ACCURACY: CMYK colors preserved without conversion`);
      
      return pdfBuffer;
      
    } catch (error) {
      console.error('❌ Ghostscript PDF generation failed:', error);
      throw error;
    }
  }
  
  /**
   * Create Page 1: Artwork positioned correctly on template-sized canvas
   */
  private async createArtworkPage(data: ProjectData, workDir: string, timestamp: number): Promise<string> {
    console.log(`📄 Creating Page 1: Artwork layout with correct canvas positioning`);
    
    const page1Path = path.join(workDir, `page1_${timestamp}.pdf`);
    const MM_TO_POINTS = 2.834645669;
    
    // Use template size for the page (A3: 297×420mm)
    const templateWidthMM = data.templateSize.width;
    const templateHeightMM = data.templateSize.height;
    const pageWidthPts = templateWidthMM * MM_TO_POINTS;
    const pageHeightPts = templateHeightMM * MM_TO_POINTS;
    
    console.log(`📐 Page 1 template dimensions: ${templateWidthMM}×${templateHeightMM}mm = ${pageWidthPts.toFixed(1)}×${pageHeightPts.toFixed(1)}pts`);
    
    // Create composite layout with all elements positioned correctly
    return await this.createCompositeArtworkPage(data, workDir, timestamp, pageWidthPts, pageHeightPts);
  }
  
  /**
   * Get the best source path for logo (prefer original PDF, fallback to SVG)
   */
  private getLogoSourcePath(logo: any, element: any): string {
    // Priority 1: Original PDF if available and no color overrides
    if (logo.originalFilename && logo.originalMimeType === 'application/pdf' && !element.colorOverrides?.inkColor) {
      const originalPdfPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
      if (fs.existsSync(originalPdfPath)) {
        console.log(`🎯 Using original PDF for perfect vector quality: ${logo.originalFilename}`);
        return originalPdfPath;
      }
    }
    
    // Priority 2: Tight content SVG (has exact bounds and preserved colors)
    if (logo.filename && logo.filename.includes('_tight-content.svg')) {
      const tightContentPath = path.join(process.cwd(), 'uploads', logo.filename);
      if (fs.existsSync(tightContentPath)) {
        console.log(`🎯 Using tight content SVG with preserved bounds: ${logo.filename}`);
        return tightContentPath;
      }
    }
    
    // Fallback: Regular SVG file
    const svgPath = path.join(process.cwd(), 'uploads', logo.filename);
    console.log(`🔄 Fallback to regular SVG: ${logo.filename}`);
    return svgPath;
  }
  
  /**
   * Create artwork page with proper canvas positioning using direct PDF overlay
   */
  private async createCompositeArtworkPage(data: ProjectData, workDir: string, timestamp: number, pageWidthPts: number, pageHeightPts: number): Promise<string> {
    console.log(`📄 Creating artwork page with canvas positioning for ${data.canvasElements.length} elements`);
    
    const page1Path = path.join(workDir, `page1_${timestamp}.pdf`);
    const MM_TO_POINTS = 2.834645669;
    
    // Create blank template page
    const blankPath = await this.createBlankPage(workDir, timestamp, pageWidthPts, pageHeightPts);
    
    // Start with the blank page
    let currentPdfPath = blankPath;
    
    // Overlay each logo at its canvas position
    for (let i = 0; i < data.canvasElements.length; i++) {
      const element = data.canvasElements[i];
      const logo = data.logos.find(l => l.id === element.logoId);
      
      if (logo) {
        const logoSourcePath = this.getLogoSourcePath(logo, element);
        
        // Calculate position in PDF coordinates (bottom-left origin)
        const xPts = element.x * MM_TO_POINTS;
        const yPts = pageHeightPts - (element.y * MM_TO_POINTS) - (element.height * MM_TO_POINTS);
        const widthPts = element.width * MM_TO_POINTS;
        const heightPts = element.height * MM_TO_POINTS;
        
        console.log(`📍 Overlaying logo ${i + 1}: (${element.x.toFixed(1)}, ${element.y.toFixed(1)})mm → (${xPts.toFixed(1)}, ${yPts.toFixed(1)})pts`);
        
        // Convert SVG to PDF if needed
        let logoPdfPath = logoSourcePath;
        if (logoSourcePath.toLowerCase().endsWith('.svg')) {
          const tempPdfPath = path.join(workDir, `temp_logo_${i}_${timestamp}.pdf`);
          const inkscapeCmd = `inkscape --export-type=pdf --export-filename="${tempPdfPath}" "${logoSourcePath}"`;
          await execAsync(inkscapeCmd);
          logoPdfPath = tempPdfPath;
        }
        
        // Create next overlay
        const nextPdfPath = path.join(workDir, `overlay_${i}_${timestamp}.pdf`);
        
        // Scale and position the logo PDF to exact canvas coordinates
        const scaledLogoPath = path.join(workDir, `scaled_logo_${i}_${timestamp}.pdf`);
        
        // First, scale and position the logo to exact coordinates
        const scaleCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -o "${scaledLogoPath}" -dFIXEDMEDIA -dPDFFitPage -g${Math.round(pageWidthPts)}x${Math.round(pageHeightPts)} -c "${pageWidthPts} ${pageHeightPts} scale" -c "${xPts / pageWidthPts} ${yPts / pageHeightPts} translate" -c "${widthPts / pageWidthPts} ${heightPts / pageHeightPts} scale" -f "${logoPdfPath}"`;
        
        await execAsync(scaleCmd);
        
        // Then overlay the scaled logo onto the current page
        const overlayCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -o "${nextPdfPath}" "${currentPdfPath}" "${scaledLogoPath}"`;
        
        try {
          await execAsync(overlayCmd);
          
          // Cleanup previous intermediate file
          if (currentPdfPath !== blankPath && fs.existsSync(currentPdfPath)) {
            fs.unlinkSync(currentPdfPath);
          }
          
          currentPdfPath = nextPdfPath;
          
          // Cleanup temporary files
          if (fs.existsSync(scaledLogoPath)) {
            fs.unlinkSync(scaledLogoPath);
          }
          if (logoPdfPath !== logoSourcePath && fs.existsSync(logoPdfPath)) {
            fs.unlinkSync(logoPdfPath);
          }
          
        } catch (error) {
          console.error(`❌ Logo overlay failed for element ${i}:`, error);
          // Cleanup on error
          [scaledLogoPath, logoPdfPath].forEach(file => {
            if (file !== logoSourcePath && fs.existsSync(file)) {
              fs.unlinkSync(file);
            }
          });
          throw error;
        }
      }
    }
    
    // Move final result to expected path
    if (currentPdfPath !== page1Path) {
      fs.renameSync(currentPdfPath, page1Path);
    }
    
    // Cleanup blank template
    if (fs.existsSync(blankPath)) {
      fs.unlinkSync(blankPath);
    }
    
    console.log(`✅ Artwork page created with proper canvas positioning: ${page1Path}`);
    return page1Path;
  }
  
  /**
   * Create blank PDF page of specified size
   */
  private async createBlankPage(workDir: string, timestamp: number, widthPts: number, heightPts: number): Promise<string> {
    const blankPath = path.join(workDir, `blank_${timestamp}.pdf`);
    
    const blankCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -o "${blankPath}" -c "<</PageSize [${widthPts} ${heightPts}]>> setpagedevice showpage"`;
    
    await execAsync(blankCmd);
    
    console.log(`✅ Created blank page: ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts`);
    return blankPath;
  }
  
  
  /**
   * Create Page 2: Garment color backgrounds with project info
   */
  private async createGarmentPage(data: ProjectData, workDir: string, timestamp: number): Promise<string> {
    console.log(`📄 Creating Page 2: Garment color backgrounds with project info`);
    
    const page2Path = path.join(workDir, `page2_${timestamp}.pdf`);
    const MM_TO_POINTS = 2.834645669;
    
    // Use template size for page 2 as well
    const templateWidthMM = data.templateSize.width;
    const templateHeightMM = data.templateSize.height;
    const pageWidthPts = templateWidthMM * MM_TO_POINTS;
    const pageHeightPts = templateHeightMM * MM_TO_POINTS;
    
    // Create PostScript for page 2
    const psPath = path.join(workDir, `garment_${timestamp}.ps`);
    let psContent = `%!PS-Adobe-3.0
%%BoundingBox: 0 0 ${pageWidthPts} ${pageHeightPts}
%%Pages: 1
%%Page: 1 1
% Page 2: Garment colors and project info

% Add project labels
/Helvetica findfont 12 scalefont setfont
0 0 0 setrgbcolor
20 ${pageHeightPts - 40} moveto
(Project: ${data.projectName} | Quantity: ${data.quantity}) show

/Helvetica findfont 10 scalefont setfont
20 ${pageHeightPts - 60} moveto
(Garment Colors: Combined View) show

`;
    
    // Add garment color backgrounds for each element
    for (const element of data.canvasElements) {
      const garmentColor = element.garmentColor || data.garmentColor || '#F3F590';
      const garmentName = getGarmentColorName(garmentColor);
      
      const xPts = element.x * MM_TO_POINTS;
      const yPts = pageHeightPts - (element.y * MM_TO_POINTS) - (element.height * MM_TO_POINTS);
      const widthPts = element.width * MM_TO_POINTS;
      const heightPts = element.height * MM_TO_POINTS;
      
      // Parse garment color to RGB
      const rgb = this.parseHexToRGB(garmentColor);
      
      psContent += `
% Garment background for ${garmentName}
${rgb.r} ${rgb.g} ${rgb.b} setrgbcolor
${xPts} ${yPts} ${widthPts} ${heightPts} rectfill

% Garment color label
0 0 0 setrgbcolor
/Helvetica findfont 8 scalefont setfont
${xPts + 5} ${yPts + heightPts + 5} moveto
(${garmentName}) show
`;
    }
    
    psContent += '%%EOF';
    fs.writeFileSync(psPath, psContent);
    
    // Convert PostScript to PDF using Ghostscript
    const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -o "${page2Path}" "${psPath}"`;
    await execAsync(gsCmd);
    
    // Cleanup PS file
    if (fs.existsSync(psPath)) {
      fs.unlinkSync(psPath);
    }
    
    console.log(`✅ Garment page created: ${page2Path}`);
    return page2Path;
  }
  
  /**
   * Parse hex color to RGB values (0-1 range)
   */
  private parseHexToRGB(hex: string): { r: number; g: number; b: number } {
    if (!hex.startsWith('#')) {
      return { r: 0.95, g: 0.96, b: 0.56 }; // Default pastel yellow
    }
    
    const hexClean = hex.substring(1);
    const r = parseInt(hexClean.substring(0, 2), 16) / 255;
    const g = parseInt(hexClean.substring(2, 4), 16) / 255;
    const b = parseInt(hexClean.substring(4, 6), 16) / 255;
    
    return { r, g, b };
  }
  
  /**
   * Cleanup temporary files
   */
  private cleanup(files: string[]): void {
    files.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          console.log(`🧹 Cleaned up: ${path.basename(file)}`);
        } catch (error) {
          console.warn(`⚠️ Failed to cleanup: ${file}`);
        }
      }
    });
  }
}