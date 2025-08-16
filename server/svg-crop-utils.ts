import * as fs from 'fs';

/**
 * Simple SVG content cropping utility
 * Extracts the actual content from a full-page PDF-converted SVG
 */
export class SVGCropUtils {
  
  /**
   * Crop SVG content to focus on the actual artwork
   */
  static async cropSVGContent(svgPath: string): Promise<void> {
    try {
      console.log('🗒️ CROPPING: Processing SVG for content extraction');
      
      const originalContent = fs.readFileSync(svgPath, 'utf8');
      
      // Skip if already cropped
      if (originalContent.includes('CONTENT_CROPPED')) {
        console.log('⏭️ Already cropped, skipping');
        return;
      }
      
      // For A3-sized PDFs, look for the typical content area
      // Most logos are centered around the middle of the page
      if (originalContent.includes('viewBox="0 0 841') && originalContent.includes('1190')) {
        console.log('📄 Detected A3 PDF - extracting center content area');
        
        // Extract the content between <svg> and </svg>
        const svgMatch = originalContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        if (!svgMatch) {
          console.log('⚠️ Could not extract SVG content');
          return;
        }
        
        const innerContent = svgMatch[1];
        
        // Create a cropped version focused on the center content area
        // A3 is 841×1191px, typical logo content is in the center third
        const contentX = 150;  // Start at 150px from left
        const contentY = 200;  // Start at 200px from top
        const contentWidth = 541;  // Width of content area (841-300)
        const contentHeight = 591; // Height of content area (1191-600)
        
        const croppedSVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- CONTENT_CROPPED -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${contentWidth}" height="${contentHeight}" viewBox="${contentX} ${contentY} ${contentWidth} ${contentHeight}">
${innerContent}
</svg>`;
        
        // Write the cropped SVG
        fs.writeFileSync(svgPath, croppedSVG, 'utf8');
        console.log(`✂️ CROPPED: Created focused content area ${contentWidth}×${contentHeight}px`);
      }
      
    } catch (error) {
      console.error('❌ CROP ERROR:', error);
    }
  }
}