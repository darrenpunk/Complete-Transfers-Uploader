import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

export interface SVGElement {
  id: string;
  type: string;
  content: string;
  attributes: Record<string, string>;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function ungroupSVG(svgContent: string): SVGElement[] {
  const elements: SVGElement[] = [];
  
  // Parse SVG content to extract individual drawable elements
  const svgMatch = svgContent.match(/<svg[^>]*>/);
  if (!svgMatch) return elements;
  
  const svgAttributes = parseSVGAttributes(svgMatch[0]);
  const viewBox = svgAttributes.viewBox || `0 0 ${svgAttributes.width || 100} ${svgAttributes.height || 100}`;
  const [vbX, vbY, vbWidth, vbHeight] = viewBox.split(' ').map(Number);
  
  // Extract individual elements (paths, circles, rects, text, etc.)
  const elementRegex = /<(path|circle|rect|ellipse|line|polyline|polygon|text|g)[^>]*>.*?<\/\1>|<(path|circle|rect|ellipse|line|polyline|polygon|image|use)\s[^>]*\/>/g;
  const matches = svgContent.match(elementRegex) || [];
  
  matches.forEach((match, index) => {
    const tagName = match.match(/<(\w+)/)?.[1] || 'unknown';
    
    // Skip groups for now - we'll handle them recursively later
    if (tagName === 'g') {
      const groupElements = extractGroupElements(match, svgAttributes);
      elements.push(...groupElements);
      return;
    }
    
    const attrs = parseElementAttributes(match);
    const bounds = calculateElementBounds(tagName, attrs, vbWidth, vbHeight);
    
    // Only include visible elements with meaningful content
    if (bounds.width > 1 && bounds.height > 1) {
      elements.push({
        id: nanoid(),
        type: tagName,
        content: match,
        attributes: attrs,
        bounds
      });
    }
  });
  
  return elements;
}

function extractGroupElements(groupContent: string, svgAttributes: Record<string, string>): SVGElement[] {
  const elements: SVGElement[] = [];
  
  // Extract elements from within the group
  const innerContent = groupContent.replace(/<g[^>]*>/, '').replace(/<\/g>$/, '');
  const elementRegex = /<(path|circle|rect|ellipse|line|polyline|polygon|text|image|use)[^>]*>.*?<\/\1>|<(path|circle|rect|ellipse|line|polyline|polygon|image|use)\s[^>]*\/>/g;
  const matches = innerContent.match(elementRegex) || [];
  
  matches.forEach((match) => {
    const tagName = match.match(/<(\w+)/)?.[1] || 'unknown';
    const attrs = parseElementAttributes(match);
    const bounds = calculateElementBounds(tagName, attrs, 100, 100); // Default bounds
    
    if (bounds.width > 1 && bounds.height > 1) {
      elements.push({
        id: nanoid(),
        type: tagName,
        content: match,
        attributes: attrs,
        bounds
      });
    }
  });
  
  return elements;
}

function parseSVGAttributes(svgTag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match;
  
  while ((match = attrRegex.exec(svgTag)) !== null) {
    attrs[match[1]] = match[2];
  }
  
  return attrs;
}

function parseElementAttributes(element: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
  let match;
  
  while ((match = attrRegex.exec(element)) !== null) {
    attrs[match[1]] = match[2];
  }
  
  return attrs;
}

function calculateElementBounds(tagName: string, attrs: Record<string, string>, defaultWidth: number, defaultHeight: number): { x: number; y: number; width: number; height: number } {
  let bounds = { x: 0, y: 0, width: defaultWidth / 4, height: defaultHeight / 4 };
  
  switch (tagName) {
    case 'rect':
      bounds = {
        x: parseFloat(attrs.x || '0'),
        y: parseFloat(attrs.y || '0'),
        width: parseFloat(attrs.width || '50'),
        height: parseFloat(attrs.height || '50')
      };
      break;
      
    case 'circle':
      const cx = parseFloat(attrs.cx || '50');
      const cy = parseFloat(attrs.cy || '50');
      const r = parseFloat(attrs.r || '25');
      bounds = {
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2
      };
      break;
      
    case 'ellipse':
      const ecx = parseFloat(attrs.cx || '50');
      const ecy = parseFloat(attrs.cy || '50');
      const rx = parseFloat(attrs.rx || '25');
      const ry = parseFloat(attrs.ry || '25');
      bounds = {
        x: ecx - rx,
        y: ecy - ry,
        width: rx * 2,
        height: ry * 2
      };
      break;
      
    case 'path':
      // Simplified path bounds calculation
      const pathData = attrs.d || '';
      bounds = calculatePathBounds(pathData, defaultWidth, defaultHeight);
      break;
      
    case 'text':
      bounds = {
        x: parseFloat(attrs.x || '0'),
        y: parseFloat(attrs.y || '0') - 20, // Approximate text height
        width: 100, // Estimate based on content
        height: 25
      };
      break;
      
    default:
      // For other elements, use default bounds
      bounds = {
        x: 0,
        y: 0,
        width: Math.min(defaultWidth / 3, 100),
        height: Math.min(defaultHeight / 3, 100)
      };
  }
  
  return bounds;
}

function calculatePathBounds(pathData: string, defaultWidth: number, defaultHeight: number): { x: number; y: number; width: number; height: number } {
  // Extract numerical coordinates from path data
  const coords = pathData.match(/[\d.-]+/g)?.map(Number) || [];
  
  if (coords.length === 0) {
    return {
      x: 0,
      y: 0,
      width: defaultWidth / 4,
      height: defaultHeight / 4
    };
  }
  
  // Find min/max x and y coordinates
  const xCoords: number[] = [];
  const yCoords: number[] = [];
  
  for (let i = 0; i < coords.length; i += 2) {
    if (coords[i] !== undefined) xCoords.push(coords[i]);
    if (coords[i + 1] !== undefined) yCoords.push(coords[i + 1]);
  }
  
  const minX = Math.min(...xCoords);
  const maxX = Math.max(...xCoords);
  const minY = Math.min(...yCoords);
  const maxY = Math.max(...yCoords);
  
  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 10),
    height: Math.max(maxY - minY, 10)
  };
}

export function createSeparateSVGFiles(elements: SVGElement[], originalFilename: string, uploadDir: string): string[] {
  const filenames: string[] = [];
  
  elements.forEach((element, index) => {
    const newFilename = `${originalFilename.replace('.svg', '')}_part_${index + 1}_${element.id}.svg`;
    const newPath = path.join(uploadDir, newFilename);
    
    // Create a complete SVG file for each element
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${element.bounds.width}" height="${element.bounds.height}" 
     viewBox="${element.bounds.x} ${element.bounds.y} ${element.bounds.width} ${element.bounds.height}">
  ${element.content}
</svg>`;
    
    fs.writeFileSync(newPath, svgContent);
    filenames.push(newFilename);
  });
  
  return filenames;
}