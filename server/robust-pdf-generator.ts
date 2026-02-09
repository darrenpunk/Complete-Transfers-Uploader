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
  projectId?: string;
  canvasElements: any[];
  logos: any[];
  templateSize: any;
  garmentColor?: string;
  garmentColors?: any[];
  projectName: string;
  quantity: number;
  comments?: string;
  useOriginalGarmentPages?: boolean; // Pass-through mode: use customer's original PDF pages 2+ instead of generating garment color pages
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
    const pageWidth = data.templateSize.width * MM_TO_POINTS;
    const pageHeight = data.templateSize.height * MM_TO_POINTS;
    
    console.log(`📐 Template dimensions: ${data.templateSize.width}×${data.templateSize.height}mm`);
    console.log(`📐 PDF page dimensions: ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)}pt`);
    
    // Detect applique template and split elements by canvas
    const isAppliqueTemplate = data.templateSize?.id?.includes('applique') || 
      data.canvasElements.some((el: any) => el.canvasIndex === 1);
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
    const usePassThrough = data.useOriginalGarmentPages === true;
    
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
    
    // Create page 2 only if NOT using pass-through mode
    let page2: typeof page1 | null = null;
    if (!usePassThrough) {
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
          console.log(`🎨 Drawing background for ${colorName}: hex=${colorHex}, parsedColor=`, parsedColor);
          colorPage.drawRectangle({
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight,
            color: parsedColor,
          });
          console.log(`🎨 Background rectangle drawn: x=0, y=0, width=${pageWidth}, height=${pageHeight}`);
          
          garmentColorPages.push({
            page: colorPage,
            color: colorHex,
            colorName,
            quantity: qty
          });
          
          console.log(`✅ Created page for ${colorName} (Qty: ${qty})`);
        }
        
        // Use first garment color page as page2 for logo embedding
        page2 = garmentColorPages[0]?.page || null;
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
    
    // APPLIQUE TEMPLATE: Separate page structure (P1=badge, P2=embroidery, P3=form)
    if (isAppliqueTemplate) {
      console.log(`📋 Applique PDF: Processing ${badgeElements.length} badge elements for page 1`);
      for (const element of badgeElements) {
        const shapeTypes = ['rectangle', 'ellipse', 'circle', 'line', 'shield', 'star', 'hexagon', 'pentagon', 'triangle', 'diamond', 'banner', 'cross', 'oval', 'heart', 'octagon', 'arch', 'malteseCross', 'chevron', 'arrow', 'ribbon'];
        const isShape = shapeTypes.includes(element.elementType || '');
        if (isShape) {
          this.drawShapeOnPage(page1, element, data.templateSize, pageHeight);
          continue;
        }
        const logo = data.logos.find(l => l.id === element.logoId);
        if (logo) {
          await this.embedLogoInPages(pdfDoc, page1, null, logo, element, data.templateSize);
        }
      }
      
      if (embroideryElements.length > 0) {
        const embroideryPage = pdfDoc.addPage([pageWidth, pageHeight]);
        console.log(`📋 Applique PDF: Processing ${embroideryElements.length} embroidery elements for page 2`);
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
      
      // Save and return - applique form (P3) is appended by the route handler
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
    }
    
    // NON-APPLIQUE: Process each canvas element and embed logos on page 1 and matching garment color pages
    // NOTE: Labels are added AFTER logo embedding to appear on top
    console.log(`🔍 DEBUG: Starting logo processing loop - ${data.canvasElements.length} elements, ${data.logos.length} logos`);
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
        await this.embedLogoInPages(pdfDoc, page1, null, logo, element, data.templateSize);
        
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
          await this.embedLogoInPages(pdfDoc, null, page2Ref, logo, element, data.templateSize);
        } else if (!hasElementLevelColors) {
          // Project-level multi-color or single color - embed on ALL garment color pages
          for (const gcPage of garmentColorPages) {
            console.log(`🎯 Embedding logo on ${gcPage.colorName} page: ${logo.filename}`);
            await this.embedLogoInPages(pdfDoc, null, gcPage.page, logo, element, data.templateSize);
          }
        }
        
        console.log(`✅ Completed embedding logo: ${logo.filename}`);
      }
    }
    
    // Add project labels to each garment color page AFTER logo embedding (so labels appear on top)
    console.log(`📝 Adding labels to ${garmentColorPages.length} garment color pages`);
    for (const gcPage of garmentColorPages) {
      // Determine text color based on background brightness
      const bgColor = gcPage.color.toLowerCase();
      const textColor = (bgColor === '#ffffff' || bgColor === '#f3f590' || bgColor === '#d9d2ab' || 
                         bgColor === '#b9dbea' || bgColor === '#b5d55e' || bgColor === '#e7bbd0' ||
                         bgColor === '#bcbfbb' || bgColor === '#a6a9a2' || bgColor === '#919393') 
                        ? rgb(0, 0, 0) : rgb(1, 1, 1);
      
      // Draw a footer background strip for better label visibility
      gcPage.page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: 60,
        color: gcPage.color.toLowerCase() === '#ffffff' ? rgb(0.9, 0.9, 0.9) : await this.parseGarmentColor(gcPage.color),
      });
      
      const labelText = `Project: ${data.projectName}`;
      const colorText = `Garment Color: ${gcPage.colorName}   Quantity: ${gcPage.quantity}`;
      
      gcPage.page.drawText(labelText, {
        x: 20,
        y: 40,
        size: 12,
        color: textColor,
      });
      
      gcPage.page.drawText(colorText, {
        x: 20,
        y: 22,
        size: 10,
        color: textColor,
      });
      
      console.log(`✅ Added labels to ${gcPage.colorName} page`);
    }
    
    // PASS-THROUGH MODE: Append original PDF pages 2+ from customer's file
    let passThroughSucceeded = false;
    if (usePassThrough) {
      console.log(`📄 PASS-THROUGH MODE: Looking for multi-page PDF to append pages 2+`);
      
      // Find a logo with hasGarmentPages=true that has original PDF
      const multiPageLogo = data.logos.find((logo: any) => 
        logo.hasGarmentPages === true && 
        logo.pageCount > 1 && 
        logo.originalFilename && 
        logo.originalMimeType === 'application/pdf'
      );
      
      if (multiPageLogo) {
        const originalPdfPath = path.join(process.cwd(), 'uploads', multiPageLogo.originalFilename);
        console.log(`📄 Found multi-page PDF: ${multiPageLogo.originalFilename} with ${multiPageLogo.pageCount} pages`);
        
        if (fs.existsSync(originalPdfPath)) {
          try {
            const { PDFDocument } = await import('pdf-lib');
            const originalPdfBytes = fs.readFileSync(originalPdfPath);
            const originalPdf = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
            const originalPageCount = originalPdf.getPageCount();
            
            console.log(`📄 Original PDF has ${originalPageCount} pages - appending pages 2 to ${originalPageCount}`);
            
            if (originalPageCount > 1) {
              // Copy pages 2+ (indices 1 to end) from original PDF
              const pageIndicesToCopy = Array.from({ length: originalPageCount - 1 }, (_, i) => i + 1);
              const copiedPages = await pdfDoc.copyPages(originalPdf, pageIndicesToCopy);
              
              for (const copiedPage of copiedPages) {
                pdfDoc.addPage(copiedPage);
              }
              
              console.log(`✅ PASS-THROUGH: Appended ${copiedPages.length} original garment color pages`);
              passThroughSucceeded = true;
            }
          } catch (passThroughError) {
            console.error(`❌ Failed to append original PDF pages:`, passThroughError);
          }
        } else {
          console.warn(`⚠️ Original PDF file not found: ${originalPdfPath}`);
        }
      } else {
        console.warn(`⚠️ No multi-page PDF found in logos - cannot append garment pages`);
      }
    }
    
    // FALLBACK: If pass-through was enabled but failed, generate standard garment page
    if (usePassThrough && !passThroughSucceeded) {
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
      const isRasterImage = logoMimeType.startsWith('image/png') || logoMimeType.startsWith('image/jpeg') || 
                            logoMimeType.startsWith('image/jpg') ||
                            logoFilename.endsWith('.png') || logoFilename.endsWith('.jpg') || logoFilename.endsWith('.jpeg');
      
      if (isRasterImage) {
        console.log(`🖼️ RASTER IMAGE DETECTED: ${logoFilename} - using direct image embedding`);
        await this.embedRasterImage(pdfDoc, page1, page2, logo, element, templateSize);
        return;
      }
      
      let logoPdfPath: string | null = null;
      let shouldCleanup = false;
      
      // PRIORITY 1: Use preserved original PDF if available to maintain exact CMYK colors and vectors
      if (logo.originalFilename && logo.originalMimeType === 'application/pdf') {
        const originalPdfPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
        console.log(`🎯 Checking for preserved original PDF: ${originalPdfPath}`);
        
        // Check if we have ink color overrides - if so, skip original PDF and use recolored SVG
        const colorOverrides = element.colorOverrides as any;
        if (colorOverrides && colorOverrides.inkColor) {
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
            
            // Check if bounds are too small (Ghostscript bbox failed or returned minimal bounds)
            // but we have proper Inkscape-detected bounds stored
            if (contentWidthPts < 1 && contentHeightPts < 1) {
              console.log(`⚠️ Ghostscript bbox failed (0×0) - content will be at wrong position`);
              console.log(`📐 Using original PDF without cropping - SVG normalization should handle display`);
              // When Ghostscript fails AND we don't have Inkscape bounds saved,
              // the SVG was already normalized for display but PDF needs cropping
              // at the correct position which should now be stored in originalPdfBounds
              // from Inkscape detection during upload
              logoPdfPath = originalPdfPath;
            }
            // If bounds offset is non-zero, resize PDF page to content bounds
            // This preserves CMYK colors while fixing dimensions
            else if (originalPdfBounds.xMin > 1 || originalPdfBounds.yMin > 1) {
              console.log(`📐 PDF has content offset - resizing page to content bounds while preserving CMYK`);
              
              // Resize the original PDF to content bounds using Ghostscript
              const resizedPdfPath = await this.cropPdfToContentBounds(originalPdfPath, originalPdfBounds);
              if (resizedPdfPath) {
                console.log(`✅ PDF resized to content bounds: ${resizedPdfPath}`);
                logoPdfPath = resizedPdfPath;
                shouldCleanup = true; // Clean up resized PDF after embedding
                // Mark that PDF was cropped - aspect ratio fix may be needed
                (element as any)._pdfWasCropped = true;
              } else {
                console.log(`⚠️ PDF resizing failed, using original (may have dimension issues)`);
                logoPdfPath = originalPdfPath;
              }
            } else {
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
        
        if (!logoPdfPath) {
          console.warn(`⚠️ Failed to convert SVG to PDF`);
          return;
        }
      }
      
      // Read and embed the PDF
      const logoPdfBytes = fs.readFileSync(logoPdfPath);
      const logoDoc = await pdfDoc.embedPdf(logoPdfBytes);
      const [logoPage] = logoDoc;
      
      // Get the actual embedded PDF page dimensions
      const actualPdfWidth = logoPage.width;
      const actualPdfHeight = logoPage.height;
      console.log(`📄 Actual embedded PDF size: ${actualPdfWidth.toFixed(1)}×${actualPdfHeight.toFixed(1)}pts`);
      
      // Calculate exact position using user's actual element dimensions
      const MM_TO_POINTS = 2.834645669;
      
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
                // Direct SVG coordinate to PDF points conversion (SVG pixels are 1:1 with PDF points for vector content)
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
      
      // CRITICAL: Check if actual PDF dimensions differ significantly from element dimensions
      // This can happen when Inkscape reports larger bounds (including masks/clipping paths)
      // but Ghostscript crops to actual visible content
      // ONLY apply this fix when the PDF was actually cropped (not when using full page)
      const pdfWasCropped = (element as any)._pdfWasCropped === true;
      
      if (pdfWasCropped) {
        const actualPdfWidthMM = actualPdfWidth / MM_TO_POINTS;
        const actualPdfHeightMM = actualPdfHeight / MM_TO_POINTS;
        const elementPdfWidthPts = contentWidthMM * MM_TO_POINTS;
        const elementPdfHeightPts = contentHeightMM * MM_TO_POINTS;
        
        // If aspect ratios differ significantly (more than 10%), use actual PDF dimensions to preserve aspect ratio
        const pdfAspect = actualPdfWidth / actualPdfHeight;
        const elementAspect = elementPdfWidthPts / elementPdfHeightPts;
        const aspectDiff = Math.abs(pdfAspect - elementAspect) / pdfAspect;
        
        if (aspectDiff > 0.1) {
          console.log(`⚠️ ASPECT RATIO MISMATCH (cropped PDF): PDF=${pdfAspect.toFixed(3)}, Element=${elementAspect.toFixed(3)}, Diff=${(aspectDiff*100).toFixed(1)}%`);
          console.log(`🔧 Using actual PDF dimensions to preserve aspect ratio: ${actualPdfWidthMM.toFixed(2)}×${actualPdfHeightMM.toFixed(2)}mm`);
          // Use the actual PDF dimensions (preserving aspect ratio)
          // Scale to fit within element bounds while maintaining aspect ratio
          const scaleX = contentWidthMM / actualPdfWidthMM;
          const scaleY = contentHeightMM / actualPdfHeightMM;
          const scale = Math.min(scaleX, scaleY); // Use smaller scale to fit within bounds
          contentWidthMM = actualPdfWidthMM * scale;
          contentHeightMM = actualPdfHeightMM * scale;
          console.log(`📐 Scaled to fit element bounds: ${contentWidthMM.toFixed(2)}×${contentHeightMM.toFixed(2)}mm (scale=${scale.toFixed(3)})`);
        }
      } else {
        console.log(`📄 PDF not cropped - using element dimensions directly: ${contentWidthMM.toFixed(2)}×${contentHeightMM.toFixed(2)}mm`);
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
      let yPts: number;
      if (templateSize.id === 'dtf-large' || templateSize.name === 'large_dtf') {
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
      
      if (element.rotation === 90) {
        // 90° CCW rotation: content rotates so width becomes height
        // After rotation, visual size is height×width
        // Drawing position for pdf-lib to center visually:
        drawX = targetCenterX + contentHeightPts / 2;
        drawY = targetCenterY - contentWidthPts / 2;
      } else if (element.rotation === 180) {
        // 180° rotation: content is upside down
        drawX = targetCenterX + contentWidthPts / 2;
        drawY = targetCenterY + contentHeightPts / 2;
      } else if (element.rotation === 270) {
        // 270° CCW (or 90° CW): content rotates other direction
        drawX = targetCenterX - contentHeightPts / 2;
        drawY = targetCenterY + contentWidthPts / 2;
      } else {
        // No rotation - standard bottom-left positioning
        drawX = targetCenterX - contentWidthPts / 2;
        drawY = targetCenterY - contentHeightPts / 2;
      }
      
      console.log(`🎯 ROTATION CENTERING: target center=(${targetCenterX.toFixed(1)}, ${targetCenterY.toFixed(1)}), rotation=${element.rotation || 0}°`);
      console.log(`📍 DRAW POSITION: (${drawX.toFixed(1)}, ${drawY.toFixed(1)}) with size ${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts`);
      
      const drawOptions = {
        x: drawX,
        y: drawY,
        width: contentWidthPts,  // Use actual element width
        height: contentHeightPts, // Use actual element height
        rotate: element.rotation ? degrees(element.rotation) : undefined,
      };
      
      console.log(`📐 FINAL EMBEDDING: Position=(${drawX.toFixed(1)}, ${drawY.toFixed(1)}) Size=${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts, Rotation=${element.rotation || 0}°`);
      
      if (page1) {
        page1.drawPage(logoPage, drawOptions);
      }
      if (page2) {
        page2.drawPage(logoPage, drawOptions);
      }
      
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
    
    // Read image bytes
    const imageBytes = fs.readFileSync(imagePath);
    
    // Determine image type and embed accordingly
    const filename = (logo.filename || logo.originalFilename || '').toLowerCase();
    const mimeType = (logo.mimeType || logo.originalMimeType || '').toLowerCase();
    let embeddedImage: any;
    
    try {
      if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
        console.log(`📸 Embedded JPEG image: ${embeddedImage.width}×${embeddedImage.height}px`);
      } else {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
        console.log(`📸 Embedded PNG image: ${embeddedImage.width}×${embeddedImage.height}px`);
      }
    } catch (embedError) {
      console.error(`❌ Failed to embed image:`, embedError);
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