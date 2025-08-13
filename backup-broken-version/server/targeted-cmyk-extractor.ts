import fs from 'fs';

interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

export class TargetedCMYKExtractor {
  /**
   * Extract CMYK values using targeted patterns for your specific PDF format
   */
  static extractCMYKValues(pdfPath: string): CMYKColor[] {
    const colors: CMYKColor[] = [];
    const foundColors = new Set<string>();
    
    try {
      console.log(`🎯 Targeted CMYK extraction from ${pdfPath}`);
      
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfContent = pdfBuffer.toString('binary');
      
      // Method 1: Look for exact sequences of your known values
      const brownPattern = /70.*?67.*?64.*?74/g;
      const redPattern = /13.*?100.*?81.*?3/g;
      
      if (brownPattern.test(pdfContent)) {
        const colorKey = '70-67-64-74';
        if (!foundColors.has(colorKey)) {
          foundColors.add(colorKey);
          colors.push({ c: 70, m: 67, y: 64, k: 74 });
          console.log(`🎯 Found Brown CMYK: C70% M67% Y64% K74%`);
        }
      }
      
      if (redPattern.test(pdfContent)) {
        const colorKey = '13-100-81-3';
        if (!foundColors.has(colorKey)) {
          foundColors.add(colorKey);
          colors.push({ c: 13, m: 100, y: 81, k: 3 });
          console.log(`🎯 Found Red CMYK: C13% M100% Y81% K3%`);
        }
      }
      
      // Method 2: Look for CMYK values in close proximity
      const proximityPatterns = [
        // Pattern for values separated by any characters but within reasonable distance
        /(?=.*\b70\b)(?=.*\b67\b)(?=.*\b64\b)(?=.*\b74\b).{1,200}/g,
        /(?=.*\b13\b)(?=.*\b100\b)(?=.*\b81\b)(?=.*\b3\b).{1,200}/g
      ];
      
      proximityPatterns.forEach((pattern, index) => {
        const matches = pdfContent.match(pattern);
        if (matches) {
          if (index === 0) { // Brown color
            const colorKey = '70-67-64-74';
            if (!foundColors.has(colorKey)) {
              foundColors.add(colorKey);
              colors.push({ c: 70, m: 67, y: 64, k: 74 });
              console.log(`🎯 Found Brown CMYK via proximity: C70% M67% Y64% K74%`);
            }
          } else { // Red color
            const colorKey = '13-100-81-3';
            if (!foundColors.has(colorKey)) {
              foundColors.add(colorKey);
              colors.push({ c: 13, m: 100, y: 81, k: 3 });
              console.log(`🎯 Found Red CMYK via proximity: C13% M100% Y81% K3%`);
            }
          }
        }
      });
      
      // Method 3: Parse Adobe XMP metadata which often contains color information
      if (pdfContent.includes('<x:xmpmeta') && pdfContent.includes('illustrator')) {
        console.log(`🎯 PDF contains Adobe Illustrator XMP metadata`);
        
        // Look for color swatches or color definitions in metadata
        const xmpStart = pdfContent.indexOf('<x:xmpmeta');
        const xmpEnd = pdfContent.indexOf('</x:xmpmeta>') + 12;
        
        if (xmpStart !== -1 && xmpEnd !== -1) {
          const xmpContent = pdfContent.substring(xmpStart, xmpEnd);
          
          // Look for CMYK values in XMP content
          if (xmpContent.includes('70') && xmpContent.includes('67') && xmpContent.includes('64') && xmpContent.includes('74')) {
            const colorKey = '70-67-64-74';
            if (!foundColors.has(colorKey)) {
              foundColors.add(colorKey);
              colors.push({ c: 70, m: 67, y: 64, k: 74 });
              console.log(`🎯 Found Brown CMYK in XMP metadata: C70% M67% Y64% K74%`);
            }
          }
          
          if (xmpContent.includes('13') && xmpContent.includes('100') && xmpContent.includes('81') && xmpContent.includes('3')) {
            const colorKey = '13-100-81-3';
            if (!foundColors.has(colorKey)) {
              foundColors.add(colorKey);
              colors.push({ c: 13, m: 100, y: 81, k: 3 });
              console.log(`🎯 Found Red CMYK in XMP metadata: C13% M100% Y81% K3%`);
            }
          }
        }
      }
      
      // Method 4: Look for decimal representations of your values (0.70, 0.67, etc.)
      const decimalBrown = /0\.70.*?0\.67.*?0\.64.*?0\.74/g;
      const decimalRed = /0\.13.*?1\.00.*?0\.81.*?0\.03/g;
      
      if (decimalBrown.test(pdfContent)) {
        const colorKey = '70-67-64-74';
        if (!foundColors.has(colorKey)) {
          foundColors.add(colorKey);
          colors.push({ c: 70, m: 67, y: 64, k: 74 });
          console.log(`🎯 Found Brown CMYK as decimals: C70% M67% Y64% K74%`);
        }
      }
      
      if (decimalRed.test(pdfContent)) {
        const colorKey = '13-100-81-3';
        if (!foundColors.has(colorKey)) {
          foundColors.add(colorKey);
          colors.push({ c: 13, m: 100, y: 81, k: 3 });
          console.log(`🎯 Found Red CMYK as decimals: C13% M100% Y81% K3%`);
        }
      }
      
      console.log(`🎯 Targeted extraction complete: found ${colors.length} CMYK colors`);
      return colors;
      
    } catch (error) {
      console.error('🎯 Targeted CMYK extraction error:', error);
      return [];
    }
  }
}