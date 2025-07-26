// Test the new SVG processing logic
const fs = require('fs');
const path = require('path');

// Read the SVG file
let svgContent = fs.readFileSync('uploads/test-complete-logo-fixed.svg', 'utf8');

console.log('Original white elements:', (svgContent.match(/fill="rgb\(100%, 100%, 100%\)"/g) || []).length);
console.log('Original rect elements:', (svgContent.match(/<rect[^>]*>/g) || []).length);

// Apply the new selective processing logic
console.log('Original SVG first 500 chars:', svgContent.substring(0, 500));

// Only remove full-page background rectangles at origin with full dimensions
svgContent = svgContent.replace(/<rect\s+x="0"\s+y="0"\s+width="841\.89"\s+height="1190\.55"\s+fill="[^"]*"[^>]*\/?>/, '');
svgContent = svgContent.replace(/<rect\s+x="0"\s+y="0"\s+width="624\.703125"\s+height="[^"]*"\s+fill="[^"]*"[^>]*\/?>/, '');

// Remove rect elements ONLY if they are at origin (0,0) AND cover full canvas dimensions
svgContent = svgContent.replace(/<rect[^>]*>/g, (match) => {
  // Only remove if it's clearly a full-page background (at origin with large dimensions)
  const isAtOrigin = match.includes('x="0"') && match.includes('y="0"');
  const isFullSize = match.includes('width="841.89"') || match.includes('width="624.703125"') || 
                   match.includes('height="1190.55"') || match.includes('height="587.646"');
  
  if (isAtOrigin && isFullSize) {
    console.log('Removing suspected background rect:', match.substring(0, 100) + '...');
    return '';
  }
  // Keep all other rect elements, including white content
  return match;
});

// Force SVG background transparency only
svgContent = svgContent.replace('<svg', '<svg style="background:transparent !important"');

console.log('After processing white elements:', (svgContent.match(/fill="rgb\(100%, 100%, 100%\)"/g) || []).length);
console.log('After processing rect elements:', (svgContent.match(/<rect[^>]*>/g) || []).length);

// Save the processed result
fs.writeFileSync('uploads/test-complete-logo-processed.svg', svgContent);
console.log('Processed SVG saved as test-complete-logo-processed.svg');