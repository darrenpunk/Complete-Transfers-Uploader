import { PDFDocument, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CMYKPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class CMYKVectorGenerator {
  /**
   * Generate PDF with TRUE vector and CMYK preservation using Ghostscript
   * This method creates a PostScript file and converts it to PDF to maintain vectors
   */
  async generatePDF(data: CMYKPDFData): Promise<Buffer> {
    console.log('🚀 CMYK VECTOR PDF GENERATION - Direct Vector Embedding');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);
    
    try {
      // Calculate template dimensions in points
      const templateWidthPoints = data.templateSize.width * 2.834;
      const templateHeightPoints = data.templateSize.height * 2.834;
      
      // Create PostScript file with exact positioning
      const psContent = await this.createPostScriptDocument(
        data.canvasElements,
        data.logos,
        data.templateSize,
        templateWidthPoints,
        templateHeightPoints,
        data.garmentColor
      );
      
      // Save PostScript file
      const psPath = path.join(process.cwd(), 'uploads', `vector_${data.projectId}_${Date.now()}.ps`);
      fs.writeFileSync(psPath, psContent);
      
      // Convert PostScript to PDF using Ghostscript with CMYK preservation
      const outputPdfPath = path.join(process.cwd(), 'uploads', `cmyk_vector_${data.projectId}_${Date.now()}.pdf`);
      
      console.log('🎨 Converting PostScript to PDF with CMYK preservation...');
      
      // Use Ghostscript with specific CMYK settings
      const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite \
        -dPDFSETTINGS=/prepress \
        -dColorConversionStrategy=/LeaveColorUnchanged \
        -dAutoFilterColorImages=false \
        -dAutoFilterGrayImages=false \
        -dDownsampleColorImages=false \
        -dDownsampleGrayImages=false \
        -dDownsampleMonoImages=false \
        -dCompressPages=false \
        -dPreserveFlatness=true \
        -dPreserveHalftoneInfo=true \
        -dPreserveOPIComments=true \
        -dPreserveOverprintSettings=true \
        -dPreserveSeparation=true \
        -dPreserveDeviceN=true \
        -dPreserveSMask=true \
        -dPreserveTransparency=true \
        -sOutputFile="${outputPdfPath}" \
        "${psPath}"`;
      
      await execAsync(gsCmd);
      
      console.log('✅ CMYK Vector PDF created successfully');
      
      // Read the generated PDF
      const pdfBytes = fs.readFileSync(outputPdfPath);
      
      // Clean up temp files
      try {
        fs.unlinkSync(psPath);
        fs.unlinkSync(outputPdfPath);
      } catch {
        // Ignore cleanup errors
      }
      
      console.log(`✅ CMYK Vector PDF generated - Size: ${pdfBytes.length} bytes`);
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ CMYK Vector PDF generation failed:', error);
      throw new Error(`CMYK Vector PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Create PostScript document with exact positioning
   */
  private async createPostScriptDocument(
    canvasElements: any[],
    logos: any[],
    templateSize: any,
    widthPoints: number,
    heightPoints: number,
    garmentColor?: string
  ): Promise<string> {
    console.log('📐 Creating PostScript document...');
    
    let ps = `%!PS-Adobe-3.0
%%BoundingBox: 0 0 ${Math.ceil(widthPoints)} ${Math.ceil(heightPoints * 2)}
%%Pages: 2
%%EndComments

% Define CMYK color space
/setcmykcolor { setcmykcolor } bind def

%%Page: 1 1
gsave
`;
    
    // Page 1: Artwork on transparent background
    ps += `\n% Page 1: Artwork only\n`;
    ps += await this.addArtworkToPostScript(canvasElements, logos, templateSize, widthPoints, heightPoints);
    
    ps += `\ngrestore\nshowpage\n\n`;
    
    // Page 2: Artwork on garment background
    ps += `%%Page: 2 2\ngsave\n`;
    
    // Add garment background
    if (garmentColor && garmentColor !== 'none') {
      const colorInfo = this.getGarmentColorInfo(garmentColor);
      if (colorInfo) {
        const { c, m, y, k } = colorInfo.cmyk;
        ps += `\n% Garment background\n`;
        ps += `${c/100} ${m/100} ${y/100} ${k/100} setcmykcolor\n`;
        ps += `0 0 moveto\n`;
        ps += `${widthPoints} 0 lineto\n`;
        ps += `${widthPoints} ${heightPoints} lineto\n`;
        ps += `0 ${heightPoints} lineto\n`;
        ps += `closepath fill\n`;
      }
    }
    
    // Add artwork on page 2
    ps += `\n% Page 2: Artwork on garment\n`;
    ps += await this.addArtworkToPostScript(canvasElements, logos, templateSize, widthPoints, heightPoints);
    
    // Add garment color labels
    if (garmentColor && garmentColor !== 'none') {
      const colorInfo = this.getGarmentColorInfo(garmentColor);
      if (colorInfo) {
        ps += `\n% Garment color labels\n`;
        ps += `0 0 0 1 setcmykcolor\n`; // Black text
        ps += `/Helvetica findfont 12 scalefont setfont\n`;
        ps += `20 40 moveto\n`;
        ps += `(Garment Colors: ${colorInfo.name}) show\n`;
        ps += `/Helvetica findfont 10 scalefont setfont\n`;
        ps += `20 20 moveto\n`;
        ps += `(${colorInfo.hex}) show\n`;
      }
    }
    
    ps += `\ngrestore\nshowpage\n\n%%EOF\n`;
    
    return ps;
  }
  
  /**
   * Add artwork elements to PostScript
   */
  private async addArtworkToPostScript(
    canvasElements: any[],
    logos: any[],
    templateSize: any,
    widthPoints: number,
    heightPoints: number
  ): Promise<string> {
    let ps = '';
    
    for (const element of canvasElements) {
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) continue;
      
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      if (!fs.existsSync(logoPath)) continue;
      
      // Calculate exact position and size
      const scaleX = widthPoints / templateSize.pixelWidth;
      const scaleY = heightPoints / templateSize.pixelHeight;
      
      const x = element.x * scaleX;
      // PostScript Y coordinate is from bottom, so we need to flip
      const y = heightPoints - (element.y * scaleY) - (element.height * scaleY);
      const width = element.width * scaleX;
      const height = element.height * scaleY;
      
      console.log(`📍 Positioning element at PS coordinates: (${x.toFixed(1)}, ${y.toFixed(1)}) size: ${width.toFixed(1)}x${height.toFixed(1)}`);
      
      ps += `\n% Element at (${x}, ${y})\n`;
      ps += `gsave\n`;
      ps += `${x} ${y} translate\n`;
      
      if (element.rotation) {
        ps += `${width/2} ${height/2} translate\n`;
        ps += `${element.rotation} rotate\n`;
        ps += `${-width/2} ${-height/2} translate\n`;
      }
      
      if (logo.mimeType === 'image/svg+xml') {
        // For SVG files, we need to include them as EPS
        const epsPath = await this.convertSVGToEPS(logoPath);
        if (epsPath) {
          const epsContent = fs.readFileSync(epsPath, 'utf8');
          // Extract the drawing commands from EPS
          const drawingCommands = this.extractEPSDrawingCommands(epsContent);
          ps += `${width} ${height} scale\n`;
          ps += drawingCommands;
          
          // Clean up temp EPS file
          try {
            fs.unlinkSync(epsPath);
          } catch {}
        }
      }
      
      ps += `grestore\n`;
    }
    
    return ps;
  }
  
  /**
   * Convert SVG to EPS for PostScript embedding
   */
  private async convertSVGToEPS(svgPath: string): Promise<string | null> {
    try {
      const epsPath = svgPath.replace('.svg', '_temp.eps');
      const cmd = `inkscape --export-type=eps --export-filename="${epsPath}" "${svgPath}"`;
      await execAsync(cmd);
      return epsPath;
    } catch (error) {
      console.error('Failed to convert SVG to EPS:', error);
      return null;
    }
  }
  
  /**
   * Extract drawing commands from EPS file
   */
  private extractEPSDrawingCommands(epsContent: string): string {
    // Find the actual drawing commands between %%BeginProlog and %%Trailer
    const lines = epsContent.split('\n');
    let inDrawing = false;
    let commands = '';
    
    for (const line of lines) {
      if (line.includes('%%EndProlog') || line.includes('%%BeginSetup')) {
        inDrawing = true;
        continue;
      }
      if (line.includes('%%Trailer') || line.includes('%%EOF')) {
        break;
      }
      if (inDrawing && !line.startsWith('%%')) {
        commands += line + '\n';
      }
    }
    
    return commands;
  }
  
  /**
   * Get garment color information with CMYK values
   */
  private getGarmentColorInfo(garmentColor: string) {
    const colors = [
      { name: 'White', hex: '#FFFFFF', cmyk: { c: 0, m: 0, y: 0, k: 0 } },
      { name: 'Black', hex: '#171816', cmyk: { c: 78, m: 68, y: 62, k: 91 } },
      { name: 'Hi Viz', hex: '#F0F42A', cmyk: { c: 5, m: 0, y: 95, k: 0 } },
      { name: 'Red', hex: '#762009', cmyk: { c: 18, m: 95, y: 68, k: 56 } },
      { name: 'Green', hex: '#3C8A35', cmyk: { c: 71, m: 0, y: 100, k: 15 } },
      { name: 'Navy', hex: '#263147', cmyk: { c: 95, m: 72, y: 15, k: 67 } },
      { name: 'Gray', hex: '#BCBFBB', cmyk: { c: 8, m: 5, y: 7, k: 16 } },
    ];
    
    let colorInfo = colors.find(c => c.name.toLowerCase() === garmentColor.toLowerCase());
    if (!colorInfo) {
      colorInfo = colors.find(c => c.hex.toLowerCase() === garmentColor.toLowerCase());
    }
    
    if (!colorInfo && garmentColor.startsWith('#')) {
      // Convert hex to CMYK
      const hex = garmentColor;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      const k = 1 - Math.max(r, g, b);
      const c = k < 1 ? (1 - r - k) / (1 - k) : 0;
      const m = k < 1 ? (1 - g - k) / (1 - k) : 0;
      const y = k < 1 ? (1 - b - k) / (1 - k) : 0;
      
      colorInfo = {
        name: 'Custom',
        hex: garmentColor,
        cmyk: {
          c: Math.round(c * 100),
          m: Math.round(m * 100),
          y: Math.round(y * 100),
          k: Math.round(k * 100)
        }
      };
    }
    
    return colorInfo;
  }
}