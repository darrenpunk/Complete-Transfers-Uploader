const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function testPNGTransparencyFix() {
  console.log('Testing PNG transparency fix for SVG with embedded images...\n');
  
  try {
    // Use the actual uploaded file that has the transparency issue
    const svgPath = path.join(__dirname, 'uploads', 'aeea989357af651360382d669a5acc64.svg');
    
    if (!fs.existsSync(svgPath)) {
      console.error('Test SVG file not found:', svgPath);
      return;
    }
    
    // Check if SVG has embedded images
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const embeddedImageCount = (svgContent.match(/data:image/g) || []).length;
    console.log(`Found ${embeddedImageCount} embedded images in SVG`);
    
    // Test 1: Standard rsvg-convert
    console.log('\n1. Testing standard rsvg-convert...');
    const standardPdfPath = 'test-standard-rsvg.pdf';
    try {
      execSync(`rsvg-convert -f pdf -o "${standardPdfPath}" "${svgPath}"`);
      console.log('✓ Standard rsvg-convert completed');
    } catch (error) {
      console.error('✗ Standard rsvg-convert failed:', error.message);
    }
    
    // Test 2: Inkscape conversion
    console.log('\n2. Testing Inkscape conversion...');
    const inkscapePdfPath = 'test-inkscape-transparency.pdf';
    try {
      execSync(`inkscape "${svgPath}" --export-type=pdf --export-filename="${inkscapePdfPath}" --export-area-page`);
      console.log('✓ Inkscape conversion completed');
    } catch (error) {
      console.error('✗ Inkscape conversion failed:', error.message);
    }
    
    // Test 3: Using cairosvg (if available)
    console.log('\n3. Testing cairosvg conversion...');
    const cairosvgPdfPath = 'test-cairosvg-transparency.pdf';
    try {
      execSync(`which cairosvg`);
      execSync(`cairosvg "${svgPath}" -o "${cairosvgPdfPath}"`);
      console.log('✓ cairosvg conversion completed');
    } catch (error) {
      console.error('✗ cairosvg not available or failed:', error.message);
    }
    
    // Test 4: Convert via Ghostscript with transparency settings
    console.log('\n4. Testing Ghostscript with transparency preservation...');
    const gsPdfPath = 'test-gs-transparency.pdf';
    try {
      // First convert SVG to PDF with rsvg
      const tempPdf = 'temp-rsvg.pdf';
      execSync(`rsvg-convert -f pdf -o "${tempPdf}" "${svgPath}"`);
      
      // Then process with Ghostscript to preserve transparency
      const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite ` +
        `-dPreserveTransparency=true -dCompatibilityLevel=1.4 ` +
        `-dPDFSETTINGS=/prepress -dColorImageFilter=/FlateEncode ` +
        `-sOutputFile="${gsPdfPath}" "${tempPdf}"`;
      
      execSync(gsCommand);
      console.log('✓ Ghostscript transparency preservation completed');
      
      // Clean up temp file
      fs.unlinkSync(tempPdf);
    } catch (error) {
      console.error('✗ Ghostscript transparency preservation failed:', error.message);
    }
    
    console.log('\n\nGenerated test PDFs:');
    if (fs.existsSync(standardPdfPath)) console.log(`- ${standardPdfPath} (standard rsvg-convert)`);
    if (fs.existsSync(inkscapePdfPath)) console.log(`- ${inkscapePdfPath} (Inkscape)`);
    if (fs.existsSync(cairosvgPdfPath)) console.log(`- ${cairosvgPdfPath} (cairosvg)`);
    if (fs.existsSync(gsPdfPath)) console.log(`- ${gsPdfPath} (Ghostscript with transparency)`);
    
    console.log('\nPlease check these PDFs to see which method preserves PNG transparency correctly.');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPNGTransparencyFix();