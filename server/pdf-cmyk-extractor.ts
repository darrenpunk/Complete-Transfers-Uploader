import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

export class PDFCMYKExtractor {
  /**
   * Extract CMYK colors directly from PDF content using multiple sophisticated methods
   */
  static async extractCMYKValues(pdfPath: string): Promise<CMYKColor[]> {
    const colors: CMYKColor[] = [];
    
    try {
      console.log(`🎨 Starting comprehensive CMYK extraction from ${pdfPath}`);
      
      // Method 1: Extract using pdfgrep if available
      try {
        const { stdout } = await execAsync(`pdfgrep -n "CMYK\\|cmyk\\|device-cmyk" "${pdfPath}" 2>/dev/null || echo "no-grep"`);
        if (stdout && !stdout.includes('no-grep')) {
          console.log(`🎨 Found CMYK references in PDF text: ${stdout.trim()}`);
        }
      } catch (e) {
        console.log('🎨 pdfgrep not available');
      }
      
      // Method 2: Parse PDF content streams for CMYK operators
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfContent = pdfBuffer.toString('binary');
      
      // Look for PDF color operators that set CMYK values
      // These are the actual PDF operators used to set colors in CMYK color space
      const cmykOperators = [
        // K operator (stroke color in CMYK)
        /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+K/g,
        // k operator (non-stroke color in CMYK)  
        /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+k/g,
        // scn operator with 4 values (CMYK)
        /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+scn/g,
        // SCN operator with 4 values (CMYK)
        /([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+SCN/g
      ];
      
      const foundColors = new Set<string>();
      
      cmykOperators.forEach((pattern, index) => {
        let match;
        while ((match = pattern.exec(pdfContent)) !== null) {
          // PDF CMYK values are in range 0-1, convert to percentage
          const c = Math.round(parseFloat(match[1]) * 100);
          const m = Math.round(parseFloat(match[2]) * 100);
          const y = Math.round(parseFloat(match[3]) * 100);
          const k = Math.round(parseFloat(match[4]) * 100);
          
          const colorKey = `${c}-${m}-${y}-${k}`;
          if (!foundColors.has(colorKey) && (c > 0 || m > 0 || y > 0 || k > 0)) {
            foundColors.add(colorKey);
            colors.push({ c, m, y, k });
            console.log(`🎨 Found CMYK color (operator ${index}): C${c}% M${m}% Y${y}% K${k}%`);
          }
        }
      });
      
      // Method 3: Look for DeviceCMYK color space definitions
      const deviceCMYKPattern = /\/DeviceCMYK/g;
      if (deviceCMYKPattern.test(pdfContent)) {
        console.log(`🎨 PDF uses DeviceCMYK color space`);
      }
      
      // Method 4: Search for embedded color profiles
      if (pdfContent.includes('/ICCBased') || pdfContent.includes('CMYK')) {
        console.log(`🎨 PDF contains ICC-based color profile or CMYK references`);
      }
      
      // Method 5: Look for specific CMYK color definitions in object streams
      const cmykDefinitionPattern = /\[([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\]\s*\/DeviceCMYK/g;
      let match;
      while ((match = cmykDefinitionPattern.exec(pdfContent)) !== null) {
        const c = Math.round(parseFloat(match[1]) * 100);
        const m = Math.round(parseFloat(match[2]) * 100);
        const y = Math.round(parseFloat(match[3]) * 100);
        const k = Math.round(parseFloat(match[4]) * 100);
        
        const colorKey = `${c}-${m}-${y}-${k}`;
        if (!foundColors.has(colorKey)) {
          foundColors.add(colorKey);
          colors.push({ c, m, y, k });
          console.log(`🎨 Found CMYK definition: C${c}% M${m}% Y${y}% K${k}%`);
        }
      }
      
      // Method 6: Look for specific CMYK percentage patterns in content
      // Your PDFs likely contain the exact values C70% M67% Y64% K74% and C13% M100% Y81% K3%
      const percentagePatterns = [
        /C(\d+)%\s*M(\d+)%\s*Y(\d+)%\s*K(\d+)%/gi,
        /C:(\d+)\s*M:(\d+)\s*Y:(\d+)\s*K:(\d+)/gi,
        /Cyan[:\s]*(\d+).*?Magenta[:\s]*(\d+).*?Yellow[:\s]*(\d+).*?Key[:\s]*(\d+)/gi
      ];
      
      percentagePatterns.forEach((pattern, patternIndex) => {
        let match;
        while ((match = pattern.exec(pdfContent)) !== null) {
          const c = parseInt(match[1]);
          const m = parseInt(match[2]);
          const y = parseInt(match[3]);
          const k = parseInt(match[4]);
          
          // Validate the values are reasonable percentages
          if (c >= 0 && c <= 100 && m >= 0 && m <= 100 && y >= 0 && y <= 100 && k >= 0 && k <= 100) {
            const colorKey = `${c}-${m}-${y}-${k}`;
            if (!foundColors.has(colorKey)) {
              foundColors.add(colorKey);
              colors.push({ c, m, y, k });
              console.log(`🎨 Found CMYK percentage (pattern ${patternIndex}): C${c}% M${m}% Y${y}% K${k}%`);
            }
          }
        }
      });
      
      // Method 7: Try to extract using strings command to find readable color data
      try {
        const { stdout } = await execAsync(`strings "${pdfPath}" | grep -i "cmyk\\|cyan\\|magenta\\|yellow\\|black" | head -10`);
        if (stdout.trim()) {
          console.log(`🎨 Found color-related strings in PDF: ${stdout.trim()}`);
          
          // Look for patterns like "C:70 M:67 Y:64 K:74" in the strings output
          const stringCMYKPattern = /C:?\s*(\d+)\s*M:?\s*(\d+)\s*Y:?\s*(\d+)\s*K:?\s*(\d+)/gi;
          let stringMatch;
          while ((stringMatch = stringCMYKPattern.exec(stdout)) !== null) {
            const c = parseInt(stringMatch[1]);
            const m = parseInt(stringMatch[2]);
            const y = parseInt(stringMatch[3]);
            const k = parseInt(stringMatch[4]);
            
            const colorKey = `${c}-${m}-${y}-${k}`;
            if (!foundColors.has(colorKey)) {
              foundColors.add(colorKey);
              colors.push({ c, m, y, k });
              console.log(`🎨 Found CMYK from strings: C${c}% M${m}% Y${y}% K${k}%`);
            }
          }
        }
      } catch (e) {
        console.log('🎨 strings command not available or failed');
      }
      
      if (colors.length > 0) {
        console.log(`🎨 Successfully extracted ${colors.length} CMYK colors from PDF`);
        return colors;
      }
      
      console.log(`🎨 No CMYK colors found in PDF - may use RGB color space or compressed streams`);
      return [];
      
    } catch (error) {
      console.error('🎨 PDF CMYK extraction error:', error);
      return [];
    }
  }
  
  /**
   * Alternative method: Try to extract color information from PDF metadata
   */
  static async extractFromMetadata(pdfPath: string): Promise<CMYKColor[]> {
    const colors: CMYKColor[] = [];
    
    try {
      // Try pdfinfo if available
      const { stdout } = await execAsync(`pdfinfo "${pdfPath}" 2>/dev/null || echo "no-info"`);
      if (stdout && !stdout.includes('no-info')) {
        console.log(`🎨 PDF Info: ${stdout.trim()}`);
      }
    } catch (e) {
      console.log('🎨 pdfinfo not available');
    }
    
    return colors;
  }
}