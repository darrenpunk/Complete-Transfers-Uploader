#!/usr/bin/env node

// Test PDF generation to identify the issue
import { OriginalWorkingGenerator } from './server/original-working-generator.js';
import fs from 'fs';

async function testPDFGeneration() {
  console.log('🧪 Testing PDF Generation...');
  
  try {
    const generator = new OriginalWorkingGenerator();
    
    // Create minimal test data
    const testData = {
      projectId: 'test-blank-pdf',
      templateSize: {
        name: 'A3',
        width: 297, // mm
        height: 420, // mm
        pixelWidth: 3508 // pixels
      },
      canvasElements: [], // Start with no elements to test basic PDF creation
      logos: [],
      garmentColor: 'White'
    };
    
    console.log('📄 Generating test PDF with no elements...');
    const pdfBuffer = await generator.generatePDF(testData);
    
    if (pdfBuffer && pdfBuffer.length > 0) {
      const outputPath = 'test-minimal.pdf';
      fs.writeFileSync(outputPath, pdfBuffer);
      console.log(`✅ Basic PDF generated successfully: ${outputPath} (${pdfBuffer.length} bytes)`);
      
      // Now test with a simple logo if one exists
      const logoFiles = fs.readdirSync('uploads').filter(f => 
        f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.svg')
      );
      
      if (logoFiles.length > 0) {
        console.log(`🎯 Testing with existing logo: ${logoFiles[0]}`);
        
        const testDataWithLogo = {
          ...testData,
          canvasElements: [{
            id: 'test-element',
            logoId: 'test-logo',
            x: 100, // pixels
            y: 100,
            width: 200,
            height: 200,
            rotation: 0
          }],
          logos: [{
            id: 'test-logo',
            filename: logoFiles[0],
            mimeType: logoFiles[0].endsWith('.svg') ? 'image/svg+xml' : 'image/png'
          }]
        };
        
        const pdfWithLogoBuffer = await generator.generatePDF(testDataWithLogo);
        const logoOutputPath = 'test-with-logo.pdf';
        fs.writeFileSync(logoOutputPath, pdfWithLogoBuffer);
        console.log(`✅ PDF with logo generated: ${logoOutputPath} (${pdfWithLogoBuffer.length} bytes)`);
      }
    } else {
      console.error('❌ PDF generation failed - empty buffer');
    }
    
  } catch (error) {
    console.error('❌ PDF generation test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

testPDFGeneration().catch(console.error);