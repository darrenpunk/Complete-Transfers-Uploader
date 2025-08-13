import * as fs from 'fs';
import * as path from 'path';
import { PDFExtract } from 'pdf.js-extract';

export async function extractNativeEmbeddedImage(pdfPath: string, outputPrefix: string): Promise<string | null> {
  try {
    console.log('🔬 NATIVE EXTRACTION: Using PDF.js-extract to preserve original embedded size');
    
    // Use PDF.js-extract to get embedded images at native resolution
    try {
      const extract = new PDFExtract();
      const data = await new Promise<any>((resolve, reject) => {
        extract.extract(pdfPath, {}, (err: any, data: any) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      
      console.log(`📊 PDF.js-extract found ${data.pages?.length || 0} pages`);
      
      // Look for embedded images in the PDF data
      if (data.pages) {
        for (let pageIndex = 0; pageIndex < data.pages.length; pageIndex++) {
          const page = data.pages[pageIndex];
          console.log(`🔍 Page ${pageIndex + 1}: Found ${page.content?.length || 0} content items`);
          
          if (page.content) {
            for (const item of page.content) {
              if (item.type === 'image' && item.data) {
                console.log(`🖼️ Found embedded image: ${item.width}×${item.height}px`);
                
                // Extract the image data at original size
                const imageBuffer = Buffer.from(item.data, 'base64');
                const outputPath = `${outputPrefix}_native_${Date.now()}.png`;
                
                fs.writeFileSync(outputPath, imageBuffer);
                console.log(`✅ NATIVE EXTRACTION SUCCESS: ${outputPath} (${imageBuffer.length} bytes, ${item.width}×${item.height}px)`);
                
                return outputPath;
              }
            }
          }
        }
      }
      
      console.log('⚠️ No embedded images found with PDF.js-extract');
      return null;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('⚠️ PDF.js-extract failed:', errorMessage);
      return null;
    }
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Native PDF extraction error:', errorMessage);
    return null;
  }
}