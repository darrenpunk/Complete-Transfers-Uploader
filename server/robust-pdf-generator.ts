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
import crypto from 'crypto';
import { promisify } from 'util';
import { exec, execSync } from 'child_process';
import { manufacturerColors } from '@shared/garment-colors';
import { analyzeFullPageMatch } from './full-page-match';

const execAsyncRaw = promisify(exec);
const INKSCAPE_TIMEOUT = 30000;
const TOOL_TIMEOUT = 60000;

function execAsync(command: string, options?: any): Promise<{ stdout: string; stderr: string }> {
  const isInkscape = command.includes('inkscape');
  const defaultTimeout = isInkscape ? INKSCAPE_TIMEOUT : TOOL_TIMEOUT;
  const opts = { timeout: defaultTimeout, maxBuffer: 10 * 1024 * 1024, killSignal: 'SIGKILL' as const, ...options };
  return execAsyncRaw(command, opts);
}

interface ProjectData {
  projectId?: string;
  canvasElements: any[];
  logos: any[];
  templateSize: any;
  garmentColor?: string;
  garmentColors?: any[];
  projectName: string;
  quantity: number;
  comments?: string;
  useOriginalGarmentPages?: boolean;
}

const GARMENT_COLOR_MAP: Record<string, { name: string; cmyk: string }> = {
  '#ffffff': { name: 'White', cmyk: '0, 0, 0, 0' },
  '#171816': { name: 'Black', cmyk: '0, 0, 0, 100' },
  '#1a1a1a': { name: 'Black', cmyk: '0, 0, 0, 100' },
  '#d9d2ab': { name: 'Natural Cotton', cmyk: '11, 15, 32, 0' },
  '#f3f590': { name: 'Pastel Yellow', cmyk: '4, 2, 50, 0' },
  '#f0f42a': { name: 'Yellow', cmyk: '5, 0, 90, 0' },
  '#d7da14': { name: 'Hi Viz', cmyk: '20, 0, 100, 0' },
  '#d98f17': { name: 'Hi Viz Orange', cmyk: '0, 51, 93, 0' },
  '#388032': { name: 'HiViz Green', cmyk: '86, 16, 100, 3' },
  '#bf0072': { name: 'HIViz Pink', cmyk: '2, 97, 4, 0' },
  '#767878': { name: 'Sports Grey', cmyk: '0, 0, 0, 63' },
  '#919393': { name: 'Light Grey Marl', cmyk: '0, 0, 0, 50' },
  '#a6a9a2': { name: 'Ash Grey', cmyk: '32, 24, 26, 5' },
  '#bcbfbb': { name: 'Light Grey', cmyk: '25, 18, 20, 2' },
  '#353330': { name: 'Charcoal Grey', cmyk: '66, 57, 54, 60' },
  '#b9dbea': { name: 'Pastel Blue', cmyk: '32, 0, 5, 0' },
  '#5998d4': { name: 'Sky Blue', cmyk: '70, 15, 0, 0' },
  '#201c3a': { name: 'Navy', cmyk: '100, 92, 36, 39' },
  '#221866': { name: 'Royal Blue', cmyk: '100, 95, 5, 0' },
  '#b5d55e': { name: 'Pastel Green', cmyk: '34, 0, 73, 0' },
  '#90bf33': { name: 'Lime Green', cmyk: '50, 0, 99, 0' },
  '#3c8a35': { name: 'Kelly Green', cmyk: '85, 10, 100, 0' },
  '#e7bbd0': { name: 'Pastel Pink', cmyk: '0, 32, 3, 0' },
  '#d287a2': { name: 'Light Pink', cmyk: '2, 53, 11, 0' },
  '#c42469': { name: 'Fuchsia Pink', cmyk: '0, 94, 20, 0' },
  '#c02300': { name: 'Red', cmyk: '0, 99, 97, 0' },
  '#762009': { name: 'Burgundy', cmyk: '26, 100, 88, 27' },
  '#4c0a6a': { name: 'Purple', cmyk: '75, 100, 0, 0' },
};
for (const [brand, colorGroups] of Object.entries(manufacturerColors)) {
  for (const group of colorGroups) {
    for (const mc of group.colors) {
      const hex = mc.hex.toLowerCase();
      if (!GARMENT_COLOR_MAP[hex]) {
        GARMENT_COLOR_MAP[hex] = {
          name: mc.name,
          cmyk: `${mc.cmyk.c}, ${mc.cmyk.m}, ${mc.cmyk.y}, ${mc.cmyk.k}`
        };
      }
    }
  }
}

function getGarmentColorName(hex: string): string {
  const entry = GARMENT_COLOR_MAP[hex.toLowerCase()];
  return entry ? entry.name : hex;
}

function getGarmentColorCmyk(hex: string): string {
  const entry = GARMENT_COLOR_MAP[hex.toLowerCase()];
  return entry ? entry.cmyk : '';
}

function garmentColorRef(hex: string): string {
  const name = getGarmentColorName(hex);
  const cmyk = getGarmentColorCmyk(hex);
  if (name !== hex && cmyk) return `${name} (CMYK: ${cmyk})`;
  if (cmyk) return `CMYK: ${cmyk}`;
  return name;
}

export class RobustPDFGenerator {
  
  async generatePDF(data: ProjectData): Promise<Buffer> {
    try {
      console.log(`🎯 ROBUST PDF GENERATOR: Direct PDF approach with exact color and dimension preservation`);
      console.log(`📊 Project: ${data.projectName} (${data.canvasElements.length} elements)`);
      console.log(`🔍 DEBUG: Input data - Elements: ${data.canvasElements.length}, Logos: ${data.logos.length}`);
      console.log(`🔍 DEBUG: Elements:`, data.canvasElements.map(e => `${e.id}: logoId=${e.logoId}, pos=(${e.x},${e.y}), size=${e.width}x${e.height}`));
      console.log(`🔍 DEBUG: Logos:`, data.logos.map(l => `${l.id}: ${l.filename}`));
      
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
    console.log(`📄 Creating base template with exact dimensions`);
    
    // Template dimensions in points
    const MM_TO_POINTS = 2.834645669;
    const templateWidthPts = (data.templateSize?.width || 297) * MM_TO_POINTS;
    const templateHeightPts = (data.templateSize?.height || 420) * MM_TO_POINTS;
    
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
    const garmentText = data.garmentColor ? `Garment Color: ${garmentColorRef(data.garmentColor)}` : '';
    
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
    // Convert center-based coordinates to PDF bottom-left coordinates
    const MM_TO_POINTS = 2.834645669;
    const templateWidthMM = 297; // Default A4 width
    const templateHeightMM = 420; // Default A4 height
    const templateCenterX = templateWidthMM / 2;
    const templateCenterY = templateHeightMM / 2;
    
    // Convert center position to bottom-left corner for PDF
    const elementCenterX = templateCenterX + element.x;
    const elementCenterY = templateCenterY + element.y;
    const xPts = (elementCenterX - element.width / 2) * MM_TO_POINTS;
    const yPts = (templateHeightMM - elementCenterY - element.height / 2) * MM_TO_POINTS; // Flip Y for PDF
    
    // Use actual element dimensions from canvas (not hardcoded values)
    // When rotated 90° or 270°, visual dimensions are swapped but we keep original for embedding
    const isRotated = element.rotation === 90 || element.rotation === 270;
    const contentWidthMM = element.width;  // Keep original width for embedding
    const contentHeightMM = element.height; // Keep original height for embedding
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
    const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
    const { PDFPage } = await import('pdf-lib');
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Calculate correct page dimensions from template size (mm to points conversion)
    const MM_TO_POINTS = 2.834645669;
    let pageWidth = data.templateSize.width * MM_TO_POINTS;
    let pageHeight = data.templateSize.height * MM_TO_POINTS;
    
    // PRE-DETECT LANDSCAPE ORIENTATION: Only switch output to landscape when there is
    // exactly ONE logo placed on the canvas and that logo is a landscape PDF matching the
    // rotated template dimensions. For multi-logo projects the template orientation always wins.
    //
    // The full-page decision is delegated to the shared `analyzeFullPageMatch` analyzer
    // (server/full-page-match.ts) so this site stays in lockstep with the per-element
    // check below and the upload-time check in routes.ts. The teddy/Waterford fix
    // (require >85% coverage AND <5% margin on every side before flipping) lives in
    // the analyzer.
    let isLandscapeOutput = false;
    const isSingleLogoProject = data.logos.length === 1 && data.canvasElements.length === 1;
    if (isSingleLogoProject) {
      const logo = data.logos[0];
      if (logo.originalFilename && logo.originalMimeType === 'application/pdf') {
        const origPdfPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
        if (fs.existsSync(origPdfPath)) {
          try {
            const origPdfBytes = fs.readFileSync(origPdfPath);
            const origPdfDoc = await PDFDocument.load(origPdfBytes, { ignoreEncryption: true });
            const [firstPage] = origPdfDoc.getPages();
            const origSize = firstPage.getSize();
            const hasElementRotation = data.canvasElements.some(
              el => el.logoId === logo.id && el.rotation && el.rotation !== 0
            );

            const fpa = analyzeFullPageMatch(
              { widthPt: origSize.width, heightPt: origSize.height },
              { widthPt: data.templateSize.width * MM_TO_POINTS, heightPt: data.templateSize.height * MM_TO_POINTS },
              (logo as any).originalPdfBounds,
            );

            if (fpa.dimensionalMatch === 'rotated' && fpa.isLandscapeSource && !hasElementRotation && fpa.shouldFlipToLandscape) {
              console.log(`📄 LANDSCAPE PDF DETECTED (single-logo, full-page): ${logo.originalFilename} — ${fpa.reasoning}`);
              console.log(`📄 Switching output to landscape orientation`);
              pageWidth = origSize.width;
              pageHeight = origSize.height;
              isLandscapeOutput = true;
            } else if (fpa.dimensionalMatch === 'rotated' && fpa.isLandscapeSource && hasElementRotation) {
              console.log(`📄 LANDSCAPE PDF DETECTED but element has manual rotation - keeping template orientation`);
            } else if (fpa.dimensionalMatch === 'rotated' && fpa.isLandscapeSource) {
              // Dimensional rotated match but content isn't full-page (teddy / Waterford guard)
              console.log(`📄 Landscape PDF page detected but ${fpa.reasoning} — keeping template orientation so canvas placement stays valid`);
            }
          } catch (e) {
            console.warn(`⚠️ Failed to pre-scan PDF orientation: ${e}`);
          }
        }
      }
    } else {
      console.log(`📄 Multi-logo project (${data.logos.length} logos, ${data.canvasElements.length} elements) — always using template orientation`);
    }
    
    console.log(`📐 Template dimensions: ${data.templateSize.width}×${data.templateSize.height}mm`);
    console.log(`📐 PDF page dimensions: ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)}pt${isLandscapeOutput ? ' (LANDSCAPE)' : ''}`);
    
    // Detect applique template and split elements by canvas
    const isAppliqueTemplate = data.templateSize?.id?.includes('applique') || 
      data.canvasElements.some((el: any) => el.canvasIndex === 1);
    // DTF templates only need page 1 (transparent/production artwork) — no garment colour page
    const isDtfTemplate = data.templateSize?.id?.toLowerCase().includes('dtf') ||
      (data.templateSize?.width ?? 0) >= 1000 ||
      (data.templateSize?.height ?? 0) >= 500;
    const badgeElements = isAppliqueTemplate 
      ? data.canvasElements.filter((el: any) => !el.canvasIndex || el.canvasIndex === 0)
      : data.canvasElements;
    const embroideryElements = isAppliqueTemplate 
      ? data.canvasElements.filter((el: any) => el.canvasIndex === 1)
      : [];
    
    if (isAppliqueTemplate) {
      console.log(`📋 Applique template: Badge elements: ${badgeElements.length}, Embroidery elements: ${embroideryElements.length}`);
      console.log(`📋 All canvas elements canvasIndex values:`, data.canvasElements.map((el: any) => ({ id: el.id?.substring(0,8), logoId: el.logoId?.substring(0,8), canvasIndex: el.canvasIndex })));
      console.log(`📋 Available logos:`, data.logos.map((l: any) => ({ id: l.id?.substring(0,8), filename: l.filename, mimeType: l.mimeType })));
    }
    
    // Create page 1 (Badge Artwork / transparent artwork layout) with correct dimensions
    const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
    console.log(`📄 Created page 1: Badge Artwork (transparent) - ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)}pt`);
    
    // Check for pass-through mode: use customer's original garment color pages
    const usePassThrough = data.useOriginalGarmentPages === true && data.canvasElements.length <= 1;
    
    // Track all garment color pages for multi-color orders
    interface GarmentColorPage {
      page: typeof page1;
      color: string;
      colorName: string;
      quantity: number;
    }
    const garmentColorPages: GarmentColorPage[] = [];
    
    // ELEMENT-LEVEL GARMENT COLOR SUPPORT:
    // Check if canvas elements have individual garment colors set
    // This is different from project-level multi-color orders (garmentColors array)
    const elementGarmentColors = new Map<string, { color: string, colorName: string, elements: typeof data.canvasElements }>();
    
    for (const element of data.canvasElements) {
      if (element.garmentColor && element.garmentColor !== data.garmentColor) {
        const elemColor = element.garmentColor;
        const elemColorName = element.garmentColorName || getGarmentColorName(elemColor);
        
        if (!elementGarmentColors.has(elemColor)) {
          elementGarmentColors.set(elemColor, {
            color: elemColor,
            colorName: elemColorName,
            elements: []
          });
        }
        elementGarmentColors.get(elemColor)!.elements.push(element);
      }
    }
    
    // Also track elements with the default garment color
    const defaultColorElements = data.canvasElements.filter(
      el => !el.garmentColor || el.garmentColor === data.garmentColor
    );
    
    const hasElementLevelColors = elementGarmentColors.size > 0;
    if (hasElementLevelColors) {
      console.log(`🎨 ELEMENT-LEVEL COLORS: Found ${elementGarmentColors.size} unique garment colors from canvas elements`);
      Array.from(elementGarmentColors.entries()).forEach(([color, info]) => {
        console.log(`  - ${info.colorName} (${color}): ${info.elements.length} elements`);
      });
      console.log(`  - Default ${getGarmentColorName(data.garmentColor || '#171816')}: ${defaultColorElements.length} elements`);
    }
    
    // Create page 2 only if NOT using pass-through mode AND not a DTF template
    let page2: typeof page1 | null = null;
    if (isDtfTemplate) {
      console.log(`📄 DTF template: skipping garment colour page — single-page production output only`);
    } else if (!usePassThrough) {
      // MULTI-COLOR ORDER SUPPORT: Check if garmentColors array is provided (from project-level modal)
      // OR element-level garment colors
      if (data.garmentColors && Array.isArray(data.garmentColors) && data.garmentColors.length > 0) {
          console.log(`🎨 Multi-Color Order: Creating ${data.garmentColors.length} pages for different garment colors`);
          
          for (const garmentColorItem of data.garmentColors) {
            const colorPage = pdfDoc.addPage([pageWidth, pageHeight]);
            const colorHex = garmentColorItem.color || '#FFFFFF';
            const colorName = garmentColorItem.colorName || getGarmentColorName(colorHex);
            const qty = garmentColorItem.quantity || 0;
            
            // Fill page with garment color background
            const parsedColor = await this.parseGarmentColor(colorHex);
            colorPage.drawRectangle({
              x: 0,
              y: 0,
              width: pageWidth,
              height: pageHeight,
              color: parsedColor,
            });
            
            garmentColorPages.push({
              page: colorPage,
              color: colorHex,
              colorName,
              quantity: qty
            });
            
            console.log(`✅ Created page for ${colorName} (Qty: ${qty})`);
          }
          
          // Use first garment color page as page2 for logo embedding
          page2 = garmentColorPages.length > 0 ? garmentColorPages[0].page : null;
        } else if (hasElementLevelColors) {
        // ELEMENT-LEVEL COLORS: Create single page 2 with individual background rectangles per element
        // Each logo gets its own colored rectangle behind it (like the canvas preview)
        console.log(`🎨 Element-Level Colors: Creating single page with individual element backgrounds`);
        
        page2 = pdfDoc.addPage([pageWidth, pageHeight]);
        
        // Fill page with a base color (use project garment color or white)
        const baseColor = data.garmentColor || '#FFFFFF';
        const parsedBaseColor = await this.parseGarmentColor(baseColor);
        page2.drawRectangle({
          x: 0, y: 0, width: pageWidth, height: pageHeight, color: parsedBaseColor,
        });
        
        // We'll draw element backgrounds and logos together in the element loop below
        // Mark this page for element-level background rendering
        garmentColorPages.push({
          page: page2,
          color: baseColor,
          colorName: getGarmentColorName(baseColor),
          quantity: data.quantity,
          hasElementLevelBackgrounds: true // Special flag for element-level rendering
        } as any);
        
        console.log(`📄 Created page 2 for element-level backgrounds`);
      } else {
        // Single color mode - create one page with default garment color
        page2 = pdfDoc.addPage([pageWidth, pageHeight]);
        const defaultColor = data.garmentColor || '#171816';
        const defaultColorName = getGarmentColorName(defaultColor);
        
        // Fill page with garment color background
        const parsedColor = await this.parseGarmentColor(defaultColor);
        page2.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: parsedColor,
        });
        
        garmentColorPages.push({
          page: page2,
          color: defaultColor,
          colorName: defaultColorName,
          quantity: data.quantity
        });
        
        console.log(`📄 Created page 2: ${defaultColorName} background - ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)}pt`);
      }
    } else {
      console.log(`📄 PASS-THROUGH MODE: Will append customer's original garment pages`);
      
      // ALSO create additional garment color pages if customer selected extra colors
      if (data.garmentColors && Array.isArray(data.garmentColors) && data.garmentColors.length > 0) {
        console.log(`🎨 PASS-THROUGH + MULTI-COLOR: Creating ${data.garmentColors.length} additional garment color pages`);
        
        for (const garmentColorItem of data.garmentColors) {
          const colorPage = pdfDoc.addPage([pageWidth, pageHeight]);
          const colorHex = garmentColorItem.color || '#FFFFFF';
          const colorName = garmentColorItem.colorName || getGarmentColorName(colorHex);
          const qty = garmentColorItem.quantity || 0;
          
          const parsedColor = await this.parseGarmentColor(colorHex);
          colorPage.drawRectangle({
            x: 0, y: 0, width: pageWidth, height: pageHeight, color: parsedColor,
          });
          
          garmentColorPages.push({ page: colorPage, color: colorHex, colorName, quantity: qty });
          console.log(`✅ Created additional page for ${colorName} (Qty: ${qty})`);
        }
      }
    }
    
