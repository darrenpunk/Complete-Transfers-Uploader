/**
 * PDF Vector Content Bounding Box Extractor
 * 
 * Provides precise vector content bounds detection for uploaded PDF files
 * to enable accurate artwork scaling, positioning, and alignment.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
  units: 'pt' | 'px';
}

export interface BoundsExtractionResult {
  success: boolean;
  bbox?: BoundingBox;
  pdfBbox?: BoundingBox; // Original PDF page bounds
  cssBbox?: BoundingBox; // Converted to CSS pixels
  method: 'ghostscript' | 'poppler' | 'raster-fallback' | 'svg-analysis';
  contentFound: boolean;
  error?: string;
  croppedSvg?: string; // Optional cropped SVG output
  croppedPng?: string; // Optional cropped PNG output
}

export interface BoundsExtractionOptions {
  includeStrokeExtents?: boolean;
  padding?: number; // Additional padding in output units
  returnCroppedSvg?: boolean;
  returnCroppedPng?: boolean;
  tolerance?: number; // Numerical tolerance for bounds detection
  highDpiRasterFallback?: boolean;
}

export class PDFBoundsExtractor {
  
  /**
   * Extract tight vector content bounding box from PDF file
   */
  async extractContentBounds(
    pdfPath: string, 
    pageNumber: number = 1,
    options: BoundsExtractionOptions = {}
  ): Promise<BoundsExtractionResult> {
    
    const {
      includeStrokeExtents = true,
      padding = 0,
      returnCroppedSvg = false,
      returnCroppedPng = false,
      tolerance = 0.1,
      highDpiRasterFallback = true
    } = options;

    // Try methods in order of precision
    let result = await this.extractWithGhostscript(pdfPath, pageNumber, options);
    
    if (!result.success && highDpiRasterFallback) {
      console.log('🔄 Ghostscript failed, trying raster fallback...');
      result = await this.extractWithRasterFallback(pdfPath, pageNumber, options);
    }

    // Apply padding if requested
    if (result.success && result.bbox && padding > 0) {
      result.bbox = this.applyPadding(result.bbox, padding);
    }

    // Convert to CSS pixels
    if (result.success && result.bbox && result.bbox.units === 'pt') {
      result.cssBbox = this.convertToCSS(result.bbox);
    }

    return result;
  }

  /**
   * Method 1: Ghostscript-based vector bounds extraction
   * Most accurate for pure vector content
   */
  private async extractWithGhostscript(
    pdfPath: string, 
    pageNumber: number,
    options: BoundsExtractionOptions
  ): Promise<BoundsExtractionResult> {
    
    try {
      // First get the original PDF page bounds
      const pageInfo = await this.getPDFPageInfo(pdfPath, pageNumber);
      
      // Use Ghostscript to get precise vector bounds
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const bboxFile = path.join(tempDir, `bbox_${timestamp}.txt`);
      
      // Ghostscript command to extract bounding box
      const gsCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dQUIET',
        '-sDEVICE=bbox',
        `-dFirstPage=${pageNumber}`,
        `-dLastPage=${pageNumber}`,
        `"${pdfPath}"`,
        `2>"${bboxFile}"`
      ].join(' ');

      console.log(`🔍 Extracting bounds with Ghostscript: page ${pageNumber}`);
      execSync(gsCommand, { stdio: 'pipe' });

      // Parse the bounding box output
      if (fs.existsSync(bboxFile)) {
        const bboxOutput = fs.readFileSync(bboxFile, 'utf8');
        fs.unlinkSync(bboxFile); // Cleanup
        
        const bounds = this.parseGhostscriptBounds(bboxOutput);
        
        if (bounds) {
          console.log(`✅ Ghostscript bounds: ${bounds.xMin},${bounds.yMin} to ${bounds.xMax},${bounds.yMax}`);
          
          return {
            success: true,
            bbox: bounds,
            pdfBbox: pageInfo.bbox,
            method: 'ghostscript',
            contentFound: true
          };
        }
      }

      return {
        success: false,
        method: 'ghostscript',
        contentFound: false,
        error: 'No bounding box data found'
      };

    } catch (error) {
      console.error('❌ Ghostscript extraction failed:', error);
      return {
        success: false,
        method: 'ghostscript',
        contentFound: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Method 2: High-DPI raster fallback with alpha cropping
   * Used when vector extraction fails
   */
  private async extractWithRasterFallback(
    pdfPath: string,
    pageNumber: number,
    options: BoundsExtractionOptions
  ): Promise<BoundsExtractionResult> {
    
    try {
      const tempDir = path.join(process.cwd(), 'temp');
      const timestamp = Date.now();
      const rasterPath = path.join(tempDir, `raster_${timestamp}.png`);
      
      // Render at high DPI for precision
      const dpi = 300;
      const convertCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dQUIET',
        '-sDEVICE=pngalpha',
        `-r${dpi}`,
        `-dFirstPage=${pageNumber}`,
        `-dLastPage=${pageNumber}`,
        `-sOutputFile="${rasterPath}"`,
        `"${pdfPath}"`
      ].join(' ');

      console.log(`🖼️ Rendering page ${pageNumber} at ${dpi}DPI for bounds analysis`);
      execSync(convertCommand);

      if (fs.existsSync(rasterPath)) {
        // Use ImageMagick to find tight bounds
        const identifyCommand = `identify -format "%[fx:page.x],%[fx:page.y],%[fx:page.width],%[fx:page.height]" "${rasterPath}"`;
        const boundsOutput = execSync(identifyCommand, { encoding: 'utf8' }).trim();
        
        const [x, y, width, height] = boundsOutput.split(',').map(Number);
        
        // Convert pixel bounds back to points
        const scale = 72 / dpi;
        const bounds: BoundingBox = {
          xMin: x * scale,
          yMin: y * scale,
          xMax: (x + width) * scale,
          yMax: (y + height) * scale,
          width: width * scale,
          height: height * scale,
          units: 'pt'
        };

        // Cleanup
        fs.unlinkSync(rasterPath);

        console.log(`✅ Raster fallback bounds: ${bounds.xMin},${bounds.yMin} to ${bounds.xMax},${bounds.yMax}`);

        return {
          success: true,
          bbox: bounds,
          method: 'raster-fallback',
          contentFound: true
        };
      }

      return {
        success: false,
        method: 'raster-fallback',
        contentFound: false,
        error: 'Failed to render PDF page'
      };

    } catch (error) {
      console.error('❌ Raster fallback failed:', error);
      return {
        success: false,
        method: 'raster-fallback',
        contentFound: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get PDF page information including original bounds
   */
  private async getPDFPageInfo(pdfPath: string, pageNumber: number): Promise<{ bbox: BoundingBox }> {
    try {
      const identifyCommand = `identify -format "%[fx:page.width],%[fx:page.height]" "${pdfPath}[${pageNumber - 1}]"`;
      const output = execSync(identifyCommand, { encoding: 'utf8' }).trim();
      const [width, height] = output.split(',').map(Number);

      return {
        bbox: {
          xMin: 0,
          yMin: 0,
          xMax: width,
          yMax: height,
          width,
          height,
          units: 'pt'
        }
      };
    } catch (error) {
      // Default to A4 if detection fails
      return {
        bbox: {
          xMin: 0,
          yMin: 0,
          xMax: 595.28,
          yMax: 841.89,
          width: 595.28,
          height: 841.89,
          units: 'pt'
        }
      };
    }
  }

  /**
   * Parse Ghostscript bounding box output
   */
  private parseGhostscriptBounds(output: string): BoundingBox | null {
    // Look for %%HiResBoundingBox or %%BoundingBox lines
    const hiResMatch = output.match(/%%HiResBoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
    const bboxMatch = output.match(/%%BoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
    
    const match = hiResMatch || bboxMatch;
    
    if (match) {
      const [, xMin, yMin, xMax, yMax] = match.map(Number);
      
      return {
        xMin,
        yMin,
        xMax,
        yMax,
        width: xMax - xMin,
        height: yMax - yMin,
        units: 'pt'
      };
    }
    
    return null;
  }

  /**
   * Apply padding to bounding box
   */
  private applyPadding(bbox: BoundingBox, padding: number): BoundingBox {
    return {
      ...bbox,
      xMin: bbox.xMin - padding,
      yMin: bbox.yMin - padding,
      xMax: bbox.xMax + padding,
      yMax: bbox.yMax + padding,
      width: bbox.width + (padding * 2),
      height: bbox.height + (padding * 2)
    };
  }

  /**
   * Convert points to CSS pixels (72pt = 96px)
   */
  private convertToCSS(bbox: BoundingBox): BoundingBox {
    const scale = 96 / 72; // CSS pixel ratio
    
    return {
      xMin: bbox.xMin * scale,
      yMin: bbox.yMin * scale,
      xMax: bbox.xMax * scale,
      yMax: bbox.yMax * scale,
      width: bbox.width * scale,
      height: bbox.height * scale,
      units: 'px'
    };
  }
}