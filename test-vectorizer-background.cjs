const fs = require('fs');

// Read the vectorized SVG file
const svgContent = fs.readFileSync('uploads/c1f6a4a99f3ac2f7747c6713ff2a0fa0', 'utf8');

console.log('Original SVG has stroke group:', svgContent.includes('stroke-width="630.03"'));

// Apply the background removal regex
const strokeGroupRegex = /<g[^>]*stroke-width\s*=\s*["']([^"']+)["'][^>]*fill\s*=\s*["']none["'][^>]*>[\s\S]*?<\/g>/gi;
const modifiedSvg = svgContent.replace(strokeGroupRegex, (match, strokeWidth) => {
  const width = parseFloat(strokeWidth);
  console.log(`Found stroke group with width: ${width}`);
  if (width > 100) {
    console.log('Removing stroke group');
    return ''; // Remove the entire stroke group
  }
  return match;
});

console.log('Modified SVG still has stroke group:', modifiedSvg.includes('stroke-width="630.03"'));
console.log('Modified SVG length changed from', svgContent.length, 'to', modifiedSvg.length);

// Save the cleaned SVG
fs.writeFileSync('test-cleaned-vectorized.svg', modifiedSvg);
console.log('Saved cleaned SVG to test-cleaned-vectorized.svg');