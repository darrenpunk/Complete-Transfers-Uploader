const fs = require('fs');
const path = require('path');

// Create a test SVG with various color swatches
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="800" viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="600" height="800" fill="white"/>
  
  <!-- Test colors with their expected CMYK values -->
  
  <!-- Pure Black: C:0 M:0 Y:0 K:100 -->
  <rect x="50" y="50" width="100" height="100" fill="rgb(0, 0, 0)"/>
  <text x="170" y="100" font-family="Arial" font-size="12">Black (0,0,0)</text>
  <text x="170" y="115" font-family="Arial" font-size="10">Expected: C:0 M:0 Y:0 K:100</text>
  
  <!-- Pure Red: C:0 M:100 Y:100 K:0 -->
  <rect x="50" y="170" width="100" height="100" fill="rgb(255, 0, 0)"/>
  <text x="170" y="220" font-family="Arial" font-size="12">Red (255,0,0)</text>
  <text x="170" y="235" font-family="Arial" font-size="10">Expected: C:0 M:100 Y:100 K:0</text>
  
  <!-- Pure Green: C:100 M:0 Y:100 K:0 -->
  <rect x="50" y="290" width="100" height="100" fill="rgb(0, 255, 0)"/>
  <text x="170" y="340" font-family="Arial" font-size="12">Green (0,255,0)</text>
  <text x="170" y="355" font-family="Arial" font-size="10">Expected: C:100 M:0 Y:100 K:0</text>
  
  <!-- Pure Blue: C:100 M:100 Y:0 K:0 -->
  <rect x="50" y="410" width="100" height="100" fill="rgb(0, 0, 255)"/>
  <text x="170" y="460" font-family="Arial" font-size="12">Blue (0,0,255)</text>
  <text x="170" y="475" font-family="Arial" font-size="10">Expected: C:100 M:100 Y:0 K:0</text>
  
  <!-- Yellow: C:0 M:0 Y:100 K:0 -->
  <rect x="50" y="530" width="100" height="100" fill="rgb(255, 255, 0)"/>
  <text x="170" y="580" font-family="Arial" font-size="12">Yellow (255,255,0)</text>
  <text x="170" y="595" font-family="Arial" font-size="10">Expected: C:0 M:0 Y:100 K:0</text>
  
  <!-- Dark Gray: C:0 M:0 Y:0 K:60 -->
  <rect x="350" y="50" width="100" height="100" fill="rgb(102, 102, 102)"/>
  <text x="470" y="100" font-family="Arial" font-size="12">Dark Gray (102,102,102)</text>
  <text x="470" y="115" font-family="Arial" font-size="10">Expected: C:0 M:0 Y:0 K:60</text>
  
  <!-- Orange F26124: C:0 M:75 Y:95 K:0 -->
  <rect x="350" y="170" width="100" height="100" fill="rgb(242, 97, 36)"/>
  <text x="470" y="220" font-family="Arial" font-size="12">Orange (242,97,36)</text>
  <text x="470" y="235" font-family="Arial" font-size="10">Expected: C:0 M:75 Y:95 K:0</text>
  
  <!-- Custom Green: C:85 M:0 Y:59 K:0 -->
  <rect x="350" y="290" width="100" height="100" fill="rgb(22, 147, 69)"/>
  <text x="470" y="340" font-family="Arial" font-size="12">Custom Green (22,147,69)</text>
  <text x="470" y="355" font-family="Arial" font-size="10">Expected: C:85 M:0 Y:59 K:0</text>
</svg>`;

// Save the test SVG
fs.writeFileSync('test-cmyk-swatches.svg', svgContent);

console.log('Created test-cmyk-swatches.svg');

// Now test the direct CMYK conversion
const { convertSVGtoCMYKPDFDirect } = require('./server/direct-cmyk-pdf');

async function testConversion() {
  try {
    const success = await convertSVGtoCMYKPDFDirect(
      'test-cmyk-swatches.svg',
      'test-cmyk-swatches-output.pdf'
    );
    
    if (success) {
      console.log('Successfully converted SVG to CMYK PDF!');
      console.log('Output saved as: test-cmyk-swatches-output.pdf');
      console.log('Please open this PDF in Adobe Illustrator to verify CMYK values');
    } else {
      console.log('Conversion failed');
    }
  } catch (error) {
    console.error('Error during conversion:', error);
  }
}

testConversion();