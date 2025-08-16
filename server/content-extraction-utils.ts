import * as fs from 'fs';
// Simple content extraction without external dependencies

/**
 * Simple Content Extraction Utility
 * Extracts actual content from PDFs ignoring document dimensions
 * and places content at correct size on canvas
 */
export class ContentExtractionUtils {
  
  /**
   * Extract meaningful content bounds from SVG content
   * Focus on visible paths, ignore clipping paths and large document areas
   */
  static extractContentBounds(svgContent: string): { minX: number, minY: number, maxX: number, maxY: number } | null {
    try {
      // Look for the most constrained clip path - this often represents the actual content area
      const clipMatches = svgContent.match(/<clipPath[^>]*>[\s\S]*?<\/clipPath>/g) || [];
      let contentBounds = null;
      let smallestArea = Infinity;
      
      for (const clipPath of clipMatches) {
        const pathData = clipPath.match(/d="([^"]+)"/);
        if (pathData) {
          const coords = pathData[1].match(/[\d.]+/g);
          if (coords && coords.length >= 4) {
            const minX = parseFloat(coords[0]);
            const minY = parseFloat(coords[1]);
            const maxX = parseFloat(coords[2]);
            const maxY = parseFloat(coords[3]);
            
            const width = maxX - minX;
            const height = maxY - minY;
            const area = width * height;
            
            // Look for reasonably sized content area (not full page, not tiny)
            if (area > 10000 && area < 500000 && area < smallestArea) {
              smallestArea = area;
              contentBounds = { minX, minY, maxX, maxY };
              console.log(`📐 Found content clip: ${minX},${minY} to ${maxX},${maxY} (${width.toFixed(1)}×${height.toFixed(1)}, area: ${area.toFixed(0)})`);
            }
          }
        }
      }
      
      if (!contentBounds) {
        console.log('⚠️ No suitable clip path found, using simple center positioning');
        // If no good clip path, assume content is centered
        return { minX: 200, minY: 200, maxX: 600, maxY: 600 };
      }
      
      return contentBounds;
    } catch (error) {
      console.error('Failed to extract content bounds:', error);
      return null;
    }
  }
  
  /**
   * Create a clean SVG with just the content, properly sized and centered
   * SIMPLE APPROACH: Just center the content without complex calculations
   */
  static createCleanContentSVG(svgContent: string, targetWidth: number = 804, targetHeight: number = 808): string {
    console.log('🎯 SIMPLE CONTENT EXTRACTION: Creating centered content SVG');
    
    // Extract the content between <svg> and </svg> tags
    const svgMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    if (!svgMatch) {
      console.log('⚠️ Could not extract SVG content');
      return svgContent;
    }
    
    const innerContent = svgMatch[1];
    
    // Simple approach: put content at reasonable scale and center it
    const scale = 0.6; // Fixed scale that works well for most content
    const centerX = targetWidth / 2;
    const centerY = targetHeight / 2;
    
    // Center the scaled content in the canvas
    const translateX = centerX;
    const translateY = centerY;
    
    console.log(`🎯 SIMPLE CENTERING: scale=${scale}, translate(${translateX}, ${translateY}) with transform-origin at center`);
    
    // Create new clean SVG with simple centering
    const cleanSVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- SIMPLE_CONTENT_EXTRACTED -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">
  <g transform="translate(${translateX}, ${translateY}) scale(${scale}) translate(-400, -400)">
${innerContent}
  </g>
</svg>`;
    
    console.log('✅ SIMPLE CONTENT EXTRACTION: Created clean centered SVG');
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
    if (originalContent.includes('SIMPLE_CONTENT_EXTRACTED')) {
      console.log('⏭️ CONTENT EXTRACTION: Already processed, skipping');
      return;
    }
    
    const cleanContent = this.createCleanContentSVG(originalContent);
    fs.writeFileSync(svgPath, cleanContent);
    console.log(`✅ CONTENT EXTRACTION: Processed ${svgPath}`);
  }
}