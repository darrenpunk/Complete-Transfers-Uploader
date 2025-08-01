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
        const pdfContent = fs.readFileSync(pdfPath, 'utf8');
        
        // Look for CMYK color space definitions
        const cmykIndicators = [
          '/DeviceCMYK',
          '/CMYK',
          'cmyk(',
          '/ColorSpace /DeviceCMYK',
          '/CS /DeviceCMYK'
        ];
        
        for (const indicator of cmykIndicators) {
          if (pdfContent.includes(indicator)) {
            console.log(`CMYK Detector: Found CMYK indicator "${indicator}" in PDF content`);
            return true;
          }
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
   * Extract CMYK color values from PDF using Ghostscript
   */
  static async extractCMYKColors(pdfPath: string): Promise<Array<{c: number, m: number, y: number, k: number}>> {
    const colors: Array<{c: number, m: number, y: number, k: number}> = [];
    
    try {
      // Use Ghostscript to extract color information
      const tempPs = pdfPath.replace('.pdf', '_colors.ps');
      
      // PostScript code to extract CMYK colors
      const psCode = `
/cmykcolors [] def
/DeviceCMYK setcolorspace
{
  /cmykcolors cmykcolors
  currentcolor 4 array astore
  aput def
} bind
      `;
      
      fs.writeFileSync(tempPs, psCode);
      
      // Run Ghostscript to process the PDF
      const gsCommand = `gs -dNODISPLAY -dNOSAFER -dBATCH -q -sDEVICE=nullpage "${tempPs}" "${pdfPath}" 2>&1 || true`;
      
      try {
        const { stdout } = await execAsync(gsCommand);
        // Parse any CMYK values from output
        const cmykPattern = /(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+cmyk/gi;
        let match;
        
        while ((match = cmykPattern.exec(stdout)) !== null) {
          colors.push({
            c: Math.round(parseFloat(match[1]) * 100),
            m: Math.round(parseFloat(match[2]) * 100),
            y: Math.round(parseFloat(match[3]) * 100),
            k: Math.round(parseFloat(match[4]) * 100)
          });
        }
      } catch (error) {
        console.log('CMYK Detector: Could not extract specific CMYK values');
      }
      
      // Clean up temp file
      if (fs.existsSync(tempPs)) {
        fs.unlinkSync(tempPs);
      }
      
    } catch (error) {
      console.error('CMYK Detector: Error extracting CMYK colors:', error);
    }
    
    return colors;
  }
}