import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { gildanColors, fruitOfTheLoomColors } from '@shared/garment-colors';

const execAsync = promisify(exec);

interface CMYKCompositorData {
  projectId: string;
  projectName?: string;
  templateSize: { width: number; height: number; name: string };
  canvasElements: any[];
  logos: any[];
  garmentColor?: string;
  garmentColors?: { color: string; quantity: number }[];
  appliqueBadgesForm?: any;
}

const manufacturerColors = {
  gildan: gildanColors,
  fruitOfTheLoom: fruitOfTheLoomColors,
};

export class CMYKPDFCompositor {
  private iccProfilePath: string;
  
  constructor() {
    this.iccProfilePath = path.join(process.cwd(), 'server', 'fogra51.icc');
  }

  async generateCMYKPDF(data: CMYKCompositorData): Promise<Buffer> {
    console.log('🎨 CMYK PDF Compositor: Starting pure CMYK PDF generation');
    console.log(`📊 Elements: ${data.canvasElements.length}, Template: ${data.templateSize.name}`);
    
    const tempDir = '/tmp';
    const timestamp = Date.now();
    const tempPsPath = path.join(tempDir, `cmyk_template_${timestamp}.ps`);
    const tempPdfPath = path.join(tempDir, `cmyk_base_${timestamp}.pdf`);
    const outputPdfPath = path.join(tempDir, `cmyk_final_${timestamp}.pdf`);
    
    try {
      const templateWidthPts = data.templateSize.width * 2.834645669;
      const templateHeightPts = data.templateSize.height * 2.834645669;
      
      const isMultiColor = data.garmentColors && data.garmentColors.length > 1;
      const colorsToProcess = isMultiColor 
        ? data.garmentColors! 
        : data.garmentColor 
          ? [{ color: data.garmentColor, quantity: 1 }]
          : [];
      
      const pagesPs: string[] = [];
      
      pagesPs.push(this.generatePagePS(templateWidthPts, templateHeightPts, null, 1));
      
      if (colorsToProcess.length > 0) {
        colorsToProcess.forEach((gc, index) => {
          const colorInfo = this.getColorInfo(gc.color);
          const footer = `${data.projectName || data.projectId} - ${colorInfo.name} - Qty: ${gc.quantity}`;
          pagesPs.push(this.generatePagePS(templateWidthPts, templateHeightPts, gc.color, index + 2, footer));
        });
      } else {
        pagesPs.push(this.generatePagePS(templateWidthPts, templateHeightPts, '#FFFFFF', 2));
      }
      
      const fullPostScript = `%!PS-Adobe-3.0
%%Creator: CompleteTransfers CMYK Compositor
%%Title: ${data.projectName || data.projectId}
%%Pages: ${pagesPs.length}
%%DocumentData: Clean7Bit
%%EndComments

% Force CMYK colorspace for all operations
/setrgbcolor { 
  3 1 roll 1 exch sub 
  3 1 roll 1 exch sub 
  3 1 roll 1 exch sub 
  0 setcmykcolor 
} bind def

${pagesPs.join('\n')}

%%EOF
`;
      
      fs.writeFileSync(tempPsPath, fullPostScript);
      console.log('📝 Generated PostScript template with CMYK colorspace');
      
      const gsBaseCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dPDFSETTINGS=/prepress',
        '-dProcessColorModel=/DeviceCMYK',
        '-dColorConversionStrategy=/CMYK',
        '-dConvertCMYKImagesToRGB=false',
        '-dDownsampleColorImages=false',
        '-dDownsampleGrayImages=false', 
        '-dDownsampleMonoImages=false',
        '-dAutoFilterColorImages=false',
        '-dAutoFilterGrayImages=false',
        '-dColorImageFilter=/FlateEncode',
        '-dGrayImageFilter=/FlateEncode',
        `-sOutputFile="${tempPdfPath}"`,
        `"${tempPsPath}"`
      ].join(' ');
      
      console.log('🔧 Creating base CMYK PDF from PostScript...');
      await execAsync(gsBaseCommand);
      
      if (!fs.existsSync(tempPdfPath)) {
        throw new Error('Failed to create base CMYK PDF');
      }
      console.log('✅ Base CMYK PDF created');
      
      let currentPdf = tempPdfPath;
      
      for (const element of data.canvasElements) {
        const logo = data.logos.find(l => l.id === element.logoId);
        if (!logo) continue;
        
        const originalPdfPath = this.findOriginalPDF(logo);
        if (originalPdfPath && fs.existsSync(originalPdfPath)) {
          console.log(`📄 Overlaying original CMYK PDF: ${path.basename(originalPdfPath)}`);
          
          const overlayPdfPath = path.join(tempDir, `overlay_${timestamp}_${element.id}.pdf`);
          
          const position = this.calculatePosition(element, data.templateSize, templateWidthPts, templateHeightPts);
          const scale = this.calculateScale(element, data.templateSize);
          
          currentPdf = await this.overlayPDFWithGhostscript(
            currentPdf, 
            originalPdfPath, 
            overlayPdfPath,
            position,
            scale,
            element.rotation || 0,
            pagesPs.length
          );
        } else {
          console.log(`⚠️ Original PDF not found for ${logo.filename}, skipping overlay`);
        }
      }
      
      console.log('🎨 Adding CMYK OutputIntent with ICC profile...');
      const gsOutputIntentCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dPDFSETTINGS=/prepress',
        '-dProcessColorModel=/DeviceCMYK',
        '-dColorConversionStrategy=/LeaveColorUnchanged',
        '-dConvertCMYKImagesToRGB=false',
        '-dCompatibilityLevel=1.4',
        `-sOutputICCProfile="${this.iccProfilePath}"`,
        `-sOutputFile="${outputPdfPath}"`,
        `"${currentPdf}"`
      ].join(' ');
      
