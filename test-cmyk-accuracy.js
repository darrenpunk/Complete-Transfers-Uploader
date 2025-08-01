import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';

// Test CMYK colors matching the screenshot values
const testColors = [
  { c: 0, m: 69, y: 66, k: 0 },  // Should match app display
  { c: 5, m: 5, y: 5, k: 0 },
  { c: 13, m: 11, y: 11, k: 0 },
  { c: 22, m: 17, y: 18, k: 0 }
];

async function createTestSVG() {
  // Create SVG with CMYK colors in different formats
  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
  <!-- Test different CMYK color formats -->`;
  
  testColors.forEach((color, index) => {
    const y = 50 + (index * 120);
    
    // Format 1: device-cmyk (standard SVG CMYK format)
    svgContent += `
  <rect x="50" y="${y}" width="80" height="80" 
        fill="device-cmyk(${color.c/100}, ${color.m/100}, ${color.y/100}, ${color.k/100})" />
  <text x="150" y="${y + 40}" font-size="14">CMYK: ${color.c}, ${color.m}, ${color.y}, ${color.k}</text>`;
  });
  
  svgContent += `
</svg>`;
  
  fs.writeFileSync('test-cmyk-colors.svg', svgContent);
  console.log('Created test-cmyk-colors.svg with exact CMYK values');
}

async function testColorAnalysis() {
  // Import and test the color analysis
  const { analyzeSVGWithStrokeWidths } = await import('./server/svg-color-utils.js');
  
  const analysis = analyzeSVGWithStrokeWidths('test-cmyk-colors.svg');
  console.log('\nColor Analysis Results:');
  
  analysis.colors.forEach(color => {
    console.log(`- Original: ${color.originalFormat}`);
    console.log(`  CMYK: ${color.cmykColor}`);
    console.log(`  isCMYK: ${color.isCMYK}`);
    console.log(`  Converted: ${color.converted || false}\n`);
  });
}

async function testPDFGeneration() {
  // Test if PDF generation preserves CMYK values
  console.log('\nTesting PDF generation with CMYK preservation...');
  
  // Create a simple test project data
  const testData = {
    projectId: 'test-cmyk',
    templateSize: {
      id: 'a4',
      name: 'A4',
      label: 'A4',
      width: 210,
      height: 297,
      group: 'test'
    },
    canvasElements: [{
      id: 'test-element',
      projectId: 'test-cmyk',
      logoId: 'test-logo',
      x: 50,
      y: 50,
      width: 100,
      height: 150,
      rotation: 0,
      zIndex: 0,
      isVisible: true,
      isLocked: false,
      colorOverrides: null
    }],
    logos: [{
      id: 'test-logo',
      filename: 'test-cmyk-colors.svg',
      mimeType: 'image/svg+xml',
      originalName: 'test-cmyk-colors.svg',
      svgColors: testColors.map((color, i) => ({
        id: `color_${i}`,
        originalColor: `CMYK(${color.c}, ${color.m}, ${color.y}, ${color.k})`,
        originalFormat: `device-cmyk(${color.c/100}, ${color.m/100}, ${color.y/100}, ${color.k/100})`,
        cmykColor: `C:${color.c} M:${color.m} Y:${color.y} K:${color.k}`,
        isCMYK: true,
        converted: false,  // This should NOT be marked as converted
        elementType: 'rect',
        attribute: 'fill'
      }))
    }]
  };
  
  // Save test data for reference
  fs.writeFileSync('test-cmyk-data.json', JSON.stringify(testData, null, 2));
  console.log('Created test-cmyk-data.json for debugging');
}

async function main() {
  console.log('=== CMYK Color Accuracy Test ===\n');
  
  await createTestSVG();
  await testColorAnalysis();
  await testPDFGeneration();
  
  console.log('\nTest files created:');
  console.log('- test-cmyk-colors.svg (source with CMYK colors)');
  console.log('- test-cmyk-data.json (test project data)');
  console.log('\nCheck if CMYK values are preserved correctly in analysis and PDF generation.');
}

main().catch(console.error);