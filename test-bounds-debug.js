const fs = require('fs');

// Test the bounds calculation on the latest SVG
const { calculateSVGContentBounds } = require('./server/dimension-utils.ts');

async function testBounds() {
  const svgFiles = [
    'uploads/c88e6d175bafb5298c563c8c76c598c3.svg'  // Latest SVG file
  ];
  
  for (const svgFile of svgFiles) {
    if (fs.existsSync(svgFile)) {
      console.log(`\n📄 Testing bounds for: ${svgFile}`);
      
      const svgContent = fs.readFileSync(svgFile, 'utf8');
      
      // Extract viewBox for comparison
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
      if (viewBoxMatch) {
        console.log(`📐 Original viewBox: ${viewBoxMatch[1]}`);
      }
      
      // Calculate content bounds
      const bounds = calculateSVGContentBounds(svgContent);
      
      if (bounds) {
        console.log(`📏 Content bounds: ${bounds.minX.toFixed(1)}, ${bounds.minY.toFixed(1)}, ${bounds.maxX.toFixed(1)}, ${bounds.maxY.toFixed(1)}`);
        console.log(`📏 Content size: ${bounds.width.toFixed(1)} x ${bounds.height.toFixed(1)}px`);
      } else {
        console.log(`❌ No content bounds detected`);
      }
      
      // Show first few paths for debugging
      const paths = svgContent.match(/<path[^>]*d="[^"]*"/g) || [];
      console.log(`🔍 Found ${paths.length} paths`);
      if (paths.length > 0) {
        console.log(`🔍 First path: ${paths[0].substring(0, 200)}...`);
      }
    }
  }
}

testBounds().catch(console.error);