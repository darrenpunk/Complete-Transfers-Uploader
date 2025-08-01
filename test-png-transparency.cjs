const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function testPNGTransparency() {
  console.log('🧪 Testing PNG transparency handling...\n');
  
  // Create a test PNG with transparency
  const testSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect x="50" y="50" width="100" height="100" fill="red" />
    <rect x="75" y="75" width="50" height="50" fill="blue" />
  </svg>`;
  
  fs.writeFileSync('test-transparent.svg', testSvg);
  
  // Convert SVG to PNG with transparency
  await execAsync('convert -background transparent test-transparent.svg test-transparent.png');
  
  // Check the original PNG
  console.log('1️⃣ Original PNG info:');
  const { stdout: origInfo } = await execAsync('identify -format "%[colorspace] %[channels] %A" test-transparent.png');
  console.log(`   Colorspace and channels: ${origInfo}`);
  
  // Test different CMYK conversion approaches
  const iccProfile = path.join('attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
  
  console.log('\n2️⃣ Testing simple CMYK conversion:');
  await execAsync(`convert test-transparent.png -profile "${iccProfile}" -colorspace CMYK test-cmyk-simple.png`);
  const { stdout: simple } = await execAsync('identify -format "%[colorspace] %[channels] %A" test-cmyk-simple.png');
  console.log(`   Result: ${simple}`);
  
  console.log('\n3️⃣ Testing with -alpha set:');
  await execAsync(`convert test-transparent.png -profile "${iccProfile}" -colorspace CMYK -alpha set test-cmyk-alphaset.png`);
  const { stdout: alphaSet } = await execAsync('identify -format "%[colorspace] %[channels] %A" test-cmyk-alphaset.png');
  console.log(`   Result: ${alphaSet}`);
  
  console.log('\n4️⃣ Testing with separate alpha channel:');
  await execAsync('convert test-transparent.png -alpha extract test-alpha.png');
  await execAsync(`convert test-transparent.png -alpha off -profile "${iccProfile}" -colorspace CMYK test-rgb-to-cmyk.png`);
  await execAsync('convert test-rgb-to-cmyk.png test-alpha.png -alpha off -compose CopyOpacity -composite test-cmyk-composite.png');
  const { stdout: composite } = await execAsync('identify -format "%[colorspace] %[channels] %A" test-cmyk-composite.png');
  console.log(`   Result: ${composite}`);
  
  // Create a simple PDF to test embedding
  console.log('\n5️⃣ Testing PDF embedding:');
  const { PDFDocument, rgb } = require('pdf-lib');
  
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 300]);
  
  // Draw background to see transparency
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 300,
    height: 300,
    color: rgb(0.9, 0.9, 0.9)
  });
  
  // Try embedding different versions
  try {
    const pngBytes = fs.readFileSync('test-cmyk-alphaset.png');
    const pngImage = await pdfDoc.embedPng(pngBytes);
    page.drawImage(pngImage, {
      x: 50,
      y: 50,
      width: 200,
      height: 200
    });
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('test-png-transparency.pdf', pdfBytes);
    console.log('   ✅ PDF created successfully');
  } catch (error) {
    console.log('   ❌ PDF embedding failed:', error.message);
  }
  
  // Cleanup
  const files = ['test-transparent.svg', 'test-transparent.png', 'test-alpha.png', 
                 'test-rgb-to-cmyk.png', 'test-cmyk-simple.png', 'test-cmyk-alphaset.png', 
                 'test-cmyk-composite.png'];
  files.forEach(f => {
    try { fs.unlinkSync(f); } catch (e) {}
  });
  
  console.log('\n✅ Test complete - check test-png-transparency.pdf');
}

testPNGTransparency().catch(console.error);