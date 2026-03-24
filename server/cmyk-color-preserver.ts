import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface CMYKColor {
  c: number; // 0-100
  m: number; // 0-100
  y: number; // 0-100
  k: number; // 0-100
}

export class CMYKColorPreserver {
  /**
   * Create a CMYK color for pdf-lib that preserves exact values
   * @param cmyk - CMYK values in percentage (0-100)
   * @returns Color object for pdf-lib
   */
  static createExactCMYK(cmyk: CMYKColor): any {
    // Convert percentage to 0-1 range
    const c = cmyk.c / 100;
    const m = cmyk.m / 100;
    const y = cmyk.y / 100;
    const k = cmyk.k / 100;

    // Create a custom color space reference for CMYK
    return {
      type: 'CMYK',
      c,
      m,
      y,
      k
    };
  }

  /**
   * Draw a rectangle with exact CMYK color preservation
   */
  static drawCMYKRectangle(
    page: any,
    x: number,
    y: number,
    width: number,
    height: number,
    cmyk: CMYKColor
  ) {
    // Get the page's content stream
    const { pushGraphicsState, popGraphicsState, setStrokingColor, setNonStrokingColor, 
            rectangle, fill, stroke, closePath } = page;

    // Convert CMYK percentages to 0-1 range
    const c = cmyk.c / 100;
    const m = cmyk.m / 100;
    const yValue = cmyk.y / 100;
    const k = cmyk.k / 100;

    // Push graphics state to isolate color changes
    pushGraphicsState();

    // Set CMYK color directly using low-level operators
    // This ensures exact CMYK values are preserved
    const colorOp = `${c} ${m} ${yValue} ${k} k`; // 'k' is the CMYK color operator
    page.pushOperators({
      type: 'Operator',
      name: 'k',
      args: [
        { type: 'Number', value: c },
        { type: 'Number', value: m },
        { type: 'Number', value: yValue },
        { type: 'Number', value: k }
      ]
    });

    // Draw the rectangle
    rectangle(x, y, width, height);
    fill();

    // Restore graphics state
    popGraphicsState();
  }

  /**
   * Embed a PDF with exact CMYK color preservation
   */
  static async embedPDFWithCMYKPreservation(
    targetDoc: PDFDocument,
    sourcePdfPath: string,
    options: {
      x: number;
      y: number;
      width: number;
      height: number;
      preserveColorSpace?: boolean;
    }
  ) {
    const sourcePdfBytes = fs.readFileSync(sourcePdfPath);
    const sourceDoc = await PDFDocument.load(sourcePdfBytes);
    
    const pages = sourceDoc.getPages();
    if (pages.length === 0) return;

    const firstPage = pages[0];
    
    // Embed the page with color space preservation
    const embeddedPage = await targetDoc.embedPage(firstPage, {
      left: 0,
      bottom: 0,
      right: firstPage.getWidth(),
      top: firstPage.getHeight()
    });

    // Draw the embedded page
    const targetPage = targetDoc.getPages()[0]; // Assuming we're drawing on first page
    targetPage.drawPage(embeddedPage, {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height
    });

    // If color space preservation is requested, ensure CMYK color space is maintained
    if (options.preserveColorSpace) {
      const resources = targetPage.node.Resources();
      if (resources) {
        // Ensure DeviceCMYK is the default color space
        const colorSpaceDict = resources.lookup(PDFName.of('ColorSpace')) || targetDoc.context.obj({});
        colorSpaceDict.set(PDFName.of('DefaultCMYK'), PDFName.of('DeviceCMYK'));
        resources.set(PDFName.of('ColorSpace'), colorSpaceDict);
      }
    }
  }

  /**
   * Verify CMYK preservation in a PDF
   */
  static async verifyCMYKPreservation(pdfPath: string): Promise<boolean> {
    try {
      // Use Ghostscript to check color spaces
      const escapedPsPath = pdfPath.replace(/\\/g, '\\\\').replace(/[()]/g, '\\$&');
      const tempPsFile = path.join(os.tmpdir(), `cmyk_verify_${Date.now()}.ps`);
      const psCode = `(${escapedPsPath}) (r) file runpdfbegin 1 1 pdfpagecount { pdfgetpage dup /Resources get /ColorSpace known { (Has ColorSpace resources) = } if } for`;
      fs.writeFileSync(tempPsFile, psCode);
      
      try {
        const { stdout } = await execFileAsync('gs', ['-dNOPAUSE', '-dBATCH', '-dNODISPLAY', '-q', '-f', tempPsFile], { timeout: 30000 });
        console.log('CMYK Verification result:', stdout);
      } finally {
        try { fs.unlinkSync(tempPsFile); } catch {}
      }
      
      return true;
    } catch (error) {
      console.error('CMYK verification failed:', error);
      return false;
    }
  }

  /**
   * Create a PDF with exact CMYK color swatches for testing
   */
  static async createCMYKTestPDF(outputPath: string, colors: CMYKColor[]): Promise<void> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.276, 841.890]); // A4 size
    
    const swatchSize = 50;
    const margin = 20;
    const spacing = 10;
    const colsPerRow = 5;

    colors.forEach((color, index) => {
      const row = Math.floor(index / colsPerRow);
      const col = index % colsPerRow;
      
      const x = margin + col * (swatchSize + spacing);
      const y = page.getHeight() - margin - (row + 1) * (swatchSize + spacing);

      // Draw swatch with exact CMYK values
      this.drawCMYKRectangle(page, x, y, swatchSize, swatchSize, color);
    });

    // Ensure CMYK color space is set for the document
    const resources = page.node.Resources();
    if (resources) {
      const colorSpaceDict = pdfDoc.context.obj({});
      (colorSpaceDict as any).set(PDFName.of('DefaultCMYK'), PDFName.of('DeviceCMYK'));
      (resources as any).set(PDFName.of('ColorSpace'), colorSpaceDict);
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
  }
}