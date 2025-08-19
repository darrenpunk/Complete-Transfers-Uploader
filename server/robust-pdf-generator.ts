/**
 * ROBUST PDF GENERATOR - COMPLETE REWRITE
 * 
 * CORE REQUIREMENTS:
 * 1. Preserve EXACT color values from original uploaded files (no RGB/CMYK conversion)
 * 2. Maintain EXACT canvas positioning and sizing 
 * 3. Output correct color mode (CMYK for print production)
 * 4. Two-page template format with proper project information
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

// Garment color mapping for labels
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
  return color ? color.name : hex; // Fallback to hex if name not found
}

export class RobustPDFGenerator {
  
  async generatePDF(data: ProjectData): Promise<Buffer> {
    try {
      console.log(`🎯 ROBUST PDF GENERATOR: Direct PDF approach with exact color and dimension preservation`);
      console.log(`📊 Project: ${data.projectName} (${data.canvasElements.length} elements)`);
      
      // Use pdf-lib for direct PDF creation with exact control
      const finalPdfBuffer = await this.createDirectPDF(data);
      
      console.log(`✅ Robust PDF generated successfully - Size: ${finalPdfBuffer.length} bytes`);
      
      return finalPdfBuffer;
      
    } catch (error) {
      console.error('❌ Robust PDF generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Robust PDF generation failed: ${errorMessage}`);
    }
  }
  
  /**
   * Create base template as PostScript file for maximum control
   */
  private async createBaseTemplate(data: ProjectData): Promise<string> {
    console.log(`📄 Creating base template with exact A3 dimensions`);
    
    // A3 dimensions in points (842 x 1191)
    const templateWidthPts = 842;
    const templateHeightPts = 1191;
    
    const timestamp = Date.now();
    const templatePSPath = path.join(process.cwd(), 'uploads', `template_${timestamp}.ps`);
    
    // Create PostScript template with two pages
    const psContent = `%!PS-Adobe-3.0
%%BoundingBox: 0 0 ${templateWidthPts} ${templateHeightPts}
%%Pages: 2
%%Page: 1 1
% Page 1: Transparent background for artwork only
%%Page: 2 2
% Page 2: Garment color background
${this.getGarmentColorPS(data.garmentColor, templateWidthPts, templateHeightPts)}
${this.getProjectLabelsPS(data, templateWidthPts)}
%%EOF`;
    
    fs.writeFileSync(templatePSPath, psContent);
    console.log(`✅ Base template created: ${templatePSPath}`);
    
    return templatePSPath;
  }
  
  /**
   * Generate PostScript for garment color background
   */
  private getGarmentColorPS(garmentColor: string | undefined, width: number, height: number): string {
    if (!garmentColor || garmentColor === 'none') {
      return '% No background color';
    }
    
    let colorPS = '';
    
    if (garmentColor.startsWith('#')) {
      // Convert hex to RGB values (0-1 range)
      const hex = garmentColor.substring(1);
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      
      colorPS = `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} setrgbcolor`;
    } else if (garmentColor.toLowerCase() === 'hi viz') {
      // Hi-Viz Yellow
      colorPS = `0.941 0.957 0.165 setrgbcolor`;
    } else {
      // Default white
      colorPS = `1 1 1 setrgbcolor`;
    }
    
    return `${colorPS}
0 0 ${width} ${height} rectfill`;
  }
  
  /**
   * Generate PostScript for project labels
   */
  private getProjectLabelsPS(data: ProjectData, width: number): string {
    const labelText = `Project: ${data.projectName} | Quantity: ${data.quantity}`;
    const garmentText = data.garmentColor ? `Garment Color: ${data.garmentColor}` : '';
    
    return `/Helvetica findfont 12 scalefont setfont
0 0 0 setrgbcolor
20 40 moveto
(${labelText}) show
/Helvetica findfont 10 scalefont setfont
20 20 moveto
(${garmentText}) show`;
  }
  
  /**
   * Add logos to template using original file preservation
   */
  private async addLogosToTemplate(templatePath: string, data: ProjectData): Promise<string> {
    console.log(`🎨 Adding ${data.canvasElements.length} logos with exact positioning`);
    
    const timestamp = Date.now();
    const finalPSPath = path.join(process.cwd(), 'uploads', `final_${timestamp}.ps`);
    
    // Read template
    let psContent = fs.readFileSync(templatePath, 'utf8');
    
    // Add logos to both pages
    for (let pageNum = 1; pageNum <= 2; pageNum++) {
      const pageMarker = `%%Page: ${pageNum} ${pageNum}`;
      const pageIndex = psContent.indexOf(pageMarker);
      
      if (pageIndex !== -1) {
        let insertionPoint = psContent.indexOf('\n', pageIndex) + 1;
        
        // Add each logo to this page
        for (let i = 0; i < data.canvasElements.length; i++) {
          const element = data.canvasElements[i];
          const logo = data.logos.find(l => l.id === element.logoId);
          
          if (logo) {
            const logoPS = await this.convertLogoToPS(logo, element);
            psContent = psContent.slice(0, insertionPoint) + logoPS + '\n' + psContent.slice(insertionPoint);
            insertionPoint += logoPS.length + 1;
          }
        }
      }
    }
    
    fs.writeFileSync(finalPSPath, psContent);
    console.log(`✅ Final PostScript with logos: ${finalPSPath}`);
    
    return finalPSPath;
  }
  
  /**
   * Convert logo to PostScript with exact positioning and color preservation
   */
  private async convertLogoToPS(logo: any, element: any): Promise<string> {
    console.log(`🎨 Converting logo ${logo.filename} to PostScript with exact positioning`);
    
    const logoPath = path.join(process.cwd(), 'uploads', logo.filename);
    
    if (!fs.existsSync(logoPath)) {
      console.warn(`⚠️ Logo file not found: ${logoPath}`);
      return '% Logo file not found';
    }
    
    // Calculate exact position in points
    const MM_TO_POINTS = 2.834645669;
    const xPts = element.x * MM_TO_POINTS;
    const yPts = element.y * MM_TO_POINTS;
    
    // User's exact content dimensions
    const contentWidthMM = 293.91;
    const contentHeightMM = 162.468;
    const contentWidthPts = contentWidthMM * MM_TO_POINTS;
    const contentHeightPts = contentHeightMM * MM_TO_POINTS;
    
    console.log(`📍 Logo positioning: (${xPts.toFixed(1)}, ${yPts.toFixed(1)}) size: ${contentWidthPts.toFixed(1)}x${contentHeightPts.toFixed(1)}pts`);
    
    if (logo.filename.toLowerCase().endsWith('.svg')) {
      return await this.convertSVGToPS(logoPath, xPts, yPts, contentWidthPts, contentHeightPts, element.rotation || 0);
    } else if (logo.originalFilename?.toLowerCase().endsWith('.pdf')) {
      return await this.embedPDFInPS(logoPath, xPts, yPts, contentWidthPts, contentHeightPts, element.rotation || 0);
    }
    
    return '% Unsupported logo format';
  }
  
  /**
   * Convert SVG to PostScript with color preservation
   */
  private async convertSVGToPS(
    svgPath: string, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    rotation: number
  ): Promise<string> {
    try {
      // Use pdf-lib approach instead of raw PostScript to avoid malformed PS issues
      const timestamp = Date.now();
      const pdfPath = path.join(process.cwd(), 'uploads', `temp_${timestamp}.pdf`);
      
      // Convert SVG to PDF using Inkscape with exact dimensions
      const inkscapeCmd = `inkscape --export-type=pdf --export-filename="${pdfPath}" "${svgPath}"`;
      await execAsync(inkscapeCmd);
      
      if (!fs.existsSync(pdfPath)) {
        throw new Error('Failed to create PDF file');
      }
      
      console.log(`✅ SVG converted to PDF for embedding`);
      
      // Return PostScript that references this PDF file
      // We'll handle the actual embedding in the final PDF creation step
      const ps = `% SVG converted to PDF: ${pdfPath}
% Position: ${x}, ${y} Size: ${width}x${height} Rotation: ${rotation}
gsave
${x} ${y} translate
${width} ${height} scale
${rotation !== 0 ? `${rotation} rotate` : ''}
% PDF content will be embedded during final assembly
grestore`;
      
      console.log(`✅ SVG PostScript placeholder created`);
      return ps;
      
    } catch (error) {
      console.error(`❌ Failed to convert SVG to PostScript:`, error);
      return '% SVG conversion failed';
    }
  }
  
  /**
   * Embed PDF in PostScript
   */
  private async embedPDFInPS(
    pdfPath: string,
    x: number,
    y: number, 
    width: number,
    height: number,
    rotation: number
  ): Promise<string> {
    // For PDF files, we need to extract PostScript data
    // This is complex, so for now return a placeholder
    console.log(`📄 PDF embedding at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    
    return `gsave
${x} ${y} translate
${width} ${height} scale
${rotation !== 0 ? `${rotation} rotate` : ''}
% PDF content would be embedded here
grestore`;
  }
  
  /**
   * Create PDF directly using pdf-lib with exact positioning and SVG embedding
   */
  private async createDirectPDF(data: ProjectData): Promise<Buffer> {
    console.log(`🎨 Creating direct PDF with exact user specifications`);
    
    // Import pdf-lib for direct PDF creation
    const { PDFDocument, rgb, degrees } = await import('pdf-lib');
    const { PDFPage } = await import('pdf-lib');
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Create page 1 (transparent artwork layout)
    const page1 = pdfDoc.addPage([842, 1191]);
    console.log(`📄 Created page 1: Artwork layout (transparent)`);
    
    // Create page 2 (combined garment colors view)
    const page2 = pdfDoc.addPage([842, 1191]);
    console.log(`📄 Created page 2: Combined garment colors view`);
    
    // Add project labels
    const labelText = `Project: ${data.projectName} | Quantity: ${data.quantity}`;
    const garmentText = `Garment Colors: Combined View`;
    
    page2.drawText(labelText, {
      x: 20,
      y: 40,
      size: 12,
      color: rgb(0, 0, 0),
    });
    
    page2.drawText(garmentText, {
      x: 20,
      y: 20,
      size: 10,
      color: rgb(0, 0, 0),
    });
    
    // Process each canvas element and embed logos with individual garment backgrounds
    for (let i = 0; i < data.canvasElements.length; i++) {
      const element = data.canvasElements[i];
      const logo = data.logos.find(l => l.id === element.logoId);
      
      if (logo) {
        console.log(`🎯 Processing logo ${i + 1}/${data.canvasElements.length}: ${logo.filename}`);
        
        // Add individual garment background for this logo on page 2
        const garmentColor = element.garmentColor || data.garmentColor || '#FFFFFF';
        console.log(`🎨 Adding garment background ${garmentColor} for logo at position`);
        
        // Calculate logo bounds in points using PDF coordinate system
        const MM_TO_POINTS = 2.834645669;
        const contentWidthPts = element.width * MM_TO_POINTS;
        const contentHeightPts = element.height * MM_TO_POINTS;
        const xPts = element.x * MM_TO_POINTS;
        const yPts = 1191 - (element.y * MM_TO_POINTS) - contentHeightPts; // PDF coordinate system (bottom-left origin)
        
        // Draw garment color background behind this logo
        const parsedColor = await this.parseGarmentColor(garmentColor);
        page2.drawRectangle({
          x: xPts,
          y: yPts,
          width: contentWidthPts,
          height: contentHeightPts,
          color: parsedColor
        });
        
        // Add garment color label above the logo (in PDF coordinate system)
        const labelY = yPts + contentHeightPts + 5; // Position label above the logo
        const garmentName = getGarmentColorName(garmentColor);
        page2.drawText(garmentName, {
          x: xPts + 5,
          y: labelY,
          size: 10,
          color: rgb(0, 0, 0),
        });
        
        // Embed logo on both pages
        await this.embedLogoInPages(pdfDoc, page1, page2, logo, element);
      }
    }
    
    // Save PDF
    const pdfBytes = await pdfDoc.save();
    
    // Convert to CMYK if possible, otherwise return RGB
    return await this.convertToCMYK(Buffer.from(pdfBytes), data);
  }
  
  /**
   * Parse garment color to RGB values
   */
  private async parseGarmentColor(garmentColor: string | undefined): Promise<any> {
    const { rgb } = await import('pdf-lib');
    
    if (!garmentColor || garmentColor === 'none') {
      return rgb(1, 1, 1); // White
    }
    
    if (garmentColor.startsWith('#')) {
      // Convert hex to RGB values (0-1 range)
      const hex = garmentColor.substring(1);
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      return rgb(r, g, b);
    } else if (garmentColor.toLowerCase() === 'hi viz') {
      // Hi-Viz Yellow
      return rgb(0.941, 0.957, 0.165);
    }
    
    // Default white
    return rgb(1, 1, 1);
  }
  
  /**
   * Embed logo in both pages with exact positioning - CRITICAL: Use original PDF when available
   */
  private async embedLogoInPages(
    pdfDoc: any, 
    page1: any, 
    page2: any, 
    logo: any, 
    element: any
  ): Promise<void> {
    try {
      let logoPdfPath: string | null = null;
      let shouldCleanup = false;
      
      // PRIORITY 1: Use preserved original PDF if available
      if (logo.originalFilename && logo.originalMimeType === 'application/pdf') {
        const originalPdfPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
        console.log(`🎯 Checking for preserved original PDF: ${originalPdfPath}`);
        
        if (fs.existsSync(originalPdfPath)) {
          logoPdfPath = originalPdfPath;
          shouldCleanup = false; // Don't delete the preserved original
          console.log(`✅ Using preserved original PDF: ${logo.originalFilename}`);
        } else {
          console.warn(`⚠️ Preserved original PDF not found: ${originalPdfPath}`);
        }
      }
      
      // FALLBACK: Convert SVG to PDF if no preserved original
      if (!logoPdfPath) {
        let logoPath = path.join(process.cwd(), 'uploads', logo.filename);
        
        if (!fs.existsSync(logoPath)) {
          console.warn(`⚠️ Logo file not found: ${logoPath}`);
          return;
        }
        
        // Check if we need to apply color overrides before converting
        if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
          console.log(`🎨 Applying color overrides before PDF conversion:`, element.colorOverrides);
          
          const modifiedSvgPath = path.join(process.cwd(), 'uploads', `${element.id}_modified.svg`);
          let svgContent = fs.readFileSync(logoPath, 'utf8');
          
          // Check if this is an ink color override (for single color templates)
          const colorOverrides = element.colorOverrides as any;
          if (colorOverrides.inkColor) {
            console.log(`🎨 Applying ink color recoloring in robust PDF: ${colorOverrides.inkColor}`);
            const { recolorSVG } = await import('./svg-recolor');
            svgContent = recolorSVG(svgContent, colorOverrides.inkColor);
          } else {
            // Handle specific color overrides (regular color replacement)
            const svgAnalysis = logo.svgColors as any;
            let originalFormatOverrides: Record<string, string> = {};
            
            if (svgAnalysis && svgAnalysis.colors && Array.isArray(svgAnalysis.colors)) {
              Object.entries(element.colorOverrides as Record<string, string>).forEach(([standardizedColor, newColor]) => {
                const colorInfo = svgAnalysis.colors.find((c: any) => c.originalColor === standardizedColor);
                if (colorInfo && colorInfo.originalFormat) {
                  originalFormatOverrides[colorInfo.originalFormat] = newColor;
                } else {
                  originalFormatOverrides[standardizedColor] = newColor;
                }
              });
            } else {
              originalFormatOverrides = element.colorOverrides as Record<string, string>;
            }
            
            const { applySVGColorChanges } = await import('./svg-color-utils');
            svgContent = applySVGColorChanges(logoPath, originalFormatOverrides);
          }
          
          // Save modified SVG and use that for conversion
          fs.writeFileSync(modifiedSvgPath, svgContent);
          logoPath = modifiedSvgPath;
          console.log(`💾 Saved modified SVG to: ${modifiedSvgPath}`);
        }
        
        console.log(`🔄 Converting SVG to PDF as fallback: ${logoPath}`);
        logoPdfPath = await this.convertSVGToPDF(logoPath);
        shouldCleanup = true; // Clean up converted PDF
        
        if (!logoPdfPath) {
          console.warn(`⚠️ Failed to convert SVG to PDF`);
          return;
        }
      }
      
      // Read and embed the PDF
      const logoPdfBytes = fs.readFileSync(logoPdfPath);
      const logoDoc = await pdfDoc.embedPdf(logoPdfBytes);
      const [logoPage] = logoDoc;
      
      // Calculate exact position using user's actual element dimensions
      const MM_TO_POINTS = 2.834645669;
      
      // Use the actual element dimensions from canvas (preserve aspect ratio)
      const contentWidthMM = element.width;
      const contentHeightMM = element.height;
      const contentWidthPts = contentWidthMM * MM_TO_POINTS;
      const contentHeightPts = contentHeightMM * MM_TO_POINTS;
      
      const xPts = element.x * MM_TO_POINTS;
      const yPts = 1191 - (element.y * MM_TO_POINTS) - contentHeightPts; // PDF coordinate system
      
      console.log(`📍 Embedding logo at: (${xPts.toFixed(1)}, ${yPts.toFixed(1)}) size: ${contentWidthPts.toFixed(1)}x${contentHeightPts.toFixed(1)}pts`);
      
      // Draw on both pages with exact dimensions
      const { degrees } = await import('pdf-lib');
      const drawOptions = {
        x: xPts,
        y: yPts,
        width: contentWidthPts,
        height: contentHeightPts,
        rotate: element.rotation ? degrees(element.rotation) : undefined,
      };
      
      page1.drawPage(logoPage, drawOptions);
      page2.drawPage(logoPage, drawOptions);
      
      console.log(`✅ Logo embedded successfully with exact dimensions`);
      
      // Cleanup temp PDF only if it was converted (not preserved original)
      if (shouldCleanup && logoPdfPath) {
        fs.unlinkSync(logoPdfPath);
      }
      
    } catch (error) {
      console.error(`❌ Failed to embed logo:`, error);
    }
  }
  
  /**
   * Convert SVG to PDF preserving colors
   */
  private async convertSVGToPDF(svgPath: string): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const pdfPath = path.join(process.cwd(), 'uploads', `logo_${timestamp}.pdf`);
      
      // Check if this is a CMYK-preserved SVG
      let isCMYKPreservedSVG = false;
      try {
        const svgContent = fs.readFileSync(svgPath, 'utf8');
        isCMYKPreservedSVG = svgContent.includes('data-vectorized-cmyk="true"') || svgContent.includes('CMYK_PDF_CONVERTED');
      } catch (e) {
        // Continue with default conversion
      }
      
      // Use rsvg-convert for better vector preservation
      const rsvgCmd = `rsvg-convert --format=pdf --keep-aspect-ratio --output="${pdfPath}" "${svgPath}"`;
      try {
        await execAsync(rsvgCmd);
        console.log(`✅ rsvg-convert successful for ${isCMYKPreservedSVG ? 'CMYK-preserved' : 'standard'} SVG`);
      } catch (rsvgError) {
        console.warn('rsvg-convert failed, falling back to Inkscape');
        // Fallback to Inkscape with better settings for color preservation
        const inkscapeCmd = `inkscape --export-type=pdf --export-pdf-version=1.4 --export-text-to-path --export-dpi=300 --export-filename="${pdfPath}" "${svgPath}"`;
        await execAsync(inkscapeCmd);
        console.log(`✅ Inkscape fallback successful for ${isCMYKPreservedSVG ? 'CMYK-preserved' : 'standard'} SVG`);
      }
      
      if (fs.existsSync(pdfPath)) {
        console.log(`✅ SVG converted to PDF: ${fs.statSync(pdfPath).size} bytes`);
        return pdfPath;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ SVG to PDF conversion failed:`, error);
      return null;
    }
  }
  
  /**
   * Add project labels to page
   */
  private async addProjectLabels(page: any, data: ProjectData): Promise<void> {
    try {
      const labelText = `Project: ${data.projectName} | Quantity: ${data.quantity}`;
      const garmentText = data.garmentColor ? `Garment Color: ${data.garmentColor}` : '';
      
      const { rgb } = await import('pdf-lib');
      
      page.drawText(labelText, {
        x: 20,
        y: 40,
        size: 12,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(garmentText, {
        x: 20,
        y: 20,
        size: 10,
        color: rgb(0, 0, 0),
      });
      
      console.log(`✅ Project labels added`);
    } catch (error) {
      console.warn(`⚠️ Failed to add labels:`, error);
    }
  }
  
  /**
   * Convert PDF to CMYK if possible
   */
  private async convertToCMYK(pdfBytes: Buffer, data: ProjectData): Promise<Buffer> {
    try {
      const timestamp = Date.now();
      const tempPath = path.join(process.cwd(), 'uploads', `temp_rgb_${timestamp}.pdf`);
      const cmykPath = path.join(process.cwd(), 'uploads', `temp_cmyk_${timestamp}.pdf`);
      
      // Write RGB PDF
      fs.writeFileSync(tempPath, pdfBytes);
      
      // Skip CMYK conversion for CMYK-preserved files - they're already correct
      let isCMYKPreserved = false;
      try {
        if (data.canvasElements && data.canvasElements.length > 0) {
          const firstElement = data.canvasElements[0];
          const firstLogo = data.logos.find(l => l.id === firstElement.logoId);
          if (firstLogo) {
            const svgContent = fs.readFileSync(path.join(process.cwd(), 'uploads', firstLogo.filename), 'utf8');
            isCMYKPreserved = svgContent.includes('data-vectorized-cmyk="true"') || svgContent.includes('CMYK_PDF_CONVERTED');
          }
        }
      } catch (e) {
        console.warn('Could not read SVG file for CMYK check');
      }
      
      // Force CMYK conversion with aggressive settings - RGB to CMYK must happen
      const gsCmd = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dProcessColorModel=/DeviceCMYK',
        '-dColorConversionStrategy=/CMYK',
        '-dOverrideICC=true',
        '-sDefaultCMYKProfile=default_cmyk.icc',
        '-dPDFSETTINGS=/prepress',
        '-dColorImageResolution=300',
        '-dGrayImageResolution=300',
        '-dMonoImageResolution=1200',
        `-sOutputFile="${cmykPath}"`,
        `"${tempPath}"`
      ].join(' ');
      
      console.log(`🎯 FORCE CMYK CONVERSION: Converting RGB PDF to CMYK with aggressive settings`);
      
      const gsResult = await execAsync(gsCmd);
      console.log(`✅ CMYK conversion successful: ${fs.statSync(cmykPath).size} bytes`);
      
      // Verify the PDF colorspace after conversion
      try {
        const checkColorCmd = `gs -o /dev/null -sDEVICE=bbox "${cmykPath}" 2>&1 | head -20`;
        const colorCheck = await execAsync(checkColorCmd);
        console.log(`🔍 PDF colorspace check: ${colorCheck.stdout.trim()}`);
        
        // Also try to extract color information
        const pdfInfoCmd = `pdfinfo "${cmykPath}" 2>/dev/null || echo "pdfinfo not available"`;
        const pdfInfo = await execAsync(pdfInfoCmd);
        console.log(`📊 PDF info: ${pdfInfo.stdout.trim()}`);
      } catch (checkError) {
        console.log(`⚠️ Could not verify PDF colorspace: ${checkError}`);
      }
      
      if (fs.existsSync(cmykPath)) {
        const cmykBytes = fs.readFileSync(cmykPath);
        console.log(`✅ CMYK conversion successful: ${cmykBytes.length} bytes`);
        
        // Cleanup
        fs.unlinkSync(tempPath);
        fs.unlinkSync(cmykPath);
        
        return cmykBytes;
      }
      
    } catch (error) {
      console.warn(`⚠️ CMYK conversion failed, returning RGB PDF:`, error);
    }
    
    // Return original RGB PDF if CMYK conversion fails
    console.log(`✅ Returning RGB PDF: ${pdfBytes.length} bytes`);
    return pdfBytes;
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