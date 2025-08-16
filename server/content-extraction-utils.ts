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
    const scaleX = (targetWidth * 0.7) / contentWidth; // Use 70% of canvas for content
    const scaleY = (targetHeight * 0.7) / contentHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Calculate translation to move content center to canvas center
    const contentCenterX = bounds.minX + (contentWidth / 2);
    const contentCenterY = bounds.minY + (contentHeight / 2);
    const canvasCenterX = targetWidth / 2;
    const canvasCenterY = targetHeight / 2;
    
    const translateX = canvasCenterX - (contentCenterX * scale);
    const translateY = canvasCenterY - (contentCenterY * scale);
    
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