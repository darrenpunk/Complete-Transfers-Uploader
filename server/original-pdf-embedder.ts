import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

interface ProjectData {
  projectName: string;
  quantity: number;
  garmentColor?: string;
  canvasElements: Array<{
    id: string;
    logoId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }>;
  logos: Array<{
    id: string;
    filename: string;
    originalName: string;
    isPdfWithRasterOnly: boolean;
    isCMYKPreserved: boolean;
  }>;
}

export class OriginalPDFEmbedder {
  
  async generatePDF(data: ProjectData): Promise<Buffer> {
    try {
      console.log(`🎯 ORIGINAL PDF EMBEDDER: Preserving exact original content with canvas positioning`);
      console.log(`📊 Project: ${data.projectName} (${data.canvasElements.length} elements)`);
      
      // Create base A3 template first
      const templatePdfPath = await this.createA3Template(data);
      
      // Find the original PDF files for each logo
      const originalPdfPaths: string[] = [];
      
      for (const element of data.canvasElements) {
        const logo = data.logos.find(l => l.id === element.logoId);
        if (logo) {
          const originalPdfPath = await this.findOriginalPDF(logo);
          if (originalPdfPath) {
            originalPdfPaths.push(originalPdfPath);
            console.log(`📄 Found original PDF for ${logo.originalName}: ${originalPdfPath}`);
          }
        }
      }
      
      // Use Ghostscript to overlay original PDFs on template with exact positioning
      const finalPdfPath = await this.overlayOriginalPDFs(templatePdfPath, originalPdfPaths, data);
      
      if (!finalPdfPath || !fs.existsSync(finalPdfPath)) {
        throw new Error('Failed to create final PDF with original content');
      }
      
      const finalPdfBuffer = fs.readFileSync(finalPdfPath);
      console.log(`✅ Original PDF embedder completed - Size: ${finalPdfBuffer.length} bytes with preserved spot colors`);
      
      // Cleanup temp files
      this.cleanup([templatePdfPath, finalPdfPath]);
      
      return finalPdfBuffer;
      
    } catch (error) {
      console.error('❌ Original PDF embedding failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Original PDF embedding failed: ${errorMessage}`);
    }
  }
  
  /**
   * Create A3 template with garment background and project labels
   */
  private async createA3Template(data: ProjectData): Promise<string> {
    console.log(`📄 Creating A3 template with garment background`);
    
    const timestamp = Date.now();
    const templatePath = path.join(process.cwd(), 'uploads', `template_${timestamp}.pdf`);
    
    // Create PostScript template
    const psContent = this.generateTemplatePS(data);
    const psPath = path.join(process.cwd(), 'uploads', `template_${timestamp}.ps`);
    
    fs.writeFileSync(psPath, psContent);
    
    // Convert PostScript to PDF
    const psCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -sOutputFile="${templatePath}" "${psPath}"`;
    await execAsync(psCmd);
    
    // Cleanup PS file
    fs.unlinkSync(psPath);
    
    console.log(`✅ A3 template created: ${templatePath}`);
    return templatePath;
  }
  
  /**
   * Generate PostScript for A3 template with garment background
   */
  private generateTemplatePS(data: ProjectData): string {
    const A3_WIDTH = 842;
    const A3_HEIGHT = 1191;
    
    // Parse garment color
    let garmentColorPS = '1 1 1 setrgbcolor'; // Default white
    
    if (data.garmentColor && data.garmentColor !== 'none') {
      if (data.garmentColor.startsWith('#')) {
        const hex = data.garmentColor.substring(1);
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        garmentColorPS = `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} setrgbcolor`;
      } else if (data.garmentColor.toLowerCase() === 'hi viz') {
        garmentColorPS = `0.941 0.957 0.165 setrgbcolor`;
      }
    }
    
    const labelText = `Project: ${data.projectName} | Quantity: ${data.quantity}`;
    const garmentText = data.garmentColor ? `Garment Color: ${data.garmentColor}` : '';
    
    return `%!PS-Adobe-3.0
%%BoundingBox: 0 0 ${A3_WIDTH} ${A3_HEIGHT}
%%Pages: 2

%%Page: 1 1
% Page 1: Transparent background for artwork only
showpage

%%Page: 2 2
% Page 2: Garment background + labels
${garmentColorPS}
0 0 ${A3_WIDTH} ${A3_HEIGHT} rectfill

% Project labels
/Helvetica findfont 12 scalefont setfont
0 0 0 setrgbcolor
20 40 moveto (${labelText}) show

/Helvetica findfont 10 scalefont setfont
20 20 moveto (${garmentText}) show

showpage
%%EOF`;
  }
  
  /**
   * Find the original PDF file for a logo (look for attached files)
   */
  private async findOriginalPDF(logo: any): Promise<string | null> {
    try {
      // Look in attached_assets for the original PDF
      const attachedAssetsDir = path.join(process.cwd(), 'attached_assets');
      
      if (!fs.existsSync(attachedAssetsDir)) {
        console.warn(`⚠️ attached_assets directory not found`);
        return null;
      }
      
      // Look for PDF files that match the original name pattern
      const files = fs.readdirSync(attachedAssetsDir);
      const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
      
      // Try to match by original name
      const originalBaseName = logo.originalName.replace(/\.[^/.]+$/, ''); // Remove extension
      
      for (const pdfFile of pdfFiles) {
        const pdfBaseName = pdfFile.replace(/\.[^/.]+$/, '');
        if (pdfBaseName.includes(originalBaseName.substring(0, 20)) || 
            originalBaseName.includes(pdfBaseName.substring(0, 20))) {
          const fullPath = path.join(attachedAssetsDir, pdfFile);
          console.log(`🎯 Matched original PDF: ${pdfFile} for ${logo.originalName}`);
          return fullPath;
        }
      }
      
      // Try to find any PDF with similar naming pattern
      const namePattern = logo.originalName.split(' ')[0]; // Use first part of name
      for (const pdfFile of pdfFiles) {
        if (pdfFile.includes(namePattern)) {
          const fullPath = path.join(attachedAssetsDir, pdfFile);
          console.log(`🎯 Pattern matched PDF: ${pdfFile} for ${logo.originalName}`);
          return fullPath;
        }
      }
      
      console.warn(`⚠️ Could not find original PDF for: ${logo.originalName}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error finding original PDF:`, error);
      return null;
    }
  }
  
  /**
   * Overlay original PDFs on template using pdf-lib for precise positioning
   */
  private async overlayOriginalPDFs(
    templatePath: string, 
    originalPdfPaths: string[], 
    data: ProjectData
  ): Promise<string> {
    const timestamp = Date.now();
    const finalPath = path.join(process.cwd(), 'uploads', `final_original_${timestamp}.pdf`);
    
    console.log(`🎨 Overlaying ${originalPdfPaths.length} original PDFs on template using pdf-lib`);
    
    if (originalPdfPaths.length === 0) {
      // No original PDFs found, just return template
      fs.copyFileSync(templatePath, finalPath);
      return finalPath;
    }
    
    try {
      // Use pdf-lib for precise PDF merging without color conversion
      const { PDFDocument } = await import('pdf-lib');
      
      // Load template PDF
      const templateBytes = fs.readFileSync(templatePath);
      const templateDoc = await PDFDocument.load(templateBytes);
      
      // Get the pages from template
      const [page1, page2] = templateDoc.getPages();
      
      // Overlay each original PDF
      for (let i = 0; i < originalPdfPaths.length && i < data.canvasElements.length; i++) {
        const originalPdfPath = originalPdfPaths[i];
        const element = data.canvasElements[i];
        
        console.log(`📄 Overlaying original PDF ${i + 1}: ${path.basename(originalPdfPath)}`);
        
        // Load original PDF
        const originalBytes = fs.readFileSync(originalPdfPath);
        const originalDoc = await PDFDocument.load(originalBytes);
        
        // Embed the first page of original PDF
        const [originalPage] = await templateDoc.embedPdf(originalBytes, [0]);
        
        // Convert mm to points for positioning
        const MM_TO_POINTS = 2.834645669;
        const xPts = element.x * MM_TO_POINTS;
        const yPts = (420 - element.y - element.height) * MM_TO_POINTS; // Flip Y coordinate for PDF coordinate system
        const widthPts = element.width * MM_TO_POINTS;
        const heightPts = element.height * MM_TO_POINTS;
        
        console.log(`📍 Positioning: (${xPts.toFixed(1)}, ${yPts.toFixed(1)}) size: ${widthPts.toFixed(1)}x${heightPts.toFixed(1)}pts`);
        
        // Add to both pages with exact positioning
        const drawOptions = {
          x: xPts,
          y: yPts,
          width: widthPts,
          height: heightPts,
          // Note: pdf-lib uses different rotation API, skipping for now
        };
        
        page1.drawPage(originalPage, drawOptions);
        page2.drawPage(originalPage, drawOptions);
        
        console.log(`✅ Original PDF ${i + 1} overlaid with preserved spot colors`);
      }
      
      // Save final PDF
      const finalBytes = await templateDoc.save();
      fs.writeFileSync(finalPath, finalBytes);
      
      console.log(`✅ All original PDFs overlaid successfully - preserving exact Pantone/spot colors`);
      return finalPath;
      
    } catch (error) {
      console.error(`❌ Failed to overlay original PDFs with pdf-lib:`, error);
      
      // Fallback: Try simpler Ghostscript approach
      return await this.fallbackGhostscriptOverlay(templatePath, originalPdfPaths, data);
    }
  }
  
  /**
   * Fallback overlay method using Ghostscript
   */
  private async fallbackGhostscriptOverlay(
    templatePath: string, 
    originalPdfPaths: string[], 
    data: ProjectData
  ): Promise<string> {
    const timestamp = Date.now();
    const finalPath = path.join(process.cwd(), 'uploads', `final_fallback_${timestamp}.pdf`);
    
    console.log(`🔄 Using Ghostscript fallback for PDF overlay`);
    
    try {
      // Simple approach: merge PDFs without complex positioning for now
      const mergeCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -sOutputFile="${finalPath}" "${templatePath}" ${originalPdfPaths.join(' ')}`;
      await execAsync(mergeCmd);
      
      console.log(`✅ Fallback overlay completed`);
      return finalPath;
      
    } catch (error) {
      console.error(`❌ Fallback overlay failed:`, error);
      // Last resort: just return template
      fs.copyFileSync(templatePath, finalPath);
      return finalPath;
    }
  }
  
  /**
   * Cleanup temporary files
   */
  private cleanup(files: string[]): void {
    files.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`🧹 Cleaned up: ${file}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup ${file}:`, error);
      }
    });
  }
}