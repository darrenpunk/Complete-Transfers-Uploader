import React, { useEffect, useState } from 'react';
import type { Logo, CanvasElement, Project, ContentBounds } from '@shared/schema';

interface SvgInlineRendererProps {
  element: CanvasElement;
  logo: Logo;
  project: Project;
  shouldRecolorForInk: boolean;
}

export default function SvgInlineRenderer({ 
  element, 
  logo, 
  project,
  shouldRecolorForInk 
}: SvgInlineRendererProps) {
  const [svgContent, setSvgContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [useFallbackImg, setUseFallbackImg] = useState(false);

  // COMPLEX VECTOR PERFORMANCE FIX: Use PNG fallback for complex vectors (thousands of paths)
  // This prevents browser crashes from rendering too many DOM elements
  const hasComplexVectorFallback = !!(logo as any).canvasFallbackFilename;
  
  // Also check for large SVG files (legacy check - file size based)
  const LARGE_SVG_THRESHOLD = 1024 * 1024; // 1MB
  const isLargeSvg = logo.size && logo.size > LARGE_SVG_THRESHOLD;

  useEffect(() => {
    // CRITICAL: Reset fallback flag when color overrides or recoloring are needed
    const needsColorManipulation = (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) || shouldRecolorForInk;
    
    if (needsColorManipulation) {
      // Force SVG rendering for color manipulation - PNG fallback cannot be recolored
      console.log(`🎨 Color manipulation needed, forcing SVG rendering (overrides: ${!!element.colorOverrides}, recolorForInk: ${shouldRecolorForInk})`);
      setUseFallbackImg(false);
    } else {
      // PRIORITY CHECK: Use PNG fallback for complex vectors (only when no color manipulation)
      if (hasComplexVectorFallback) {
        const metrics = (logo as any).vectorComplexityMetrics;
        console.log(`🎨 COMPLEX VECTOR: Using PNG fallback for canvas (paths: ${metrics?.pathCount || 'unknown'}, elements: ${metrics?.elementCount || 'unknown'})`);
        setUseFallbackImg(true);
        setIsLoading(false);
        return;
      }
      
      // Legacy check: For very large SVGs by file size
      if (isLargeSvg) {
        console.log(`⚠️ Large SVG detected (${(logo.size! / 1024 / 1024).toFixed(1)}MB), using simplified rendering`);
        setUseFallbackImg(true);
      }
    }

    const fetchSvg = async () => {
      try {
        setIsLoading(true);
        
        // Determine which URL to fetch
        let url: string;
        if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
          url = `/api/canvas-elements/${element.id}/modified-svg?t=${Date.now()}`;
        } else if (shouldRecolorForInk && project.inkColor) {
          url = `/uploads/${logo.filename}?inkColor=${encodeURIComponent(project.inkColor)}&recolor=true&t=${Date.now()}`;
        } else {
          url = `/uploads/${logo.filename}`;
        }
        
        const response = await fetch(url);
        const text = await response.text();
        
        // For large SVGs, do minimal processing
        if (isLargeSvg && !element.colorOverrides && !shouldRecolorForInk) {
          let simpleSvg = text;
          // Only remove XML declaration and DOCTYPE
          simpleSvg = simpleSvg.replace(/<\?xml[^?]*\?>/g, '');
          simpleSvg = simpleSvg.replace(/<!DOCTYPE[^>]*>/g, '');
          setSvgContent(simpleSvg);
          setIsLoading(false);
          return;
        }
        
        // Clean and normalize SVG for content-based centering
        let cleanedSvg = text;
        
        // Remove XML declaration if present
        cleanedSvg = cleanedSvg.replace(/<\?xml[^?]*\?>/g, '');
        cleanedSvg = cleanedSvg.replace(/<!DOCTYPE[^>]*>/g, '');
        
        // CRITICAL FIX: Only remove width/height from root <svg> tag, NOT from child elements like <image>
        // Removing width/height from <image> elements collapses embedded images to 0×0
        // Use targeted replacement that only affects the opening <svg> tag
        cleanedSvg = cleanedSvg.replace(
          /(<svg[^>]*?)(\s+width\s*=\s*["'][^"']*["'])([^>]*?>)/i,
          '$1$3' // Remove width from svg tag
        );
        cleanedSvg = cleanedSvg.replace(
          /(<svg[^>]*?)(\s+height\s*=\s*["'][^"']*["'])([^>]*?>)/i,
          '$1$3' // Remove height from svg tag
        );
        
        // Set preserveAspectRatio="xMidYMid meet" for consistent scaling
        if (cleanedSvg.includes('preserveAspectRatio')) {
          cleanedSvg = cleanedSvg.replace(/preserveAspectRatio\s*=\s*["'][^"']*["']/gi, 'preserveAspectRatio="xMidYMid meet"');
        } else {
          cleanedSvg = cleanedSvg.replace(/<svg([^>]*)>/, '<svg$1 preserveAspectRatio="xMidYMid meet">');
        }
        
        // Remove any existing style attributes that might interfere
        cleanedSvg = cleanedSvg.replace(
          /style\s*=\s*["'][^"']*background[^"']*["']/gi,
          ''
        );
        
        setSvgContent(cleanedSvg);
      } catch (error) {
        console.error('Failed to load SVG content:', error);
        setSvgContent('');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSvg();
  }, [element.id, element.colorOverrides, logo.filename, shouldRecolorForInk, project.inkColor, isLargeSvg, logo.size]);

  // PERFORMANCE FIX: Render complex vectors using PNG fallback or simplified SVG
  const renderSimplifiedLargeSvg = () => {
    // COMPLEX VECTOR: Use PNG fallback if available
    if (hasComplexVectorFallback) {
      const pngUrl = `/uploads/${(logo as any).canvasFallbackFilename}`;
      const metrics = (logo as any).vectorComplexityMetrics;
      console.log('🎨 Rendering complex vector with PNG fallback:', { 
        pngUrl, 
        pathCount: metrics?.pathCount,
        elementCount: metrics?.elementCount
      });
      
      // Use content bounds for positioning if available
      const hasContentBounds = logo.contentBounds && 
                              typeof logo.contentBounds === 'object' &&
                              'xMin' in logo.contentBounds &&
                              'yMin' in logo.contentBounds;
      
      return (
        <div 
          className="w-full h-full"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            margin: 0,
            overflow: 'hidden'
          }}
        >
          <img 
            src={pngUrl} 
            alt={logo.originalName}
            data-testid="complex-vector-png-fallback"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
        </div>
      );
    }
    
    // Legacy: Large SVG simplified rendering
    console.log('🎨 Rendering large SVG with simplified inline rendering:', { size: logo.size });
    
    // Render the SVG content as-is without complex transformations
    // The SVG's viewBox will handle the scaling
    return (
      <div 
        className="w-full h-full"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          margin: 0,
          overflow: 'hidden'
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    );
  };

  // ARCHITECT SOLUTION: Content-bounds-based centering with viewBox expansion for negative coordinates
  const renderWithContentBounds = () => {
    // Check if we have valid content bounds for precise positioning
    const hasContentBounds = logo.contentBounds && 
                            typeof logo.contentBounds === 'object' &&
                            'xMin' in logo.contentBounds &&
                            'yMin' in logo.contentBounds &&
                            'xMax' in logo.contentBounds &&
                            'yMax' in logo.contentBounds;
    
    if (!hasContentBounds) {
      // Fallback to default centering - content always at fixed size
      return (
        <div 
          className="w-full h-full"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            margin: 0,
            overflow: 'hidden'
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      );
    }
    
    const bounds = logo.contentBounds as ContentBounds;
    
    // Get viewBox dimensions to check for overflow
    const viewBoxMatch = svgContent.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    let viewBoxWidth = element.width;
    let viewBoxHeight = element.height;
    
    if (viewBoxMatch) {
      const [vbX, vbY, vbWidth, vbHeight] = viewBoxMatch[1].split(/\s+/).map(Number);
      viewBoxWidth = vbWidth;
      viewBoxHeight = vbHeight;
    }
    
    // CRITICAL FIX: For content extending beyond viewBox, use simplified rendering
    // Compare bounds (in viewBox coordinates) against viewBox size (not element size!)
    const hasOverflow = bounds.xMin < 0 || bounds.yMin < 0 || 
                        bounds.xMax > viewBoxWidth || bounds.yMax > viewBoxHeight;
    
    if (hasOverflow) {
      console.log('🎯 OVERFLOW DETECTED: Using full viewBox rendering with proper scaling');
      console.log(`   Content bounds: (${bounds.xMin}, ${bounds.yMin}) to (${bounds.xMax}, ${bounds.yMax})`);
      console.log(`   Element size: ${element.width} × ${element.height}mm`);
      
      // Calculate scale: Canvas layout displays elements at 96 DPI CSS standard
      // SVG viewBox is in 72 DPI PDF units, so we need to scale to match 96 DPI display
      const mmToPixel96DPI = 96 / 25.4; // 3.779 px/mm (CSS standard)
      const targetPixelWidth = element.width * mmToPixel96DPI;
      const targetPixelHeight = element.height * mmToPixel96DPI;
      
      const scaleX = targetPixelWidth / viewBoxWidth;
      const scaleY = targetPixelHeight / viewBoxHeight;
      const scale = Math.min(scaleX, scaleY);
      
      // Calculate rendered pixel dimensions
      const renderedWidth = viewBoxWidth * scale;
      const renderedHeight = viewBoxHeight * scale;
      
      console.log(`   Target: ${targetPixelWidth.toFixed(1)}×${targetPixelHeight.toFixed(1)}px (${element.width.toFixed(1)}×${element.height.toFixed(1)}mm @ 96 DPI)`);
      console.log(`   ViewBox: ${viewBoxWidth}×${viewBoxHeight}px (72 DPI)`);
      console.log(`   Scale: ${scale.toFixed(4)}, Rendered: ${renderedWidth.toFixed(1)}×${renderedHeight.toFixed(1)}px`);
      
      // Ensure SVG has proper namespace and remove width/height attrs
      let processedSvg = svgContent;
      if (!svgContent.includes('xmlns:xlink')) {
        processedSvg = processedSvg.replace(
          /<svg([^>]*)>/i,
          '<svg$1 xmlns:xlink="http://www.w3.org/1999/xlink">'
        );
      }
      
      // Remove existing width/height attributes
      processedSvg = processedSvg.replace(/\s+width\s*=\s*["'][^"']*["']/gi, '');
      processedSvg = processedSvg.replace(/\s+height\s*=\s*["'][^"']*["']/gi, '');
      
      // Set explicit pixel dimensions based on scale
      processedSvg = processedSvg.replace(
        /<svg([^>]*)>/,
        `<svg$1 width="${renderedWidth}px" height="${renderedHeight}px" style="display: block;">`
      );
      
      return (
        <div 
          className="w-full h-full"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            margin: 0,
            overflow: 'visible'
          }}
          dangerouslySetInnerHTML={{ __html: processedSvg }}
        />
      );
    }
    
    // No negative coordinates - use standard centering
    const contentCenterX = (bounds.xMin + bounds.xMax) / 2;
    const contentCenterY = (bounds.yMin + bounds.yMax) / 2;
    
    // Detect Y-inversion by checking for scaleY(-1) in the SVG
    const hasYFlip = svgContent.includes('matrix(') && 
                     (svgContent.includes('matrix(1, 0, 0, -1') || 
                      svgContent.includes('matrix(1,0,0,-1'));
    
    // Handle Y-inversion for PDF-derived content
    let adjustedCenterY = contentCenterY;
    if (hasYFlip) {
      const viewBoxMatch = svgContent.match(/viewBox\s*=\s*["']([^"']+)["']/i);
      if (viewBoxMatch) {
        const [, , , svgHeight] = viewBoxMatch[1].split(/\s+/).map(Number);
        adjustedCenterY = svgHeight - contentCenterY;
      }
    }
    
    // Use stored contentScale if available, otherwise calculate from current bounds
    // CRITICAL: Backend stores element dimensions at 72 DPI (PDF standard)
    // So we must use 72 DPI here to match: viewBox pixels → mm using same conversion
    const pxToMm = 1 / 2.834645669; // PDF DPI conversion (72 DPI: 1mm = 2.834645669px)
    const svgWidthMm = viewBoxWidth * pxToMm;
    const svgHeightMm = viewBoxHeight * pxToMm;
    
    let scale;
    if (element.contentScale && element.contentScale > 0) {
      // Use stored scale - this keeps content at original size when bounds change
      scale = element.contentScale;
      console.log(`🎯 Using STORED contentScale: ${scale.toFixed(4)} (content size locked)`);
    } else {
      // Calculate scale from current bounds (first import)
      const scaleX = element.width / svgWidthMm;
      const scaleY = element.height / svgHeightMm;
      scale = Math.min(scaleX, scaleY);
      console.log(`🎯 Calculating NEW scale: ${scale.toFixed(4)} from bounds ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm`);
    }
    
    // Calculate the rendered pixel dimensions at this scale
    const renderedWidth = viewBoxWidth * scale;
    const renderedHeight = viewBoxHeight * scale;
    
    console.log(`   Bounds: ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm | Rendered: ${renderedWidth.toFixed(1)}×${renderedHeight.toFixed(1)}px`);
    
    // Remove width/height attributes
    let scaledSvg = svgContent.replace(/\s+width\s*=\s*["'][^"']*["']/gi, '');
    scaledSvg = scaledSvg.replace(/\s+height\s*=\s*["'][^"']*["']/gi, '');
    
    // Set explicit pixel dimensions based on the scale factor
    // These dimensions are independent of the container size
    scaledSvg = scaledSvg.replace(
      /<svg([^>]*)>/,
      `<svg$1 width="${renderedWidth}px" height="${renderedHeight}px" style="display: block;">`
    );
    
    return (
      <div 
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          margin: 0,
          overflow: 'visible'
        }}
        dangerouslySetInnerHTML={{ __html: scaledSvg }}
      />
    );
  };

  // Early returns for loading and error states
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  // PERFORMANCE FIX: Render PNG fallback for complex vectors or simplified SVG for large files
  // Note: PNG fallback doesn't need svgContent, so check useFallbackImg first
  if (useFallbackImg) {
    return renderSimplifiedLargeSvg();
  }

  if (!svgContent) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 p-2">
        <svg className="w-8 h-8 mb-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
        <span className="text-xs">{logo.originalName}</span>
      </div>
    );
  }
  
  return renderWithContentBounds();
}