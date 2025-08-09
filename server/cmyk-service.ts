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
  }> {
    try {
      const filePath = path.join(uploadDir, file.filename);
      
      // Only process PDFs
      if (file.mimetype !== 'application/pdf') {
        return { isCMYKPreserved: false };
      }
      
      console.log(`🔍🔍🔍 CMYK SERVICE: Processing ${file.originalname}`);
      
      // Detect CMYK in the uploaded PDF
      const isCMYK = await this.detectCMYKInPDF(filePath);
      
      if (isCMYK) {
        // Create a preserved copy with 'original_' prefix
        const originalFilename = `original_${file.filename}`;
        const originalPath = path.join(uploadDir, originalFilename);
        
        // Copy the original PDF to preserve it
        fs.copyFileSync(filePath, originalPath);
        
        console.log(`💾 CMYK PDF preserved as: ${originalFilename}`);
        
        return {
          isCMYKPreserved: true,
          originalPdfPath: originalPath
        };
      }
      
      return { isCMYKPreserved: false };
      
    } catch (error) {
      console.error('❌ CMYK service processing error:', error);
      return { isCMYKPreserved: false };
    }
  }
}