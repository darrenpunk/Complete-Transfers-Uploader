import * as fs from 'fs';

/**
 * Universal SVG Centering Utility
 * Applies consistent centering transform to all SVG files regardless of source
 */
export class SVGCenteringUtils {
  
  /**
   * Apply automatic centering transform to any SVG content
   * This ensures all uploaded content appears centered within the 283.5×285.2mm bounds
   */
  static applyCenteringTransform(svgContent: string): string {
    console.log('🎨 UNIVERSAL CENTERING: Applying centering transform');
    
    // Skip if already has centering transform
    if (svgContent.includes('translate(402, 404) scale(0.8) translate(-647, -611)')) {
      console.log('⏭️ UNIVERSAL CENTERING: Transform already applied, skipping');
      return svgContent;
    }
    
    let centeredContent = svgContent;
    
    // Add centering transform after the opening <svg> tag but before content
    // This centers content at 647,611 (average of content bounds) to canvas center 402,404
    if (centeredContent.includes('<defs>')) {
      centeredContent = centeredContent.replace(
        '<defs>',
        '<g transform="translate(402, 404) scale(0.8) translate(-647, -611)">\n<defs>'
      );
    } else {
      // If no defs, add after svg opening tag
      centeredContent = centeredContent.replace(
        /(<svg[^>]*>)/,
        '$1\n<g transform="translate(402, 404) scale(0.8) translate(-647, -611)">'
      );
    }
    
    // Close the transform group before closing </svg>
    centeredContent = centeredContent.replace('</svg>', '</g>\n</svg>');
    
    console.log('✅ UNIVERSAL CENTERING: Transform applied successfully');
    return centeredContent;
  }
  
  /**
   * Apply centering transform to an SVG file
   */
  static applyCenteringToFile(svgPath: string): void {
    if (!fs.existsSync(svgPath)) {
      console.warn(`⚠️ UNIVERSAL CENTERING: File not found: ${svgPath}`);
      return;
    }
    
    console.log(`🎨 UNIVERSAL CENTERING: Processing file: ${svgPath}`);
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const centeredContent = this.applyCenteringTransform(svgContent);
    
    if (centeredContent !== svgContent) {
      fs.writeFileSync(svgPath, centeredContent);
      console.log(`✅ UNIVERSAL CENTERING: File updated: ${svgPath}`);
    }
  }
  
  /**
   * Apply centering to multiple SVG files
   */
  static applyCenteringToFiles(svgPaths: string[]): void {
    console.log(`🎨 UNIVERSAL CENTERING: Processing ${svgPaths.length} files`);
    svgPaths.forEach(path => this.applyCenteringToFile(path));
  }
}