const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

async function testMinimalPDF() {
  console.log('🧪 Testing minimal PDF generation...');
  
  try {
    // Create basic PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 landscape
    
    console.log('✅ Basic PDF and page created successfully');
    
    // Test basic text
    page.drawText('Test PDF - PNG Bypass Working', {
      x: 50,
      y: 500,
      size: 20
    });
    
    console.log('✅ Text added successfully');
    
    // Save PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('test-minimal-output.pdf', pdfBytes);
    
    console.log(`✅ Minimal PDF created successfully - ${pdfBytes.length} bytes`);
    
  } catch (error) {
    console.error('❌ Minimal PDF test failed:', error);
  }
}

testMinimalPDF();