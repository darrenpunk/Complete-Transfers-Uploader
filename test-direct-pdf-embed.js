// Direct test of PDF embedding process
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function testDirectPDFEmbedding() {
  try {
    console.log('🧪 DIRECT PDF EMBEDDING TEST');
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 landscape
    
    console.log('✅ PDF document created');
    
    // Test if we have the PNG from previous test
    const testPngPath = 'test-direct-conversion.png';
    
    if (fs.existsSync(testPngPath)) {
      console.log('📂 Found test PNG file');
      const pngData = fs.readFileSync(testPngPath);
      console.log(`📊 PNG size: ${pngData.length} bytes`);
      
      if (pngData.length > 0) {
        console.log('🔧 Embedding PNG into PDF...');
        const embeddedImage = await pdfDoc.embedPng(pngData);
        console.log(`✅ PNG embedded: ${embeddedImage.width}x${embeddedImage.height}`);
        
        // Draw the image
        page.drawImage(embeddedImage, {
          x: 100,
          y: 300,
          width: 200,
          height: 150
        });
        console.log('✅ Image drawn on PDF page');
        
        // Save PDF
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync('test-direct-embed-result.pdf', pdfBytes);
        
        console.log(`🎉 SUCCESS: PDF with embedded image created: ${pdfBytes.length} bytes`);
        
        if (pdfBytes.length > 10000) {
          console.log('✅ PDF size indicates successful embedding!');
        } else {
          console.log('❌ PDF size too small - embedding may have failed');
        }
        
      } else {
        console.log('❌ PNG file is empty');
      }
    } else {
      console.log('❌ Test PNG file not found');
      
      // List available files for debugging
      console.log('Available files in current directory:');
      const files = fs.readdirSync('.');
      files.filter(f => f.endsWith('.png') || f.endsWith('.svg')).forEach(f => {
        const size = fs.statSync(f).size;
        console.log(`  - ${f} (${size} bytes)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Direct embedding test failed:', error);
  }
}

testDirectPDFEmbedding();