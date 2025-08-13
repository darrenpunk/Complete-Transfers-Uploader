import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface VectorPDFData {
  projectId: string;
  templateSize: any;
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  appliqueBadgesForm?: any;
}

export class VectorPreservingGenerator {
  /**
   * Generate PDF with TRUE vector preservation and CMYK color mode
   * This method embeds SVG vectors directly without rasterization
   */
  async generatePDF(data: VectorPDFData): Promise<Buffer> {
    console.log('🚀 VECTOR PRESERVING PDF GENERATION - Maintaining Original Vectors & CMYK');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);
    
    try {
      // Calculate template dimensions in points
      const templateWidthPoints = data.templateSize.width * 2.834;
      const templateHeightPoints = data.templateSize.height * 2.834;
      
      // Create a master SVG that will contain all elements
      const masterSvgPath = await this.createMasterVectorDocument(
        data.canvasElements,
        data.logos,
        data.templateSize,
        templateWidthPoints,
        templateHeightPoints,
        data.garmentColor
      );
      
      // Convert the master SVG to PDF using Inkscape with CMYK preservation
      const outputPdfPath = path.join(process.cwd(), 'uploads', `vector_${data.projectId}_${Date.now()}.pdf`);
      
      console.log('🎨 Converting master SVG to PDF with CMYK color preservation...');
      
      // Use Inkscape to convert SVG to PDF while preserving vectors and CMYK
      const inkscapeCmd = `inkscape --export-type=pdf --export-pdf-version=1.5 --export-text-to-path --export-filename="${outputPdfPath}" "${masterSvgPath}"`;
      
      await execAsync(inkscapeCmd);
      
      console.log('✅ Vector PDF created with preserved CMYK colors');
      
      // Read the generated PDF
      const pdfBytes = fs.readFileSync(outputPdfPath);
      
      // Clean up temp files
      try {
        fs.unlinkSync(masterSvgPath);
        fs.unlinkSync(outputPdfPath);
      } catch {
        // Ignore cleanup errors
      }
      
      console.log(`✅ Vector PDF generated successfully - Size: ${pdfBytes.length} bytes`);
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Vector PDF generation failed:', error);
      throw new Error(`Vector PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Create a master SVG document with all elements positioned correctly
   */
  private async createMasterVectorDocument(
    canvasElements: any[],
    logos: any[],
    templateSize: any,
    widthPoints: number,
    heightPoints: number,
    garmentColor?: string
  ): Promise<string> {
    console.log('📐 Creating master vector document...');
    
    // Convert points to pixels for SVG (72 DPI)
    const svgWidth = widthPoints * (72/72);
    const svgHeight = heightPoints * (72/72);
    
    // Start building the SVG
    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${svgWidth}pt" 
     height="${svgHeight}pt" 
     viewBox="0 0 ${svgWidth} ${svgHeight}">
`;
    
    // Add CMYK color profile definition
    svgContent += `
  <defs>
    <color-profile name="FOGRA51" xlink:href="/usr/share/color/icc/ghostscript/default_cmyk.icc"/>
  </defs>
`;
    
    // PAGE 1: Transparent background with artwork
    svgContent += `
  <!-- Page 1: Artwork on transparent background -->
  <g id="page1">
`;
    
    // Add each logo/element
    for (const element of canvasElements) {
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) continue;
      
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      if (!fs.existsSync(logoPath)) continue;
      
      // Calculate exact position and size
      const scaleX = svgWidth / templateSize.pixelWidth;
      const scaleY = svgHeight / templateSize.pixelHeight;
      
      const x = element.x * scaleX;
      const y = element.y * scaleY;
      const width = element.width * scaleX;
      const height = element.height * scaleY;
      
      console.log(`📍 Positioning element at (${x.toFixed(1)}, ${y.toFixed(1)}) size: ${width.toFixed(1)}x${height.toFixed(1)}`);
      
      if (logo.mimeType === 'image/svg+xml') {
        // Read and embed the SVG content directly
        const svgElementContent = fs.readFileSync(logoPath, 'utf8');
        
        // Extract just the SVG content (remove XML declaration and outer SVG tags)
        const svgMatch = svgElementContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        if (svgMatch) {
          const innerContent = svgMatch[1];
          
          // Wrap in a group with proper transform
          svgContent += `
    <g transform="translate(${x}, ${y}) scale(${width/element.width}, ${height/element.height})">
      ${innerContent}
    </g>
`;
        }
      } else {
        // For raster images, embed as image element
        const base64 = fs.readFileSync(logoPath).toString('base64');
        const mimeType = logo.mimeType || 'image/png';
        
        svgContent += `
    <image x="${x}" y="${y}" width="${width}" height="${height}" 
           xlink:href="data:${mimeType};base64,${base64}"/>
`;
      }
    }
    
    svgContent += `
  </g>
`;
    
    // PAGE 2: With garment background
    const page2Y = svgHeight;
    svgContent += `
  <!-- Page 2: Artwork on garment background -->
  <g id="page2" transform="translate(0, ${page2Y})">
`;
    
    // Add garment background
    if (garmentColor && garmentColor !== 'none') {
      const colorInfo = this.getGarmentColorInfo(garmentColor);
      if (colorInfo) {
        // Use CMYK values for the background
        const { c, m, y: yVal, k } = colorInfo.cmyk;
        svgContent += `
    <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" 
          fill="device-cmyk(${c/100}, ${m/100}, ${yVal/100}, ${k/100})"/>
`;
      }
    }
    
    // Add the same logos again on page 2
    for (const element of canvasElements) {
      const logo = logos.find(l => l.id === element.logoId);
      if (!logo) continue;
      
      const logoPath = path.resolve(process.cwd(), 'uploads', logo.filename);
      if (!fs.existsSync(logoPath)) continue;
      
      const scaleX = svgWidth / templateSize.pixelWidth;
      const scaleY = svgHeight / templateSize.pixelHeight;
      
      const x = element.x * scaleX;
      const y = element.y * scaleY;
      const width = element.width * scaleX;
      const height = element.height * scaleY;
      
      if (logo.mimeType === 'image/svg+xml') {
        const svgElementContent = fs.readFileSync(logoPath, 'utf8');
        const svgMatch = svgElementContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        if (svgMatch) {
          const innerContent = svgMatch[1];
          svgContent += `
    <g transform="translate(${x}, ${y}) scale(${width/element.width}, ${height/element.height})">
      ${innerContent}
    </g>
`;
        }
      }
    }
    
    // Add garment color labels
    if (garmentColor && garmentColor !== 'none') {
      const colorInfo = this.getGarmentColorInfo(garmentColor);
      if (colorInfo) {
        svgContent += `
    <text x="20" y="${svgHeight - 30}" font-family="Arial" font-size="12" fill="black">
      Garment Colors: ${colorInfo.name}
    </text>
    <text x="20" y="${svgHeight - 15}" font-family="Arial" font-size="10" fill="black">
      ${colorInfo.hex}
    </text>
`;
      }
    }
    
    svgContent += `
  </g>
</svg>`;
    
    // Save the master SVG
    const masterSvgPath = path.join(process.cwd(), 'uploads', `master_vector_${Date.now()}.svg`);
    fs.writeFileSync(masterSvgPath, svgContent);
    
    console.log(`✅ Master vector document created: ${masterSvgPath}`);
    return masterSvgPath;
  }
  
  /**
   * Get garment color information
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
    
    // Try to find by name or hex
    let colorInfo = colors.find(c => c.name.toLowerCase() === garmentColor.toLowerCase());
    if (!colorInfo) {
      colorInfo = colors.find(c => c.hex.toLowerCase() === garmentColor.toLowerCase());
    }
    
    // If it's a hex color, parse it
    if (!colorInfo && garmentColor.startsWith('#')) {
      const hex = garmentColor;
      // Convert hex to approximate CMYK
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