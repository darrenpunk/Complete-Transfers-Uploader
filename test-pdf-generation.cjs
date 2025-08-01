const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function testPDFGeneration() {
  console.log('Testing PDF generation with current setup...\n');
  
  try {
    // Test the uploaded SVG file
    const svgPath = path.join(__dirname, 'uploads', 'b097b6145b6a8fb7130ab7e70542c495.svg');
    
    if (!fs.existsSync(svgPath)) {
      console.error('Test SVG file not found:', svgPath);
      return;
    }
    
    console.log('Found SVG file:', svgPath);
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // Check SVG content
    const hasEmbeddedImages = svgContent.includes('data:image/');
    const hasDeviceCMYK = svgContent.includes('device-cmyk');
    
    console.log('SVG Analysis:');
    console.log('- Has embedded images:', hasEmbeddedImages);
    console.log('- Has device-cmyk colors:', hasDeviceCMYK);
    console.log('- File size:', (svgContent.length / 1024).toFixed(2), 'KB');
    
    // Test conversion methods
    console.log('\nTesting PDF conversion methods:');
    
    // 1. Simple rsvg-convert
    console.log('\n1. Testing rsvg-convert...');
    const rsvgPdf = 'test-simple-rsvg.pdf';
    try {
      execSync(`rsvg-convert -f pdf -o "${rsvgPdf}" "${svgPath}"`);
      const stats = fs.statSync(rsvgPdf);
      console.log(`✓ Created ${rsvgPdf} - Size: ${(stats.size / 1024).toFixed(2)} KB`);
    } catch (error) {
      console.error('✗ rsvg-convert failed:', error.message);
    }
    
    // 2. Inkscape
    console.log('\n2. Testing Inkscape...');
    const inkscapePdf = 'test-simple-inkscape.pdf';
    try {
      execSync(`inkscape "${svgPath}" --export-type=pdf --export-filename="${inkscapePdf}"`);
      const stats = fs.statSync(inkscapePdf);
      console.log(`✓ Created ${inkscapePdf} - Size: ${(stats.size / 1024).toFixed(2)} KB`);
    } catch (error) {
      console.error('✗ Inkscape failed:', error.message);
    }
    
    // 3. Test direct CMYK conversion
    console.log('\n3. Testing CMYK conversion with Ghostscript...');
    const cmykPdf = 'test-simple-cmyk.pdf';
    try {
      // First create PDF with rsvg
      const tempPdf = 'temp-for-cmyk.pdf';
      execSync(`rsvg-convert -f pdf -o "${tempPdf}" "${svgPath}"`);
      
      // Then convert to CMYK
      const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite ` +
        `-dProcessColorModel=/DeviceCMYK -dColorConversionStrategy=/CMYK ` +
        `-dConvertCMYKImagesToRGB=false -sOutputFile="${cmykPdf}" "${tempPdf}"`;
      
      execSync(gsCommand);
      const stats = fs.statSync(cmykPdf);
      console.log(`✓ Created ${cmykPdf} - Size: ${(stats.size / 1024).toFixed(2)} KB`);
      
      // Clean up
      fs.unlinkSync(tempPdf);
    } catch (error) {
      console.error('✗ CMYK conversion failed:', error.message);
    }
    
    console.log('\n\nTest complete. Check the generated PDFs to see if they are empty or contain content.');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPDFGeneration();