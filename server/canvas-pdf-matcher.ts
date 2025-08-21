/**
 * Canvas-PDF Dimension Matcher
 * 
 * This module ensures PDF output exactly matches canvas preview by calculating
 * corrected dimensions directly from tight content SVGs, completely ignoring
 * oversized canvas element dimensions.
 */

import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

interface CorrectedDimensions {
  widthMm: number;
  heightMm: number;
  widthPts: number;
  heightPts: number;
  isOversized: boolean;
  appliedContentRatio: boolean;
}

export class CanvasPDFMatcher {
  private readonly CONTENT_RATIO = 0.75; // 75% content ratio for better visibility
  private readonly MM_TO_PT = 2.834645669; // 72 DPI conversion
  private readonly OVERSIZED_THRESHOLD = 200; // mm
  
  /**
   * Extract corrected dimensions from tight content SVG, completely ignoring canvas element size
   */
  async extractCorrectedDimensions(tightContentSvgPath: string): Promise<CorrectedDimensions> {
    console.log(`🔧 MATCHER: Extracting corrected dimensions from ${path.basename(tightContentSvgPath)}`);
    
    if (!fs.existsSync(tightContentSvgPath)) {
      throw new Error(`Tight content SVG not found: ${tightContentSvgPath}`);
    }
    
    const svgContent = fs.readFileSync(tightContentSvgPath, 'utf8');
    
    // Parse SVG using DOM for accurate dimension extraction
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const svgElement = dom.window.document.querySelector('svg');
    
    if (!svgElement) {
      throw new Error('Invalid SVG: no svg element found');
    }
    
    // Extract viewBox dimensions (these are the oversized dimensions we need to correct)
    const viewBox = svgElement.getAttribute('viewBox');
    if (!viewBox) {
      throw new Error('SVG missing viewBox attribute');
    }
    
    const [, , viewBoxWidth, viewBoxHeight] = viewBox.split(' ').map(parseFloat);
    console.log(`📊 MATCHER: ViewBox dimensions: ${viewBoxWidth.toFixed(1)}×${viewBoxHeight.toFixed(1)}px`);
    
    // Convert pixels to mm using 72 DPI standard
    let widthMm = viewBoxWidth / this.MM_TO_PT;
    let heightMm = viewBoxHeight / this.MM_TO_PT;
    
    console.log(`📏 MATCHER: Initial dimensions: ${widthMm.toFixed(1)}×${heightMm.toFixed(1)}mm`);
    
    // Check if dimensions are oversized
    const isOversized = widthMm > this.OVERSIZED_THRESHOLD || heightMm > this.OVERSIZED_THRESHOLD;
    let appliedContentRatio = false;
    
    if (isOversized) {
      // Apply a more intelligent scaling based on the specific dimensions
      // For very wide logos (like 260×92), use a different ratio than square logos
      const aspectRatio = widthMm / heightMm;
      let scalingRatio = this.CONTENT_RATIO;
      
      if (aspectRatio > 2.5) {
        // Wide logos: use less aggressive scaling
        scalingRatio = 0.85; // 85% for wide logos
        console.log(`🎯 MATCHER: Wide logo detected (${aspectRatio.toFixed(1)}:1), applying ${scalingRatio * 100}% content ratio`);
      } else if (aspectRatio < 0.4) {
        // Tall logos: use less aggressive scaling  
        scalingRatio = 0.85; // 85% for tall logos
        console.log(`🎯 MATCHER: Tall logo detected (${aspectRatio.toFixed(1)}:1), applying ${scalingRatio * 100}% content ratio`);
      } else {
        console.log(`🎯 MATCHER: Standard logo detected, applying ${scalingRatio * 100}% content ratio`);
      }
      
      widthMm *= scalingRatio;
      heightMm *= scalingRatio;
      appliedContentRatio = true;
      console.log(`✅ MATCHER: Corrected dimensions: ${widthMm.toFixed(1)}×${heightMm.toFixed(1)}mm`);
    } else {
      console.log(`✅ MATCHER: Dimensions are reasonable, using as-is`);
    }
    
    // Convert to points for PDF embedding
    const widthPts = widthMm * this.MM_TO_PT;
    const heightPts = heightMm * this.MM_TO_PT;
    
    console.log(`📐 MATCHER: Final PDF dimensions: ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts`);
    
    return {
      widthMm,
      heightMm,
      widthPts,
      heightPts,
      isOversized,
      appliedContentRatio
    };
  }
  
  /**
   * Update canvas element to match corrected dimensions for display consistency
   */
  async syncCanvasElementDimensions(
    elementId: string, 
    correctedDimensions: CorrectedDimensions,
    updateCanvasElement: (id: string, updates: { width: number; height: number }) => Promise<void>
  ): Promise<void> {
    if (correctedDimensions.appliedContentRatio) {
      console.log(`🔄 MATCHER: Syncing canvas element ${elementId} to corrected dimensions`);
      await updateCanvasElement(elementId, {
        width: correctedDimensions.widthMm,
        height: correctedDimensions.heightMm
      });
      console.log(`✅ MATCHER: Canvas element synced to ${correctedDimensions.widthMm.toFixed(1)}×${correctedDimensions.heightMm.toFixed(1)}mm`);
    }
  }
}