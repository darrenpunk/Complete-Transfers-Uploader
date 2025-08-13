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
          '/CS /DeviceCMYK',
          '<xmpG:mode>CMYK</xmpG:mode>',  // XMP metadata CMYK indicator
          'CMYK Red',                      // CMYK swatch names
          'CMYK Yellow',
          'CMYK Green',
          'CMYK Cyan',
          'CMYK Magenta',
          'CMYK Black'
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

      // Method 4: Advanced CMYK detection using pdfimages and identify
      try {
        // Extract images and check their color space
        const tempDir = pdfPath.replace('.pdf', '_temp');
        await execAsync(`mkdir -p "${tempDir}"`);
        
        // Extract images from PDF
        await execAsync(`pdfimages "${pdfPath}" "${tempDir}/img" 2>/dev/null || true`);
        
        // Check if any extracted images have CMYK color space
        const { stdout: lsOutput } = await execAsync(`ls "${tempDir}"/ 2>/dev/null || echo ""`);
        const imageFiles = lsOutput.split('\n').filter(f => f.trim() !== '');
        
        for (const imageFile of imageFiles) {
          try {
            const imagePath = `${tempDir}/${imageFile}`;
            const { stdout: identifyOutput } = await execAsync(`identify -verbose "${imagePath}" 2>/dev/null || true`);
            
            if (identifyOutput.toLowerCase().includes('cmyk') || 
                identifyOutput.toLowerCase().includes('colorspace: cmyk') ||
                identifyOutput.toLowerCase().includes('channels: cmyk')) {
              console.log(`CMYK Detector: Found CMYK image in PDF: ${imageFile}`);
              await execAsync(`rm -rf "${tempDir}" 2>/dev/null || true`);
              return true;
            }
          } catch (e) {
            // Continue checking other images
          }
        }
        
        // Clean up
        await execAsync(`rm -rf "${tempDir}" 2>/dev/null || true`);
      } catch (error) {
        console.log('CMYK Detector: Advanced image detection failed');
      }

      // Method 5: Check for CMYK-specific operators in PDF streams
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfContent = pdfBuffer.toString('latin1'); // Use latin1 to preserve binary data
        
        // Look for CMYK color operators
        const cmykOperators = [
          'K ', // CMYK color operator (setcmykcolor)
          'k ', // CMYK color operator (lowercase)
          'SC ', // setcolor with CMYK
          'sc ', // setcolor with CMYK (lowercase)
          '\\bCMYK\\b', // CMYK keyword
          'DeviceCMYK', // DeviceCMYK color space
          '/ColorSpace\\s*/DeviceCMYK', // ColorSpace DeviceCMYK
          'separation', // Separation color space (often CMYK-based)
          'Separation' // Separation color space
        ];
        
        for (const operator of cmykOperators) {
          const regex = new RegExp(operator, 'gi');
          if (regex.test(pdfContent)) {
            console.log(`CMYK Detector: Found CMYK operator "${operator}" in PDF streams`);
            return true;
          }
        }
      } catch (error) {
        console.log('CMYK Detector: Could not analyze PDF streams');
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