const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test the specific file that was uploaded
const svgPath = path.join(__dirname, 'uploads', 'b097b6145b6a8fb7130ab7e70542c495.svg');

if (!fs.existsSync(svgPath)) {
  console.error('SVG file not found:', svgPath);
  process.exit(1);
}

console.log('Testing PDF generation for:', svgPath);
console.log('File size:', (fs.statSync(svgPath).size / 1024).toFixed(2), 'KB');

// Check SVG content
const svgContent = fs.readFileSync(svgPath, 'utf8');
const hasEmbeddedImages = (svgContent.match(/data:image/g) || []).length;
console.log('Embedded images found:', hasEmbeddedImages);

// Try to generate a simple PDF
const outputPdf = 'test-error-output.pdf';

try {
  // Method 1: rsvg-convert (standard)
  console.log('\nTrying rsvg-convert...');
  execSync(`rsvg-convert -f pdf -o "${outputPdf}" "${svgPath}" 2>&1`);
  
  if (fs.existsSync(outputPdf)) {
    const stats = fs.statSync(outputPdf);
    if (stats.size > 0) {
      console.log('✓ PDF created successfully, size:', (stats.size / 1024).toFixed(2), 'KB');
      
      // Check if PDF has content
      const pdfBuffer = fs.readFileSync(outputPdf);
      const pdfString = pdfBuffer.toString('utf8', 0, 1000);
      
      if (pdfString.includes('%PDF')) {
        console.log('✓ PDF has valid header');
        
        // Check for content streams
        if (pdfBuffer.toString().includes('stream')) {
          console.log('✓ PDF has content streams');
        } else {
          console.log('✗ PDF appears to be empty (no content streams)');
        }
      }
    } else {
      console.log('✗ PDF is empty (0 bytes)');
    }
  } else {
    console.log('✗ No PDF file created');
  }
  
} catch (error) {
  console.error('Error generating PDF:', error.message);
  console.error('Full error:', error.toString());
}

// Try Method 2: Inkscape
try {
  console.log('\nTrying Inkscape...');
  const inkscapeOutput = 'test-error-inkscape.pdf';
  execSync(`inkscape "${svgPath}" --export-type=pdf --export-filename="${inkscapeOutput}" 2>&1`);
  
  if (fs.existsSync(inkscapeOutput)) {
    const stats = fs.statSync(inkscapeOutput);
    console.log('✓ Inkscape PDF created, size:', (stats.size / 1024).toFixed(2), 'KB');
  }
} catch (error) {
  console.error('Inkscape error:', error.message);
}

// Check if the SVG itself is valid
console.log('\nChecking SVG validity...');
try {
  // Try to get SVG dimensions
  const dimensionMatch = svgContent.match(/viewBox="([^"]+)"/);
  if (dimensionMatch) {
    console.log('✓ SVG has viewBox:', dimensionMatch[1]);
  }
  
  const widthMatch = svgContent.match(/width="([^"]+)"/);
  const heightMatch = svgContent.match(/height="([^"]+)"/);
  if (widthMatch && heightMatch) {
    console.log('✓ SVG dimensions:', widthMatch[1], 'x', heightMatch[1]);
  }
  
  // Check for actual content
  const pathCount = (svgContent.match(/<path/g) || []).length;
  const rectCount = (svgContent.match(/<rect/g) || []).length;
  const imageCount = (svgContent.match(/<image/g) || []).length;
  
  console.log('SVG content:');
  console.log('- Paths:', pathCount);
  console.log('- Rects:', rectCount);
  console.log('- Images:', imageCount);
  
} catch (error) {
  console.error('Error checking SVG:', error.message);
}