import * as fs from 'fs';
// Simple content extraction without external dependencies

/**
 * Simple Content Extraction Utility
 * Extracts actual content from PDFs ignoring document dimensions
 * and places content at correct size on canvas
 */
export class ContentExtractionUtils {
  
  /**
   * Extract content bounds from SVG content
   */
  static extractContentBounds(svgContent: string): { minX: number, minY: number, maxX: number, maxY: number } | null {
    try {
      // Extract all path data to find actual content bounds
      const pathMatches = svgContent.match(/d="[^"]+"/g) || [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      for (const pathData of pathMatches) {
        // Extract coordinates from path data
        const coords = pathData.match(/[\d.-]+/g);
        if (coords) {
          for (let i = 0; i < coords.length; i += 2) {
            const x = parseFloat(coords[i]);
            const y = parseFloat(coords[i + 1]);
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }
      }
      
      if (minX === Infinity) return null;
      
      return { minX, minY, maxX, maxY };
    } catch (error) {
      console.error('Failed to extract content bounds:', error);
      return null;
    }
  }
  
  /**
   * Create a clean SVG with just the content, properly sized
   */
  static createCleanContentSVG(svgContent: string, targetWidth: number = 804, targetHeight: number = 808): string {
    console.log('🎯 CONTENT EXTRACTION: Creating clean content SVG');
    
    // Extract content bounds
    const bounds = this.extractContentBounds(svgContent);
    if (!bounds) {
      console.log('⚠️ Could not extract content bounds, using original');
      return svgContent;
    }
    
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    console.log(`📐 CONTENT BOUNDS: ${bounds.minX},${bounds.minY} to ${bounds.maxX},${bounds.maxY} (${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)})`);
    
    // Calculate scale to fit content properly in target dimensions
    const scaleX = (targetWidth * 0.8) / contentWidth; // Use 80% of canvas for content
    const scaleY = (targetHeight * 0.8) / contentHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Calculate translation to center the content
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    const translateX = (targetWidth - scaledWidth) / 2 - (bounds.minX * scale);
    const translateY = (targetHeight - scaledHeight) / 2 - (bounds.minY * scale);
    
    console.log(`🎯 CENTERING: scale=${scale.toFixed(3)}, translate(${translateX.toFixed(1)}, ${translateY.toFixed(1)})`);
    
    // Extract the content between <svg> and </svg> tags
    const svgMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    if (!svgMatch) {
      console.log('⚠️ Could not extract SVG content');
      return svgContent;
    }
    
    const innerContent = svgMatch[1];
    
    // Create new clean SVG with proper centering
    const cleanSVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- CLEAN_CONTENT_EXTRACTED -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">
  <g transform="translate(${translateX}, ${translateY}) scale(${scale})">
${innerContent}
  </g>
</svg>`;
    
    console.log('✅ CONTENT EXTRACTION: Created clean centered SVG');
    return cleanSVG;
  }
  
  /**
   * Apply content extraction to an SVG file
   */
  static processFileContent(svgPath: string): void {
    if (!fs.existsSync(svgPath)) {
      console.warn(`⚠️ CONTENT EXTRACTION: File not found: ${svgPath}`);
      return;
    }
    
    console.log(`🎯 CONTENT EXTRACTION: Processing ${svgPath}`);
    const originalContent = fs.readFileSync(svgPath, 'utf8');
    
    // Skip if already processed
    if (originalContent.includes('CLEAN_CONTENT_EXTRACTED')) {
      console.log('⏭️ CONTENT EXTRACTION: Already processed, skipping');
      return;
    }
    
    const cleanContent = this.createCleanContentSVG(originalContent);
    fs.writeFileSync(svgPath, cleanContent);
    console.log(`✅ CONTENT EXTRACTION: Processed ${svgPath}`);
  }
}