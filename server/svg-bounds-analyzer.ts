/**
 * SVG Content Bounds Analyzer
 * 
 * Provides precise vector content bounds detection for SVG files
 * using DOM-based analysis and geometric calculations.
 */

import fs from 'fs';
import { JSDOM } from 'jsdom';

export interface SVGBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
  units: 'px' | 'mm' | 'pt';
}

export interface SVGBoundsResult {
  success: boolean;
  contentBounds?: SVGBounds;
  viewBoxBounds?: SVGBounds;
  method: 'dom-analysis' | 'viewbox-parsing' | 'path-calculation';
  hasContent: boolean;
  error?: string;
}

export class SVGBoundsAnalyzer {
  
  /**
   * Extract tight content bounds from SVG file
   */
  async extractSVGBounds(svgPath: string): Promise<SVGBoundsResult> {
    try {
      const svgContent = fs.readFileSync(svgPath, 'utf8');
      return this.analyzeSVGContent(svgContent);
    } catch (error) {
      return {
        success: false,
        method: 'dom-analysis',
        hasContent: false,
        error: error instanceof Error ? error.message : 'Failed to read SVG file'
      };
    }
  }

  /**
   * Analyze SVG content string for bounds
   */
  async analyzeSVGContent(svgContent: string): Promise<SVGBoundsResult> {
    try {
      // Create DOM for SVG analysis
      const dom = new JSDOM(`<!DOCTYPE html><html><body>${svgContent}</body></html>`);
      const document = dom.window.document;
      const svgElement = document.querySelector('svg');
      
      if (!svgElement) {
        return {
          success: false,
          method: 'dom-analysis',
          hasContent: false,
          error: 'No SVG element found'
        };
      }

      // Try different methods for bounds detection
      
      // Method 1: Parse viewBox if available
      const viewBoxResult = this.parseViewBox(svgElement);
      
      // Method 2: Calculate from path data
      const pathResult = this.calculatePathBounds(svgElement);
      
      // Method 3: Analyze all geometric elements
      const geometryResult = this.analyzeGeometryBounds(svgElement);

      // Choose the most accurate result
      // For AI-vectorized content, always calculate actual content bounds, not viewBox
      const isAIVectorized = svgContent.includes('data-ai-vectorized="true"');
      console.log(`🔍 DEBUG: isAIVectorized=${isAIVectorized}, SVG content preview: ${svgContent.substring(0, 200)}...`);
      let contentBounds;
      
      if (isAIVectorized) {
        // For AI-vectorized content, calculate actual content bounds excluding background paths
        console.log(`🎯 AI-VECTORIZED CONTENT DETECTED: Calculating actual content bounds`);
        
        // Try content-focused bounds analysis that excludes large background paths
        const contentFocusedBounds = this.calculateContentFocusedBounds(svgElement);
        contentBounds = contentFocusedBounds || pathResult || geometryResult || this.calculateVisibleContentBounds(svgElement);
        
        if (contentBounds) {
          console.log(`📐 AI-VECTORIZED CONTENT BOUNDS: ${contentBounds.width.toFixed(1)}×${contentBounds.height.toFixed(1)}px (actual content size)`);
          console.log(`📍 AI-VECTORIZED POSITION: (${contentBounds.xMin.toFixed(1)}, ${contentBounds.yMin.toFixed(1)}) to (${contentBounds.xMax.toFixed(1)}, ${contentBounds.yMax.toFixed(1)})`);
        }
      } else {
        // For normal SVGs, prioritize path and geometry calculations over viewBox
        contentBounds = pathResult || geometryResult || viewBoxResult;
      }
      
      if (contentBounds) {
        console.log(`✅ SVG content bounds: ${contentBounds.xMin},${contentBounds.yMin} to ${contentBounds.xMax},${contentBounds.yMax}`);
        
        return {
          success: true,
          contentBounds,
          viewBoxBounds: viewBoxResult || undefined,
          method: pathResult ? 'path-calculation' : geometryResult ? 'dom-analysis' : 'viewbox-parsing',
          hasContent: true
        };
      }

      return {
        success: false,
        method: 'dom-analysis',
        hasContent: false,
        error: 'No content bounds could be calculated'
      };

    } catch (error) {
      return {
        success: false,
        method: 'dom-analysis',
        hasContent: false,
        error: error instanceof Error ? error.message : 'SVG analysis failed'
      };
    }
  }

