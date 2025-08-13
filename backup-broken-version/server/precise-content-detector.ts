/**
 * Precise Content Detector - Finds actual visual content dimensions
 * Focuses on meaningful artwork elements, ignoring canvas structure and spacing
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

interface VisualElement {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  pathData: string;
  coordinateCount: number;
  isSignificant: boolean;
}

export function detectPreciseContentBounds(svgContent: string): ContentBounds | null {
  console.log('🎯 PRECISE CONTENT DETECTION: Finding actual visual elements...');
  
  try {
    // Extract only meaningful visual elements
    const visualElements = extractVisualElements(svgContent);
    
    if (visualElements.length === 0) {
      console.log('❌ No visual elements found');
      return null;
    }
    
    console.log(`📍 Found ${visualElements.length} visual elements`);
    
    // Group elements and find content clusters
    const contentElements = filterContentElements(visualElements);
    
    if (contentElements.length === 0) {
      console.log('❌ No content elements after filtering');
      return null;
    }
    
    console.log(`🎯 Content elements: ${contentElements.length} meaningful visual elements`);
    
    // Calculate tight bounds around actual content
    const bounds = calculateTightContentBounds(contentElements);
    
    const mmDimensions = boundsToMillimeters(bounds);
    console.log(`✅ PRECISE CONTENT BOUNDS: ${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}px = ${mmDimensions.widthMm.toFixed(1)}×${mmDimensions.heightMm.toFixed(1)}mm`);
    
    return bounds;
    
  } catch (error) {
    console.error('❌ Precise content detection error:', error);
    return null;
  }
}

function extractVisualElements(svgContent: string): VisualElement[] {
  const elements: VisualElement[] = [];
  const pathRegex = /<path[^>]*?d="([^"]*?)"[^>]*?>/g;
  
  let match;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    const pathData = match[1];
    const fullElement = match[0];
    
    // Skip invisible elements
    if (fullElement.includes('opacity="0"') || fullElement.includes('visibility="hidden"')) {
      continue;
    }
    
    // Skip very simple structural elements (likely canvas bounds)
    if (isStructuralElement(pathData)) {
      continue;
    }
    
    // Extract coordinates and calculate bounds for this element
    const elementBounds = calculateElementBounds(pathData);
    
    if (elementBounds && isValidElement(elementBounds)) {
      elements.push({
        bounds: elementBounds,
        pathData: pathData,
        coordinateCount: countCoordinates(pathData),
        isSignificant: isSignificantElement(elementBounds, pathData)
      });
    }
  }
  
  return elements;
}

function isStructuralElement(pathData: string): boolean {
  // Skip very simple rectangles or lines that are likely canvas structure
  if (pathData.match(/^M\s*[-\d.]+[,\s]+[-\d.]+\s*[HVL]\s*[-\d.]+\s*[HVL]\s*[-\d.]+\s*[HVL]\s*[-\d.]+\s*Z?\s*$/)) {
    return true;
  }
  
  // Skip paths with very few moves (likely structural)
  const moveCommands = (pathData.match(/M/g) || []).length;
  if (moveCommands <= 1 && pathData.length < 50) {
    return true;
  }
  
  return false;
}

function calculateElementBounds(pathData: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const coordinateRegex = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)|([HV])\s*([-\d.]+)|([CSQTA])\s*([-\d.,\s]+)/g;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let lastX = 0, lastY = 0;
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
    
    if (!isNaN(x) && !isNaN(y)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      lastX = x;
      lastY = y;
    }
  }
  
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    return null;
  }
  
  return { minX, minY, maxX, maxY };
}

function isValidElement(bounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  
  // Must have meaningful dimensions
  if (width < 0.1 || height < 0.1) {
    return false;
  }
  
  // Filter out elements that are way too large (likely canvas bounds)
  if (width > 2000 || height > 2000) {
    return false;
  }
  
  return true;
}

function isSignificantElement(bounds: { minX: number; minY: number; maxX: number; maxY: number }, pathData: string): boolean {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const area = width * height;
  
  // Elements with reasonable size and complexity are significant
  const coordinateCount = countCoordinates(pathData);
  
  return area > 10 && coordinateCount > 4;
}

function countCoordinates(pathData: string): number {
  const coordinateRegex = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)|([HV])\s*([-\d.]+)|([CSQTA])\s*([-\d.,\s]+)/g;
  let count = 0;
  let match;
  
  while ((match = coordinateRegex.exec(pathData)) !== null) {
    count++;
  }
  
  return count;
}

function filterContentElements(elements: VisualElement[]): VisualElement[] {
  // Sort by area to prioritize main content elements
  elements.sort((a, b) => {
    const aArea = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY);
    const bArea = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY);
    return bArea - aArea;
  });
  
  // Find the main content cluster - elements that are close to each other
  const contentElements: VisualElement[] = [];
  const threshold = 100; // pixels - elements within this distance are considered part of the same content
  
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    
    // First element is always included
    if (contentElements.length === 0) {
      contentElements.push(element);
      continue;
    }
    
    // Check if this element is close to any existing content element
    const isNearContent = contentElements.some(contentEl => {
      const distance = Math.min(
        Math.abs(element.bounds.minX - contentEl.bounds.maxX),
        Math.abs(element.bounds.maxX - contentEl.bounds.minX),
        Math.abs(element.bounds.minY - contentEl.bounds.maxY),
        Math.abs(element.bounds.maxY - contentEl.bounds.minY)
      );
      return distance < threshold;
    });
    
    if (isNearContent || element.isSignificant) {
      contentElements.push(element);
    }
  }
  
  return contentElements;
}

function calculateTightContentBounds(elements: VisualElement[]): ContentBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let totalCoordinates = 0;
  
  for (const element of elements) {
    minX = Math.min(minX, element.bounds.minX);
    maxX = Math.max(maxX, element.bounds.maxX);
    minY = Math.min(minY, element.bounds.minY);
    maxY = Math.max(maxY, element.bounds.maxY);
    totalCoordinates += element.coordinateCount;
  }
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    coordinateCount: totalCoordinates
  };
}

export function boundsToMillimeters(bounds: ContentBounds): { widthMm: number; heightMm: number } {
  const PIXEL_TO_MM = 0.35; // Correct artwork conversion factor
  return {
    widthMm: bounds.width * PIXEL_TO_MM,
    heightMm: bounds.height * PIXEL_TO_MM
  };
}