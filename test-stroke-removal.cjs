const fs = require('fs');

// Read the vectorized SVG
const svgContent = fs.readFileSync('uploads/fd73e819778d782ce37de7e3c38a9a03', 'utf8');

console.log('=== ORIGINAL SVG ===');
console.log('Has data-vectorized-cmyk:', svgContent.includes('data-vectorized-cmyk="true"'));
console.log('Has stroke-width="630.03":', svgContent.includes('stroke-width="630.03"'));

// Test the exact regex from our function
const strokeGroupRegex = /<g[^>]*stroke-width\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/g>/gi;

// Find all matches first
const matches = svgContent.match(strokeGroupRegex);
console.log('\n=== REGEX MATCHES ===');
if (matches) {
  console.log('Found', matches.length, 'matching groups');
  matches.forEach((match, i) => {
    console.log(`Match ${i + 1} length:`, match.length);
    console.log('First 200 chars:', match.substring(0, 200) + '...');
  });
}

// Apply the replacement
const modifiedSvg = svgContent.replace(strokeGroupRegex, (match, strokeWidth) => {
  const width = parseFloat(strokeWidth);
  console.log(`\n=== REPLACEMENT CALLED ===`);
  console.log('Stroke width found:', width);
  if (width > 100) {
    console.log('Removing group with width:', width);
    return '';
  }
  return match;
});

console.log('\n=== RESULT ===');
console.log('Modified SVG still has stroke-width="630.03":', modifiedSvg.includes('stroke-width="630.03"'));
console.log('Size changed from', svgContent.length, 'to', modifiedSvg.length);

// Save for inspection
fs.writeFileSync('test-stroke-removed.svg', modifiedSvg);
console.log('Saved to test-stroke-removed.svg');