  /**
   * Calculate actual visible content bounds for tight content SVGs
   * This measures the content within the viewBox, not the absolute coordinates
   */
  private calculateVisibleContentBounds(svgElement: Element): SVGBounds | null {
    const viewBox = svgElement.getAttribute('viewBox');
    if (!viewBox) return null;
    
    const values = viewBox.split(/\s+/).map(Number);
    if (values.length !== 4) return null;
    
    const [vbX, vbY, vbWidth, vbHeight] = values;
    
    // For AI-vectorized content, analyze actual path coordinates to find true content bounds
    console.log(`📊 VIEWBOX ANALYSIS: viewBox="${viewBox}" (${vbWidth.toFixed(1)}×${vbHeight.toFixed(1)}px)`);
    
    // Analyze all drawable elements, not just paths
    const allElements = svgElement.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon');
    if (allElements.length === 0) {
      console.log(`⚠️ No drawable elements found in SVG`);
      return null;
    }
    
    console.log(`🔍 Found ${allElements.length} drawable elements to analyze`);
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let hasValidElement = false;
    let processedElements = 0;
    
    allElements.forEach(element => {
      const tagName = element.tagName.toLowerCase();
      let bounds: SVGBounds | null = null;
      
      if (tagName === 'path') {
        const d = element.getAttribute('d');
        if (d) {
          bounds = this.parsePathData(d);
        }
      } else if (tagName === 'circle') {
        const cx = parseFloat(element.getAttribute('cx') || '0');
        const cy = parseFloat(element.getAttribute('cy') || '0');
        const r = parseFloat(element.getAttribute('r') || '0');
        bounds = {
          xMin: cx - r, yMin: cy - r, xMax: cx + r, yMax: cy + r,
          width: r * 2, height: r * 2, units: 'px'
        };
      } else if (tagName === 'rect') {
        const x = parseFloat(element.getAttribute('x') || '0');
        const y = parseFloat(element.getAttribute('y') || '0');
        const width = parseFloat(element.getAttribute('width') || '0');
        const height = parseFloat(element.getAttribute('height') || '0');
        bounds = {
          xMin: x, yMin: y, xMax: x + width, yMax: y + height,
          width, height, units: 'px'
        };
      } else if (tagName === 'ellipse') {
        const cx = parseFloat(element.getAttribute('cx') || '0');
        const cy = parseFloat(element.getAttribute('cy') || '0');
        const rx = parseFloat(element.getAttribute('rx') || '0');
        const ry = parseFloat(element.getAttribute('ry') || '0');
        bounds = {
          xMin: cx - rx, yMin: cy - ry, xMax: cx + rx, yMax: cy + ry,
          width: rx * 2, height: ry * 2, units: 'px'
        };
      }
      
      if (bounds) {
        processedElements++;
        const elementSize = `${(bounds.xMax - bounds.xMin).toFixed(1)}×${(bounds.yMax - bounds.yMin).toFixed(1)}`;
        console.log(`📏 Element ${processedElements}: ${tagName} ${elementSize}px at (${bounds.xMin.toFixed(1)},${bounds.yMin.toFixed(1)})`);
        
        // For AI-vectorized content, don't clip to viewBox - find the natural content bounds
        minX = Math.min(minX, bounds.xMin);
        minY = Math.min(minY, bounds.yMin);
        maxX = Math.max(maxX, bounds.xMax);
        maxY = Math.max(maxY, bounds.yMax);
        hasValidElement = true;
      }
    });
    
    if (!hasValidElement) {
      // Fallback: use the viewBox as content bounds
      console.log(`📐 NO VISIBLE ELEMENTS: Using viewBox as content bounds`);
      return {
        xMin: 0,
        yMin: 0,
        xMax: vbWidth,
        yMax: vbHeight,
        width: vbWidth,
        height: vbHeight,
        units: 'px'
      };
    }
    
    // Calculate the actual visible content size
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    console.log(`📏 ACTUAL CONTENT BOUNDS: ${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)}px within ${vbWidth.toFixed(1)}×${vbHeight.toFixed(1)}px viewBox`);
    console.log(`📍 Content position: (${minX.toFixed(1)}, ${minY.toFixed(1)}) to (${maxX.toFixed(1)}, ${maxY.toFixed(1)})`);
    
    // Return content bounds relative to the SVG coordinate system
    return {
      xMin: minX,
      yMin: minY,
      xMax: maxX,
      yMax: maxY,
      width: contentWidth,
      height: contentHeight,
      units: 'px'
    };
  }

