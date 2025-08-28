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
        
        const bounds = this.parseGhostscriptBounds(bboxOutput, pageInfo.bbox);
        
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
        console.log(`🔍 Analyzing raster content with ImageMagick trim...`);
        
        // Use ImageMagick trim to crop transparent pixels and get actual content bounds
        const trimPath = path.join(tempDir, `trimmed_${timestamp}.png`);
        const trimCommand = `convert "${rasterPath}" -trim +repage "${trimPath}"`;
        
        try {
          execSync(trimCommand);
          
          if (fs.existsSync(trimPath)) {
            // Get original dimensions
            const originalSizeCmd = `identify -format "%w,%h" "${rasterPath}"`;
            const [origWidth, origHeight] = execSync(originalSizeCmd, { encoding: 'utf8' }).trim().split(',').map(Number);
            
            // Get trimmed dimensions and offset
            const trimInfoCmd = `identify -format "%w,%h,%X,%Y" "${trimPath}"`;
            const trimOutput = execSync(trimInfoCmd, { encoding: 'utf8' }).trim();
            const [trimWidth, trimHeight, trimX, trimY] = trimOutput.split(',').map(Number);
            
            console.log(`📐 Original: ${origWidth}×${origHeight}px, Trimmed: ${trimWidth}×${trimHeight}px at offset (${trimX},${trimY})`);
            
            // Convert pixel bounds back to points (PDF coordinate system)
            const scale = 72 / dpi;
            const bounds: BoundingBox = {
              xMin: trimX * scale,
              yMin: (origHeight - trimY - trimHeight) * scale, // Convert to PDF coordinates (origin at bottom-left)
              xMax: (trimX + trimWidth) * scale,
              yMax: (origHeight - trimY) * scale,
              width: trimWidth * scale,
              height: trimHeight * scale,
              units: 'pt'
            };

            // Cleanup temp files
            fs.unlinkSync(rasterPath);
            fs.unlinkSync(trimPath);

            console.log(`✅ RASTER TRIM SUCCESS: ${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}pts at (${bounds.xMin.toFixed(1)},${bounds.yMin.toFixed(1)})`);

            return {
              success: true,
              bbox: bounds,
              method: 'raster-fallback',
              contentFound: true
            };
          }
        } catch (trimError) {
          console.log(`⚠️ Trim failed, using full raster bounds`);
          
          // Fallback to original approach
          const identifyCommand = `identify -format "%w,%h" "${rasterPath}"`;
          const sizeOutput = execSync(identifyCommand, { encoding: 'utf8' }).trim();
          const [width, height] = sizeOutput.split(',').map(Number);
          
          const scale = 72 / dpi;
          const bounds: BoundingBox = {
            xMin: 0,
            yMin: 0,
            xMax: width * scale,
            yMax: height * scale,
            width: width * scale,
            height: height * scale,
            units: 'pt'
          };

          // Cleanup
          fs.unlinkSync(rasterPath);

          console.log(`✅ Raster full page bounds: ${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}pts`);

          return {
            success: true,
            bbox: bounds,
            method: 'raster-fallback',
            contentFound: true
          };
        }
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
      // Try to get MediaBox using Ghostscript for more accurate results
      const gsInfoCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dQUIET',
        '-dNODISPLAY',
        `-c`,
        `"(${pdfPath}) (r) file runpdfbegin ${pageNumber} pdfgetpage /MediaBox get {=print ( ) print} forall quit"`
      ].join(' ');
      
      try {
        const gsOutput = execSync(gsInfoCommand, { encoding: 'utf8', stdio: 'pipe' }).trim();
        const mediaBoxValues = gsOutput.split(' ').filter(v => v).map(Number);
        
        if (mediaBoxValues.length === 4 && !mediaBoxValues.some(isNaN)) {
          const [x1, y1, x2, y2] = mediaBoxValues;
          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);
          
          console.log(`📄 PDF MediaBox: [${x1}, ${y1}, ${x2}, ${y2}] = ${width}×${height}pts`);
          
          return {
            bbox: {
              xMin: Math.min(x1, x2),
              yMin: Math.min(y1, y2),
              xMax: Math.max(x1, x2),
              yMax: Math.max(y1, y2),
              width,
              height,
              units: 'pt'
            }
          };
        }
      } catch (gsError) {
        // Silently fall back to ImageMagick
      }
      
      // Fallback to ImageMagick
      const identifyCommand = `identify -format "%[fx:page.width],%[fx:page.height]" "${pdfPath}[${pageNumber - 1}]"`;
      const output = execSync(identifyCommand, { encoding: 'utf8' }).trim();
      const [width, height] = output.split(',').map(Number);

      if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
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
      }
    } catch (error) {
      console.log('⚠️ Failed to get PDF page info, using default A4');
    }
    
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

  /**
   * Parse Ghostscript bounding box output
   */
  private parseGhostscriptBounds(output: string, pageBounds?: BoundingBox): BoundingBox | null {
    // Look for %%HiResBoundingBox or %%BoundingBox lines
    const hiResMatch = output.match(/%%HiResBoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
    const bboxMatch = output.match(/%%BoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
    
    const match = hiResMatch || bboxMatch;
    
    if (match) {
      let [, xMin, yMin, xMax, yMax] = match.map(Number);
      
      // Handle PDFs with offset bounds (negative coordinates)
      if (xMin < -100 || yMin < -100) {
        console.log(`🔄 Adjusting offset bounds: (${xMin}, ${yMin}) -> normalized`);
        // Normalize the bounds to start at (0,0)
        const offsetX = Math.min(0, xMin);
        const offsetY = Math.min(0, yMin);
        xMax = xMax - offsetX;
        yMax = yMax - offsetY;
        xMin = 0;
        yMin = 0;
      }
      
      const width = xMax - xMin;
      const height = yMax - yMin;
      
      // Check if bounds seem too conservative using page dimensions
      if (pageBounds) {
        const pageWidth = pageBounds.width;
        const pageHeight = pageBounds.height;
        
        const bboxArea = width * height;
        const pageArea = pageWidth * pageHeight;
        const coverage = bboxArea / pageArea;
        
        // Check if Ghostscript bounds seem unreliable (too small coverage)
        const isLowCoverage = coverage < 0.35;
        const isSignificantlySmaller = width < pageWidth * 0.8 && height < pageHeight * 0.8;
        
        if (isLowCoverage && isSignificantlySmaller) {
          console.log(`🚨 GHOSTSCRIPT BOUNDS UNRELIABLE: ${width.toFixed(1)}×${height.toFixed(1)}pts (${(coverage*100).toFixed(1)}% coverage)`);
          console.log(`🔄 FALLING BACK TO RASTER ANALYSIS: Ghostscript missed significant content`);
          
          // Return null to trigger raster fallback method
          return null;
        }
      }
      
      // Validate bounds are reasonable
      if (width > 0 && height > 0 && width < 10000 && height < 10000) {
        return {
          xMin,
          yMin,
          xMax,
          yMax,
          width,
          height,
          units: 'pt'
        };
      } else {
        console.log(`⚠️ Invalid bounds detected: ${width}×${height}`);
      }
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