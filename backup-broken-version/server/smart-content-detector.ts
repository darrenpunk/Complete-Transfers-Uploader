/**
 * Smart Content Bounds Detector - Advanced filtering for actual artwork content
 * Filters out background elements, padding, and canvas bounds to find true artwork content
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

interface Coordinate {
  x: number;
  y: number;
  pathId: number;
  isSignificant: boolean;
}

export function detectSmartContentBounds(svgContent: string): ContentBounds | null {
  console.log('🧠 SMART CONTENT DETECTION: Starting intelligent artwork extraction...');
  
  try {
    // Extract all coordinates from visible elements
    const coordinates = extractAllCoordinates(svgContent);
    
    if (coordinates.length === 0) {
      console.log('❌ No coordinates found in SVG');
      return null;
    }
    
    console.log(`📍 Extracted ${coordinates.length} total coordinates from SVG`);
    
    // Statistical filtering to find actual content cluster
    const contentCoords = filterContentCoordinates(coordinates);
    
    if (contentCoords.length === 0) {
      console.log('❌ No content coordinates found after filtering');
      return null;
    }
    
    console.log(`🎯 Content filtering: ${coordinates.length} → ${contentCoords.length} coordinates (${((contentCoords.length / coordinates.length) * 100).toFixed(1)}% are actual content)`);
    
    // Calculate tight bounds around actual content
    const bounds = calculateContentBounds(contentCoords);
    
    const mmDimensions = boundsToMillimeters(bounds);
    console.log(`✅ SMART CONTENT BOUNDS: ${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}px = ${mmDimensions.widthMm.toFixed(1)}×${mmDimensions.heightMm.toFixed(1)}mm`);
    
    return bounds;
    
  } catch (error) {
    console.error('❌ Smart content detection error:', error);
    return null;
  }
}

function extractAllCoordinates(svgContent: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  
  // Path elements
  const pathRegex = /<path[^>]*?d="([^"]*?)"[^>]*?>/g;
  const coordinateRegex = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)|([HV])\s*([-\d.]+)|([CSQTA])\s*([-\d.,\s]+)/g;
  
  let match;
  let pathId = 0;
  let lastX = 0, lastY = 0;
  
  while ((match = pathRegex.exec(svgContent)) !== null) {
    pathId++;
    const pathData = match[1];
    const fullElement = match[0];
    
    // Skip obvious background elements
    if (isBackgroundPath(fullElement, pathData)) {
      continue;
    }
    
    let coordMatch;
    while ((coordMatch = coordinateRegex.exec(pathData)) !== null) {
      let x: number, y: number;
      
      if (coordMatch[1] === 'M' || coordMatch[1] === 'L') {
        x = parseFloat(coordMatch[2]);
        y = parseFloat(coordMatch[3]);
      } else if (coordMatch[4] === 'H') {
        x = parseFloat(coordMatch[5]);
        y = lastY;
      } else if (coordMatch[4] === 'V') {
        x = lastX;
        y = parseFloat(coordMatch[5]);
      } else if (coordMatch[6]) {
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
      
      if (!isNaN(x) && !isNaN(y) && isValidCoordinate(x, y)) {
        coordinates.push({ x, y, pathId, isSignificant: false });
        lastX = x;
        lastY = y;
      }
    }
  }
  
  // Rectangle elements
  const rectRegex = /<rect[^>]*?x="([^"]*?)"[^>]*?y="([^"]*?)"[^>]*?width="([^"]*?)"[^>]*?height="([^"]*?)"/g;
  while ((match = rectRegex.exec(svgContent)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const width = parseFloat(match[3]);
    const height = parseFloat(match[4]);
    
    if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
      pathId++;
      coordinates.push(
        { x, y, pathId, isSignificant: true },
        { x: x + width, y, pathId, isSignificant: true },
        { x, y: y + height, pathId, isSignificant: true },
        { x: x + width, y: y + height, pathId, isSignificant: true }
      );
    }
  }
  
  return coordinates;
}

function isBackgroundPath(element: string, pathData: string): boolean {
  // Skip invisible or transparent elements only
  if (element.includes('opacity="0"') || element.includes('visibility="hidden"')) {
    return true;
  }
  
  // For artwork content, don't skip paths based on complexity - keep all visible content
  return false;
}

function isValidCoordinate(x: number, y: number): boolean {
  // Filter out extreme values that are likely padding or errors
  return x > -2000 && x < 5000 && y > -2000 && y < 5000;
}

function filterContentCoordinates(coordinates: Coordinate[]): Coordinate[] {
  if (coordinates.length === 0) return [];
  
  // Statistical analysis to find the main content cluster
  const xValues = coordinates.map(c => c.x).sort((a, b) => a - b);
  const yValues = coordinates.map(c => c.y).sort((a, b) => a - b);
  
  // Find quartiles to identify the main content area
  const xQ1 = xValues[Math.floor(xValues.length * 0.25)];
  const xQ3 = xValues[Math.floor(xValues.length * 0.75)];
  const yQ1 = yValues[Math.floor(yValues.length * 0.25)];
  const yQ3 = yValues[Math.floor(yValues.length * 0.75)];
  
  // Expand generously beyond interquartile range to capture all edge content
  const xIQR = xQ3 - xQ1;
  const yIQR = yQ3 - yQ1;
  const xMin = xQ1 - (xIQR * 1.0);  // More generous expansion
  const xMax = xQ3 + (xIQR * 1.0);
  const yMin = yQ1 - (yIQR * 1.0);
  const yMax = yQ3 + (yIQR * 1.0);
  
  console.log(`📊 Content cluster analysis: X range ${xMin.toFixed(1)} to ${xMax.toFixed(1)}, Y range ${yMin.toFixed(1)} to ${yMax.toFixed(1)}`);
  
  // Filter coordinates to main content cluster
  return coordinates.filter(coord => 
    coord.x >= xMin && coord.x <= xMax && 
    coord.y >= yMin && coord.y <= yMax
  );
}

function calculateContentBounds(coordinates: Coordinate[]): ContentBounds {
  const xValues = coordinates.map(c => c.x);
  const yValues = coordinates.map(c => c.y);
  
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    coordinateCount: coordinates.length
  };
}

export function boundsToMillimeters(bounds: ContentBounds): { widthMm: number; heightMm: number } {
  const PIXEL_TO_MM = 0.35; // Correct artwork conversion factor
  return {
    widthMm: bounds.width * PIXEL_TO_MM,
    heightMm: bounds.height * PIXEL_TO_MM
  };
}