  /**
   * Parse SVG viewBox attribute
   */
  private parseViewBox(svgElement: Element): SVGBounds | null {
    const viewBox = svgElement.getAttribute('viewBox');
    if (!viewBox) return null;

    const values = viewBox.split(/\s+/).map(Number);
    if (values.length !== 4) return null;

    const [x, y, width, height] = values;
    
    return {
      xMin: x,
      yMin: y,
      xMax: x + width,
      yMax: y + height,
      width,
      height,
      units: 'px'
    };
  }

  /**
   * Calculate bounds from path elements
   */
  private calculatePathBounds(svgElement: Element): SVGBounds | null {
    const paths = svgElement.querySelectorAll('path');
    if (paths.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let hasValidPath = false;

    paths.forEach(path => {
      const d = path.getAttribute('d');
      if (!d) return;

      const bounds = this.parsePathData(d);
      if (bounds) {
        minX = Math.min(minX, bounds.xMin);
        minY = Math.min(minY, bounds.yMin);
        maxX = Math.max(maxX, bounds.xMax);
        maxY = Math.max(maxY, bounds.yMax);
        hasValidPath = true;
      }
    });

    if (!hasValidPath) return null;

    return {
      xMin: minX,
      yMin: minY,
      xMax: maxX,
      yMax: maxY,
      width: maxX - minX,
      height: maxY - minY,
      units: 'px'
    };
  }

  /**
   * Analyze all geometric elements for bounds
   */
  private analyzeGeometryBounds(svgElement: Element): SVGBounds | null {
    const geometrySelectors = [
      'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'
    ];

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let hasContent = false;

    geometrySelectors.forEach(selector => {
      const elements = svgElement.querySelectorAll(selector);
      
      elements.forEach(element => {
        const bounds = this.getElementBounds(element);
        if (bounds) {
          minX = Math.min(minX, bounds.xMin);
          minY = Math.min(minY, bounds.yMin);
          maxX = Math.max(maxX, bounds.xMax);
          maxY = Math.max(maxY, bounds.yMax);
          hasContent = true;
        }
      });
    });

    if (!hasContent) return null;

    return {
      xMin: minX,
      yMin: minY,
      xMax: maxX,
      yMax: maxY,
      width: maxX - minX,
      height: maxY - minY,
      units: 'px'
    };
  }

  /**
   * Get bounds for individual SVG element
   */
  private getElementBounds(element: Element): SVGBounds | null {
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case 'rect':
        return this.getRectBounds(element);
      case 'circle':
        return this.getCircleBounds(element);
      case 'ellipse':
        return this.getEllipseBounds(element);
      case 'line':
        return this.getLineBounds(element);
      case 'path':
        const d = element.getAttribute('d');
        return d ? this.parsePathData(d) : null;
      case 'polygon':
      case 'polyline':
        return this.getPolygonBounds(element);
      default:
        return null;
    }
  }

  /**
   * Parse path data for bounds calculation
   */
  private parsePathData(pathData: string): SVGBounds | null {
    try {
      // Enhanced path parsing for better bounds detection
      const coords = pathData.match(/([-+]?\d*\.?\d+)/g);
      if (!coords || coords.length < 2) return null;

      const numbers = coords.map(Number);
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      // Process coordinates in pairs to find actual content bounds
      for (let i = 0; i < numbers.length - 1; i += 2) {
        const x = numbers[i];
        const y = numbers[i + 1];
        
        if (!isNaN(x) && !isNaN(y)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      if (minX === Infinity) return null;

      const width = maxX - minX;
      const height = maxY - minY;
      
      // Add debug logging for path bounds
      console.log(`🛤️  Path bounds: (${minX.toFixed(1)}, ${minY.toFixed(1)}) to (${maxX.toFixed(1)}, ${maxY.toFixed(1)}) = ${width.toFixed(1)}×${height.toFixed(1)}`);

      return {
        xMin: minX,
        yMin: minY,
        xMax: maxX,
        yMax: maxY,
        width: width,
        height: height,
        units: 'px'
      };

    } catch (error) {
      console.error('Path parsing error:', error);
      return null;
    }
  }

  /**
   * Get bounds for rectangle element
   */
  private getRectBounds(element: Element): SVGBounds | null {
    const x = Number(element.getAttribute('x') || 0);
    const y = Number(element.getAttribute('y') || 0);
    const width = Number(element.getAttribute('width') || 0);
    const height = Number(element.getAttribute('height') || 0);

    if (width <= 0 || height <= 0) return null;

    return {
      xMin: x,
      yMin: y,
      xMax: x + width,
      yMax: y + height,
      width,
      height,
      units: 'px'
    };
  }

  /**
   * Get bounds for circle element
   */
  private getCircleBounds(element: Element): SVGBounds | null {
    const cx = Number(element.getAttribute('cx') || 0);
    const cy = Number(element.getAttribute('cy') || 0);
    const r = Number(element.getAttribute('r') || 0);

    if (r <= 0) return null;

    return {
      xMin: cx - r,
      yMin: cy - r,
      xMax: cx + r,
      yMax: cy + r,
      width: r * 2,
      height: r * 2,
      units: 'px'
    };
  }

  /**
   * Get bounds for ellipse element
   */
  private getEllipseBounds(element: Element): SVGBounds | null {
    const cx = Number(element.getAttribute('cx') || 0);
    const cy = Number(element.getAttribute('cy') || 0);
    const rx = Number(element.getAttribute('rx') || 0);
    const ry = Number(element.getAttribute('ry') || 0);

    if (rx <= 0 || ry <= 0) return null;

    return {
      xMin: cx - rx,
      yMin: cy - ry,
      xMax: cx + rx,
      yMax: cy + ry,
      width: rx * 2,
      height: ry * 2,
      units: 'px'
    };
  }

  /**
   * Get bounds for line element
   */
  private getLineBounds(element: Element): SVGBounds | null {
    const x1 = Number(element.getAttribute('x1') || 0);
    const y1 = Number(element.getAttribute('y1') || 0);
    const x2 = Number(element.getAttribute('x2') || 0);
    const y2 = Number(element.getAttribute('y2') || 0);

    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);

    return {
      xMin: minX,
      yMin: minY,
      xMax: maxX,
      yMax: maxY,
      width: maxX - minX,
      height: maxY - minY,
      units: 'px'
    };
  }

  /**
   * Get bounds for polygon/polyline element
   */
  private getPolygonBounds(element: Element): SVGBounds | null {
    const points = element.getAttribute('points');
    if (!points) return null;

    const coords = points.trim().split(/[\s,]+/).map(Number);
    if (coords.length < 4) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < coords.length - 1; i += 2) {
      const x = coords[i];
      const y = coords[i + 1];
      
      if (!isNaN(x) && !isNaN(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (minX === Infinity) return null;

    return {
      xMin: minX,
      yMin: minY,
      xMax: maxX,
      yMax: maxY,
      width: maxX - minX,
      height: maxY - minY,
      units: 'px'
    };
  }

  /**
   * Calculate content-focused bounds that exclude large background paths
   */
  private calculateContentFocusedBounds(svgElement: Element): SVGBounds | null {
    const paths = svgElement.querySelectorAll('path');
    if (paths.length === 0) return null;

    let allBounds: (SVGBounds & { pathIndex: number; area: number })[] = [];
    
    // Analyze all paths and collect their bounds
    paths.forEach((path, index) => {
      const d = path.getAttribute('d');
      if (d) {
        const bounds = this.parsePathData(d);
        if (bounds) {
          const area = bounds.width * bounds.height;
          allBounds.push({
            ...bounds,
            pathIndex: index,
            area: area
          });
        }
      }
    });

    if (allBounds.length === 0) return null;

    // Sort by area to identify potential background paths
    allBounds.sort((a, b) => a.area - b.area);
    
    // Calculate statistics for smarter filtering
    const areas = allBounds.map(b => b.area);
    const widths = allBounds.map(b => b.width);
    const heights = allBounds.map(b => b.height);
    
    // Sort to get percentiles
    areas.sort((a, b) => a - b);
    widths.sort((a, b) => a - b);
    heights.sort((a, b) => a - b);
    
    const medianArea = areas[Math.floor(areas.length * 0.5)];
    const area75th = areas[Math.floor(areas.length * 0.75)];
    const area90th = areas[Math.floor(areas.length * 0.9)];
    
    console.log(`📊 Path statistics: median area=${medianArea.toFixed(0)}, 75th=${area75th.toFixed(0)}, 90th=${area90th.toFixed(0)}`);
    
    // DENSITY-BASED filtering - find the actual content cluster
    // Vectorizer.ai creates huge square canvases, we need to find where the real logo is
    
    // Step 1: Remove obvious artifacts and containers
    const filteredPaths = allBounds.filter(pathBounds => {
      const isHugeContainer = pathBounds.area > medianArea * 50;
      const isMassiveBackground = pathBounds.width > 1500 || pathBounds.height > 1500;
      const isTinyArtifact = (pathBounds.width < 2 || pathBounds.height < 2) && pathBounds.area < 200;
      
      if (isHugeContainer || isMassiveBackground || isTinyArtifact) {
        console.log(`🚫 Excluding ${isHugeContainer ? 'huge container' : isMassiveBackground ? 'massive background' : 'tiny artifact'}: ${pathBounds.width.toFixed(1)}×${pathBounds.height.toFixed(1)}`);
        return false;
      }
      return true;
    });
    
    // Step 2: Find center of mass of remaining paths (where the logo actually is)
    const centerX = filteredPaths.reduce((sum, p) => sum + (p.xMin + p.xMax) / 2, 0) / filteredPaths.length;
    const centerY = filteredPaths.reduce((sum, p) => sum + (p.yMin + p.yMax) / 2, 0) / filteredPaths.length;
    console.log(`📍 Logo center of mass detected at: (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
    
    // Step 3: AGGRESSIVE content density detection
    // For 2400x1800 original with centered monster, actual content should be much smaller
    // Look for the core cluster of content, not the spread-out vectorizer padding
    
    // First pass: Only exclude extremely large canvas-spanning paths, keep logo content
    const coreContentPaths = filteredPaths.filter(pathBounds => {
      const isExtremelyLarge = pathBounds.width > 1000 || pathBounds.height > 1000; // Much more permissive
      const isCanvasSpanning = pathBounds.area > medianArea * 1.5; // Less aggressive
      
      if (isExtremelyLarge && isCanvasSpanning) {
        console.log(`🚫 Excluding extremely large path: ${pathBounds.width.toFixed(1)}×${pathBounds.height.toFixed(1)} (area: ${pathBounds.area.toFixed(0)})`);
        return false;
      }
      return true;
    });
    
    console.log(`🎯 Core content paths: ${coreContentPaths.length} out of ${filteredPaths.length} filtered paths`);
    
    // Step 4: Find the densest cluster of these core paths  
    let contentPaths;
    if (coreContentPaths.length > 0) {
      const coreCenter = {
        x: coreContentPaths.reduce((sum, p) => sum + (p.xMin + p.xMax) / 2, 0) / coreContentPaths.length,
        y: coreContentPaths.reduce((sum, p) => sum + (p.yMin + p.yMax) / 2, 0) / coreContentPaths.length
      };
      console.log(`📍 Core content center: (${coreCenter.x.toFixed(1)}, ${coreCenter.y.toFixed(1)})`);
      
      // Keep only paths within reasonable radius of core content center  
      const maxCoreDistance = Math.max(500, Math.sqrt(medianArea) * 1.2); // Much more generous  
      contentPaths = coreContentPaths.filter(pathBounds => {
        const pathCenterX = (pathBounds.xMin + pathBounds.xMax) / 2;
        const pathCenterY = (pathBounds.yMin + pathBounds.yMax) / 2;
        const distance = Math.sqrt(Math.pow(pathCenterX - coreCenter.x, 2) + Math.pow(pathCenterY - coreCenter.y, 2));
        
        if (distance > maxCoreDistance) {
          console.log(`🚫 Excluding distant from core: ${pathBounds.width.toFixed(1)}×${pathBounds.height.toFixed(1)} (${distance.toFixed(0)}px from core)`);
          return false;
        }
        return true;
      });
      
      console.log(`🎯 Final tight content paths: ${contentPaths.length}`);
    } else {
      // Fallback to original approach
      contentPaths = filteredPaths;
      console.log(`⚠️ No core content found, using all filtered paths: ${contentPaths.length}`);
    }

    if (contentPaths.length === 0) {
      console.log('⚠️ All paths filtered out, using smallest 80% of paths');
      // If all paths were filtered, use most paths (only exclude the largest ones)
      const keepCount = Math.ceil(allBounds.length * 0.8);
      contentPaths.push(...allBounds.slice(0, keepCount));
      console.log(`🔄 Fallback: Using smallest ${keepCount} paths out of ${allBounds.length}`);
    }

    console.log(`🎯 Using ${contentPaths.length} content paths out of ${allBounds.length} total paths`);

    // Calculate unified bounds from remaining content paths
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    contentPaths.forEach(bounds => {
      minX = Math.min(minX, bounds.xMin);
      minY = Math.min(minY, bounds.yMin);
      maxX = Math.max(maxX, bounds.xMax);
      maxY = Math.max(maxY, bounds.yMax);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    console.log(`🎯 CONTENT-FOCUSED BOUNDS: ${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)}px at (${minX.toFixed(1)}, ${minY.toFixed(1)})`);

    return {
      xMin: minX,
      yMin: minY,
      xMax: maxX,
      yMax: maxY,
      width: contentWidth,
      height: contentHeight,
      units: 'px'
    };
  }
}