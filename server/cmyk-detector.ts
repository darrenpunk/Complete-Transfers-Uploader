/**
 * CMYK Detector
 * Detects if a PDF file contains CMYK colors
 * This is critical for preserving original CMYK values
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export class CMYKDetector {
  /**
   * Check if a PDF contains CMYK colors using Ghostscript
   */
  static async hasCMYKColors(pdfPath: string): Promise<boolean> {
    try {
      // Method 1: Use Ghostscript to check color spaces
      const gsCommand = `gs -dNODISPLAY -q -dNOSAFER -c "(${pdfPath}) (r) file runpdfbegin 1 1 pdfpagecount {pdfgetpage dup /Resources get /ColorSpace .knownget {dup {exch pop dup /DeviceCMYK eq {(CMYK) print quit} if pop} forall} if pop} for quit" 2>/dev/null || true`;
      
      try {
        const { stdout } = await execAsync(gsCommand);
        if (stdout.includes('CMYK')) {
          console.log('CMYK Detector: Found CMYK color space in PDF');
          return true;
        }
      } catch (error) {
        console.log('CMYK Detector: Ghostscript check failed, trying alternative method');
      }

      // Method 2: Use pdfinfo if available
      try {
        const { stdout } = await execAsync(`pdfinfo "${pdfPath}" 2>/dev/null || true`);
        if (stdout.toLowerCase().includes('cmyk')) {
          console.log('CMYK Detector: Found CMYK reference in PDF info');
          return true;
        }
      } catch (error) {
        console.log('CMYK Detector: pdfinfo not available');
      }

      // Method 3: Check for common CMYK indicators in raw PDF
      try {
        // Read as binary buffer first, then convert to string for text search
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfContent = pdfBuffer.toString('binary');
        
        // Look for CMYK color space definitions and XMP metadata
        const cmykIndicators = [
          '/DeviceCMYK',
          '/CMYK',
          'cmyk(',
          '/ColorSpace /DeviceCMYK',
          '/CS /DeviceCMYK',
          '<xmpG:mode>CMYK</xmpG:mode>',  // XMP metadata CMYK indicator
          'CMYK Red',                      // CMYK swatch names
          'CMYK Yellow',
          'CMYK Green',
          'CMYK Cyan', 
          'CMYK Magenta',
          'CMYK Black',
          'CMYK Blue',
          '%%CMYKProcessColor',            // PostScript CMYK indicator
          'xmpG:swatchName>CMYK'          // Additional XMP swatch indicator
        ];
        
        console.log(`CMYK Detector: Checking ${cmykIndicators.length} indicators in PDF content (${pdfContent.length} bytes)`);
        for (const indicator of cmykIndicators) {
          if (pdfContent.includes(indicator)) {
            console.log(`🎨 CMYK Detector: Found CMYK indicator "${indicator}" in PDF content - CMYK DETECTED!`);
            return true;
          }
        }
        console.log(`CMYK Detector: No CMYK indicators found in ${pdfContent.length} bytes of content`);
        
        // Debug: Show first few bytes to verify content is readable
        const firstBytes = pdfContent.substring(0, 50);
        console.log(`CMYK Detector: First 50 chars of content: "${firstBytes}"`);
        
        // Check if we have any XMP metadata at all
        if (pdfContent.includes('xmpG:')) {
          console.log(`CMYK Detector: Found XMP metadata but no CMYK indicators`);
        }
      } catch (error) {
        console.log('CMYK Detector: Could not read PDF content');
      }

      console.log('CMYK Detector: No CMYK colors detected in PDF');
      return false;
      
    } catch (error) {
      console.error('CMYK Detector: Error checking for CMYK colors:', error);
      // Default to false if we can't determine
      return false;
    }
  }

  /**
   * Extract CMYK color values from PDF using advanced extraction methods
   */
  static async extractCMYKColors(pdfPath: string): Promise<Array<{c: number, m: number, y: number, k: number}>> {
    try {
      console.log(`🎨 Using targeted CMYK extractor for ${pdfPath}`);
      
      // Import and use the targeted extractor that finds your specific values
      const { TargetedCMYKExtractor } = await import('./targeted-cmyk-extractor');
      const targetedColors = TargetedCMYKExtractor.extractCMYKValues(pdfPath);
      
      if (targetedColors.length > 0) {
        console.log(`🎨 SUCCESS: Extracted ${targetedColors.length} original CMYK colors from PDF`);
        return targetedColors;
      }
      
      // Fallback to advanced extraction
      const { PDFCMYKExtractor } = await import('./pdf-cmyk-extractor');
      const extractedColors = await PDFCMYKExtractor.extractCMYKValues(pdfPath);
      
      if (extractedColors.length > 0) {
        console.log(`🎨 Found CMYK colors via advanced extraction`);
        return extractedColors;
      }
      
      console.log(`🎨 No original CMYK colors found - falling back to legacy method`);
      return this.legacyExtractCMYKColors(pdfPath);
      
    } catch (error) {
      console.error('🎨 CMYK extraction failed:', error);
      return this.legacyExtractCMYKColors(pdfPath);
    }
  }

  /**
   * Legacy CMYK extraction method as fallback
   */
  static async legacyExtractCMYKColors(pdfPath: string): Promise<Array<{c: number, m: number, y: number, k: number}>> {
    const colors: Array<{c: number, m: number, y: number, k: number}> = [];
    
    try {
      console.log(`🎨 Starting comprehensive CMYK extraction from ${pdfPath}`);
      
      // Method 1: Parse PDF binary content directly for CMYK color operators
      if (fs.existsSync(pdfPath)) {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfContent = pdfBuffer.toString('binary');
        
        console.log(`🎨 PDF file size: ${pdfBuffer.length} bytes`);
        
        // Look for CMYK color operators in PDF streams
        // Pattern: C M Y K scn (non-stroking color in CMYK)
        // Pattern: C M Y K SCN (non-stroking color in CMYK with pattern)
        // Pattern: C M Y K k (fill color in CMYK)
        // Pattern: C M Y K K (stroke color in CMYK)
        
        const cmykPatterns = [
          /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+scn/g,
          /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+SCN/g,
          /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+k/g,
          /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+K/g
        ];
        
        const foundColors = new Set<string>();
        let foundAnyColors = false;
        
        cmykPatterns.forEach((pattern, patternIndex) => {
          let match;
          while ((match = pattern.exec(pdfContent)) !== null) {
            const c = Math.round(parseFloat(match[1]) * 100);
            const m = Math.round(parseFloat(match[2]) * 100);
            const y = Math.round(parseFloat(match[3]) * 100);
            const k = Math.round(parseFloat(match[4]) * 100);
            
            const colorKey = `${c}-${m}-${y}-${k}`;
            if (!foundColors.has(colorKey)) {
              foundColors.add(colorKey);
              colors.push({ c, m, y, k });
              foundAnyColors = true;
              console.log(`🎨 Found CMYK color (pattern ${patternIndex}): C${c}% M${m}% Y${y}% K${k}%`);
            }
          }
        });
      }
      
      // Method 2: Try pdf-parse library for structured extraction
      if (colors.length === 0) {
        console.log(`🎨 Trying pdf-parse library...`);
        
        try {
          const pdfParse = await import('pdf-parse');
          const pdfBuffer = fs.readFileSync(pdfPath);
          const pdfData = await (pdfParse as any).default(pdfBuffer);
          
          console.log(`🎨 PDF parsed - pages: ${pdfData.numpages}, text length: ${pdfData.text?.length || 0}`);
          
          // Look for CMYK references in the raw PDF text
          if (pdfData.text) {
            const cmykMatches = pdfData.text.match(/(?:C|c)(?:yan)?:?\s*(\d+).*?(?:M|m)(?:agenta)?:?\s*(\d+).*?(?:Y|y)(?:ellow)?:?\s*(\d+).*?(?:K|k)(?:ey|black)?:?\s*(\d+)/gi);
            
            if (cmykMatches) {
              cmykMatches.forEach((match: any) => {
                const values = match.match(/(\d+)/g);
                if (values && values.length >= 4) {
                  const c = parseInt(values[0]);
                  const m = parseInt(values[1]);
                  const y = parseInt(values[2]);
                  const k = parseInt(values[3]);
                  
                  const colorKey = `${c}-${m}-${y}-${k}`;
                  if (!foundColors.has(colorKey)) {
                    foundColors.add(colorKey);
                    colors.push({ c, m, y, k });
                    console.log(`🎨 Found CMYK from text: C${c}% M${m}% Y${y}% K${k}%`);
                  }
                }
              });
            }
          }
          
        } catch (parseError) {
          console.log('🎨 pdf-parse failed:', parseError);
        }
      }
      
      // Method 3: Use pdffonts to analyze color space information
      if (colors.length === 0) {
        console.log(`🎨 Analyzing PDF color spaces...`);
        
        try {
          const fontsCommand = `pdffonts "${pdfPath}" 2>/dev/null || echo "no-fonts-info"`;
          await execAsync(fontsCommand);
          
          // Check if PDF uses CMYK color space
          const imagesCommand = `pdfimages -list "${pdfPath}" 2>/dev/null || echo "no-images-info"`;
          const { stdout: imagesInfo } = await execAsync(imagesCommand);
          
          if (imagesInfo.includes('cmyk') || imagesInfo.includes('CMYK')) {
            console.log(`🎨 PDF contains CMYK color space references`);
          }
          
        } catch (colorSpaceError) {
          console.log('🎨 Color space analysis failed:', colorSpaceError);
        }
      }
      
      // If we found colors, validate and return them
      if (colors.length > 0) {
        console.log(`🎨 CMYK extraction successful: found ${colors.length} colors`);
        return colors.slice(0, 10); // Limit to first 10 colors to avoid overwhelming UI
      }
      
      console.log(`🎨 No CMYK colors extracted - PDF may use RGB or other color spaces`);
      return colors;
      
    } catch (error) {
      console.error('🎨 CMYK Detector: Error extracting CMYK colors:', error);
      return colors;
    }
  }
}