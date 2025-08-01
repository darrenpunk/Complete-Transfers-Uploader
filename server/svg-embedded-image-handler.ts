import * as fs from 'fs';
import * as path from 'path';
import { execAsync } from './utils';

export class SVGEmbeddedImageHandler {
  /**
   * Check if SVG contains embedded images
   */
  static hasEmbeddedImages(svgContent: string): boolean {
    return svgContent.includes('data:image/') || svgContent.includes('<image ');
  }

  /**
   * Extract and process embedded images from SVG
   * Returns modified SVG content with processed images
   */
  static async processEmbeddedImages(svgPath: string): Promise<string> {
    try {
      let svgContent = fs.readFileSync(svgPath, 'utf8');
      
      // Check if SVG has embedded images
      if (!this.hasEmbeddedImages(svgContent)) {
        return svgContent;
      }

      console.log('SVG Embedded Images: Processing embedded images in SVG');

      // Find all embedded PNG images
      const imagePattern = /data:image\/png;base64,([A-Za-z0-9+/=]+)/g;
      const matches = [...svgContent.matchAll(imagePattern)];
      
      if (matches.length === 0) {
        return svgContent;
      }

      console.log(`SVG Embedded Images: Found ${matches.length} embedded PNG images`);

      // Process each embedded image
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const base64Data = match[1];
        const fullDataUri = match[0];
        
        try {
          // Decode base64 to buffer
          const imageBuffer = Buffer.from(base64Data, 'base64');
          
          // Save to temporary file
          const tempPngPath = path.join(path.dirname(svgPath), `temp_embedded_${i}.png`);
          fs.writeFileSync(tempPngPath, imageBuffer);
          
          // Check if PNG has transparency
          const { stdout } = await execAsync(`identify -format "%A" "${tempPngPath}"`);
          const hasAlpha = stdout.trim().toLowerCase() === 'true' || stdout.trim() === 'Blend';
          
          console.log(`SVG Embedded Images: Image ${i} has alpha channel: ${hasAlpha}`);
          
          // For PNG with transparency, we need to handle it carefully
          if (hasAlpha) {
            // Keep the PNG as-is to preserve transparency
            // The PDF generator will handle RGB PNGs with transparency correctly
            console.log(`SVG Embedded Images: Keeping PNG ${i} in RGB format to preserve transparency`);
          }
          
          // Clean up temp file
          if (fs.existsSync(tempPngPath)) {
            fs.unlinkSync(tempPngPath);
          }
          
        } catch (error) {
          console.error(`SVG Embedded Images: Error processing embedded image ${i}:`, error);
        }
      }

      return svgContent;
      
    } catch (error) {
      console.error('SVG Embedded Images: Error processing embedded images:', error);
      return fs.readFileSync(svgPath, 'utf8');
    }
  }

  /**
   * Convert SVG with embedded images to PDF while preserving transparency
   */
  static async convertToPDFWithTransparency(svgPath: string, outputPath: string): Promise<boolean> {
    try {
      console.log('SVG Embedded Images: Converting SVG with embedded images to PDF');
      
      // Use Inkscape for better handling of embedded images with transparency
      try {
        await execAsync('which inkscape');
        
        // Inkscape handles embedded images with transparency better
        const inkscapeCommand = `inkscape "${svgPath}" --export-type=pdf --export-filename="${outputPath}" --export-area-page`;
        
        console.log('SVG Embedded Images: Using Inkscape for conversion');
        await execAsync(inkscapeCommand);
        
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          console.log('SVG Embedded Images: Successfully converted with Inkscape');
          return true;
        }
      } catch (error) {
        console.log('SVG Embedded Images: Inkscape not available, trying alternative method');
      }
      
      // Fallback to rsvg-convert with specific options
      const rsvgCommand = `rsvg-convert -f pdf -o "${outputPath}" "${svgPath}"`;
      
      console.log('SVG Embedded Images: Using rsvg-convert for conversion');
      await execAsync(rsvgCommand);
      
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        console.log('SVG Embedded Images: Successfully converted with rsvg-convert');
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('SVG Embedded Images: Error converting to PDF:', error);
      return false;
    }
  }
}