// Test the bounds calculation function

// Import the bounds calculation function (simulated)
function calculateSVGContentBounds(svgContent) {
  try {
    console.log('=== TESTING BOUNDS CALCULATION ===');
    console.log('SVG length:', svgContent.length);
    
    // Check for viewBox
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    if (viewBoxMatch) {
      console.log('ViewBox found:', viewBoxMatch[1]);
    } else {
      console.log('No viewBox found');
    }
    
    // Extract path coordinates
    const pathRegex = /<path[^>]*d="([^"]*)"[^>]*>/gi;
    const pathMatches = [];
    let pathMatch;
    let matchCount = 0;
    
    while ((pathMatch = pathRegex.exec(svgContent)) !== null && matchCount < 20) {
      matchCount++;
      const pathData = pathMatch[1];
      console.log(`Path ${matchCount}: ${pathData.substring(0, 100)}...`);
      pathMatches.push(pathData);
    }
    
    console.log(`Found ${matchCount} paths total`);
    
    // Extract coordinates from first path
    if (pathMatches.length > 0) {
      const firstPath = pathMatches[0];
      const coordinateRegex = /[ML]\s*([-\d.]+)[,\s]+([-\d.]+)|[HV]\s*([-\d.]+)|[CSQTA]\s*([-\d.,\s]+)/g;
      const coordinates = [];
      let coordMatch;
      
      while ((coordMatch = coordinateRegex.exec(firstPath)) !== null) {
        if (coordMatch[1] && coordMatch[2]) {
          // M or L command
          coordinates.push({ x: parseFloat(coordMatch[1]), y: parseFloat(coordMatch[2]) });
        } else if (coordMatch[3]) {
          // H or V command - only one coordinate
          const isH = firstPath[coordMatch.index] === 'H';
          if (isH) {
            coordinates.push({ x: parseFloat(coordMatch[3]), y: coordinates[coordinates.length - 1]?.y || 0 });
          } else {
            coordinates.push({ x: coordinates[coordinates.length - 1]?.x || 0, y: parseFloat(coordMatch[3]) });
          }
        }
      }
      
      console.log(`Extracted ${coordinates.length} coordinates from first path`);
      console.log('First few coordinates:', coordinates.slice(0, 10));
      
      if (coordinates.length > 0) {
        const minX = Math.min(...coordinates.map(c => c.x));
        const minY = Math.min(...coordinates.map(c => c.y));
        const maxX = Math.max(...coordinates.map(c => c.x));
        const maxY = Math.max(...coordinates.map(c => c.y));
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        console.log('=== CALCULATED BOUNDS ===');
        console.log(`Bounds: ${minX}, ${minY} to ${maxX}, ${maxY}`);
        console.log(`Dimensions: ${width} x ${height}`);
        
        return {
          width,
          height,
          minX,
          minY,
          maxX,
          maxY
        };
      }
    }
    
    console.log('No valid bounds could be calculated');
    return null;
    
  } catch (error) {
    console.error('Error in bounds calculation:', error);
    return null;
  }
}

// Test with a simple SVG
const testSVG = `<svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
  <path d="M 50 50 L 200 50 L 200 150 L 50 150 Z" fill="red"/>
  <path d="M 250 100 L 400 100 L 400 200 L 250 200 Z" fill="blue"/>
</svg>`;

console.log('Testing with simple SVG...');
const result = calculateSVGContentBounds(testSVG);
console.log('Final result:', result);