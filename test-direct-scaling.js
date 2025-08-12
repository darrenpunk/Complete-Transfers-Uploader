// Direct test of the PDF scaling fix
import { WorkingPDFGenerator } from './server/working-pdf-generator.js';
import fs from 'fs';

async function testScaling() {
  console.log('🧪 Testing PDF scaling fix directly...');
  
  // Create mock data that matches the problematic scenario
  const mockData = {
    projectId: 'test-123',
    canvasElements: [{
      id: 'test-element',
      x: 251.9140625,
      y: 482.90234399999997,
      width: 338.171875,  // This should appear full-size in PDF, not scaled down
      height: 225.195312,
      logoId: 'test-logo',
      rotation: 0
    }],
    logos: [{
      id: 'test-logo',
      filename: '767d6d26eccf7d564acbdab376b5f060.pdf.svg', // Use existing file
      mimeType: 'image/svg+xml',
      originalName: 'test.svg'
    }],
    templateSize: {
      id: 'template-A3',
      name: 'A3',
      width: 297,    // mm
      height: 420,   // mm
      pixelWidth: 842,   // Canvas pixels
      pixelHeight: 1191  // Canvas pixels
    },
    project: {
      id: 'test-123',
      name: 'Scaling Test'
    },
    garmentColor: '#FFFFFF',
    extraGarmentColors: [],
    quantity: 1
  };
  
  try {
    const generator = new WorkingPDFGenerator();
    const pdfBuffer = await generator.generatePDF(mockData);
    
    console.log('✅ PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    
    // Write to file for inspection
    fs.writeFileSync('direct-scaling-test.pdf', pdfBuffer);
    console.log('📄 PDF saved as direct-scaling-test.pdf');
    
    return true;
  } catch (error) {
    console.error('❌ Direct scaling test failed:', error.message);
    return false;
  }
}

testScaling();