    // APPLIQUE TEMPLATE: Separate page structure (P1=badge transparent, P2=badge on garment color, P3=embroidery, P4=form)
    if (isAppliqueTemplate) {
      console.log(`📋 Applique PDF: Processing ${badgeElements.length} badge elements for page 1 (transparent) and page 2 (garment color)`);
      for (const element of badgeElements) {
        const shapeTypes = ['rectangle', 'ellipse', 'circle', 'line', 'shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];
        const isShape = shapeTypes.includes(element.elementType || '');
        if (isShape) {
          this.drawShapeOnPage(page1, element, data.templateSize, pageHeight);
          if (page2) {
            this.drawShapeOnPage(page2, element, data.templateSize, pageHeight);
          }
          continue;
        }
        const logo = data.logos.find(l => l.id === element.logoId);
        if (logo) {
          await this.embedLogoInPages(pdfDoc, page1, page2, logo, element, data.templateSize);
        }
      }
      
      if (embroideryElements.length > 0) {
        const embroideryPage = pdfDoc.addPage([pageWidth, pageHeight]);
        console.log(`📋 Applique PDF: Processing ${embroideryElements.length} embroidery elements for embroidery page`);
        for (const element of embroideryElements) {
          console.log(`📋 Emb element: id=${(element as any).id?.substring(0,8)}, logoId=${element.logoId?.substring(0,8)}, type=${element.elementType}, size=${element.width}x${element.height}`);
          const embShapeTypes = ['rectangle', 'ellipse', 'circle', 'line', 'shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];
          const isShape = embShapeTypes.includes(element.elementType || '');
          if (isShape) {
            this.drawShapeOnPage(embroideryPage, element, data.templateSize, pageHeight);
            continue;
          }
          const logo = data.logos.find(l => l.id === element.logoId);
          if (logo) {
            console.log(`📋 Found emb logo: ${logo.filename}, mime=${logo.mimeType}`);
            await this.embedLogoInPages(pdfDoc, null, embroideryPage, logo, element, data.templateSize);
          } else {
            console.log(`❌ Embroidery logo NOT FOUND for logoId: ${element.logoId}`);
          }
        }
      }
      
      // Save and return - applique form page is appended by the route handler
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
    }
    
    // NON-APPLIQUE: Process each canvas element and embed logos on page 1 and matching garment color pages
    // NOTE: Labels are added AFTER logo embedding to appear on top
    console.log(`🔍 DEBUG: Starting logo processing loop - ${data.canvasElements.length} elements, ${data.logos.length} logos`);
    if (data.canvasElements.length > 1) {
      for (const el of data.canvasElements) {
        (el as any)._multipleElements = true;
      }
    }
    // SO89550 INSTRUMENTATION: track silent-skip paths so we can detect when canvas
    // elements never made it onto page 1 of the production PDF. Two known silent paths:
    //   (a) `data.logos.find(...)` returns undefined → element dropped without log
    //   (b) `embedLogoInPages` throws inside its catch → swallowed, element dropped
    // Counters are read after the loop; if attempted > succeeded we log loudly so the
    // missing-artwork condition is visible in deployment logs (no customer warning).
    const allShapeTypesForCount = ['rectangle', 'ellipse', 'circle', 'line', 'shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];
    const elementsAttempted = data.canvasElements.filter(
      e => !allShapeTypesForCount.includes((e as any).elementType || '')
    ).length;
    let logoElementsEmbeddedOnPage1 = 0;
    const skippedElements: Array<{ i: number; reason: string; logoId: string }> = [];

    // SO89778 PRE-FLIGHT SOURCE-FILE SCAN: before any embed attempt, check whether
    // each referenced logo's source file(s) still exist on disk. The Replit Reserved
    // VM has an ephemeral ./uploads directory and Dropbox backup was removed (see
    // routes.ts:6863 — `/dropbox-upload` returns 410 Gone), so a customer uploading
    // a PNG that vanishes before PDF generation has NO recovery path. The embed
    // pipeline will still throw ENOENT, retry, fail the raster fallback (PNG has
    // no PDF source to rasterize), and skip — i.e. existing behavior is unchanged.
    // What this scan adds is an EXPLICIT, parseable list of missing source files
    // that gets attached to the post-loop `pdf_embed_incomplete` crash_log row,
    // so the next "missing artwork" incident is answerable from one SQL query
    // (`SELECT details->'sourceFileIssues' FROM crash_logs WHERE event_type='pdf_embed_incomplete'`)
    // instead of having to grep the __embedErrors[] stack-trace blob.
    const sourceFileIssues: Array<{ logoId: string; filename: string | null; originalFilename: string | null; filenameExists: boolean; originalExists: boolean }> = [];
    const referencedLogoIds = new Set<string>();
    for (const el of data.canvasElements) {
      if ((el as any).logoId) referencedLogoIds.add((el as any).logoId);
    }
    for (const logoId of Array.from(referencedLogoIds)) {
      const logo = data.logos.find(l => l.id === logoId);
      if (!logo) continue; // 'logo-not-found' is already detected inside the loop
      const filename = (logo as any).filename || null;
      const originalFilename = (logo as any).originalFilename || null;
      const filenameExists = filename ? fs.existsSync(path.join(process.cwd(), 'uploads', filename)) : false;
      const originalExists = originalFilename ? fs.existsSync(path.join(process.cwd(), 'uploads', originalFilename)) : false;
      // Only flag if NEITHER source exists — embedRasterImage already falls back
      // from filename → originalFilename, so a single missing file is not a problem.
      if (!filenameExists && !originalExists) {
        sourceFileIssues.push({ logoId, filename, originalFilename, filenameExists, originalExists });
        console.error(`❌❌❌ SOURCE FILES MISSING for logo=${logoId.slice(0, 8)}: filename="${filename}" exists=${filenameExists}, originalFilename="${originalFilename}" exists=${originalExists} — embed WILL fail and forensics will be in pdf_embed_incomplete`);
      }
    }
    if (sourceFileIssues.length > 0) {
      (pdfDoc as any).__sourceFileIssues = sourceFileIssues;
    }

    for (let i = 0; i < data.canvasElements.length; i++) {
      const element = data.canvasElements[i];
      console.log(`🔍 DEBUG: Processing element ${i}: logoId=${element.logoId}, position=(${element.x}, ${element.y}), size=${element.width}x${element.height}, garmentColor=${element.garmentColor || 'default'}`);
      const logo = data.logos.find(l => l.id === element.logoId);
      console.log(`🔍 DEBUG: Logo lookup result:`, logo ? `Found logo: ${logo.filename}` : 'Logo not found');
      
      const allShapeTypes = ['rectangle', 'ellipse', 'circle', 'line', 'shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];
      const isShapeElement = allShapeTypes.includes(element.elementType || '');
      
      if (isShapeElement) {
        console.log(`🔷 Processing shape element ${i + 1}/${data.canvasElements.length}: ${element.elementType}`);
        this.drawShapeOnPage(page1, element, data.templateSize, pageHeight);
        
        for (const gcPage of garmentColorPages) {
          this.drawShapeOnPage(gcPage.page, element, data.templateSize, pageHeight);
        }
        continue;
      }

      if (logo) {
        console.log(`🎯 Processing logo ${i + 1}/${data.canvasElements.length}: ${logo.filename}`);
        
        // Embed logo on page 1 (transparent background) - ALL elements go on page 1
        console.log(`🎯 Embedding logo on page 1: ${logo.filename}`);
        const beforeCount = (pdfDoc as any).__embedSuccessCount || 0;
        await this.embedLogoInPages(pdfDoc, page1, null, logo, element, data.templateSize);
        let afterCount = (pdfDoc as any).__embedSuccessCount || 0;
        if (afterCount === beforeCount) {
          // SILENT EMBED FAILURE on page 1 — the embed function's try/catch swallowed
          // an exception (corrupt cropped PDF, embedPdf failure, drawPage failure, etc).
          // Try ONCE more before giving up. The cropping/embed pipeline has transient
          // failure modes (Ghostscript flakes, fs races on the temp dir) and a single
          // retry routinely succeeds. If it fails again we record the skip for the
          // post-loop summary.
          console.error(`⚠️⚠️⚠️ SILENT EMBED FAILURE on page 1 for element ${i} (logo=${logo.filename}) — retrying once`);
          await this.embedLogoInPages(pdfDoc, page1, null, logo, element, data.templateSize);
          afterCount = (pdfDoc as any).__embedSuccessCount || 0;
          if (afterCount === beforeCount) {
            console.error(`❌❌❌ EMBED FAILED AFTER RETRY: element ${i}, logoId=${element.logoId}, filename=${logo.filename}, size=${element.width}×${element.height}mm — attempting raster fallback so page 1 doesn't ship blank`);
            // SO89676 EMERGENCY RASTER FALLBACK: vector pipeline failed twice — rasterize
            // source PDF via Ghostscript pngalpha and embed as a PNG. Quality is lower than
            // the vector path but guarantees artwork on page 1 instead of a blank sheet.
            const fallbackOk = await this.embedSourceAsRasterFallback(pdfDoc, page1, null, logo, element, data.templateSize);
            afterCount = (pdfDoc as any).__embedSuccessCount || 0;
            if (!fallbackOk || afterCount === beforeCount) {
              console.error(`❌❌❌ RASTER FALLBACK ALSO FAILED: element ${i} WILL BE MISSING from page 1 (project="${data.projectName}", template="${data.templateSize?.name || data.templateSize?.id || '?'}")`);
              skippedElements.push({ i, reason: 'embed-and-fallback-failed', logoId: element.logoId || '<none>' });
            } else {
              console.log(`🛟 RASTER FALLBACK RESCUED: element ${i} embedded as raster after vector pipeline failed twice`);
            }
          } else {
            console.log(`✅ RETRY SUCCEEDED: element ${i} embedded on second attempt`);
          }
        }
        if (afterCount > beforeCount) logoElementsEmbeddedOnPage1++;
        
        // For element-level colors, draw background rectangle THEN embed logo on page 2
        // For project-level multi-color orders, embed on ALL garment color pages
        if (hasElementLevelColors && garmentColorPages[0]) {
          const page2Ref = garmentColorPages[0].page;
          const elementColor = element.garmentColor || data.garmentColor || '#171816';
          const elementColorName = element.garmentColorName || getGarmentColorName(elementColor);
          
          // Calculate element position in PDF coordinates - MUST MATCH embedLogoInPages logic
          const mmToPt = 2.834645669;
          const templateWidthMM = data.templateSize?.width || 297;
          const templateHeightMM = data.templateSize?.height || 420;
          const templateCenterX = templateWidthMM / 2;
          const templateCenterY = templateHeightMM / 2;
          
          // Element x,y is CENTER position relative to canvas center (0,0)
          const elementCenterX = templateCenterX + element.x;
          const elementCenterY = templateCenterY + element.y;
          
          const elemWidthPt = element.width * mmToPt;
          const elemHeightPt = element.height * mmToPt;
          
          // Convert to PDF coordinates (bottom-left origin)
          const elemXPt = (elementCenterX - element.width / 2) * mmToPt;
          const elemYPt = pageHeight - ((elementCenterY + element.height / 2) * mmToPt);
          
          // Draw colored background rectangle behind this element
          const parsedElementColor = await this.parseGarmentColor(elementColor);
          console.log(`🎨 Drawing element background: ${elementColorName} at (${elemXPt.toFixed(1)}, ${elemYPt.toFixed(1)}) size ${elemWidthPt.toFixed(1)}×${elemHeightPt.toFixed(1)}`);
          page2Ref.drawRectangle({
            x: elemXPt,
            y: elemYPt,
            width: elemWidthPt,
            height: elemHeightPt,
            color: parsedElementColor,
          });
          
          // Now embed the logo on top of the background rectangle
          console.log(`🎯 Embedding logo on page 2 with ${elementColorName} background: ${logo.filename}`);
          await this.embedWithRetryAndFallback(pdfDoc, null, page2Ref, logo, element, data.templateSize, i, skippedElements, `page2/${elementColorName}`);
        } else if (!hasElementLevelColors) {
          // Project-level multi-color or single color - embed on ALL garment color pages
          for (const gcPage of garmentColorPages) {
            console.log(`🎯 Embedding logo on ${gcPage.colorName} page: ${logo.filename}`);
            await this.embedWithRetryAndFallback(pdfDoc, null, gcPage.page, logo, element, data.templateSize, i, skippedElements, `page2/${gcPage.colorName}`);
          }
        }
        
        console.log(`✅ Completed embedding logo: ${logo.filename}`);
      } else {
        // SO89550 SILENT-SKIP PATH (a): canvas element references a logoId that isn't
        // in data.logos. Previously this only logged "Logo not found" once via the
        // generic DEBUG line above and silently fell off the end of the loop body —
        // the element vanished from page 1 with no other signal. Now we log loudly
        // with the full context needed to diagnose (element index, missing logoId,
        // and the logoIds we DO have so it's obvious if there's a stale reference,
        // a deleted-logo race, or a logos-array truncation upstream).
        const availableLogoIds = data.logos.map(l => `${(l.id || '').slice(0, 8)}(${l.filename || '?'})`);
        console.error(`❌❌❌ ELEMENT DROPPED — logoId not in project logos: element ${i}, logoId=${element.logoId}, size=${element.width}×${element.height}mm @ (${element.x},${element.y}). Available logos (${data.logos.length}): [${availableLogoIds.join(', ')}]`);
        skippedElements.push({ i, reason: 'logo-not-found', logoId: element.logoId || '<none>' });
      }
    }

    // SO89550 POST-LOOP SUMMARY: surface partial/complete embedding failures loudly.
    // If a customer's order ships with fewer logos on page 1 than they placed on the
    // canvas we want it visible in deployment logs (no customer-facing warning per
    // user preference — warning would tempt re-add → duplicate orders).
    const page1Skips = skippedElements.filter(s => !s.reason.startsWith('page2/')).length;
    const page2Skips = skippedElements.filter(s => s.reason.startsWith('page2/')).length;
    console.log(`📊 EMBED SUMMARY: page1 attempted=${elementsAttempted} embedded=${logoElementsEmbeddedOnPage1} skipped(page1)=${page1Skips} skipped(page2)=${page2Skips}`);
    const sourceFileIssuesForLog = (pdfDoc as any).__sourceFileIssues as typeof sourceFileIssues | undefined;
    if (logoElementsEmbeddedOnPage1 < elementsAttempted || skippedElements.length > 0 || (sourceFileIssuesForLog && sourceFileIssuesForLog.length > 0)) {
      const which: string[] = [];
      if (logoElementsEmbeddedOnPage1 < elementsAttempted) which.push(`page1 incomplete (${logoElementsEmbeddedOnPage1}/${elementsAttempted})`);
      if (page2Skips > 0) which.push(`page2 skips=${page2Skips}`);
      if (sourceFileIssuesForLog && sourceFileIssuesForLog.length > 0) which.push(`source files missing=${sourceFileIssuesForLog.length}`);
      console.error(`❌❌❌ EMBED INCOMPLETE: ${which.join(', ')} (project="${data.projectName}", template="${data.templateSize?.name || data.templateSize?.id || '?'}"). Skipped: ${JSON.stringify(skippedElements)}`);
      // SO89676 PERSISTENT FORENSICS: deployment logs are wiped on every republish,
      // so the loud-log lines above evaporate within hours of the incident. crash_logs
      // (DB) survives — persist a row with the full skipped-elements list AND the
      // per-element error messages we stashed on pdfDoc.__embedErrors so the next
      // SO89676 is answerable from a single SQL query without reproducing the issue.
      try {
        const { persistCrashLog } = await import('./index');
        const embedErrors = (pdfDoc as any).__embedErrors || [];
        await persistCrashLog('pdf_embed_incomplete',
          `Page-1 embed incomplete: ${logoElementsEmbeddedOnPage1}/${elementsAttempted} embedded, ${skippedElements.length} skipped`,
          {
            projectName: data.projectName,
            template: data.templateSize?.name || data.templateSize?.id || null,
            templateGroup: data.templateSize?.group || null,
            inkColor: (data as any).inkColor || null,
            garmentColor: data.garmentColor || null,
            elementsAttempted,
            elementsEmbedded: logoElementsEmbeddedOnPage1,
            skippedElements,
            embedErrors: embedErrors.slice(0, 20), // cap to keep row small
            sourceFileIssues: sourceFileIssuesForLog || [], // SO89778: missing PNG/PDF sources
            logoCount: data.logos.length,
            canvasElementCount: data.canvasElements.length,
          }
        );
      } catch (e: any) {
        console.error(`[CRASH LOG] persistCrashLog(pdf_embed_incomplete) failed: ${e?.message || e}`);
      }
    }

    // Add project labels to each garment color page AFTER logo embedding (so labels appear on top).
    // SAFETY: On small templates (e.g. 100×70mm badges) the artwork can extend down to within
    // a few pt of the page bottom. A fixed 60pt band painted in the garment colour will repaint
    // the bottom of the artwork in solid colour, hiding part of the design. So we:
    //   1. Compute the lowest artwork edge in PDF-y across all elements (worst-case, ignoring rotation).
    //   2. Scale the band to fit the available bottom margin, capped at 60pt.
    //   3. Only draw the contrast rectangle when the bg is white-ish (where a 0.9-grey strip
    //      actually adds visibility); on coloured backgrounds the strip is the same colour as
    //      the bg so it adds nothing visually but still overpaints artwork — skip it.
    //   4. If there's literally no room (margin < ~10pt), skip the labels entirely rather
    //      than overdraw the artwork. Production specs are still available in the order.
    console.log(`📝 Adding labels to ${garmentColorPages.length} garment color pages`);
    const templateHeightMMforLabels = data.templateSize?.height || 420;
    const templateCenterYMMforLabels = templateHeightMMforLabels / 2;
    let lowestArtworkPdfYpts = pageHeight; // start at top, walk downward
    for (const el of data.canvasElements as any[]) {
      if (el.isVisible === false) continue;
      // Use a non-zero fallback so degenerate shapes (lines, zero-height) still contribute
      // to the safety calculation rather than being silently skipped.
      const wMM = Math.max(el.width || 0, 0.5);
      const hMM = Math.max(el.height || 0, 0.5);
      // Rotation-aware AABB half-height: for any rotation θ the axis-aligned bounding box
      // half-height is |w·sinθ|/2 + |h·cosθ|/2. Covers 0/90/180/270 and arbitrary angles.
      const rotRad = ((el.rotation || 0) * Math.PI) / 180;
      const halfHeightMM = (Math.abs(wMM * Math.sin(rotRad)) + Math.abs(hMM * Math.cos(rotRad))) / 2;
      const elBottomCanvasMM = templateCenterYMMforLabels + (el.y || 0) + halfHeightMM;
      const pdfYofBottom = (templateHeightMMforLabels - elBottomCanvasMM) * MM_TO_POINTS;
      if (pdfYofBottom < lowestArtworkPdfYpts) lowestArtworkPdfYpts = pdfYofBottom;
    }
    const STANDARD_BAND_HEIGHT = 60;
    const MIN_LABEL_BAND_HEIGHT = 24; // enough for two stacked text lines
    const availableBottomPts = Math.max(0, lowestArtworkPdfYpts);
    const bandHeightPts = Math.min(STANDARD_BAND_HEIGHT, availableBottomPts);
    const labelsCanFit = bandHeightPts >= MIN_LABEL_BAND_HEIGHT;
    if (!labelsCanFit) {
      console.log(`⚠️ Garment-page labels skipped: bottom margin only ${availableBottomPts.toFixed(1)}pt — labels would cover artwork`);
    } else if (bandHeightPts < STANDARD_BAND_HEIGHT) {
      console.log(`📐 Garment-page label band shrunk from ${STANDARD_BAND_HEIGHT}pt to ${bandHeightPts.toFixed(1)}pt to clear artwork`);
    }
    for (const gcPage of garmentColorPages) {
      const bgColor = gcPage.color.toLowerCase();
      const lightBgs = new Set([
        '#ffffff','#f3f590','#d9d2ab','#b9dbea','#b5d55e','#e7bbd0',
        '#bcbfbb','#a6a9a2','#919393',
      ]);
      const textColor = lightBgs.has(bgColor) ? rgb(0, 0, 0) : rgb(1, 1, 1);

      if (!labelsCanFit) {
        console.log(`✅ ${gcPage.colorName} page: labels omitted (no clear bottom margin)`);
        continue;
      }

      // Only draw a contrast strip on white backgrounds — on coloured bgs it would be the
      // same colour as the bg and would only serve to overpaint the artwork.
      if (bgColor === '#ffffff') {
        gcPage.page.drawRectangle({
          x: 0, y: 0, width: pageWidth, height: bandHeightPts,
          color: rgb(0.9, 0.9, 0.9),
        });
      }

      const labelText = `Project: ${data.projectName}`;
      const colorText = `Garment Color: ${gcPage.colorName} (CMYK: ${getGarmentColorCmyk(gcPage.color)})   Quantity: ${gcPage.quantity}`;
      const largeSize = bandHeightPts >= STANDARD_BAND_HEIGHT ? 12 : 10;
      const smallSize = bandHeightPts >= STANDARD_BAND_HEIGHT ? 10 : 8;
      const largeY = bandHeightPts >= STANDARD_BAND_HEIGHT ? 40 : (bandHeightPts - largeSize - 2);
      const smallY = bandHeightPts >= STANDARD_BAND_HEIGHT ? 22 : 4;

      gcPage.page.drawText(labelText, { x: 20, y: largeY, size: largeSize, color: textColor });
      gcPage.page.drawText(colorText, { x: 20, y: smallY, size: smallSize, color: textColor });

      console.log(`✅ Added labels to ${gcPage.colorName} page (band=${bandHeightPts.toFixed(0)}pt, drawStrip=${bgColor === '#ffffff'})`);
    }
    
    // PASS-THROUGH MODE: Append original PDF pages 2+ from customer's file
    // This preserves Front/Back layouts and any garment color pages in the source PDF.
    // NOTE: We do NOT rely on logo.pageCount (which is stored in-memory and lost on restart).
    // Instead we open the actual file on disk and check its page count at generation time.
    const hasExplicitGarmentColors = data.garmentColors && Array.isArray(data.garmentColors) && data.garmentColors.length > 0;
    let passThroughSucceeded = false;

    const hasMultipleCanvasElements = data.canvasElements.length > 1;
    if (usePassThrough && !hasExplicitGarmentColors && !hasMultipleCanvasElements) {
      const pdfLogoCandidate = data.logos.find((logo: any) =>
        logo.originalFilename &&
        logo.originalMimeType === 'application/pdf'
      );

      if (pdfLogoCandidate) {
        const originalPdfPath = path.join(process.cwd(), 'uploads', pdfLogoCandidate.originalFilename);
        console.log(`📄 PASS-THROUGH CHECK: Inspecting original PDF on disk: ${pdfLogoCandidate.originalFilename}`);

        if (fs.existsSync(originalPdfPath)) {
          try {
            const { PDFDocument } = await import('pdf-lib');
            const originalPdfBytes = fs.readFileSync(originalPdfPath);
            const originalPdf = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
            const originalPageCount = originalPdf.getPageCount();

            console.log(`📄 Original PDF on disk has ${originalPageCount} pages`);

            if (originalPageCount > 1) {
              // Append pages 2+ from the original PDF (index 1 onwards)
              const pageIndicesToCopy = Array.from({ length: originalPageCount - 1 }, (_, i) => i + 1);
              const copiedPages = await pdfDoc.copyPages(originalPdf, pageIndicesToCopy);
              for (const copiedPage of copiedPages) {
                pdfDoc.addPage(copiedPage);
              }
              console.log(`✅ PASS-THROUGH: Appended ${copiedPages.length} page(s) from original PDF`);
              passThroughSucceeded = true;
            } else {
              console.log(`📄 Original PDF is single-page — no extra pages to append`);
            }
          } catch (passThroughError) {
            console.error(`❌ Failed to append original PDF pages:`, passThroughError);
          }
        } else {
          console.warn(`⚠️ Original PDF not found on disk: ${originalPdfPath}`);
        }
      } else {
        console.log(`📄 No original PDF logo found — skipping pass-through`);
      }
    }
    
    // FALLBACK: If pass-through was enabled but failed (and no explicit garment colors), generate standard garment page
    if (usePassThrough && !passThroughSucceeded && !hasExplicitGarmentColors) {
      console.log(`⚠️ PASS-THROUGH FAILED: Generating fallback garment color page`);
      
      // Create fallback page 2 with garment color background
      const fallbackPage2 = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Add project labels
      const labelText = `Project: ${data.projectName} | Quantity: ${data.quantity}`;
      const garmentText = `Garment Colors: Combined View (Fallback)`;
      
      fallbackPage2.drawText(labelText, {
        x: 20,
        y: 40,
        size: 12,
        color: rgb(0, 0, 0),
      });
      
      fallbackPage2.drawText(garmentText, {
        x: 20,
        y: 20,
        size: 10,
        color: rgb(0, 0, 0),
      });
      
      // Draw garment color background and embed logos on fallback page
      for (let i = 0; i < data.canvasElements.length; i++) {
        const element = data.canvasElements[i];
        const logo = data.logos.find(l => l.id === element.logoId);
        
        if (logo) {
          const garmentColor = element.garmentColor || data.garmentColor || '#FFFFFF';
          const contentWidthPts = element.width * MM_TO_POINTS;
          const contentHeightPts = element.height * MM_TO_POINTS;
          const templateWidthMM = data.templateSize?.width || 297;
          const templateHeightMM = data.templateSize?.height || 420;
          const templateCenterX = templateWidthMM / 2;
          const templateCenterY = templateHeightMM / 2;
          
          const elementCenterX = templateCenterX + element.x;
          const elementCenterY = templateCenterY + element.y;
          const xPts = (elementCenterX - element.width / 2) * MM_TO_POINTS;
          const yPts = pageHeight - ((elementCenterY + element.height / 2) * MM_TO_POINTS);
          
          const parsedColor = await this.parseGarmentColor(garmentColor);
          fallbackPage2.drawRectangle({
            x: xPts,
            y: yPts,
            width: contentWidthPts,
            height: contentHeightPts,
            color: parsedColor
          });
          
          // Re-embed logo on fallback page only (page1 is already done)
          await this.embedLogoInPages(pdfDoc, null, fallbackPage2, logo, element, data.templateSize);
        }
      }
      
      console.log(`✅ Fallback garment color page generated`);
    }
    
    // Save PDF
    const pdfBytes = await pdfDoc.save();
    
    // SKIP ALL COLOR CONVERSION - PRESERVE EXACT ORIGINAL COLORS
    console.log(`🎯 PRESERVING EXACT ORIGINAL CMYK COLORS - NO COLOR CONVERSION`);
    console.log(`✅ Final PDF: ${pdfBytes.length} bytes with exact original colors preserved`);
    return Buffer.from(pdfBytes);
  }
  
  /**
   * Parse garment color to RGB values
   */
  private drawShapeOnPage(page: any, element: any, templateSize: any, pageHeight: number): void {
    const { rgb, degrees } = require('pdf-lib');
    const mmToPt = 2.834645669;
    const templateWidthMM = templateSize?.width || 297;
    const templateHeightMM = templateSize?.height || 420;
    const templateCenterX = templateWidthMM / 2;
    const templateCenterY = templateHeightMM / 2;

    const elementCenterX = templateCenterX + element.x;
    const elementCenterY = templateCenterY + element.y;

    const elemWidthPt = element.width * mmToPt;
    const elemHeightPt = element.height * mmToPt;

    const elemXPt = (elementCenterX - element.width / 2) * mmToPt;
    const elemYPt = pageHeight - ((elementCenterY + element.height / 2) * mmToPt);

    const parseHexColor = (hex: string) => {
      if (!hex || hex === 'none') return null;
      const h = hex.replace('#', '');
      return rgb(
        parseInt(h.substring(0, 2), 16) / 255,
        parseInt(h.substring(2, 4), 16) / 255,
        parseInt(h.substring(4, 6), 16) / 255
      );
    };

    const strokeColor = parseHexColor(element.strokeColor || '#000000');
    const fillColor = element.fillColor && element.fillColor !== 'none' ? parseHexColor(element.fillColor) : undefined;
    const strokeWidthPt = (element.strokeWidth || 1) * mmToPt;
    const opacity = element.opacity ?? 1;
    const cornerRadiusPt = (element.cornerRadius || 0) * mmToPt;

    if (element.elementType === 'rectangle') {
      const drawOpts: any = {
        x: elemXPt,
        y: elemYPt,
        width: elemWidthPt,
        height: elemHeightPt,
        borderWidth: strokeWidthPt,
        borderColor: strokeColor,
        opacity,
        borderOpacity: opacity,
      };
      if (fillColor) drawOpts.color = fillColor;
      if (element.rotation) drawOpts.rotate = degrees(element.rotation);
      page.drawRectangle(drawOpts);
    } else if (element.elementType === 'ellipse' || element.elementType === 'circle' || element.elementType === 'oval') {
      const drawOpts: any = {
        x: elemXPt + elemWidthPt / 2,
        y: elemYPt + elemHeightPt / 2,
        xScale: elemWidthPt / 2,
        yScale: elemHeightPt / 2,
        borderWidth: strokeWidthPt,
        borderColor: strokeColor,
        opacity,
        borderOpacity: opacity,
      };
      if (fillColor) drawOpts.color = fillColor;
      if (element.rotation) drawOpts.rotate = degrees(element.rotation);
      page.drawEllipse(drawOpts);
    } else if (element.elementType === 'line') {
      const lineOpts: any = {
        start: { x: elemXPt, y: elemYPt + elemHeightPt / 2 },
        end: { x: elemXPt + elemWidthPt, y: elemYPt + elemHeightPt / 2 },
        thickness: strokeWidthPt,
        color: strokeColor,
        opacity,
      };
      page.drawLine(lineOpts);
    } else {
      const badgeShapes = ['shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];
      if (badgeShapes.includes(element.elementType || '')) {
        const svgPath = this.getBadgeShapeSvgPath(element.elementType!, elemWidthPt, elemHeightPt);
        if (svgPath) {
          page.drawSvgPath(svgPath, {
            x: elemXPt,
            y: elemYPt + elemHeightPt,
            borderWidth: strokeWidthPt,
            borderColor: strokeColor,
            color: fillColor,
            opacity,
            borderOpacity: opacity,
          });
        }
      }
    }

    console.log(`🔷 Drew ${element.elementType} shape at (${elemXPt.toFixed(1)}, ${elemYPt.toFixed(1)}) size ${elemWidthPt.toFixed(1)}×${elemHeightPt.toFixed(1)}`);
  }

  private getBadgeShapeSvgPath(shapeType: string, w: number, h: number): string {
    switch (shapeType) {
      case 'shield':
        return `M ${w * 0.5} 0 L ${w} ${h * 0.15} L ${w} ${h * 0.55} Q ${w * 0.5} ${h} ${w * 0.5} ${h} Q ${w * 0.5} ${h} 0 ${h * 0.55} L 0 ${h * 0.15} Z`;
      case 'star': {
        const cx = w / 2, cy = h / 2;
        const outerR = Math.min(w, h) / 2;
        const innerR = outerR * 0.38;
        let d = '';
        for (let i = 0; i < 5; i++) {
          const outerAngle = (i * 72 - 90) * Math.PI / 180;
          const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
          d += `${i === 0 ? 'M' : 'L'} ${cx + outerR * Math.cos(outerAngle)} ${cy + outerR * Math.sin(outerAngle)} `;
          d += `L ${cx + innerR * Math.cos(innerAngle)} ${cy + innerR * Math.sin(innerAngle)} `;
        }
        return d + 'Z';
      }
      case 'hexagon': {
        const cx = w / 2, cy = h / 2;
        const rx = w / 2, ry = h / 2;
        let d = '';
        for (let i = 0; i < 6; i++) {
          const angle = (i * 60 - 90) * Math.PI / 180;
          d += `${i === 0 ? 'M' : 'L'} ${cx + rx * Math.cos(angle)} ${cy + ry * Math.sin(angle)} `;
        }
        return d + 'Z';
      }
      case 'pentagon': {
        const cx = w / 2, cy = h / 2;
        const rx = w / 2, ry = h / 2;
        let d = '';
        for (let i = 0; i < 5; i++) {
          const angle = (i * 72 - 90) * Math.PI / 180;
          d += `${i === 0 ? 'M' : 'L'} ${cx + rx * Math.cos(angle)} ${cy + ry * Math.sin(angle)} `;
        }
        return d + 'Z';
      }
      case 'triangle':
        return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
      case 'diamond':
        return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
      case 'banner':
        return `M 0 0 L ${w} 0 L ${w} ${h * 0.75} L ${w * 0.5} ${h} L 0 ${h * 0.75} Z`;
      case 'cross': {
        const armW = w / 3;
        const armH = h / 3;
        return `M ${armW} 0 L ${armW * 2} 0 L ${armW * 2} ${armH} L ${w} ${armH} L ${w} ${armH * 2} L ${armW * 2} ${armH * 2} L ${armW * 2} ${h} L ${armW} ${h} L ${armW} ${armH * 2} L 0 ${armH * 2} L 0 ${armH} L ${armW} ${armH} Z`;
      }
      case 'heart': {
        const cx = w / 2;
        return `M ${cx} ${h * 0.25} C ${cx} 0, ${w} 0, ${w} ${h * 0.3} C ${w} ${h * 0.55}, ${cx} ${h * 0.8}, ${cx} ${h} C ${cx} ${h * 0.8}, 0 ${h * 0.55}, 0 ${h * 0.3} C 0 0, ${cx} 0, ${cx} ${h * 0.25} Z`;
      }
      case 'octagon': {
        const cx = w / 2, cy = h / 2;
        const rx = w / 2, ry = h / 2;
        let d = '';
        for (let i = 0; i < 8; i++) {
          const angle = (i * 45 - 90 + 22.5) * Math.PI / 180;
          d += `${i === 0 ? 'M' : 'L'} ${cx + rx * Math.cos(angle)} ${cy + ry * Math.sin(angle)} `;
        }
        return d + 'Z';
      }
      case 'arch':
        return `M 0 ${h} L 0 ${h * 0.4} Q 0 0, ${w / 2} 0 Q ${w} 0, ${w} ${h * 0.4} L ${w} ${h} Z`;
      case 'malteseCross': {
        const notch = 0.22;
        const arm = 0.35;
        return `M ${w * 0.5} 0 L ${w * (0.5 + arm)} ${h * notch} L ${w * (0.5 + notch)} ${h * (0.5 - arm)} L ${w} ${h * 0.5} L ${w * (0.5 + notch)} ${h * (0.5 + arm)} L ${w * (0.5 + arm)} ${h * (1 - notch)} L ${w * 0.5} ${h} L ${w * (0.5 - arm)} ${h * (1 - notch)} L ${w * (0.5 - notch)} ${h * (0.5 + arm)} L 0 ${h * 0.5} L ${w * (0.5 - notch)} ${h * (0.5 - arm)} L ${w * (0.5 - arm)} ${h * notch} Z`;
      }
      case 'chevron':
        return `M 0 0 L ${w} 0 L ${w} ${h * 0.7} L ${w * 0.5} ${h} L 0 ${h * 0.7} Z`;
      case 'arrow':
        return `M 0 ${h * 0.25} L ${w * 0.65} ${h * 0.25} L ${w * 0.65} 0 L ${w} ${h * 0.5} L ${w * 0.65} ${h} L ${w * 0.65} ${h * 0.75} L 0 ${h * 0.75} Z`;
      case 'ribbon':
        return `M 0 ${h * 0.2} L ${w * 0.1} 0 L ${w * 0.1} ${h * 0.2} L ${w * 0.9} ${h * 0.2} L ${w * 0.9} 0 L ${w} ${h * 0.2} L ${w} ${h * 0.8} L ${w * 0.9} ${h} L ${w * 0.9} ${h * 0.8} L ${w * 0.1} ${h * 0.8} L ${w * 0.1} ${h} L 0 ${h * 0.8} Z`;
      default:
        return '';
    }
  }

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
   * Embed logo in page 1 and/or page 2 with exact positioning - CRITICAL: Use original PDF when available
   * page1 and page2 are nullable for flexible embedding (e.g., pass-through mode or fallback scenarios)
   */
  private async embedLogoInPages(
    pdfDoc: any, 
    page1: any | null, 
    page2: any | null, 
    logo: any, 
    element: any,
    templateSize: any
  ): Promise<void> {
    console.log(`🔍 DEBUG: Starting embedLogoInPages for logo: ${logo.filename}`);
    console.log(`🔍 DEBUG: Element position: (${element.x}, ${element.y}) size: ${element.width}x${element.height}`);
    console.log(`🔍 DEBUG: Original filename: ${logo.originalFilename}, original mime: ${logo.originalMimeType}`);
    
    // CRITICAL: Use CANVAS element dimensions for BOTH placement AND drawing
    // This ensures the PDF output exactly matches what the user sees on canvas
    // The canvas dimensions ARE the correct final dimensions (already include any bounds extraction)
    const MM_TO_POINTS = 2.834645669;
    
    // Use element dimensions - these match what's displayed on canvas
    const elementWidthMM = element.width;
    const elementHeightMM = element.height;
    
    let finalDimensions = { 
      widthPts: elementWidthMM * MM_TO_POINTS, 
      heightPts: elementHeightMM * MM_TO_POINTS 
    };
    
    console.log(`🎯 USING CANVAS DIMENSIONS: ${elementWidthMM.toFixed(2)}×${elementHeightMM.toFixed(2)}mm`);
    console.log(`📐 Converting to points: ${finalDimensions.widthPts.toFixed(1)}×${finalDimensions.heightPts.toFixed(1)}pts`);
    console.log(`✅ PDF OUTPUT WILL MATCH CANVAS EXACTLY`);
    
    // Store target dimensions (canvas element dimensions for consistent sizing)
    const targetDimensions = {
      widthMm: elementWidthMM,
      heightMm: elementHeightMM,  
      widthPts: finalDimensions.widthPts,
      heightPts: finalDimensions.heightPts,
      isCanvasTarget: true
    };
    (element as any)._targetDimensions = targetDimensions;
    
    // Store target dimensions for SVG conversion process
    (this as any)._currentTargetDimensions = targetDimensions;
    try {
      // RASTER IMAGE HANDLING: Check if logo is a PNG/JPG raster image
      const logoFilename = logo.filename || '';
      const logoMimeType = logo.mimeType || logo.originalMimeType || '';
      // A logo whose filename ends in .png may still have an original vector PDF (DTF/complex fallback).
      // Guard against this: only treat as raster if there is no original PDF to fall back to.
      const hasOriginalPdf = !!(logo.originalFilename && logo.originalMimeType === 'application/pdf' &&
                                fs.existsSync(path.join(process.cwd(), 'uploads', logo.originalFilename)));
      const isActuallyRasterFile = logoFilename.endsWith('.png') || logoFilename.endsWith('.jpg') || logoFilename.endsWith('.jpeg') ||
                                   logoMimeType.startsWith('image/png') || logoMimeType.startsWith('image/jpeg') || logoMimeType.startsWith('image/jpg');
      const isRasterImage = !hasOriginalPdf && isActuallyRasterFile;
      
      if (isRasterImage) {
        console.log(`🖼️ RASTER IMAGE DETECTED: ${logoFilename} - using direct image embedding`);
        await this.embedRasterImage(pdfDoc, page1, page2, logo, element, templateSize);
        return;
      }
      
      // RASTER-ONLY PDF WITH INK RECOLORING: When original PDF contains only raster content
      // (logo file is a PNG extracted from it) and ink color override is set, we must use the
      // raster embedding path with ImageMagick recoloring — NOT the SVG recoloring path.
      // The SVG path would try to read a PNG as SVG text and produce an invalid file.
      const colorOverridesCheck = element.colorOverrides as any;
      if (hasOriginalPdf && isActuallyRasterFile && colorOverridesCheck && colorOverridesCheck.inkColor) {
        console.log(`🖼️ RASTER-ONLY PDF WITH INK RECOLORING: ${logoFilename} - routing to raster embedding with ImageMagick recoloring`);
        await this.embedRasterImage(pdfDoc, page1, page2, logo, element, templateSize);
        return;
      }
      
      let logoPdfPath: string | null = null;
      let shouldCleanup = false;
      // Tracks whether logoPdfPath is a DERIVED file (a freshly converted SVG→PDF, or an
      // already-cropped copy of the original) rather than the pristine, untransformed
      // original PDF. logo.originalPdfBounds are measured on the pristine original at upload
      // time, so they describe ONLY that file's coordinate space. Applying them to any
      // derived file (different page box / content already shifted to the origin) re-shifts
      // content partly outside the crop box, and pdf-lib then bakes that box into the form
      // XObject BBox → the artwork is clipped. The auto-crop block below only trusts stored
      // bounds when this is false.
      let logoPdfIsDerived = false;
      
      // PRIORITY 1: Use preserved original PDF if available to maintain exact CMYK colors and vectors
      if (logo.originalFilename && logo.originalMimeType === 'application/pdf') {
        const originalPdfPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
        console.log(`🎯 Checking for preserved original PDF: ${originalPdfPath}`);
        
        // Check if we have ink color overrides - if so, skip original PDF and use recolored SVG
        const colorOverrides = element.colorOverrides as any;
        // FONTS-OUTLINED CHECK: If the user has explicitly outlined fonts, the original PDF
        // still contains the live text — using it would silently undo the outlining the user
        // requested. Skip the original PDF and fall through to the SVG path so the outlined
        // SVG (with text-as-paths) is used for the export.
        if ((logo as any).fontsOutlined === true) {
          console.log(`🔤 FONTS OUTLINED — skipping original PDF and using outlined SVG (${logo.filename}) so PDF output has no live text`);
          // Don't set logoPdfPath - force it to use the SVG conversion path with the outlined SVG
        }
        else if (colorOverrides && colorOverrides.inkColor) {
          console.log(`🎨 Ink color override detected (${colorOverrides.inkColor}) - skipping original PDF to apply recoloring`);
          // Don't set logoPdfPath - force it to use the SVG conversion path with recoloring
        } 
        // USE ORIGINAL PDF to preserve exact CMYK colors and vectors (no conversion)
        // If PDF has content offset, resize the page to content bounds using Ghostscript
        else if (fs.existsSync(originalPdfPath)) {
          const originalPdfBounds = logo.originalPdfBounds as any;
          
          // Check if content bounds differ from page origin - if so, need to resize
          if (originalPdfBounds && originalPdfBounds.xMin !== undefined) {
            const contentWidthPts = originalPdfBounds.width || (originalPdfBounds.xMax - originalPdfBounds.xMin);
            const contentHeightPts = originalPdfBounds.height || (originalPdfBounds.yMax - originalPdfBounds.yMin);
            
            console.log(`📋 Original PDF bounds: (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) to (${originalPdfBounds.xMax.toFixed(1)}, ${originalPdfBounds.yMax.toFixed(1)})`);
            console.log(`📐 Content size: ${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts`);
            
            // FULL-PAGE PDF DETECTION: If original PDF page size matches template size
            // AND the content actually fills that page (not just a small crest centred on
            // a full-bleed sheet), embed the source PDF whole rather than cropping to
            // content bounds. This prevents clipping when artwork fills the entire
            // template page (e.g., A3 PDF on A3 template) while avoiding the Waterford /
            // BEM regression where a small/inset crest got mis-classified as full-page
            // and the entire empty sheet was embedded into the canvas element.
            //
            // Decision is delegated to the shared `analyzeFullPageMatch` analyzer
            // (server/full-page-match.ts) so this site stays in lockstep with the
            // pre-detect orientation flip above and the upload-time check in routes.ts.
            const { PDFDocument: PDFDocCheck } = await import('pdf-lib');
            const origPdfBytes = fs.readFileSync(originalPdfPath);
            const origPdfDoc = await PDFDocCheck.load(origPdfBytes);
            const [origPage] = origPdfDoc.getPages();
            const origPageSize = origPage.getSize();
            const MM_TO_PTS_CHECK = 2.834645669;
            const templateWPts = (templateSize?.width || 297) * MM_TO_PTS_CHECK;
            const templateHPts = (templateSize?.height || 420) * MM_TO_PTS_CHECK;

            const fpaElement = analyzeFullPageMatch(
              { widthPt: origPageSize.width, heightPt: origPageSize.height },
              { widthPt: templateWPts, heightPt: templateHPts },
              originalPdfBounds,
            );
            const hasUserRotation = !!(element.rotation && element.rotation !== 0);

            if (fpaElement.dimensionalMatch !== 'none') {
              const orientationNote = fpaElement.dimensionalMatch === 'rotated' ? ' (LANDSCAPE - rotated orientation)' : '';
              console.log(`📄 FULL-PAGE PDF CHECK${orientationNote}: ${fpaElement.reasoning}`);
              console.log(`📄 Content size: ${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts in ${origPageSize.width.toFixed(1)}×${origPageSize.height.toFixed(1)}pt page`);

              if (fpaElement.dimensionalMatch === 'rotated' && hasUserRotation) {
                console.log(`📄 LANDSCAPE PDF with user rotation (${element.rotation}°) - NOT treating as full-page landscape`);
                console.log(`📄 User has manually rotated this element - will crop to content bounds then apply rotation`);
                // DO NOT set logoPdfPath here - let the normal cropping flow handle it
                // Setting logoPdfPath = originalPdfPath would embed the full 842×595 page
                // but drawPage would force it into element dimensions (~737×312pts), squashing the content
              } else if (fpaElement.shouldEmbedFullPage) {
                console.log(`📄 Content fills >85% of page AND extends to all edges - treating as full-page PDF`);
                console.log(`📄 Skipping content-bounds cropping - embedding full page to prevent clipping`);
                logoPdfPath = originalPdfPath;
                (element as any)._isFullPagePdf = true;
                if (fpaElement.dimensionalMatch === 'rotated') {
                  (element as any)._isLandscapePdf = true;
                  (element as any)._origPageWidth = origPageSize.width;
                  (element as any)._origPageHeight = origPageSize.height;
                }
              } else {
                console.log(`📄 Artwork is inset (coverage ${(fpaElement.contentCoverage * 100).toFixed(1)}%, max margin ${(fpaElement.maxMarginPct * 100).toFixed(1)}%) - NOT treating as full-page PDF`);
                console.log(`📄 Will crop to content bounds so artwork fits the canvas element correctly`);
              }
            }
            // ELEMENT-MATCHES-PAGE CHECK: If the canvas element dimensions are close to the original
            // PDF page dimensions, the element was sized from the full page (not just content).
            // In this case, skip cropping and use the original PDF directly to prevent distortion.
            // Uses generous tolerance (50pts ≈ 17.6mm) because Inkscape bounds extraction may
            // produce slightly different dimensions than the raw PDF page size.
            if (!logoPdfPath) {
              const elementWPts = element.width * MM_TO_PTS_CHECK;
              const elementHPts = element.height * MM_TO_PTS_CHECK;
              const elementMatchesPageDirect = Math.abs(elementWPts - origPageSize.width) < 50 && 
                                               Math.abs(elementHPts - origPageSize.height) < 50;
              const elementMatchesPageSwapped = Math.abs(elementWPts - origPageSize.height) < 50 && 
                                                Math.abs(elementHPts - origPageSize.width) < 50;
              if (elementMatchesPageDirect || elementMatchesPageSwapped) {
                console.log(`📄 ELEMENT MATCHES PDF PAGE: Element ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm ≈ PDF page ${(origPageSize.width/MM_TO_PTS_CHECK).toFixed(1)}×${(origPageSize.height/MM_TO_PTS_CHECK).toFixed(1)}mm`);
                console.log(`📄 Using original PDF without cropping to prevent content distortion`);
                logoPdfPath = originalPdfPath;
              }
            }
            // ELEMENT-LARGER-THAN-CONTENT CHECK: If the canvas element is significantly wider
            // than the Ghostscript content bounds, it may mean the element was sized from the full
            // SVG/page (including white elements GS can't detect). But we must check whether the
            // element's aspect ratio matches the content bounds or the page — if it matches content,
            // the user sized to content and we should crop (scaling up is fine).
            if (!logoPdfPath) {
              const elementWPts = element.width * MM_TO_PTS_CHECK;
              const elementHPts = element.height * MM_TO_PTS_CHECK;
              const contentToElementRatio = contentWidthPts / elementWPts;
              if (contentToElementRatio < 0.5) {
                const contentAspect = contentWidthPts / contentHeightPts;
                const elementAspect = elementWPts / elementHPts;
                const pageAspect = origPageSize.width / origPageSize.height;
                const contentAspectMatch = Math.abs(contentAspect - elementAspect) / Math.max(contentAspect, elementAspect);
                const pageAspectMatch = Math.abs(pageAspect - elementAspect) / Math.max(pageAspect, elementAspect);
                
                console.log(`📄 ELEMENT MUCH WIDER THAN GS CONTENT: Element ${element.width.toFixed(1)}mm vs GS content ${(contentWidthPts/MM_TO_PTS_CHECK).toFixed(1)}mm (ratio ${(contentToElementRatio * 100).toFixed(1)}%)`);
                console.log(`📐 Aspect check: content=${contentAspect.toFixed(3)}, element=${elementAspect.toFixed(3)}, page=${pageAspect.toFixed(3)}`);
                console.log(`📐 Match: content-element=${(contentAspectMatch * 100).toFixed(1)}%, page-element=${(pageAspectMatch * 100).toFixed(1)}%`);
                
                if (contentAspectMatch < 0.05) {
                  console.log(`📄 Element aspect matches CONTENT bounds - user scaled up content, will crop to content bounds`);
                } else if (pageAspectMatch < 0.05) {
                  console.log(`📄 Element aspect matches PAGE - GS bbox likely missed white elements, using original PDF`);
                  logoPdfPath = originalPdfPath;
                } else {
                  console.log(`📄 Element aspect matches neither content nor page - using original PDF to be safe`);
                  logoPdfPath = originalPdfPath;
                }
              }
            }
            // Check if bounds are too small (Ghostscript bbox failed or returned minimal bounds)
            // but we have proper Inkscape-detected bounds stored
            if (!logoPdfPath && contentWidthPts < 1 && contentHeightPts < 1) {
              console.log(`⚠️ Ghostscript bbox failed (0×0) - content will be at wrong position`);
              console.log(`📐 Using original PDF without cropping - SVG normalization should handle display`);
              logoPdfPath = originalPdfPath;
            }
            // If bounds offset is non-zero, create a new PDF page with content at origin
            // by embedding the original page with translation - no Ghostscript re-encoding needed
            if (!logoPdfPath && (originalPdfBounds.xMin > 1 || originalPdfBounds.yMin > 1)) {
              console.log(`📐 PDF has content offset (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) - cropping to content bounds with Ghostscript`);
              
              const resizedPdfPath = await this.cropPdfToContentBounds(originalPdfPath, originalPdfBounds);
              if (resizedPdfPath) {
                logoPdfPath = resizedPdfPath;
                shouldCleanup = true;
                logoPdfIsDerived = true; // already cropped to origin — bounds no longer apply
              } else {
                console.log(`⚠️ Ghostscript crop failed, using original PDF as-is`);
                logoPdfPath = originalPdfPath;
              }
            } else if (!logoPdfPath) {
              console.log(`✅ PDF content starts at origin - safe to use original PDF`);
              console.log(`✅ USING ORIGINAL PDF: Preserving exact CMYK colors and vectors from: ${originalPdfPath}`);
              logoPdfPath = originalPdfPath;
            }
            console.log(`📄 Original PDF will be embedded directly - no color conversion`);
          } else {
            console.log(`📄 No original bounds - using full PDF page directly`);
            logoPdfPath = originalPdfPath;
            console.log(`📄 Original PDF will be embedded directly - no color conversion`);
          }
        }
        else {
          console.log(`⚠️ Original PDF not found at: ${originalPdfPath} - will fall back to SVG`);
          logoPdfPath = null;
        }
      }
      
      // FALLBACK: Convert SVG to PDF if no preserved original
      if (!logoPdfPath) {
        let logoPath = (element as any)._colorPreservedPath || path.join(process.cwd(), 'uploads', logo.filename);
        
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
        logoPdfIsDerived = true; // converted file — coordinate space differs from original PDF
        
        if (!logoPdfPath) {
          console.warn(`⚠️ Failed to convert SVG to PDF`);
          return;
        }
      }
      
      // ASPECT RATIO SAFETY NET: Before embedding, check if the PDF page dimensions
      // match the element dimensions. If the aspect ratios differ significantly, the PDF
      // page is likely uncropped (full page with whitespace) while the element was sized
      // from content bounds. This causes drawPage to squash/distort the content.
      // Most common with landscape PDFs rotated to fit portrait templates.
      const MM_TO_POINTS = 2.834645669;
      // Only use full-page mode when drawing on page 1 (transparent artwork page).
      // For garment color pages (page1 === null), always use canvas-element-positioned
      // embedding so that white PDF backgrounds don't paint over the garment colour.
      // Also disable full-page override when there are MULTIPLE elements on the canvas,
      // because each element needs its own position — placing all at (0,0) makes them overlap.
      const hasMultipleElements = (element as any)._multipleElements === true;
      const isFullPagePdf = (element as any)._isFullPagePdf === true && page1 !== null && !hasMultipleElements;
      
      if (!isFullPagePdf) {
        const { PDFDocument: PDFDocAspect } = await import('pdf-lib');
        const checkPdfBytes = fs.readFileSync(logoPdfPath);
        const checkPdfDoc = await PDFDocAspect.load(checkPdfBytes);
        const [checkPage] = checkPdfDoc.getPages();
        const pdfW = checkPage.getSize().width;
        const pdfH = checkPage.getSize().height;
        const elemWPts = element.width * MM_TO_POINTS;
        const elemHPts = element.height * MM_TO_POINTS;
        
        const pdfAspect = pdfW / pdfH;
        const elemAspect = elemWPts / elemHPts;
        const aspectDiff = Math.abs(pdfAspect - elemAspect);
        
        // Trigger auto-crop when aspect ratios differ AND the PDF page is larger than the element
        // in EITHER dimension (not just both). This catches the case where a 100×70mm PDF page
        // has only 100×61.88mm of actual content — same width but extra height — causing squash.
        if (aspectDiff > 0.05 && (pdfH > elemHPts + 5 || pdfW > elemWPts + 5)) {
          console.log(`⚠️ ASPECT RATIO MISMATCH: PDF page ${pdfW.toFixed(1)}×${pdfH.toFixed(1)}pts (${pdfAspect.toFixed(2)}) vs element ${elemWPts.toFixed(1)}×${elemHPts.toFixed(1)}pts (${elemAspect.toFixed(2)})`);
          console.log(`📐 Difference: ${aspectDiff.toFixed(3)} - PDF page is larger than element in at least one dimension, needs cropping`);
          
          // Per-pdfDoc cache for the final cropped/letter-boxed PDF path keyed by source
          // logoPdfPath. Imposition can call this hot loop 20-40 times for the same source
          // — without caching we'd run a fresh `gs -sDEVICE=bbox` AND a fresh
          // `cropPdfToContentBounds` (another GS pass) for every tile, blowing the
          // 180s pdfGenController timeout.
          type AutoCropCacheEntry = { croppedPath: string | null };
          const autoCropCache: Map<string, AutoCropCacheEntry> =
            ((pdfDoc as any).__autoCropCache ||= new Map());
          const cropCacheKey = `${logoPdfPath}|${elemWPts.toFixed(2)}x${elemHPts.toFixed(2)}`;
          const cachedCrop = autoCropCache.get(cropCacheKey);
          if (cachedCrop) {
            if (cachedCrop.croppedPath && cachedCrop.croppedPath !== logoPdfPath) {
              if (shouldCleanup && logoPdfPath) {
                try { fs.unlinkSync(logoPdfPath); } catch (e) {}
              }
              logoPdfPath = cachedCrop.croppedPath;
              shouldCleanup = false; // Cached path is shared — never unlink
              console.log(`♻️ Reusing cached auto-cropped PDF for ${cropCacheKey.slice(0, 80)}`);
            } else {
              console.log(`♻️ Reusing cached auto-crop decision (skip) for ${cropCacheKey.slice(0, 80)}`);
            }
          } else {
          const originalPdfBounds = logo.originalPdfBounds as any;
          let boundsForCrop = null;
          // CRITICAL: only trust stored originalPdfBounds when logoPdfPath is the PRISTINE
          // original PDF. Those bounds are measured in the original PDF's coordinate space at
          // upload time. If logoPdfPath is DERIVED — a freshly converted SVG→PDF (Inkscape
          // --export-area-page, e.g. fonts outlined or colours overridden) OR an already-
          // cropped copy whose content was shifted to the origin — its page box / content
          // origin no longer matches those bounds, so applying them re-shifts content partly
          // outside the crop box and the embedded form XObject BBox then clips the artwork
          // (classic symptom: bottom of every imposition tile cut off). For derived files,
          // fall through to a live Ghostscript bbox measured on the actual file.
          if (!logoPdfIsDerived && originalPdfBounds && originalPdfBounds.width > 1 && originalPdfBounds.height > 1) {
            boundsForCrop = originalPdfBounds;
          } else {
            if (logoPdfIsDerived && originalPdfBounds && originalPdfBounds.width > 1) {
              console.log(`ℹ️ Ignoring stored originalPdfBounds for derived PDF (converted/already-cropped, different coordinate space) — measuring the actual file's own content bounds`);
            }
            // No stored content bounds (e.g. multi-page reorder PDFs in pass-through mode
            // skip upload-time bbox detection). The OLD behaviour here assumed content
            // started at the top-left of the page and cropped to element dimensions —
            // which silently dropped any content outside that top-left rectangle.
            // Production case: SO89526 / Wilton Orange Hi Vis Back / SRA3 — source PDF
            // had blue WILTON square on the LEFT and orange rectangle extending to the
            // RIGHT; the top-left crop took only the blue portion, dropping orange in
            // every imposition tile while the canvas screenshot showed the full design.
            // Now: run Ghostscript bbox live to detect ACTUAL content position. Only
            // crop when detection gives reasonable bounds. Otherwise SKIP cropping and
            // embed the full page — letter-boxing inside the element is far better
            // than silently dropping artwork.
            console.log(`⚠️ No originalPdfBounds — running live Ghostscript bbox detection on ${logoPdfPath}`);
            try {
              const bboxOut = execSync(
                `gs -o /dev/null -sDEVICE=bbox -dNOPAUSE -dBATCH -dQUIET "${logoPdfPath}" 2>&1`,
                { encoding: 'utf8', timeout: 15000 }
              );
              const hiRes = bboxOut.match(/%%HiResBoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
              const intRes = bboxOut.match(/%%BoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
              const m = hiRes || intRes;
              if (m) {
                const xMin = parseFloat(m[1]);
                const yMin = parseFloat(m[2]);
                const xMax = parseFloat(m[3]);
                const yMax = parseFloat(m[4]);
                const w = xMax - xMin;
                const h = yMax - yMin;
                // Sanity check: bounds must be positive, fit within the page, and cover
                // at least 5% of the page area (anything smaller is almost certainly a
                // GS bbox failure on white/transparent content — safer to skip cropping).
                const pageArea = pdfW * pdfH;
                const bboxArea = w * h;
                const fits = xMin >= -1 && yMin >= -1 && xMax <= pdfW + 1 && yMax <= pdfH + 1;
                if (w > 1 && h > 1 && fits && bboxArea / pageArea > 0.05) {
                  boundsForCrop = { xMin, yMin, xMax, yMax, width: w, height: h };
                  console.log(`✅ Live GS bbox: (${xMin.toFixed(1)},${yMin.toFixed(1)})→(${xMax.toFixed(1)},${yMax.toFixed(1)}) = ${w.toFixed(1)}×${h.toFixed(1)}pts (${(bboxArea / pageArea * 100).toFixed(0)}% of page)`);
                } else {
                  console.log(`❌❌❌ AUTO-CROP SKIPPED — live GS bbox unreasonable: (${xMin.toFixed(1)},${yMin.toFixed(1)})→(${xMax.toFixed(1)},${yMax.toFixed(1)}) on page ${pdfW.toFixed(1)}×${pdfH.toFixed(1)} — embedding full page (letter-boxed) to avoid silent content loss`);
                }
              } else {
                console.log(`❌❌❌ AUTO-CROP SKIPPED — live GS bbox returned no BoundingBox line — embedding full page (letter-boxed) to avoid silent content loss. logoPdfPath=${logoPdfPath} element=${element.id} logo=${logo.id}`);
              }
            } catch (bboxErr: any) {
              console.log(`❌❌❌ AUTO-CROP SKIPPED — live GS bbox threw: ${bboxErr?.message || bboxErr} — embedding full page (letter-boxed) to avoid silent content loss. logoPdfPath=${logoPdfPath} element=${element.id} logo=${logo.id}`);
            }
          }
          let resolvedCroppedPath: string | null = null;
          if (boundsForCrop) {
            console.log(`🔪 Auto-cropping PDF to content bounds to prevent distortion`);
            const croppedPath = await this.cropPdfToContentBounds(logoPdfPath, boundsForCrop);
            if (croppedPath) {
              if (shouldCleanup && logoPdfPath) {
                try { fs.unlinkSync(logoPdfPath); } catch (e) {}
              }
              logoPdfPath = croppedPath;
              shouldCleanup = false; // Cached & shared across imposition tiles — never unlink
              resolvedCroppedPath = croppedPath;
              console.log(`✅ Auto-cropped PDF to prevent squashing`);
            }
          }
          // Record the decision (cropped path OR skip) so subsequent imposition tiles
          // for the same source skip the GS bbox + crop work entirely.
          autoCropCache.set(cropCacheKey, { croppedPath: resolvedCroppedPath });
          } // end "else" (no cache hit)
        }
      }
      
      // Read and embed the PDF.
      // IMPORTANT: pdf-lib's embedPdf does NOT deduplicate identical inputs — calling it
      // N times for the same source bytes produces N independent XObjects in the output,
      // bloating the file linearly with the number of canvas elements. The imposition tool
      // (and any layout that reuses the same logo) regularly produces 20-40 elements pointing
      // at the same source PDF, which can push the final output past Odoo's ~40MB nginx
      // body limit and cause /artwork/api/attach-pdf to fail (ECONNRESET). We cache the
      // embedded page per (pdfDoc × content-hash) so identical sources are embedded once
      // and reused for every placement.
      const logoPdfBytes = fs.readFileSync(logoPdfPath);
      const embedCache: Map<string, any> = ((pdfDoc as any).__embeddedPdfCache ||= new Map());
      const cacheKey = crypto.createHash('sha1').update(logoPdfBytes).digest('hex');
      let logoPage: any;
      if (embedCache.has(cacheKey)) {
        logoPage = embedCache.get(cacheKey);
        console.log(`♻️ Reusing cached embedded PDF (sha1=${cacheKey.slice(0, 8)}, ${(logoPdfBytes.length / 1024).toFixed(1)} KB) — saved one full embed`);
      } else {
        const logoDoc = await pdfDoc.embedPdf(logoPdfBytes);
        logoPage = logoDoc[0];
        embedCache.set(cacheKey, logoPage);
        console.log(`📥 Embedded new PDF source (sha1=${cacheKey.slice(0, 8)}, ${(logoPdfBytes.length / 1024).toFixed(1)} KB) — cached for reuse`);
      }
      
      // Get the actual embedded PDF page dimensions
      const actualPdfWidth = logoPage.width;
      const actualPdfHeight = logoPage.height;
      console.log(`📄 Actual embedded PDF size: ${actualPdfWidth.toFixed(1)}×${actualPdfHeight.toFixed(1)}pts`);
      
      if (isFullPagePdf) {
        console.log(`📄 FULL-PAGE PDF: Embedding at full template size (${(templateSize?.width || 297)}×${(templateSize?.height || 420)}mm) to prevent clipping`);
      }
      
      // CRITICAL FIX: Check if this is from a tight content SVG with viewBox offset
      let viewBoxOffsetX = 0;
      let viewBoxOffsetY = 0;
      
      if (logo.filename && logo.filename.includes('_tight-content.svg')) {
        const tightContentSvgPath = path.join(process.cwd(), 'uploads', logo.filename);
        if (fs.existsSync(tightContentSvgPath)) {
          try {
            const svgContent = fs.readFileSync(tightContentSvgPath, 'utf8');
            const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
            if (viewBoxMatch) {
              const [offsetX, offsetY] = viewBoxMatch[1].split(' ').map(Number);
              if (offsetX !== 0 || offsetY !== 0) {
                viewBoxOffsetX = -offsetX; 
                viewBoxOffsetY = -offsetY;
                console.log(`🔧 CRITICAL POSITIONING FIX: Applying viewBox offset compensation: X=${viewBoxOffsetX.toFixed(2)}pt, Y=${viewBoxOffsetY.toFixed(2)}pt`);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Could not read viewBox offset from tight content SVG:`, error);
          }
        }
      }
      
      // Use CANVAS element dimensions for consistent sizing
      // This ensures PDF output exactly matches what user sees on canvas
      const isRotated = element.rotation === 90 || element.rotation === 270;
      const visualWidthMM = isRotated ? element.height : element.width;
      const visualHeightMM = isRotated ? element.width : element.height;
      
      // For PDF embedding, use element dimensions (matches canvas display)
      let contentWidthMM = element.width;
      let contentHeightMM = element.height;
      
      // FULL-PAGE PDF: Override element dimensions with template dimensions
      // This prevents clipping when the original PDF fills the entire template page
      // For landscape PDFs, use the original PDF's dimensions (swapped from template)
      const isLandscapePdf = (element as any)._isLandscapePdf === true;
      if (isFullPagePdf) {
        if (isLandscapePdf) {
          const origW = (element as any)._origPageWidth || 0;
          const origH = (element as any)._origPageHeight || 0;
          contentWidthMM = origW / MM_TO_POINTS;
          contentHeightMM = origH / MM_TO_POINTS;
          console.log(`📄 Full-page LANDSCAPE override: Using original PDF dimensions ${contentWidthMM.toFixed(1)}×${contentHeightMM.toFixed(1)}mm instead of element ${element.width.toFixed(2)}×${element.height.toFixed(2)}mm`);
        } else {
          contentWidthMM = templateSize?.width || 297;
          contentHeightMM = templateSize?.height || 420;
          console.log(`📄 Full-page override: Using template dimensions ${contentWidthMM}×${contentHeightMM}mm instead of element ${element.width.toFixed(2)}×${element.height.toFixed(2)}mm`);
        }
      }
      
      if (!isFullPagePdf) {
        console.log(`📄 Using element dimensions: ${contentWidthMM.toFixed(2)}×${contentHeightMM.toFixed(2)}mm, embedded PDF: ${(actualPdfWidth / MM_TO_POINTS).toFixed(2)}×${(actualPdfHeight / MM_TO_POINTS).toFixed(2)}mm`);
      }
      
      console.log(`🔍 CANVAS DIMENSIONS: ${element.width.toFixed(2)}×${element.height.toFixed(2)}mm`);
      console.log(`🔄 Rotation: ${element.rotation || 0}° (isRotated: ${isRotated})`);
      console.log(`✅ PDF OUTPUT WILL MATCH CANVAS: ${contentWidthMM.toFixed(2)}×${contentHeightMM.toFixed(2)}mm`);
      
      
      const contentWidthPts = contentWidthMM * MM_TO_POINTS;
      const contentHeightPts = contentHeightMM * MM_TO_POINTS;
      
      // Position calculation needs to account for visual dimensions when rotated
      // Convert center-based coordinates to PDF bottom-left coordinates
      const templateWidthMM = templateSize?.width || 297; // Use actual template width
      const templateHeightMM = templateSize?.height || 420; // Use actual template height
      const templateCenterX = templateWidthMM / 2;
      const templateCenterY = templateHeightMM / 2;
      
      // Convert center position to bottom-left corner
      const elementCenterX = templateCenterX + element.x;
      const elementCenterY = templateCenterY + element.y;
      let xPts = (elementCenterX - contentWidthMM / 2) * MM_TO_POINTS + viewBoxOffsetX;
      
      // Adjust position for rotation (rotation happens around center point)
      if (isRotated) {
        // When rotated, we need to adjust for the center-based rotation
        const centerXBefore = element.x + element.width / 2;
        const centerYBefore = element.y + element.height / 2;
        const centerXAfter = element.x + visualWidthMM / 2;
        const centerYAfter = element.y + visualHeightMM / 2;
        
        // Calculate the offset needed to maintain the same visual center
        const xAdjustment = (centerXBefore - centerXAfter) * MM_TO_POINTS;
        const yAdjustment = (centerYBefore - centerYAfter) * MM_TO_POINTS;
        
        xPts += xAdjustment;
        console.log(`📐 Rotation adjustment: X offset=${xAdjustment.toFixed(2)}pts`);
      }
      
      // Template-specific coordinate calculation to avoid affecting other templates
      // Detect large-format DTF by dimensions (1000mm wide) so all variants
      // (dtf-large, dtf-large-next-day, future variants) use the direct Y mapping.
      let yPts: number;
      const isLargeDTF = (templateSize.id?.startsWith('dtf-large') ?? false)
        || templateSize.name === 'large_dtf'
        || (templateSize.name?.startsWith('large_dtf') ?? false);
      if (isLargeDTF) {
        // For DTF large format template - direct coordinate mapping
        // DTF canvas Y coordinate maps directly to PDF Y coordinate
        // Canvas coordinate system: Y=0 is at top, increasing downward
        // PDF coordinate system: Y=0 is at bottom, increasing upward
        
        // For DTF: Use direct Y mapping from canvas to PDF bottom-up coordinates
        // Use visual height for positioning when rotated
        yPts = element.y * MM_TO_POINTS + viewBoxOffsetY;
        
        // No adjustment needed for center-based rotation
        // Rotation adjustments are handled in the drawOptions section
        
        console.log(`🎯 DTF template: elementY=${element.y}mm, visualSize=${visualWidthMM.toFixed(1)}×${visualHeightMM.toFixed(1)}mm, pdfY=${yPts.toFixed(1)}pt`);
        
        // Ensure PDF Y coordinate is within valid bounds (no negative positioning)
        yPts = Math.max(0, yPts);
      } else {
        // For all other templates (A3, etc.) - convert canvas coordinates to PDF coordinates
        // Convert center-based Y to PDF bottom-left Y
        // Template center Y = 0 in our coordinate system
        const templateHeightPts = (templateSize?.height || 420) * MM_TO_POINTS; // Exact template height in points
        const templateHeightMM2 = templateSize?.height || 420; // Template height in mm
        const templateCenterYMM = templateHeightMM / 2;
        
        // Convert element center position to absolute position
        const elementCenterYMM = templateCenterYMM + element.y;
        // Use visual height for positioning when rotated
        const effectiveHeightPts = isRotated ? (element.width * MM_TO_POINTS) : contentHeightPts;
        yPts = templateHeightPts - ((elementCenterYMM + contentHeightMM / 2) * MM_TO_POINTS) + viewBoxOffsetY;
        
        // No adjustment needed for center-based rotation
        // Rotation adjustments are handled in the drawOptions section
        
        console.log(`📐 Standard template positioning: Template height=${templateHeightPts}pt, element.y=${element.y}mm, visualHeight=${visualHeightMM}mm, y=${yPts.toFixed(1)}pt`);
      }
      
      console.log(`📍 Embedding logo at: (${xPts.toFixed(1)}, ${yPts.toFixed(1)}) size: ${contentWidthPts.toFixed(1)}x${contentHeightPts.toFixed(1)}pts`);
      console.log(`🔍 DEBUG: Logo PDF path: ${logoPdfPath}`);
      
      // CRITICAL FIX: Force exact dimensions and centering for PDF embedding
      const { degrees } = await import('pdf-lib');
      
      // Use actual element position (no forced centering)
      const finalX = xPts; // Use the element's actual X position
      
      console.log(`📍 ELEMENT POSITION: Using actual position X=${finalX.toFixed(1)}pts (from element.x=${element.x}mm)`);
      
      // NOTE: Previously overrode logoPdfPath with full original PDF here,
      // but that undoes content-bounds cropping and causes clipping on small templates.
      // The cropped/processed PDF from earlier is already correct.
      console.log(`✅ EXACT ELEMENT SIZE: Using ${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts from element dimensions`);
      
      // ASPECT RATIO PRESERVATION: When PDF page aspect ratio differs from element,
      // scale to fit within element bounds while preserving proportions (prevent squashing)
      let adjustedContentWidthPts = contentWidthPts;
      let adjustedContentHeightPts = contentHeightPts;
      let aspectXOffset = 0;
      let aspectYOffset = 0;
      
      const embeddedPdfAspect = actualPdfWidth / actualPdfHeight;
      const elementDrawAspect = contentWidthPts / contentHeightPts;
      const drawAspectDiff = Math.abs(embeddedPdfAspect - elementDrawAspect) / Math.max(embeddedPdfAspect, elementDrawAspect);
      
      if (!isFullPagePdf && drawAspectDiff > 0.02) {
        console.log(`⚠️ PDF→Element aspect mismatch: PDF=${embeddedPdfAspect.toFixed(3)} (${actualPdfWidth.toFixed(1)}×${actualPdfHeight.toFixed(1)}pts), element=${elementDrawAspect.toFixed(3)} (${(drawAspectDiff * 100).toFixed(1)}% diff)`);
        if (embeddedPdfAspect > elementDrawAspect) {
          adjustedContentHeightPts = contentWidthPts / embeddedPdfAspect;
        } else {
          adjustedContentWidthPts = contentHeightPts * embeddedPdfAspect;
        }
        aspectXOffset = (contentWidthPts - adjustedContentWidthPts) / 2;
        aspectYOffset = (contentHeightPts - adjustedContentHeightPts) / 2;
        console.log(`📐 Adjusted to preserve ratio: ${adjustedContentWidthPts.toFixed(1)}×${adjustedContentHeightPts.toFixed(1)}pts (centering offset: x=${aspectXOffset.toFixed(1)}, y=${aspectYOffset.toFixed(1)})`);
      }
      
      // CORRECT ROTATION HANDLING:
      // pdf-lib rotates around the drawing position (x, y) which is the bottom-left corner
      // For centered placement with rotation, we need to calculate where to place the
      // unrotated content so that after rotation, the visual center is at the target position
      
      // Template center in PDF coordinates (bottom-left origin)
      const MM_TO_PTS = 2.834645669;
      const templateCenterXPts = (templateSize?.width || 297) / 2 * MM_TO_PTS;
      const templateCenterYPts = (templateSize?.height || 420) / 2 * MM_TO_PTS;
      
      // Target visual center (where the element should appear centered)
      // element.x and element.y are offsets from template center in mm
      // Include viewBox offset compensation for tight-content SVGs
      const targetCenterX = templateCenterXPts + element.x * MM_TO_PTS + viewBoxOffsetX;
      const targetCenterY = templateCenterYPts - element.y * MM_TO_PTS + viewBoxOffsetY; // Flip Y for PDF (canvas Y increases down, PDF Y increases up)
      
      console.log(`🔧 ViewBox offset compensation: X=${viewBoxOffsetX.toFixed(1)}pt, Y=${viewBoxOffsetY.toFixed(1)}pt`);
      
      let drawX: number;
      let drawY: number;
      
      if (isFullPagePdf) {
        drawX = 0;
        drawY = 0;
        console.log(`📄 Full-page PDF: Placing at origin (0, 0) to cover full page${isLandscapePdf ? ' (LANDSCAPE)' : ''}`);
      } else if (element.rotation === 90) {
        drawX = targetCenterX + adjustedContentHeightPts / 2;
        drawY = targetCenterY - adjustedContentWidthPts / 2;
      } else if (element.rotation === 180) {
        drawX = targetCenterX + adjustedContentWidthPts / 2;
        drawY = targetCenterY + adjustedContentHeightPts / 2;
      } else if (element.rotation === 270) {
        drawX = targetCenterX - adjustedContentHeightPts / 2;
        drawY = targetCenterY + adjustedContentWidthPts / 2;
      } else {
        // No rotation - standard bottom-left positioning
        drawX = targetCenterX - adjustedContentWidthPts / 2;
        drawY = targetCenterY - adjustedContentHeightPts / 2;
      }
      
      console.log(`🎯 ROTATION CENTERING: target center=(${targetCenterX.toFixed(1)}, ${targetCenterY.toFixed(1)}), rotation=${element.rotation || 0}°`);
      console.log(`📍 DRAW POSITION: (${drawX.toFixed(1)}, ${drawY.toFixed(1)}) with size ${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts`);
      
      const shouldSkipRotation = isFullPagePdf && isLandscapePdf;
      const drawOptions = {
        x: drawX,
        y: drawY,
        width: adjustedContentWidthPts,
        height: adjustedContentHeightPts,
        rotate: (element.rotation && !shouldSkipRotation) ? degrees(element.rotation) : undefined,
      };
      
      if (shouldSkipRotation && element.rotation) {
        console.log(`📄 LANDSCAPE FULL-PAGE: Skipping element rotation (${element.rotation}°) - output page already matches PDF orientation`);
      }
      console.log(`📐 FINAL EMBEDDING: Position=(${drawX.toFixed(1)}, ${drawY.toFixed(1)}) Size=${adjustedContentWidthPts.toFixed(1)}×${adjustedContentHeightPts.toFixed(1)}pts, Rotation=${shouldSkipRotation ? 0 : (element.rotation || 0)}°`);
      
      if (page1) {
        page1.drawPage(logoPage, drawOptions);
      }
      if (page2) {
        page2.drawPage(logoPage, drawOptions);
      }
      // SO89550 INSTRUMENTATION: bump the per-pdfDoc success counter the outer loop
      // reads to detect silent embed failures. We only count when something was
      // actually painted onto a page — null page1+page2 means nothing was drawn and
      // the counter must NOT advance, otherwise the outer retry would never trigger.
      if (page1 || page2) {
        (pdfDoc as any).__embedSuccessCount = ((pdfDoc as any).__embedSuccessCount || 0) + 1;
      }
      
      console.log(`✅ Logo embedded successfully with exact dimensions`);
      
      // Cleanup temp PDF only if it was converted (not preserved original)
      if (shouldCleanup && logoPdfPath) {
        fs.unlinkSync(logoPdfPath);
      }
      
    } catch (error) {
      // SO89550 SILENT-SKIP PATH (b): any throw inside the embed pipeline
      // (cropPdfToContentBounds, fs.readFileSync, embedPdf, drawPage, etc.) is caught
      // here and the outer loop continues to the next element with no other signal.
      // Log loudly with element + logo context so the lost-artwork condition is
      // visible in deployment logs. The outer loop checks __embedSuccessCount and
      // retries once before giving up.
      const err: any = error;
      console.error(`❌❌❌ EMBED THREW for logo ${logo?.filename || '?'} (logoId=${logo?.id?.slice(0, 8) || '?'}, element ${element.width}×${element.height}mm @ (${element.x},${element.y})): ${err?.message || err}`);
      if (err?.stack) console.error(err.stack);
      // SO89676 INSTRUMENTATION: stash the error so the outer loop can include it in
      // the persisted crash_logs row when EMBED INCOMPLETE fires. Deployment logs are
      // wiped on every republish, but crash_logs survives — this is the only way to
      // recover "why did page X ship blank?" from a later forensic query.
      try {
        const errors: Array<any> = ((pdfDoc as any).__embedErrors ||= []);
        errors.push({
          logoId: logo?.id?.slice(0, 8) || null,
          filename: logo?.filename || null,
          originalFilename: logo?.originalFilename || null,
          mimeType: logo?.mimeType || logo?.originalMimeType || null,
          elementId: (element as any)?.id?.slice(0, 8) || null,
          elementSize: `${element?.width}×${element?.height}mm`,
          elementPos: `(${element?.x},${element?.y})`,
          rotation: element?.rotation || 0,
          page: page1 ? 'page1' : (page2 ? 'page2' : 'none'),
          errMessage: String(err?.message || err).slice(0, 500),
          errStack: String(err?.stack || '').split('\n').slice(0, 6).join('\n'),
        });
      } catch {}
    }
  }

  /**
   * SO89676 EMERGENCY RASTER FALLBACK: when the preferred vector embed pipeline
   * (preserved-original / SVG-recolor → convertSVGToPDF → embedPdf → drawPage)
   * throws TWICE for the same element, page 1 (and the matching garment-colour
   * page) end up with NOTHING drawn — the customer ships a blank artwork page.
   *
   * This fallback rasterizes the source PDF via Ghostscript `pngalpha` and
   * embeds the result through the existing raster path. Quality is lower than
   * the vector path but it guarantees the artwork appears on the page instead
   * of silently shipping blank. Per user preference NO customer-facing warning
   * is added (would tempt re-add → duplicate orders) — production receives
   * artwork; the incident is recorded server-side in deployment logs AND
   * crash_logs for monitoring.
   */
  private async embedSourceAsRasterFallback(
    pdfDoc: any,
    page1: any | null,
    page2: any | null,
    logo: any,
    element: any,
    templateSize: any
  ): Promise<boolean> {
    // Embed a PNG already sitting in uploads/ via the raster path. Returns true
    // only if embedRasterImage actually incremented the success counter. Uses a
    // shallow clone so we never mutate the shared logo record (the element loop
    // still needs the original filename for the next placement).
    const tryEmbedExistingPng = async (pngBasename: string, tier: string): Promise<boolean> => {
      try {
        const logoForRaster = {
          ...logo,
          filename: pngBasename,
          mimeType: 'image/png',
          originalFilename: undefined, // force embedRasterImage to read the PNG path directly
        };
        const beforeCount = (pdfDoc as any).__embedSuccessCount || 0;
        await this.embedRasterImage(pdfDoc, page1, page2, logoForRaster, element, templateSize);
        const afterCount = (pdfDoc as any).__embedSuccessCount || 0;
        if (afterCount > beforeCount) {
          console.log(`✅ RASTER FALLBACK SUCCEEDED (${tier}) for logo=${logo?.filename || '?'} on ${page1 ? 'page1' : 'page2'}`);
          return true;
        }
        console.error(`❌❌❌ RASTER FALLBACK (${tier}): embedRasterImage did not increment success counter for ${logo?.filename || '?'}`);
        return false;
      } catch (e: any) {
        console.error(`❌❌❌ RASTER FALLBACK (${tier}) THREW: ${e?.message || e}`);
        return false;
      }
    };

    // ── TIER 1: rasterize the source PDF via Ghostscript (highest fidelity) ──
    try {
      const originalPdfPath = logo.originalFilename
        ? path.join(process.cwd(), 'uploads', logo.originalFilename)
        : null;
      const logoSvgPath = logo.filename
        ? path.join(process.cwd(), 'uploads', logo.filename)
        : null;

      // Prefer rasterizing the source PDF (highest fidelity); fall back to the
      // SVG-named slot only when it is actually a PDF.
      let sourcePath: string | null = null;
      if (originalPdfPath && fs.existsSync(originalPdfPath) && originalPdfPath.toLowerCase().endsWith('.pdf')) {
        sourcePath = originalPdfPath;
      } else if (logoSvgPath && fs.existsSync(logoSvgPath) && logoSvgPath.toLowerCase().endsWith('.pdf')) {
        sourcePath = logoSvgPath;
      }

      if (sourcePath) {
        // Per-pdfDoc cache so imposition (20-40 copies of same logo) only rasterizes once.
        type RasterCache = Map<string, string | null>;
        const cache: RasterCache = ((pdfDoc as any).__rasterFallbackCache ||= new Map());
        let pngPath = cache.get(sourcePath) ?? null;
        if (pngPath === null && !cache.has(sourcePath)) {
          const tmp = path.join(process.cwd(), 'uploads', `embed_fallback_${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 8)}.png`);
          // Target ~150 DPI — high enough for production print on garment-size elements,
          // low enough to keep memory bounded for A3 source PDFs.
          // -dFirstPage/-dLastPage pin to page 1 so multi-page source PDFs (e.g. reorder
          // exports with metadata/screenshot pages) don't emit numbered files and leave
          // `tmp` missing — fallback would then false-fail and we'd ship blank.
          let gsOk = true;
          try {
            execSync(
              `gs -o "${tmp}" -sDEVICE=pngalpha -r150 -dFirstPage=1 -dLastPage=1 -dNOPAUSE -dBATCH -dQUIET "${sourcePath}"`,
              { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }
            );
          } catch (gsErr: any) {
            // A malformed customer PDF makes gs bail ("Unrecoverable error") — don't
            // give up, fall through to the pre-generated PNG tier below. Do NOT cache
            // the failure: a transient GS flake on the first placement would otherwise
            // poison every subsequent imposition tile with the same source.
            console.error(`❌❌❌ RASTER FALLBACK: gs pngalpha failed for ${sourcePath}: ${gsErr?.message || gsErr} — trying pre-generated PNG next`);
            gsOk = false;
          }
          if (gsOk) {
            if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 100) {
              console.error(`❌❌❌ RASTER FALLBACK: gs produced empty/missing PNG at ${tmp} — trying pre-generated PNG next`);
            } else {
              pngPath = tmp;
              cache.set(sourcePath, pngPath);
              console.log(`🛟 RASTER FALLBACK: rasterized ${path.basename(sourcePath)} → ${path.basename(pngPath)} (${(fs.statSync(pngPath).size / 1024).toFixed(0)} KB)`);
            }
          }
        }
        if (pngPath && await tryEmbedExistingPng(path.basename(pngPath), 'gs-source-pdf')) {
          return true;
        }
      } else {
        console.error(`❌❌❌ RASTER FALLBACK: no source PDF available for logo=${logo?.filename || '?'} — trying pre-generated PNG`);
      }
    } catch (e: any) {
      console.error(`❌❌❌ RASTER FALLBACK (gs tier) THREW: ${e?.message || e} — trying pre-generated PNG`);
    }

    // ── TIER 2: a PNG preview/canvas-fallback produced at upload time ──
    // When Ghostscript chokes on a customer's PDF (malformed PDF → "Unrecoverable
    // error") AND the processed file is an SVG (no source PDF to rasterize), every
    // tier above fails and the print page would ship BLANK — the SO90850 symptom
    // (page 1 empty, garment page showing only the backing rectangle). But upload
    // already flattened this artwork to a PNG (previewFilename / canvasFallbackFilename
    // — the very image the browser canvas renders), so embed THAT instead of leaving
    // the page empty. Lower fidelity than vector, but present beats blank
    // (user preference: silent recovery over hard failure).
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const candidates: string[] = [];
    if (logo.canvasFallbackFilename) candidates.push(logo.canvasFallbackFilename);
    if (logo.previewFilename) candidates.push(logo.previewFilename);
    const base: string = logo.filename || '';
    if (base) {
      // Naming conventions used by the upload pipeline (server/routes.ts).
      candidates.push(`${base}_canvas_fallback.png`);
      candidates.push(`${base}_preview.png`);
      if (/\.svg$/i.test(base)) {
        candidates.push(base.replace(/\.svg$/i, '-canvas-fallback.png'));
        candidates.push(base.replace(/\.svg$/i, '_preview.png'));
      }
      if (/\.(png|jpe?g)$/i.test(base)) candidates.push(base); // already a raster
    }
    const seen = new Set<string>();
    for (const rawCand of candidates) {
      // Defensive: these come from DB fields / derived names — strip any path
      // component so a join can never escape uploads/.
      const cand = rawCand ? path.basename(rawCand) : '';
      if (!cand || seen.has(cand)) continue;
      seen.add(cand);
      let exists = false;
      try {
        const p = path.join(uploadsDir, cand);
        exists = fs.existsSync(p) && fs.statSync(p).size > 100;
      } catch { exists = false; }
      if (!exists) continue;
      console.log(`🛟 RASTER FALLBACK: using pre-generated PNG "${cand}" for logo=${logo?.filename || '?'}`);
      if (await tryEmbedExistingPng(cand, 'pre-generated-png')) {
        return true;
      }
    }

    console.error(`❌❌❌ RASTER FALLBACK: exhausted all tiers (gs source PDF + pre-generated PNG) for logo=${logo?.filename || '?'} — page WILL be blank`);
    return false;
  }

  /**
   * SO89676 RETRY+FALLBACK WRAPPER for page-2 / garment-colour embeds. Mirrors
   * the inline page-1 logic so a garment-colour page can't ship blank when
   * the vector embed pipeline throws. Updates `skippedElements` so the
   * post-loop EMBED INCOMPLETE check and crash_logs forensics capture page-2
   * failures the same way they capture page-1 ones.
   */
  private async embedWithRetryAndFallback(
    pdfDoc: any,
    page1: any | null,
    page2: any | null,
    logo: any,
    element: any,
    templateSize: any,
    elementIndex: number,
    skippedElements: Array<{ i: number; reason: string; logoId: string }>,
    pageLabel: string
  ): Promise<boolean> {
    const beforeCount = (pdfDoc as any).__embedSuccessCount || 0;
    await this.embedLogoInPages(pdfDoc, page1, page2, logo, element, templateSize);
    let afterCount = (pdfDoc as any).__embedSuccessCount || 0;
    if (afterCount > beforeCount) return true;

    console.error(`⚠️⚠️⚠️ SILENT EMBED FAILURE on ${pageLabel} for element ${elementIndex} (logo=${logo?.filename}) — retrying once`);
    await this.embedLogoInPages(pdfDoc, page1, page2, logo, element, templateSize);
    afterCount = (pdfDoc as any).__embedSuccessCount || 0;
    if (afterCount > beforeCount) {
      console.log(`✅ RETRY SUCCEEDED: element ${elementIndex} embedded on ${pageLabel} (second attempt)`);
      return true;
    }

    console.error(`❌❌❌ EMBED FAILED AFTER RETRY on ${pageLabel}: element ${elementIndex}, logo=${logo?.filename} — attempting raster fallback`);
    const fallbackOk = await this.embedSourceAsRasterFallback(pdfDoc, page1, page2, logo, element, templateSize);
    afterCount = (pdfDoc as any).__embedSuccessCount || 0;
    if (fallbackOk && afterCount > beforeCount) {
      console.log(`🛟 RASTER FALLBACK RESCUED: element ${elementIndex} embedded as raster on ${pageLabel}`);
      return true;
    }
    console.error(`❌❌❌ RASTER FALLBACK ALSO FAILED on ${pageLabel}: element ${elementIndex} WILL BE MISSING`);
    skippedElements.push({ i: elementIndex, reason: `${pageLabel}-embed-and-fallback-failed`, logoId: (element as any)?.logoId || '<none>' });
    return false;
  }

  /**
   * Embed a raster image (PNG/JPG) directly into the PDF pages
   * Uses pdf-lib's embedPng/embedJpg for proper raster image handling
   */
  private async embedRasterImage(
    pdfDoc: any,
    page1: any | null,
    page2: any | null,
    logo: any,
    element: any,
    templateSize: any
  ): Promise<void> {
    const MM_TO_POINTS = 2.834645669;
    const { degrees } = await import('pdf-lib');
    
    // Find the raster image file
    let imagePath = path.join(process.cwd(), 'uploads', logo.filename);
    
    // Also check for original file if the processed one doesn't exist
    if (!fs.existsSync(imagePath) && logo.originalFilename) {
      imagePath = path.join(process.cwd(), 'uploads', logo.originalFilename);
    }
    
    if (!fs.existsSync(imagePath)) {
      console.warn(`⚠️ Raster image file not found: ${imagePath}`);
      return;
    }
    
    console.log(`🖼️ Embedding raster image: ${path.basename(imagePath)}`);
    
    // Check for ink color recoloring (single colour templates)
    const colorOverrides = element.colorOverrides as any;
    let recoloredImagePath: string | null = null;
    
    if (colorOverrides && colorOverrides.inkColor) {
      console.log(`🎨 Ink color override detected for raster image: ${colorOverrides.inkColor}`);
      try {
        const timestamp = Date.now();
        recoloredImagePath = path.join(process.cwd(), 'uploads', `recolored_${timestamp}.png`);
        const inkColor = colorOverrides.inkColor;
        
        // Validate ink color format to prevent command injection
        if (!/^#?[0-9a-fA-F]{3,8}$/.test(inkColor) && !/^[a-zA-Z]{1,30}$/.test(inkColor)) {
          throw new Error(`Invalid ink color format: ${inkColor}`);
        }
        // Recolor all visible/opaque pixels to the ink color while preserving transparency
        const isJpeg = imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg');
        if (isJpeg) {
          await execAsync(
            `convert "${imagePath}" -grayscale Rec709Luminance -fill "${inkColor}" -colorize 100 "${recoloredImagePath}"`,
            { timeout: 30000, maxBuffer: 1024 * 1024 }
          );
        } else {
          // Check if PNG has meaningful alpha (transparency)
          let hasAlpha = false;
          try {
            const { stdout: alphaStdout } = await execAsync(`identify -format "%A" "${imagePath}" 2>/dev/null || echo "False"`, { timeout: 10000, maxBuffer: 64 * 1024 });
            const alphaCheck = alphaStdout.trim();
            hasAlpha = alphaCheck === 'True' || alphaCheck === 'Blend';
            if (hasAlpha) {
              const { stdout: meanStdout } = await execAsync(`convert "${imagePath}" -alpha extract -format "%[fx:mean]" info: 2>/dev/null || echo "1"`, { timeout: 10000, maxBuffer: 64 * 1024 });
              const alphaVal = parseFloat(meanStdout.trim());
              if (!isNaN(alphaVal) && alphaVal > 0.99) {
                hasAlpha = false;
              }
            }
          } catch (e) { /* assume no alpha */ }
          
          if (hasAlpha) {
            // PNG with transparency: fill with ink color, preserve alpha
            await execAsync(
              `convert "${imagePath}" -alpha extract -background "${inkColor}" -alpha shape "${recoloredImagePath}"`,
              { timeout: 30000, maxBuffer: 1024 * 1024 }
            );
          } else {
            // Opaque PNG: luminance-based — create grayscale mask, apply as alpha on solid ink color
            const tmpGray = recoloredImagePath.replace('.png', '_gray.png');
            await execAsync(`convert "${imagePath}" -grayscale Rec709Luminance "${tmpGray}"`, { timeout: 30000, maxBuffer: 1024 * 1024 });
            const { stdout: dimsStdout } = await execAsync(`identify -format "%wx%h" "${imagePath}" 2>/dev/null`, { timeout: 10000, maxBuffer: 64 * 1024 });
            const dims = dimsStdout.trim();
            await execAsync(`convert -size ${dims} xc:"${inkColor}" "${tmpGray}" -alpha off -compose CopyOpacity -composite "${recoloredImagePath}"`, { timeout: 30000, maxBuffer: 1024 * 1024 });
            try { fs.unlinkSync(tmpGray); } catch(e) {}
          }
        }
        
        if (fs.existsSync(recoloredImagePath)) {
          console.log(`✅ Raster image recolored to ${inkColor}`);
          imagePath = recoloredImagePath;
        } else {
          console.warn(`⚠️ Recolored image not created, using original`);
          recoloredImagePath = null;
        }
      } catch (recolorError) {
        console.error(`❌ Failed to recolor raster image:`, recolorError);
        recoloredImagePath = null;
      }
    }
    
    // Read image bytes
    const imageBytes = fs.readFileSync(imagePath);
    
    // Determine image type and embed accordingly
    const filename = (logo.filename || logo.originalFilename || '').toLowerCase();
    const mimeType = (logo.mimeType || logo.originalMimeType || '').toLowerCase();
    let embeddedImage: any;
    
    try {
      if (recoloredImagePath) {
        // Recolored images are always PNG
        embeddedImage = await pdfDoc.embedPng(imageBytes);
        console.log(`📸 Embedded recolored PNG image: ${embeddedImage.width}×${embeddedImage.height}px`);
      } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
        console.log(`📸 Embedded JPEG image: ${embeddedImage.width}×${embeddedImage.height}px`);
      } else {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
        console.log(`📸 Embedded PNG image: ${embeddedImage.width}×${embeddedImage.height}px`);
      }
    } catch (embedError) {
      console.error(`❌ Failed to embed image:`, embedError);
      // Clean up temp recolored file
      if (recoloredImagePath && fs.existsSync(recoloredImagePath)) {
        try { fs.unlinkSync(recoloredImagePath); } catch (e) {}
      }
      return;
    }
    
    // Calculate positioning using the same logic as vector logos
    const contentWidthMM = element.width;
    const contentHeightMM = element.height;
    const contentWidthPts = contentWidthMM * MM_TO_POINTS;
    const contentHeightPts = contentHeightMM * MM_TO_POINTS;
    
    // Template center in PDF coordinates
    const templateCenterXPts = (templateSize?.width || 297) / 2 * MM_TO_POINTS;
    const templateCenterYPts = (templateSize?.height || 420) / 2 * MM_TO_POINTS;
    
    // Target visual center
    const targetCenterX = templateCenterXPts + element.x * MM_TO_POINTS;
    const targetCenterY = templateCenterYPts - element.y * MM_TO_POINTS;
    
    let drawX: number;
    let drawY: number;
    
    if (element.rotation === 90) {
      drawX = targetCenterX + contentHeightPts / 2;
      drawY = targetCenterY - contentWidthPts / 2;
    } else if (element.rotation === 180) {
      drawX = targetCenterX + contentWidthPts / 2;
      drawY = targetCenterY + contentHeightPts / 2;
    } else if (element.rotation === 270) {
      drawX = targetCenterX - contentHeightPts / 2;
      drawY = targetCenterY + contentWidthPts / 2;
    } else {
      drawX = targetCenterX - contentWidthPts / 2;
      drawY = targetCenterY - contentHeightPts / 2;
    }
    
    const drawOptions = {
      x: drawX,
      y: drawY,
      width: contentWidthPts,
      height: contentHeightPts,
      rotate: element.rotation ? degrees(element.rotation) : undefined,
    };
    
    console.log(`📍 RASTER POSITION: (${drawX.toFixed(1)}, ${drawY.toFixed(1)}) Size=${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts, Rotation=${element.rotation || 0}°`);
    
    if (page1) {
      page1.drawImage(embeddedImage, drawOptions);
      console.log(`✅ Raster image drawn on page 1`);
    }
    if (page2) {
      page2.drawImage(embeddedImage, drawOptions);
      console.log(`✅ Raster image drawn on page 2`);
    }
    // SO89550 INSTRUMENTATION: bump shared success counter so the outer loop's
    // silent-failure detector also accounts for raster (PNG/JPG) elements that took
    // the embedRasterImage early-return branch in embedLogoInPages.
    if (page1 || page2) {
      (pdfDoc as any).__embedSuccessCount = ((pdfDoc as any).__embedSuccessCount || 0) + 1;
    }
    
    // Clean up temporary recolored file
    if (recoloredImagePath && fs.existsSync(recoloredImagePath)) {
      try { fs.unlinkSync(recoloredImagePath); } catch (e) {}
    }
    
    console.log(`✅ Raster image embedded successfully`);
  }
  
  /**
   * Crop PDF to content bounds using Ghostscript
   * This physically resizes the PDF page to content dimensions while preserving CMYK colors
   * Uses -dFIXEDMEDIA with device dimensions and BeginPage translate to shift content to origin
   */
  private async cropPdfToContentBounds(
    pdfPath: string, 
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number }
  ): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const croppedPath = path.join(process.cwd(), 'uploads', `cropped_${timestamp}.pdf`);
      
      // Calculate content dimensions
      const contentWidth = bounds.width || (bounds.xMax - bounds.xMin);
      const contentHeight = bounds.height || (bounds.yMax - bounds.yMin);
      
      // Calculate translation to move content to origin (negative of min bounds)
      const translateX = -bounds.xMin;
      const translateY = -bounds.yMin;
      
      console.log(`🔪 Resizing PDF page to content bounds`);
      console.log(`📐 Content size: ${contentWidth.toFixed(2)}×${contentHeight.toFixed(2)}pts`);
      console.log(`📍 Translating content by: (${translateX.toFixed(2)}, ${translateY.toFixed(2)})pts`);
      
      // Use Ghostscript to:
      // 1. Set fixed media size to content dimensions (-dFIXEDMEDIA -dDEVICEWIDTHPOINTS -dDEVICEHEIGHTPOINTS)
      // 2. Translate content to origin using BeginPage procedure
      // 3. Preserve CMYK colors (-dColorConversionStrategy=/LeaveColorUnchanged)
      const gsCmd = `gs -o "${croppedPath}" -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dSAFER ` +
        `-dAutoRotatePages=/None ` +
        `-dColorConversionStrategy=/LeaveColorUnchanged ` +
        `-dPreserveColorProfiles=true ` +
        `-dFIXEDMEDIA ` +
        `-dDEVICEWIDTHPOINTS=${contentWidth.toFixed(2)} ` +
        `-dDEVICEHEIGHTPOINTS=${contentHeight.toFixed(2)} ` +
        `-c "<</BeginPage{${translateX.toFixed(2)} ${translateY.toFixed(2)} translate}>> setpagedevice" ` +
        `-f "${pdfPath}"`;
      
      console.log(`🔧 Ghostscript command: ${gsCmd.substring(0, 200)}...`);
      
      await execAsync(gsCmd);
      
      if (fs.existsSync(croppedPath)) {
        const stats = fs.statSync(croppedPath);
        console.log(`✅ PDF resized successfully: ${stats.size} bytes`);
        
        // Verify the cropped PDF has the correct dimensions
        try {
          const { PDFDocument } = await import('pdf-lib');
          const croppedBytes = fs.readFileSync(croppedPath);
          const croppedDoc = await PDFDocument.load(croppedBytes);
          const [page] = croppedDoc.getPages();
          const { width, height } = page.getSize();
          console.log(`📐 Resized PDF page size: ${width.toFixed(1)}×${height.toFixed(1)}pts`);
          
          // Check if resizing worked - page should match content size
          const widthDiff = Math.abs(width - contentWidth);
          const heightDiff = Math.abs(height - contentHeight);
          
          if (widthDiff < 2 && heightDiff < 2) {
            console.log(`✅ Resized PDF dimensions match content size exactly!`);
          } else {
            console.log(`⚠️ Resized PDF size differs: got ${width.toFixed(1)}×${height.toFixed(1)}, expected ${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)}`);
          }
        } catch (verifyError) {
          console.log(`⚠️ Could not verify resized PDF dimensions: ${verifyError}`);
        }
        
        return croppedPath;
      }
      
      console.log(`⚠️ Resized PDF not created`);
      return null;
    } catch (error) {
      console.error(`❌ PDF resizing failed:`, error);
      return null;
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
      let svgContent: string;
      try {
        svgContent = fs.readFileSync(svgPath, 'utf8');
        isCMYKPreservedSVG = svgContent.includes('data-vectorized-cmyk="true"') || svgContent.includes('CMYK_PDF_CONVERTED');
      } catch (e) {
        // Continue with default conversion
        svgContent = '';
      }
      
      // Fix viewBox offset issue for tight content SVGs before PDF conversion
      // This ensures the PDF content starts at 0,0 instead of offset coordinates
      let processedSvgPath = svgPath;
      console.log(`🔍 DEBUG: Checking SVG content for tight content marker...`);
      console.log(`🔍 DEBUG: SVG content length: ${svgContent.length}`);
      console.log(`🔍 DEBUG: Contains data-content-extracted: ${svgContent.includes('data-content-extracted="true"')}`);
      console.log(`🔍 DEBUG: SVG path: ${svgPath}`);
      
      if (svgContent.includes('data-content-extracted="true"')) {
        console.log(`🔧 Fixing viewBox offset for tight content SVG before PDF conversion`);
        
        // NO SCALING - just fix the viewBox offset without any scaling
        console.log(`✅ NO SCALING: Using viewBox offset fix only - preserving original dimensions`);
        let fixedSvgContent = this.fixSVGViewBoxOffset(svgContent);
        
        if (fixedSvgContent !== svgContent) {
          // Create temporary fixed SVG file
          const fixedSvgPath = svgPath.replace('.svg', '_viewbox_fixed.svg');
          fs.writeFileSync(fixedSvgPath, fixedSvgContent);
          processedSvgPath = fixedSvgPath;
          console.log(`💾 Saved viewBox-fixed SVG: ${path.basename(fixedSvgPath)}`);
        } else {
          console.log(`⚠️ No changes needed for SVG viewBox`);
        }
      } else {
        console.log(`ℹ️ Not a tight content SVG, using original file`);
      }
      
      // Use Inkscape with optimal vector preservation settings
      const inkscapeCmd = `inkscape --export-type=pdf --export-pdf-version=1.4 --export-text-to-path --export-dpi=300 --export-area-page --export-filename="${pdfPath}" "${processedSvgPath}"`;
      try {
        await execAsync(inkscapeCmd);
        console.log(`✅ Inkscape conversion successful with vector preservation for ${isCMYKPreservedSVG ? 'CMYK-preserved' : 'standard'} SVG`);
      } catch (inkscapeError) {
        console.warn('Inkscape failed, falling back to rsvg-convert');
        // Fallback to rsvg-convert
        const rsvgCmd = `rsvg-convert --format=pdf --keep-aspect-ratio --output="${pdfPath}" "${processedSvgPath}"`;
        await execAsync(rsvgCmd);
        console.log(`✅ rsvg-convert fallback successful for ${isCMYKPreservedSVG ? 'CMYK-preserved' : 'standard'} SVG`);
      }
      
      // Clean up temporary fixed SVG file if created
      if (processedSvgPath !== svgPath && fs.existsSync(processedSvgPath)) {
        fs.unlinkSync(processedSvgPath);
        console.log(`🧹 Cleaned up temporary viewBox-fixed SVG`);
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
      const garmentText = data.garmentColor ? `Garment Color: ${garmentColorRef(data.garmentColor)}` : '';
      
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
      
      // Check if PDF already has CMYK colors - if so, preserve them
      console.log(`🎨 CHECKING EXISTING COLOR SPACE: Analyzing PDF for CMYK content`);
      const colorCheckCmd = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-sDEVICE=inkcov',
        `"${tempPath}"`
      ].join(' ');
      
      let hasCMYK = false;
      try {
        const { stdout: colorOutput } = await execAsync(colorCheckCmd);
        // If we get ink coverage values, PDF has CMYK colors
        hasCMYK = /\b0\.\d+\s+0\.\d+\s+0\.\d+\s+0\.\d+/.test(colorOutput);
        console.log(`🔍 CMYK CHECK RESULT: ${hasCMYK ? 'CMYK colors detected - will preserve' : 'No CMYK colors - will convert'}`);
        if (hasCMYK) {
          console.log(`📊 Ink coverage found: ${colorOutput.split('\n').find(line => /\b0\.\d+\s+0\.\d+\s+0\.\d+\s+0\.\d+/.test(line))}`);
        }
      } catch (error) {
        console.log(`⚠️ Could not check CMYK status, defaulting to conversion:`, error);
      }
      
      let gsCmd: string;
      
      if (hasCMYK) {
        console.log(`🎨 CMYK PRESERVATION: Original CMYK colors detected - using preservation mode`);
        // Preserve existing CMYK colors, only convert RGB elements
        gsCmd = [
          'gs',
          '-dNOPAUSE',
          '-dBATCH',
          '-dSAFER',
          '-sDEVICE=pdfwrite',
          '-dPreserveDeviceN=true',
          '-dPreserveSeparation=true',
          '-dPreserveSpotColor=true',
          '-dColorConversionStrategy=/LeaveColorUnchanged',
          '-dAutoFilterColorImages=false',
          '-dAutoFilterGrayImages=false', 
          '-dDownsampleColorImages=false',
          '-dDownsampleGrayImages=false',
          '-dPDFSETTINGS=/prepress',
          `-sOutputFile="${cmykPath}"`,
          `"${tempPath}"`
        ].join(' ');
      } else {
        console.log(`🎯 RGB TO CMYK CONVERSION: No CMYK detected - converting RGB to CMYK`);
        // Convert RGB to CMYK for RGB-only content
        gsCmd = [
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
      }
      
      console.log(`🎨 COLOR PROCESSING: Using ${hasCMYK ? 'preservation' : 'conversion'} approach`);
      
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

  /**
   * Fix viewBox offset issue and scale to canvas target dimensions
   */
  private fixSVGViewBoxOffsetWithScaling(svgContent: string, targetDimensions: any): string {
    try {
      const MM_TO_POINTS = 2.834645669;
      const targetWidthPts = targetDimensions.widthPts;
      const targetHeightPts = targetDimensions.heightPts;
      
      console.log(`🔧 RobustPDF: Scaling SVG to canvas target dimensions: ${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts`);
      
      // Extract viewBox values
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
      if (!viewBoxMatch) {
        console.log(`🔧 RobustPDF: No viewBox found, creating new one with target dimensions`);
        // Add viewBox with target dimensions
        const newViewBox = `viewBox="0 0 ${targetWidthPts} ${targetHeightPts}"`;
        return svgContent.replace('<svg', `<svg ${newViewBox}`);
      }
      
      const viewBoxValues = viewBoxMatch[1].split(/\s+/).map(Number);
      if (viewBoxValues.length !== 4) {
        console.log(`🔧 RobustPDF: Invalid viewBox format, using target dimensions`);
        const newViewBox = `0 0 ${targetWidthPts} ${targetHeightPts}`;
        return svgContent.replace(/viewBox="[^"]+"/, `viewBox="${newViewBox}"`);
      }
      
      const [x, y, width, height] = viewBoxValues;
      
      // Calculate scaling factors to match canvas element dimensions
      const scaleX = targetWidthPts / width;
      const scaleY = targetHeightPts / height;
      
      console.log(`🔧 RobustPDF: Original: ${width}×${height}pts, Target: ${targetWidthPts.toFixed(1)}×${targetHeightPts.toFixed(1)}pts, Scale: ${scaleX.toFixed(3)}×${scaleY.toFixed(3)}`);
      
      // Create new viewBox with target dimensions
      const newViewBox = `0 0 ${targetWidthPts} ${targetHeightPts}`;
      let fixedSvg = svgContent.replace(/viewBox="[^"]+"/, `viewBox="${newViewBox}"`);
      
      // Scale and shift all path coordinates
      fixedSvg = fixedSvg.replace(/d="([^"]+)"/g, (match: string, pathData: string) => {
        const adjustedPath = pathData.replace(/([ML])\s*([\d.-]+)\s+([\d.-]+)/g, (coord: string, command: string, xVal: string, yVal: string) => {
          const adjustedX = (parseFloat(xVal) - x) * scaleX;
          const adjustedY = (parseFloat(yVal) - y) * scaleY;
          return `${command} ${adjustedX} ${adjustedY}`;
        });
        return `d="${adjustedPath}"`;
      });
      
      console.log(`🔧 RobustPDF: Successfully scaled SVG to canvas target dimensions`);
      return fixedSvg;
      
    } catch (error) {
      console.error(`🔧 RobustPDF: Error scaling SVG:`, error);
      return svgContent;
    }
  }

  /**
   * Fix viewBox offset issue in tight content SVGs
   * Converts viewBox like "58.90625 22.570312 708.6875 228.367188" to "0 0 708.6875 228.367188"
   * and adjusts all path coordinates accordingly
   */
  private fixSVGViewBoxOffset(svgContent: string): string {
    try {
      console.log(`🔧 RobustPDF: Fixing SVG viewBox offset for PDF generation`);
      
      // Extract viewBox values
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
      if (!viewBoxMatch) {
        console.log(`🔧 RobustPDF: No viewBox found, returning SVG as-is`);
        return svgContent;
      }
      
      const viewBoxValues = viewBoxMatch[1].split(/\s+/).map(Number);
      if (viewBoxValues.length !== 4) {
        console.log(`🔧 RobustPDF: Invalid viewBox format, returning SVG as-is`);
        return svgContent;
      }
      
      const [x, y, width, height] = viewBoxValues;
      
      // If already starts at 0,0, no fix needed
      if (x === 0 && y === 0) {
        console.log(`🔧 RobustPDF: ViewBox already starts at 0,0, no fix needed`);
        return svgContent;
      }
      
      console.log(`🔧 RobustPDF: Fixing viewBox offset from ${x},${y} to 0,0 (size: ${width}x${height})`);
      
      // Create new viewBox starting at 0,0
      const newViewBox = `0 0 ${width} ${height}`;
      
      // Replace the viewBox
      let fixedSvg = svgContent.replace(/viewBox="[^"]+"/, `viewBox="${newViewBox}"`);
      
      // Shift all path coordinates by the offset amounts
      // This moves the content to start at 0,0 in the new coordinate system
      fixedSvg = fixedSvg.replace(/d="([^"]+)"/g, (match: string, pathData: string) => {
        // Parse and adjust path coordinates
        const adjustedPath = pathData.replace(/([ML])\s*([\d.-]+)\s+([\d.-]+)/g, (coord: string, command: string, xVal: string, yVal: string) => {
          const adjustedX = parseFloat(xVal) - x;
          const adjustedY = parseFloat(yVal) - y;
          return `${command} ${adjustedX} ${adjustedY}`;
        });
        return `d="${adjustedPath}"`;
      });
      
      console.log(`🔧 RobustPDF: Successfully fixed SVG viewBox offset - content now starts at 0,0`);
      return fixedSvg;
      
    } catch (error) {
      console.error(`🔧 RobustPDF: Error fixing SVG viewBox offset:`, error);
      return svgContent; // Return original if fix fails
    }
  }
}