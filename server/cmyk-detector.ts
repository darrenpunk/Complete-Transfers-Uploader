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
   * Extract CMYK color values from PDF using multiple methods
   */
  static async extractCMYKColors(pdfPath: string): Promise<Array<{c: number, m: number, y: number, k: number}>> {
    const colors: Array<{c: number, m: number, y: number, k: number}> = [];
    
    try {
      console.log(`🎨 Starting CMYK extraction from ${pdfPath}`);
      
      // Method 1: Try to extract CMYK values directly from PDF content
      if (fs.existsSync(pdfPath)) {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfContent = pdfBuffer.toString('binary');
        
        // Look for CMYK color commands in PDF
        // Pattern: decimal decimal decimal decimal k (fill)
        // Pattern: decimal decimal decimal decimal K (stroke)
        const cmykFillPattern = /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+k/g;
        const cmykStrokePattern = /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+K/g;
        
        let match;
        const foundColors = new Set<string>();
        
        // Extract fill colors
        while ((match = cmykFillPattern.exec(pdfContent)) !== null) {
          const c = Math.round(parseFloat(match[1]) * 100);
          const m = Math.round(parseFloat(match[2]) * 100);
          const y = Math.round(parseFloat(match[3]) * 100);
          const k = Math.round(parseFloat(match[4]) * 100);
          
          const colorKey = `${c}-${m}-${y}-${k}`;
          if (!foundColors.has(colorKey)) {
            foundColors.add(colorKey);
            colors.push({ c, m, y, k });
            console.log(`🎨 Found CMYK fill color: C${c} M${m} Y${y} K${k}`);
          }
        }
        
        // Extract stroke colors
        while ((match = cmykStrokePattern.exec(pdfContent)) !== null) {
          const c = Math.round(parseFloat(match[1]) * 100);
          const m = Math.round(parseFloat(match[2]) * 100);
          const y = Math.round(parseFloat(match[3]) * 100);
          const k = Math.round(parseFloat(match[4]) * 100);
          
          const colorKey = `${c}-${m}-${y}-${k}`;
          if (!foundColors.has(colorKey)) {
            foundColors.add(colorKey);
            colors.push({ c, m, y, k });
            console.log(`🎨 Found CMYK stroke color: C${c} M${m} Y${y} K${k}`);
          }
        }
      }
      
      // Method 2: If no colors found, try Ghostscript method with improved pattern
      if (colors.length === 0) {
        console.log(`🎨 No direct CMYK found, trying Ghostscript method...`);
        
        try {
          // Use gs to dump CMYK color information
          const gsCommand = `gs -dNODISPLAY -dBATCH -dQUIET -sDEVICE=txtwrite -sOutputFile=- "${pdfPath}" 2>/dev/null || echo "gs-failed"`;
          const { stdout } = await execAsync(gsCommand);
          
          // Look for any CMYK references in the output
          const lines = stdout.split('\n');
          lines.forEach(line => {
            if (line.includes('CMYK') || line.includes('cmyk')) {
              console.log(`🎨 Ghostscript found CMYK reference: ${line.substring(0, 100)}`);
            }
          });
          
        } catch (error) {
          console.log('🎨 Ghostscript method failed:', error);
        }
      }
      
      // Method 3: If still no colors, provide fallback based on common print colors
      if (colors.length === 0) {
        console.log(`🎨 No CMYK colors extracted, checking for common patterns...`);
        
        // Check if PDF contains color content by looking for colorspace definitions
        if (fs.existsSync(pdfPath)) {
          const pdfBuffer = fs.readFileSync(pdfPath);
          const pdfContent = pdfBuffer.toString('binary');
          
          if (pdfContent.includes('/DeviceCMYK') || pdfContent.includes('CMYK')) {
            console.log(`🎨 PDF contains CMYK references but couldn't extract specific values`);
            // Return placeholder values that will trigger manual color picker
            colors.push({ c: 0, m: 0, y: 0, k: 100 }); // Black as placeholder
          }
        }
      }
      
      console.log(`🎨 CMYK extraction complete: found ${colors.length} colors`);
      return colors;
      
    } catch (error) {
      console.error('🎨 CMYK Detector: Error extracting CMYK colors:', error);
      return colors;
    }
  }
}