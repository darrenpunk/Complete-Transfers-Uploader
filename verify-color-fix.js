import fs from 'fs';
import { applySVGColorChanges } from './server/svg-color-utils.js';

// Create test SVG with red rectangle
const testSvg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="80" fill="rgb(255, 0, 0)" />
</svg>`;

// Write test SVG
const testPath = 'test-input.svg';
fs.writeFileSync(testPath, testSvg);

console.log('🧪 Testing color changes fix...');
console.log('Original SVG:');
console.log(testSvg);

// Test color change: red to blue
const colorOverrides = {
  'rgb(255, 0, 0)': '#0000FF'  // Change red to blue
};

console.log('\n🎨 Applying color changes:', colorOverrides);

// Apply color changes
const modifiedSvg = applySVGColorChanges(testPath, colorOverrides);

console.log('\nModified SVG:');
console.log(modifiedSvg);

// Verify the change
if (modifiedSvg.includes('#0000FF') && !modifiedSvg.includes('rgb(255, 0, 0)')) {
  console.log('\n✅ SUCCESS: Color changes are working correctly!');
  console.log('   - Red color (rgb(255, 0, 0)) was successfully changed to blue (#0000FF)');
} else {
  console.log('\n❌ FAILED: Color changes not applied correctly');
}

// Clean up
fs.unlinkSync(testPath);