const fs = require('fs');
const path = require('path');

// Quick test to check if Pantone detection is fixed
console.log('Testing Pantone detection fix...\n');

// Create a simple test SVG without any Pantone colors
const testSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <rect fill="rgb(255, 0, 0)" width="50" height="50" x="0" y="0"/>
  <rect fill="rgb(0, 255, 0)" width="50" height="50" x="50" y="0"/>
  <rect fill="rgb(0, 0, 255)" width="50" height="50" x="0" y="50"/>
  <rect fill="rgb(255, 255, 0)" width="50" height="50" x="50" y="50"/>
</svg>`;

// Write test SVG
const testPath = path.join(__dirname, 'test-pantone-detection.svg');
fs.writeFileSync(testPath, testSvg);

console.log('Created test SVG without Pantone colors');

// Test the API
const http = require('http');

const uploadTest = () => {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/logos/test-logo-id/analyze-svg',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('\nAnalysis result:');
          if (result.colors && result.colors.length > 0) {
            console.log(`Found ${result.colors.length} colors`);
            
            // Check first color
            const firstColor = result.colors[0];
            console.log('\nFirst color:');
            console.log('- Original:', firstColor.originalColor);
            console.log('- CMYK:', firstColor.cmykColor);
            console.log('- Pantone Match:', firstColor.pantoneMatch || 'None (as expected)');
            
            // Check if any colors have false Pantone matches
            const pantoneColors = result.colors.filter(c => c.pantoneMatch);
            if (pantoneColors.length > 0) {
              console.log(`\n⚠️  WARNING: Found ${pantoneColors.length} colors with Pantone matches when none should exist!`);
              pantoneColors.forEach(c => {
                console.log(`  - ${c.originalColor} -> ${c.pantoneMatch}`);
              });
            } else {
              console.log('\n✅ SUCCESS: No false Pantone detections found!');
            }
          }
          resolve(result);
        } catch (e) {
          console.error('Error parsing response:', e);
          console.log('Raw response:', data);
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
};

// Clean up
setTimeout(() => {
  if (fs.existsSync(testPath)) {
    fs.unlinkSync(testPath);
    console.log('\nCleaned up test file');
  }
}, 1000);