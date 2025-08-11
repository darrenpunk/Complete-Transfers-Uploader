/**
 * SIMPLE CONTENT BOUNDS DETECTOR
 * 
 * Direct approach: Find the exact boundaries of visible artwork content only.
 * No complex algorithms, no density analysis, no target matching.
 * Just pure coordinate extraction from actual drawing elements.
 */

interface ContentBounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  coordinateCount: number;
}

export function detectSimpleContentBounds(svgContent: string): ContentBounds | null {
  console.log('🎯 SIMPLE BOUNDS DETECTION: Starting smart content extraction...');
  
  try {
    // Extract visible elements, filtering out backgrounds and padding
    const pathRegex = /<path[^>]*?d="([^"]*?)"[^>]*?>/g;
    const rectRegex = /<rect[^>]*?x="([^"]*?)"[^>]*?y="([^"]*?)"[^>]*?width="([^"]*?)"[^>]*?height="([^"]*?)"/g;
    const circleRegex = /<circle[^>]*?cx="([^"]*?)"[^>]*?cy="([^"]*?)"[^>]*?r="([^"]*?)"/g;
    
    // Coordinate extraction patterns
    const coordinateRegex = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)|([HV])\s*([-\d.]+)|([CSQTA])\s*([-\d.,\s]+)/g;
    
    let allCoordinates: { x: number, y: number, pathId: number }[] = [];
    
    // Process all paths and collect coordinates with metadata
    let match;
    let pathCount = 0;
    
    while ((match = pathRegex.exec(svgContent)) !== null) {
      pathCount++;
      const pathData = match[1];
      const fullPathElement = match[0];
      
      // Skip background elements, large rectangles, and invisible elements
      if (isBackgroundElement(fullPathElement, pathData)) {
        continue;
      }
      
      // Extract coordinates from path data
      let coordMatch;
      let pathCoords = 0;
      
      while ((coordMatch = coordinateRegex.exec(pathData)) !== null) {
        let x: number, y: number;
        
        if (coordMatch[1] === 'M' || coordMatch[1] === 'L') {
          // Move/Line commands: x,y coordinates
          x = parseFloat(coordMatch[2]);
          y = parseFloat(coordMatch[3]);
        } else if (coordMatch[4] === 'H') {
          // Horizontal line: x coordinate only
          x = parseFloat(coordMatch[5]);
          y = maxY === -Infinity ? 0 : maxY; // Use last Y
        } else if (coordMatch[4] === 'V') {
          // Vertical line: y coordinate only
          x = maxX === -Infinity ? 0 : maxX; // Use last X
          y = parseFloat(coordMatch[5]);
        } else if (coordMatch[6]) {
          // Curve/Arc commands: extract coordinate pairs
          const coords = coordMatch[7].split(/[,\s]+/).filter(c => c && !isNaN(parseFloat(c)));
          if (coords.length >= 2) {
            x = parseFloat(coords[coords.length - 2]);
            y = parseFloat(coords[coords.length - 1]);
          } else {
            continue;
          }
        } else {
          continue;
        }
        
        // Validate coordinates
        if (isNaN(x) || isNaN(y)) continue;
        if (x < -1000 || x > 10000 || y < -1000 || y > 10000) continue; // Filter extreme values
        
        // Update bounds
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        
        coordinateCount++;
        pathCoords++;
      }
      
      console.log(`📍 Path ${pathCount}: Found ${pathCoords} coordinates`);
    }
    
    // Process rectangles
    while ((match = rectRegex.exec(svgContent)) !== null) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      const width = parseFloat(match[3]);
      const height = parseFloat(match[4]);
      
      if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + width);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y + height);
        coordinateCount += 4;
        console.log(`📍 Rectangle: ${x},${y} ${width}×${height}`);
      }
    }
    
    // Process circles
    while ((match = circleRegex.exec(svgContent)) !== null) {
      const cx = parseFloat(match[1]);
      const cy = parseFloat(match[2]);
      const r = parseFloat(match[3]);
      
      if (!isNaN(cx) && !isNaN(cy) && !isNaN(r)) {
        minX = Math.min(minX, cx - r);
        maxX = Math.max(maxX, cx + r);
        minY = Math.min(minY, cy - r);
        maxY = Math.max(maxY, cy + r);
        coordinateCount += 4;
        console.log(`📍 Circle: center ${cx},${cy} radius ${r}`);
      }
    }
    
    // Validate results
    if (coordinateCount === 0 || minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      console.log('❌ SIMPLE BOUNDS: No valid coordinates found');
      return null;
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    if (width <= 0 || height <= 0) {
      console.log('❌ SIMPLE BOUNDS: Invalid dimensions');
      return null;
    }
    
    console.log(`✅ SIMPLE BOUNDS RESULT: ${width.toFixed(1)}×${height.toFixed(1)}px from ${coordinateCount} coordinates`);
    console.log(`📏 Content area: ${minX.toFixed(1)},${minY.toFixed(1)} → ${maxX.toFixed(1)},${maxY.toFixed(1)}`);
    
    return {
      width,
      height,
      minX,
      minY,
      maxX,
      maxY,
      coordinateCount
    };
    
  } catch (error) {
    console.error('❌ SIMPLE BOUNDS ERROR:', error);
    return null;
  }
}

/**
 * Convert bounds to millimeters using exact conversion
 */
export function boundsToMillimeters(bounds: ContentBounds): { widthMm: number; heightMm: number } {
  // Use the exact conversion factor from dimension-utils
  const PIXEL_TO_MM_FACTOR = 0.35; // 1 pixel = 0.35mm at 72 DPI
  
  return {
    widthMm: bounds.width * PIXEL_TO_MM_FACTOR,
    heightMm: bounds.height * PIXEL_TO_MM_FACTOR
  };
}