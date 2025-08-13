import fs from 'fs';

/**
 * Verify CMYK colors in PDF by checking for CMYK color operators
 */
function verifyCMYKInPDF(pdfPath) {
  try {
    const pdfContent = fs.readFileSync(pdfPath, 'utf8');
    
    // Check for CMYK color operators in PDF
    const cmykPatterns = [
      /k\s+/g,           // CMYK stroke color operator
      /K\s+/g,           // CMYK fill color operator
      /setcmykcolor/g,   // PostScript CMYK operator
      /DeviceCMYK/g,     // CMYK color space
      /\/C\s+\d/g,       // C values in CMYK
      /\/M\s+\d/g,       // M values in CMYK
      /\/Y\s+\d/g,       // Y values in CMYK
      /\/K\s+\d/g,       // K values in CMYK
    ];
    
    let cmykFound = false;
    const results = {};
    
    cmykPatterns.forEach((pattern, index) => {
      const matches = pdfContent.match(pattern);
      if (matches) {
        cmykFound = true;
        results[`pattern_${index}`] = matches.length;
      }
    });
    
    console.log('🔍 CMYK Verification Results:');
    console.log(`📁 File: ${pdfPath}`);
    console.log(`📊 File size: ${fs.statSync(pdfPath).size} bytes`);
    console.log(`🎨 CMYK content found: ${cmykFound ? 'YES' : 'NO'}`);
    
    if (cmykFound) {
      console.log('✅ CMYK operators detected:', results);
    } else {
      console.log('❌ No CMYK color operators found in PDF');
      
      // Check for RGB patterns instead
      const rgbPatterns = [
        /rg\s+/g,          // RGB stroke color operator
        /RG\s+/g,          // RGB fill color operator
        /DeviceRGB/g,      // RGB color space
      ];
      
      const rgbResults = {};
      rgbPatterns.forEach((pattern, index) => {
        const matches = pdfContent.match(pattern);
        if (matches) {
          rgbResults[`rgb_pattern_${index}`] = matches.length;
        }
      });
      
      if (Object.keys(rgbResults).length > 0) {
        console.log('⚠️ RGB operators found instead:', rgbResults);
      }
    }
    
    return cmykFound;
    
  } catch (error) {
    console.error('❌ Error reading PDF:', error.message);
    return false;
  }
}

// Check the generated PDF
if (process.argv[2]) {
  verifyCMYKInPDF(process.argv[2]);
} else {
  console.log('Usage: node verify-cmyk-colors.js <pdf-file>');
}