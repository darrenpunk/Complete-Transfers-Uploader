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
      
      // Use strings to find CMYK color patterns in PDF content
      const stringCommand = `strings "${pdfPath}" | grep -E "(setcmykcolor|DeviceCMYK)" | head -20`;
      
      try {
        const result = await execAsync(stringCommand);
        const cmykColors: Array<{ c: number, m: number, y: number, k: number }> = [];
        
        // Parse CMYK patterns from PDF content
        // Look for patterns like "0.13 1.0 0.81 0.03 setcmykcolor"
        const cmykPattern = /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+setcmykcolor/g;
        let match;
        
        while ((match = cmykPattern.exec(result)) !== null) {
          const [, c, m, y, k] = match;
          cmykColors.push({
            c: Math.round(parseFloat(c) * 100),
            m: Math.round(parseFloat(m) * 100),
            y: Math.round(parseFloat(y) * 100),
            k: Math.round(parseFloat(k) * 100)
          });
        }
        
        console.log(`🎨 Extracted ${cmykColors.length} CMYK colors from PDF content`);
        return cmykColors.length > 0 ? cmykColors : null;
        
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