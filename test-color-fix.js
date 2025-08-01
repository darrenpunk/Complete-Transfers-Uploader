const { SimplifiedPDFGenerator } = require('./server/simplified-pdf-generator');
const fs = require('fs');

// Test color changes in PDF generation
async function testColorChanges() {
  console.log('Testing color changes in PDF generation...');
  
  // Create test SVG with red rectangle
  const testSvg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="80" height="80" fill="rgb(255, 0, 0)" />
  </svg>`;
  
  fs.writeFileSync('uploads/test-color-change.svg', testSvg);
  
  // Mock data for testing
  const mockElement = {
    id: 'test-element',
    logoId: 'test-logo',
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    rotation: 0,
    colorOverrides: {
      'rgb(255, 0, 0)': '#0000FF' // Change red to blue
    }
  };
  
  const mockLogo = {
    id: 'test-logo',
    filename: 'test-color-change.svg',
    mimeType: 'image/svg+xml',
    svgColors: {
      colors: [
        {
          originalColor: 'rgb(255, 0, 0)',
          originalFormat: 'rgb(255, 0, 0)'
        }
      ]
    }
  };
  
  const templateSize = { width: 297, height: 420 }; // A3
  
  try {
    const generator = new SimplifiedPDFGenerator();
    
    // Test checkForColorChanges
    const hasChanges = await generator.checkForColorChanges(mockElement, mockLogo);
    console.log('Color changes detected:', hasChanges);
    
    if (hasChanges) {
      console.log('✅ Color changes detection working correctly');
    } else {
      console.log('❌ Color changes not detected');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  // Clean up
  if (fs.existsSync('uploads/test-color-change.svg')) {
    fs.unlinkSync('uploads/test-color-change.svg');
  }
}

testColorChanges();