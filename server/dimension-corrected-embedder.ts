/**
 * Dimension-Corrected PDF Embedder
 * 
 * This approach pre-processes the original PDF to fix its internal coordinate system
 * and dimensions BEFORE embedding with pdf-lib. This preserves:
 * - Vector quality
 * - CMYK colors  
 * - Original color accuracy
 * While achieving exact target dimensions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DimensionCorrectedEmbedder {
  
  /**
   * Pre-process PDF to correct dimensions, then use standard embedding
   */
  static async createWithCorrectedDimensions(
    logoPath: string,
    targetWidthMM: number = 270.28,
    targetHeightMM: number = 201.96
  ): Promise<Buffer> {
    
    const MM_TO_POINTS = 2.834645669;
    const targetWidthPts = targetWidthMM * MM_TO_POINTS;
    const targetHeightPts = targetHeightMM * MM_TO_POINTS;
    
    console.log(`🔄 DIMENSION CORRECTED: Processing ${logoPath}`);
    console.log(`📐 DIMENSION CORRECTED: Target=${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts`);
    
    try {
      // Step 1: Create a corrected PDF with exact target dimensions
      const correctedPath = path.join(process.cwd(), 'uploads', `corrected_${Date.now()}.pdf`);
      
      // Use Ghostscript to create a new PDF with exact target dimensions
      // This preserves vector content and CMYK colors while fixing coordinate system
      const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -o "${correctedPath}" -c "<</PageSize [${targetWidthPts} ${targetHeightPts}]>> setpagedevice" -c "0 0 ${targetWidthPts} ${targetHeightPts} rectclip" -f "${logoPath}"`;
      
      console.log(`🔧 DIMENSION CORRECTED: Creating corrected PDF with exact dimensions`);
      await execAsync(gsCmd);
      
      // Step 2: Now use the existing Robust PDF Generator with the corrected PDF
      // This will preserve CMYK colors, vector quality, AND include garment info
      const { RobustPDFGenerator } = await import('./robust-pdf-generator');
      
      // Create a temporary logo object for the corrected PDF
      const tempLogo = {
        filename: path.basename(correctedPath),
        originalFilename: path.basename(logoPath),
        bounds: {
          width: targetWidthMM,
          height: targetHeightMM
        }
      };
      
      const tempElement = {
        id: 'temp-corrected',
        logoId: 'temp-corrected', 
        x: 148.5 - (targetWidthMM / 2), // Center on A3 width (297/2)
        y: 210 - (targetHeightMM / 2), // Center on A3 height (420/2)
        width: targetWidthMM,
        height: targetHeightMM,
        rotation: 0
      };
      
      const tempProject = {
        name: 'Dimension Corrected',
        templateSize: 'template-A3',
        garmentColor: '#FFFFFF', // Default white
        comments: ''
      };
      
      console.log(`🔧 DIMENSION CORRECTED: Using corrected PDF with Robust Generator`);
      
      // Generate final PDF using robust generator (preserves everything)
      const generator = new RobustPDFGenerator();
      const projectData = {
        canvasElements: [tempElement],
        logos: [tempLogo],
        templateSize: { width: 297, height: 420 }, // A3 in mm
        garmentColor: '#F3F590',
        projectName: tempProject.name,
        quantity: 1,
        comments: tempProject.comments || ''
      };
      
      const pdfBuffer = await generator.generatePDF(projectData);
      
      // Cleanup
      if (fs.existsSync(correctedPath)) {
        fs.unlinkSync(correctedPath);
      }
      
      console.log(`✅ DIMENSION CORRECTED: PDF generated successfully with exact dimensions AND preserved colors/vectors`);
      
      return pdfBuffer;
      
    } catch (error) {
      console.error(`❌ DIMENSION CORRECTED: Failed`, error);
      throw error;
    }
  }
}