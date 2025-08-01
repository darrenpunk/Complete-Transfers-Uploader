const fs = require('fs');

// Read the new vectorized SVG
const svgContent = fs.readFileSync('uploads/5530acd6abdfc5818ce5f047cbb1b7da', 'utf8');

console.log('=== TESTING NON-SCALING STROKE REMOVAL ===');
console.log('Has vector-effect="non-scaling-stroke":', svgContent.includes('vector-effect="non-scaling-stroke"'));
console.log('Count of non-scaling strokes:', (svgContent.match(/vector-effect="non-scaling-stroke"/g) || []).length);
console.log('Original size:', svgContent.length);

// Apply the updated background removal function
function removeVectorizedBackgrounds(svgContent) {
  try {
    let modifiedSvg = svgContent;
    
    // Remove stroke groups with large widths
    const strokeGroupRegex = /<g[^>]*stroke-width\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/g>/gi;
    
    modifiedSvg = modifiedSvg.replace(strokeGroupRegex, (match, strokeWidth) => {
      const width = parseFloat(strokeWidth);
      if (width > 100) {
        console.log(`🎨 Removing stroke outline group with width: ${width}`);
        return '';
      }
      return match;
    });
    
    // Remove vector-effect="non-scaling-stroke" attributes
    const beforeNonScaling = modifiedSvg.includes('vector-effect="non-scaling-stroke"');
    const beforeCount = (modifiedSvg.match(/vector-effect="non-scaling-stroke"/g) || []).length;
    
    modifiedSvg = modifiedSvg.replace(/\s*vector-effect\s*=\s*["']non-scaling-stroke["']/gi, '');
    
    const afterNonScaling = modifiedSvg.includes('vector-effect="non-scaling-stroke"');
    const afterCount = (modifiedSvg.match(/vector-effect="non-scaling-stroke"/g) || []).length;
    
    console.log(`🎨 Non-scaling stroke removal: ${beforeCount} → ${afterCount} (${beforeCount - afterCount} removed)`);
    
    return modifiedSvg;
  } catch (error) {
    console.error('Error:', error);
    return svgContent;
  }
}

const cleaned = removeVectorizedBackgrounds(svgContent);

console.log('\n=== RESULTS ===');
console.log('Still has vector-effect="non-scaling-stroke":', cleaned.includes('vector-effect="non-scaling-stroke"'));
console.log('Remaining count:', (cleaned.match(/vector-effect="non-scaling-stroke"/g) || []).length);
console.log('Size changed from', svgContent.length, 'to', cleaned.length);

// Save for testing
fs.writeFileSync('test-no-vector-effect.svg', cleaned);
console.log('Saved cleaned version to test-no-vector-effect.svg');