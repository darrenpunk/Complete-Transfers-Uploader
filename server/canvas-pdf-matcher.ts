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
  private readonly MM_TO_PT = 2.834645669; // 72 DPI conversion
  
  /**
   * Extract EXACT content bounds from tight content SVG using SVG Bounds Analyzer
   */
  async extractCorrectedDimensions(tightContentSvgPath: string): Promise<CorrectedDimensions> {
    console.log(`🎯 MATCHER: EXACT BOUNDS EXTRACTION from ${path.basename(tightContentSvgPath)}`);
    
    if (!fs.existsSync(tightContentSvgPath)) {
      throw new Error(`Tight content SVG not found: ${tightContentSvgPath}`);
    }
    
    try {
      // Direct analysis of tight content SVG for exact bounds
      const svgContent = fs.readFileSync(tightContentSvgPath, 'utf8');
      
      // Check if this is a tight content SVG (has data-content-extracted attribute)
      if (svgContent.includes('data-content-extracted="true"')) {
        console.log(`🎯 MATCHER: Processing tight content SVG for EXACT bounds`);
        
        // Parse the DOM to get actual content bounds
        const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
        const svgElement = dom.window.document.querySelector('svg');
        
        if (svgElement) {
          // For tight content SVGs, use the width/height attributes as they represent actual content
          const widthAttr = svgElement.getAttribute('width');
          const heightAttr = svgElement.getAttribute('height');
          
          if (widthAttr && heightAttr) {
            const exactWidthPx = parseFloat(widthAttr);
            const exactHeightPx = parseFloat(heightAttr);
            
            const exactWidthMm = exactWidthPx / this.MM_TO_PT;
            const exactHeightMm = exactHeightPx / this.MM_TO_PT;
            
            console.log(`✅ MATCHER: EXACT TIGHT CONTENT BOUNDS: ${exactWidthMm.toFixed(1)}×${exactHeightMm.toFixed(1)}mm`);
            console.log(`📐 MATCHER: EXACT TIGHT CONTENT BOUNDS: ${exactWidthPx.toFixed(1)}×${exactHeightPx.toFixed(1)}pts`);
            
            return {
              widthMm: exactWidthMm,
              heightMm: exactHeightMm,
              widthPts: exactWidthPx,
              heightPts: exactHeightPx,
              isOversized: false,
              appliedContentRatio: true
            };
          }
        }
      }
      
      console.log(`🔄 MATCHER: Not tight content SVG, extracting from viewBox with analysis`);
      
    } catch (error) {
      console.error(`❌ MATCHER: Failed to analyze tight content bounds:`, error);
    }
    
    // Fallback: Use viewBox but with no scaling - keep original dimensions
    console.log(`🔄 MATCHER: Fallback to viewBox (no scaling)`);
    const svgContent = fs.readFileSync(tightContentSvgPath, 'utf8');
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    
    if (!viewBoxMatch) {
      throw new Error('SVG missing viewBox attribute and bounds analysis failed');
    }
    
    const [, , viewBoxWidth, viewBoxHeight] = viewBoxMatch[1].split(' ').map(parseFloat);
    const widthMm = viewBoxWidth / this.MM_TO_PT;
    const heightMm = viewBoxHeight / this.MM_TO_PT;
    const widthPts = viewBoxWidth;
    const heightPts = viewBoxHeight;
    
    console.log(`📊 MATCHER: Fallback viewBox dimensions: ${widthMm.toFixed(1)}×${heightMm.toFixed(1)}mm`);
    
    return {
      widthMm,
      heightMm,
      widthPts,
      heightPts,
      isOversized: true,
      appliedContentRatio: false
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