      await execAsync(gsOutputIntentCommand);
      
      if (!fs.existsSync(outputPdfPath)) {
        console.warn('⚠️ OutputIntent embedding failed, using previous PDF');
        const pdfBytes = fs.readFileSync(currentPdf);
        this.cleanup([tempPsPath, tempPdfPath]);
        return pdfBytes;
      }
      
      const pdfBytes = fs.readFileSync(outputPdfPath);
      console.log('✅ CMYK PDF with OutputIntent generated successfully');
      
      this.cleanup([tempPsPath, tempPdfPath, outputPdfPath, currentPdf]);
      
      return pdfBytes;
      
    } catch (error) {
      console.error('❌ CMYK PDF Compositor error:', error);
      this.cleanup([tempPsPath, tempPdfPath, outputPdfPath]);
      throw error;
    }
  }
  
  private generatePagePS(widthPts: number, heightPts: number, backgroundColor: string | null, pageNum: number, footer?: string): string {
    let bgCommands = '';
    
    if (backgroundColor && backgroundColor !== 'none') {
      const cmyk = this.hexToCMYK(backgroundColor);
      bgCommands = `
% Draw background in CMYK
${cmyk.c} ${cmyk.m} ${cmyk.y} ${cmyk.k} setcmykcolor
0 0 ${widthPts} ${heightPts} rectfill
`;
    }
    
    let footerCommands = '';
    if (footer) {
      footerCommands = `
% Draw footer text in CMYK black
0 0 0 1 setcmykcolor
/Helvetica findfont 10 scalefont setfont
20 15 moveto
(${footer}) show
`;
    }
    
    return `
%%Page: ${pageNum} ${pageNum}
<< /PageSize [${widthPts} ${heightPts}] >> setpagedevice
${bgCommands}
${footerCommands}
showpage
`;
  }
  
  private async overlayPDFWithGhostscript(
    basePdf: string, 
    overlayPdf: string, 
    outputPath: string,
    position: { x: number; y: number },
    scale: number,
    rotation: number,
    numPages: number
  ): Promise<string> {
    const pdfmarksPath = outputPath.replace('.pdf', '.pdfmarks');
    
    const pdfmarks = `
[
  /PageMode /UseNone
  /DOCINFO pdfmark
`;
    
    fs.writeFileSync(pdfmarksPath, pdfmarks);
    
    const gsCommand = [
      'gs',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-sDEVICE=pdfwrite',
      '-dProcessColorModel=/DeviceCMYK',
      '-dColorConversionStrategy=/LeaveColorUnchanged',
      '-dConvertCMYKImagesToRGB=false',
      `-sOutputFile="${outputPath}"`,
      `"${basePdf}"`,
      `"${overlayPdf}"`
    ].join(' ');
    
    try {
      await execAsync(gsCommand);
      this.cleanup([pdfmarksPath]);
      
      if (fs.existsSync(outputPath)) {
        return outputPath;
      }
    } catch (error) {
      console.error('PDF overlay failed:', error);
    }
    
    return basePdf;
  }
  
  private findOriginalPDF(logo: any): string | null {
    const uploadDir = path.join(process.cwd(), 'uploads');
    
    if (logo.originalFilename) {
      const originalPath = path.join(uploadDir, logo.originalFilename);
      if (fs.existsSync(originalPath)) {
        console.log(`✅ Found original PDF: ${logo.originalFilename}`);
        return originalPath;
      }
    }
    
    if (logo.filename) {
      const baseFilename = logo.filename.replace(/\.(svg|png|jpg)$/i, '');
      const patterns = [
        `original_${baseFilename}*.pdf`,
        `${baseFilename}.pdf`,
        logo.filename.replace(/\.svg$/, '.pdf')
      ];
      
      for (const pattern of patterns) {
        const files = fs.readdirSync(uploadDir).filter(f => {
          if (pattern.includes('*')) {
            const prefix = pattern.split('*')[0];
            return f.startsWith(prefix) && f.endsWith('.pdf');
          }
          return f === pattern;
        });
        
        if (files.length > 0) {
          const foundPath = path.join(uploadDir, files[0]);
          console.log(`✅ Found original PDF via pattern: ${files[0]}`);
          return foundPath;
        }
      }
    }
    
    console.log(`⚠️ No original PDF found for logo: ${logo.filename}`);
    return null;
  }
  
  private calculatePosition(element: any, templateSize: any, widthPts: number, heightPts: number): { x: number; y: number } {
    const mmToPts = 2.834645669;
    const templateCenterX = widthPts / 2;
    const templateCenterY = heightPts / 2;
    
    const elementX = (element.x || 0) * mmToPts;
    const elementY = (element.y || 0) * mmToPts;
    
    return {
      x: templateCenterX + elementX - (element.width * mmToPts / 2),
      y: templateCenterY - elementY - (element.height * mmToPts / 2)
    };
  }
  
  private calculateScale(element: any, templateSize: any): number {
    return 1;
  }
  
  private hexToCMYK(hex: string): { c: number; m: number; y: number; k: number } {
    const colorInfo = this.getColorInfo(hex);
    if (colorInfo.cmykValues) {
      return {
        c: colorInfo.cmykValues.c / 100,
        m: colorInfo.cmykValues.m / 100,
        y: colorInfo.cmykValues.y / 100,
        k: colorInfo.cmykValues.k / 100
      };
    }
    
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 1 };
    
    const c = (1 - r - k) / (1 - k);
    const m = (1 - g - k) / (1 - k);
    const y = (1 - b - k) / (1 - k);
    
    return { c, m, y, k };
  }
  
  private getColorInfo(hexColor: string): { name: string; cmyk: string; cmykValues?: { c: number; m: number; y: number; k: number } } {
    if (!hexColor) return { name: hexColor, cmyk: "" };
    
    const quickColors = [
      { name: "White", hex: "#FFFFFF", cmyk: { c: 0, m: 0, y: 0, k: 0 } },
      { name: "Black", hex: "#171816", cmyk: { c: 0, m: 0, y: 0, k: 100 } },
    ];
    
    for (const color of quickColors) {
      if (color.hex.toLowerCase() === hexColor.toLowerCase()) {
        return { 
          name: color.name, 
          cmyk: `(${color.cmyk.c}, ${color.cmyk.m}, ${color.cmyk.y}, ${color.cmyk.k})`,
          cmykValues: color.cmyk
        };
      }
    }
    
    for (const [manufacturer, colorGroups] of Object.entries(manufacturerColors)) {
      for (const group of colorGroups) {
        for (const color of group.colors) {
          if (color.hex.toLowerCase() === hexColor.toLowerCase()) {
            return { 
              name: color.name, 
              cmyk: `(${color.cmyk.c}, ${color.cmyk.m}, ${color.cmyk.y}, ${color.cmyk.k})`,
              cmykValues: color.cmyk
            };
          }
        }
      }
    }
    
    return { name: hexColor.toUpperCase(), cmyk: "" };
  }
  
  private cleanup(files: string[]) {
    for (const file of files) {
      try {
        if (file && fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (e) {
      }
    }
  }
}
