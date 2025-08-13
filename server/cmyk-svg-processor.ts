import fs from 'fs';

interface SVGColorInfo {
  id: string;
  originalColor: string;
  originalFormat?: string;
  cmykColor?: string;
  pantoneMatch?: string;
  pantoneDistance?: number;
  elementType: string;
  attribute: string;
  selector: string;
  isCMYK?: boolean;
}

/**
 * Process SVG to replace RGB colors with their original CMYK equivalents
 * This ensures true CMYK color preservation in the final PDF output
 */
export class CMYKSVGProcessor {
  
  /**
   * Replace RGB colors in SVG with CMYK device colors for true preservation
   */
  static async processSVGForCMYKPreservation(
    svgPath: string, 
    svgColors: { colors: SVGColorInfo[] }
  ): Promise<string> {
    
    let svgContent = fs.readFileSync(svgPath, 'utf-8');
    
    console.log(`🎨 Processing SVG for CMYK preservation with ${svgColors.colors.length} colors`);
    
    // Create a mapping of RGB colors to their CMYK equivalents
    const colorMap = new Map<string, string>();
    
    for (const colorInfo of svgColors.colors) {
      if (colorInfo.isCMYK && colorInfo.cmykColor) {
        // Parse CMYK values like "C:0 M:15 Y:96 K:5"
        const cmykMatch = colorInfo.cmykColor.match(/C:(\d+)\s+M:(\d+)\s+Y:(\d+)\s+K:(\d+)/);
        if (cmykMatch) {
          const [, c, m, y, k] = cmykMatch;
          
          // Convert to device-cmyk format for true CMYK preservation
          const deviceCMYK = `device-cmyk(${(parseFloat(c) / 100).toFixed(3)}, ${(parseFloat(m) / 100).toFixed(3)}, ${(parseFloat(y) / 100).toFixed(3)}, ${(parseFloat(k) / 100).toFixed(3)})`;
          
          // Map the original RGB color to the device-cmyk equivalent
          colorMap.set(colorInfo.originalColor, deviceCMYK);
          
          console.log(`🎨 Mapping: ${colorInfo.originalColor} → ${deviceCMYK}`);
        }
      }
    }
    
    // Replace all RGB colors with their CMYK equivalents
    colorMap.forEach((cmykColor, rgbColor) => {
      // Handle various RGB formats
      const rgbVariations = [
        rgbColor,
        rgbColor.replace(/\s+/g, ''), // Remove spaces
        rgbColor.replace(/,\s*/g, ','), // Normalize comma spacing
      ];
      
      for (const variation of rgbVariations) {
        svgContent = svgContent.replace(new RegExp(variation.replace(/[()]/g, '\\$&'), 'g'), cmykColor);
      }
    });
    
    // Save the processed SVG
    const processedPath = svgPath.replace('.svg', '_cmyk_processed.svg');
    fs.writeFileSync(processedPath, svgContent);
    
    console.log(`✅ SVG processed for CMYK preservation: ${processedPath}`);
    
    return processedPath;
  }
  
  /**
   * Ensure proper CMYK color space definition in SVG
   */
  static addCMYKColorSpaceToSVG(svgContent: string): string {
    // Add CMYK color space definition if not present
    if (!svgContent.includes('device-cmyk')) {
      // Insert CMYK color space definition after the opening <svg> tag
      const svgTagMatch = svgContent.match(/<svg[^>]*>/);
      if (svgTagMatch) {
        const svgTag = svgTagMatch[0];
        const cmykColorSpace = `
  <defs>
    <color-profile name="CMYK" rendering-intent="relative-colorimetric"/>
  </defs>`;
        
        svgContent = svgContent.replace(svgTag, svgTag + cmykColorSpace);
      }
    }
    
    return svgContent;
  }
}