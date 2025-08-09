import fs from 'fs';
import path from 'path';

export class CMYKService {
  /**
   * Detects CMYK content in PDFs by checking for XMP metadata and CMYK color spaces
   */
  static async detectCMYKInPDF(pdfPath: string): Promise<boolean> {
    try {
      console.log(`🎨🎨🎨 CMYK SERVICE: Analyzing ${pdfPath}`);
      
      if (!fs.existsSync(pdfPath)) {
        console.log(`❌ PDF file not found: ${pdfPath}`);
        return false;
      }

      // Read PDF as binary buffer
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfContent = pdfBuffer.toString('binary');
      
      console.log(`📄 PDF size: ${pdfBuffer.length} bytes`);
      
      // Check for CMYK indicators in the PDF content
      const cmykIndicators = [
        // XMP metadata CMYK mode
        '<xmpG:mode>CMYK</xmpG:mode>',
        'xmpG:mode="CMYK"',
        
        // PDF color space definitions
        '/DeviceCMYK',
        '/CMYK',
        
        // ICC profile CMYK signatures
        'CMYK',
        'cmyk',
        
        // Color space arrays with CMYK
        '[/DeviceCMYK]',
        
        // CMYK color values (4-component)
        /\b[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+k\b/,
        /\b[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+K\b/,
      ];
      
      let foundIndicators = 0;
      const foundDetails: string[] = [];
      
      for (const indicator of cmykIndicators) {
        if (typeof indicator === 'string') {
          if (pdfContent.includes(indicator)) {
            foundIndicators++;
            foundDetails.push(`String: "${indicator}"`);
            console.log(`✅ Found CMYK indicator: ${indicator}`);
          }
        } else {
          // RegExp indicator
          if (indicator.test(pdfContent)) {
            foundIndicators++;
            foundDetails.push(`Pattern: ${indicator.source}`);
            console.log(`✅ Found CMYK pattern: ${indicator.source}`);
          }
        }
      }
      
      const isCMYK = foundIndicators > 0;
      
      console.log(`🎨 CMYK Detection Result: ${isCMYK ? 'CMYK DETECTED' : 'RGB/No CMYK'}`);
      console.log(`📊 Found ${foundIndicators} CMYK indicators:`, foundDetails);
      
      return isCMYK;
      
    } catch (error) {
      console.error(`❌ CMYK detection error for ${pdfPath}:`, error);
      return false;
    }
  }

  /**
   * Processes uploaded file and preserves original CMYK PDF if detected
   */
  static async processUploadedFile(file: Express.Multer.File, uploadDir: string): Promise<{
    isCMYKPreserved: boolean;
    originalPdfPath?: string;
    cmykColors?: Array<{ c: number, m: number, y: number, k: number }>;
  }> {
    try {
      const filePath = path.join(uploadDir, file.filename);
      
      // Only process PDFs
      if (file.mimetype !== 'application/pdf') {
        return { isCMYKPreserved: false };
      }
      
      console.log(`🔍🔍🔍 CMYK SERVICE: Processing ${file.originalname}`);
      
      // Extract actual CMYK values AND detect CMYK presence
      const [cmykColors, isCMYK] = await Promise.all([
        this.extractCMYKValues(filePath),
        this.detectCMYKInPDF(filePath)
      ]);
      
      // Consider CMYK if either detection method succeeded or we found CMYK colors
      const hasCMYK = isCMYK || (cmykColors && cmykColors.length > 0);
      
      if (hasCMYK) {
        // Create a preserved copy with 'original_' prefix
        const originalFilename = `original_${file.filename}`;
        const originalPath = path.join(uploadDir, originalFilename);
        
        // Copy the original PDF to preserve it
        fs.copyFileSync(filePath, originalPath);
        
        console.log(`💾 CMYK PDF preserved as: ${originalFilename}`);
        console.log(`🎨 Extracted ${cmykColors?.length || 0} CMYK color values`);
        
        return {
          isCMYKPreserved: true,
          originalPdfPath: originalPath,
          cmykColors: cmykColors || []
        };
      }
      
      return { isCMYKPreserved: false };
      
    } catch (error) {
      console.error('❌ CMYK service processing error:', error);
      return { isCMYKPreserved: false };
    }
  }

  /**
   * Extract actual CMYK color values from PDF content stream
   */
  private static async extractCMYKValues(pdfPath: string): Promise<Array<{ c: number, m: number, y: number, k: number }> | null> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      console.log(`🔍 Starting CMYK value extraction from: ${pdfPath}`);
      
      // Method 1: Use Ghostscript to extract color information directly
      const gsCommand = `gs -dNODISPLAY -dBATCH -dNOPAUSE -q -c "
        /showcolors {
          0 1 {
            dup setcolor
            currentcolor == flush
          } for
        } def
        /DeviceCMYK setcolorspace
        showcolors
      " "${pdfPath}" 2>/dev/null || echo "gs_failed"`;
      
      // Method 2: Extract raw PDF content and look for color patterns
      const extractCommand = `pdftotext -raw "${pdfPath}" - 2>/dev/null | head -50 || strings "${pdfPath}" | head -100`;
      
      try {
        // Try Ghostscript first
        let result = await execAsync(gsCommand);
        console.log(`🎨 Ghostscript extraction result length: ${result.length}`);
        
        // If Ghostscript fails, try text extraction
        if (result.includes('gs_failed') || result.length < 10) {
          console.log(`🔄 Falling back to text extraction method`);
          result = await execAsync(extractCommand);
        }
        
        const cmykColors: Array<{ c: number, m: number, y: number, k: number }> = [];
        
        // Multiple pattern matching approaches
        const patterns = [
          // Standard PostScript setcmykcolor: "0.13 1.0 0.81 0.03 setcmykcolor"
          /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+setcmykcolor/g,
          // PDF stream format: "0.13 1.0 0.81 0.03 K"
          /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+K/g,
          // Array format: "[0.13 1.0 0.81 0.03]"
          /\[(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\]/g,
          // Direct CMYK values: "C:70 M:67 Y:64 K:74"
          /C:?(\d+(?:\.\d+)?)\s*M:?(\d+(?:\.\d+)?)\s*Y:?(\d+(?:\.\d+)?)\s*K:?(\d+(?:\.\d+)?)/gi
        ];
        
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(result)) !== null) {
            const [, c, m, y, k] = match;
            let cVal = parseFloat(c);
            let mVal = parseFloat(m);
            let yVal = parseFloat(y);
            let kVal = parseFloat(k);
            
            // Handle percentage vs decimal values
            if (cVal <= 1 && mVal <= 1 && yVal <= 1 && kVal <= 1) {
              // Decimal format (0.0-1.0), convert to percentage
              cVal = Math.round(cVal * 100);
              mVal = Math.round(mVal * 100);
              yVal = Math.round(yVal * 100);
              kVal = Math.round(kVal * 100);
            } else {
              // Already percentage format
              cVal = Math.round(cVal);
              mVal = Math.round(mVal);
              yVal = Math.round(yVal);
              kVal = Math.round(kVal);
            }
            
            // Only add valid CMYK values (0-100%)
            if (cVal >= 0 && cVal <= 100 && mVal >= 0 && mVal <= 100 && 
                yVal >= 0 && yVal <= 100 && kVal >= 0 && kVal <= 100) {
              cmykColors.push({ c: cVal, m: mVal, y: yVal, k: kVal });
              console.log(`✅ Found CMYK: C:${cVal}% M:${mVal}% Y:${yVal}% K:${kVal}%`);
            }
          }
        }
        
        // Remove duplicates
        const uniqueColors = cmykColors.filter((color, index, arr) => 
          arr.findIndex(c => c.c === color.c && c.m === color.m && c.y === color.y && c.k === color.k) === index
        );
        
        console.log(`🎨 Extracted ${uniqueColors.length} unique CMYK colors from PDF`);
        return uniqueColors.length > 0 ? uniqueColors : null;
        
      } catch (extractError) {
        console.log(`⚠️ CMYK value extraction failed:`, extractError);
        return null;
      }

    } catch (error) {
      console.error('CMYK value extraction error:', error);
      return null;
    }
  }
}