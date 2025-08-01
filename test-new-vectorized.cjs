const fs = require('fs');

// Read the new vectorized SVG
const svgContent = fs.readFileSync('uploads/5530acd6abdfc5818ce5f047cbb1b7da', 'utf8');

console.log('=== NEW VECTORIZED SVG ===');
console.log('Has data-vectorized-cmyk:', svgContent.includes('data-vectorized-cmyk="true"'));
console.log('Has stroke-width="1084.83":', svgContent.includes('stroke-width="1084.83"'));
console.log('Original size:', svgContent.length);

// Apply the exact same function from svg-color-utils
function removeVectorizedBackgrounds(svgContent) {
  try {
    let modifiedSvg = svgContent;
    
    // Vectorized files have a specific structure with stroke outlines
    // Look for g elements with excessive stroke-width and remove just that group
    const strokeGroupRegex = /<g[^>]*stroke-width\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/g>/gi;
    
    modifiedSvg = modifiedSvg.replace(strokeGroupRegex, (match, strokeWidth) => {
      const width = parseFloat(strokeWidth);
      console.log(`Found stroke group with width: ${width}`);
      // Only remove groups with abnormally large stroke widths (vectorizer artifacts)
      if (width > 100) {
        console.log(`🎨 Removing stroke outline group with width: ${width}`);
        return ''; // Remove the entire stroke group
      }
      return match;
    });
    
    console.log(`🎨 Background removal complete for vectorized SVG`);
    return modifiedSvg;
  } catch (error) {
    console.error('Error removing vectorized backgrounds:', error);
    return svgContent;
  }
}

const cleaned = removeVectorizedBackgrounds(svgContent);

console.log('\n=== AFTER CLEANING ===');
console.log('Still has stroke-width="1084.83":', cleaned.includes('stroke-width="1084.83"'));
console.log('Size changed from', svgContent.length, 'to', cleaned.length);

// Save for testing
fs.writeFileSync('test-new-cleaned.svg', cleaned);
console.log('Saved cleaned version to test-new-cleaned.svg');