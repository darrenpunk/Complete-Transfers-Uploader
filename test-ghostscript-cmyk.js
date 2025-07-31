const { exec } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testGhostscriptCMYK() {
  // Create a test SVG with known RGB colors
  const testColors = [
    { name: 'Green1', rgb: 'rgb(106, 132, 38)' },
    { name: 'Green2', rgb: 'rgb(147, 175, 0)' },
    { name: 'Green3', rgb: 'rgb(158, 186, 48)' },
    { name: 'Green4', rgb: 'rgb(190, 212, 141)' },
    { name: 'White', rgb: 'rgb(255, 255, 255)' }
  ];

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="100" viewBox="0 0 500 100" xmlns="http://www.w3.org/2000/svg">
  ${testColors.map((color, i) => 
    `<rect x="${i * 100}" y="0" width="100" height="100" fill="${color.rgb}" />`
  ).join('\n  ')}
</svg>`;

  // Save SVG
  fs.writeFileSync('test-gs-colors.svg', svgContent);

  // Convert to PDF with rsvg-convert
  await execAsync('rsvg-convert --format=pdf --output="test-gs-rgb.pdf" "test-gs-colors.svg"');
  console.log('Created RGB PDF');

  // Convert to CMYK with Ghostscript
  const gsCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -sOutputFile="test-gs-cmyk.pdf" "test-gs-rgb.pdf"`;
  
  try {
    const { stdout, stderr } = await execAsync(gsCommand);
    console.log('Ghostscript conversion complete');
    
    // Extract color info from CMYK PDF
    const infoCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=inkcov -sOutputFile=- "test-gs-cmyk.pdf"`;
    const { stdout: inkCoverage } = await execAsync(infoCommand);
    console.log('\nInk Coverage:', inkCoverage);

    // Use pdftotext to extract any color information
    try {
      await execAsync('pdftotext -layout "test-gs-cmyk.pdf" -');
    } catch (e) {
      // pdftotext might not show color values
    }

    // Use Ghostscript to analyze colors
    const analyzeCommand = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=tiffsep -sOutputFile="test-gs-sep-%d.tif" "test-gs-cmyk.pdf"`;
    await execAsync(analyzeCommand);
    console.log('\nCreated color separations');

  } catch (error) {
    console.error('Error:', error);
  }

  // Clean up
  setTimeout(() => {
    ['test-gs-colors.svg', 'test-gs-rgb.pdf', 'test-gs-cmyk.pdf'].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
    // Clean up separation files
    for (let i = 1; i <= 10; i++) {
      ['Cyan', 'Magenta', 'Yellow', 'Black'].forEach(color => {
        const file = `test-gs-sep-${i}.${color}.tif`;
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
      const file = `test-gs-sep-${i}.tif`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }, 5000);
}

testGhostscriptCMYK();