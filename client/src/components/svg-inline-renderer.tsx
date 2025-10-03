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

  useEffect(() => {
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
        
        console.log('🎨 Fetching SVG content from:', url);
        
        const response = await fetch(url);
        const text = await response.text();
        
        // Clean and normalize SVG for content-based centering
        let cleanedSvg = text;
        
        // Remove XML declaration if present
        cleanedSvg = cleanedSvg.replace(/<\?xml[^?]*\?>/g, '');
        cleanedSvg = cleanedSvg.replace(/<!DOCTYPE[^>]*>/g, '');
        
        // CRITICAL FIX: Keep explicit width/height attributes for proper intrinsic sizing
        // The backend now adds these attributes for normalized SVGs - don't remove them!
        
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
        
        // CRITICAL FIX: Remove fixed width/height AND add inline styles to force 100% sizing
        // The viewBox provides aspect ratio, width/height prevent proper scaling
        cleanedSvg = cleanedSvg.replace(
          /<svg([^>]*)\s+width\s*=\s*["'][^"']*["']/gi,
          '<svg$1'
        );
        cleanedSvg = cleanedSvg.replace(
          /<svg([^>]*)\s+height\s*=\s*["'][^"']*["']/gi,
          '<svg$1'
        );
        
        // Add inline styles to force SVG to fill container completely
        cleanedSvg = cleanedSvg.replace(
          /<svg/,
          '<svg style="width: 100%; height: 100%; display: block;"'
        );
        
        setSvgContent(cleanedSvg);
        console.log('✅ SVG content loaded and cleaned');
      } catch (error) {
        console.error('Failed to load SVG content:', error);
        setSvgContent('');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSvg();
  }, [element.id, element.colorOverrides, logo.filename, shouldRecolorForInk, project.inkColor]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
      </div>
    );
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

  // ARCHITECT SOLUTION: Content-bounds-based centering with Y-inversion handling
  const renderWithContentBounds = () => {
    // Check if we have valid content bounds for precise positioning
    const hasContentBounds = logo.contentBounds && 
                            typeof logo.contentBounds === 'object' &&
                            'minX' in logo.contentBounds &&
                            'minY' in logo.contentBounds &&
                            'maxX' in logo.contentBounds &&
                            'maxY' in logo.contentBounds;
    
    // CRITICAL FIX: Tight-content SVGs have normalized viewBox starting at (0,0) with internal transform
    // Flexbox centering is the correct approach since the SVG itself is self-contained
    const isTightContent = logo.filename.includes('_tight-content.svg');
    
    if (!hasContentBounds || isTightContent) {
      if (isTightContent) {
        console.log('🎯 Tight-content SVG detected, using flexbox centering (positioned viewBox without transform)');
      } else {
        console.log('🔍 No contentBounds available, using default centering');
      }
      // Use flexbox centering for tight-content SVGs and fallback
      // Extract viewBox to calculate aspect ratio and add explicit sizing
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
      let styledSvg = svgContent;
      
      // ARCHITECT FIX: Constrain SVG to fit within container to prevent clipping
      // Use descendant selectors to force the injected <svg> to scale properly
      console.log('🎯 PURE SVG: Constraining dimensions to prevent clipping');
      
      return (
        <div 
          className="w-full h-full flex items-center justify-center overflow-visible"
          style={{
            maxWidth: '100%',
            maxHeight: '100%'
          }}
        >
          <div 
            className="max-w-full max-h-full"
            style={{
              maxWidth: '100%',
              maxHeight: '100%'
            }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>
      );
    }
    
    const bounds = logo.contentBounds as ContentBounds;
    
    // Detect Y-inversion by checking for scaleY(-1) in the SVG
    const hasYFlip = svgContent.includes('matrix(') && 
                     (svgContent.includes('matrix(1, 0, 0, -1') || 
                      svgContent.includes('matrix(1,0,0,-1'));
    
    console.log('🎯 Content-bounds centering:', {
      bounds,
      hasYFlip,
      logoFile: logo.filename
    });
    
    // Calculate content center and dimensions
    const contentCenterX = (bounds.minX + bounds.maxX) / 2;
    const contentCenterY = (bounds.minY + bounds.maxY) / 2;
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    // Handle Y-inversion for PDF-derived content
    let adjustedCenterY = contentCenterY;
    if (hasYFlip) {
      // For Y-flipped content, invert the Y coordinate
      // This assumes the SVG viewBox height as reference
      const viewBoxMatch = svgContent.match(/viewBox\s*=\s*["']([^"']+)["']/i);
      if (viewBoxMatch) {
        const [, , , svgHeight] = viewBoxMatch[1].split(/\s+/).map(Number);
        adjustedCenterY = svgHeight - contentCenterY;
        console.log('🔄 Y-flip detected, adjusted centerY:', adjustedCenterY);
      }
    }
    
    // Calculate scale to fit content in container (preserving aspect ratio)
    // Assume container is 100% of allocated space
    const containerAspect = 1; // Will be determined by CSS
    const contentAspect = contentWidth / contentHeight;
    
    // Calculate transform to center the content
    // Move content center to container center (50%, 50%)
    const translateX = `calc(50% - ${contentCenterX}px)`;
    const translateY = `calc(50% - ${adjustedCenterY}px)`;
    
    console.log('📐 Calculated transforms:', {
      translateX,
      translateY,
      contentCenter: [contentCenterX, adjustedCenterY],
      contentSize: [contentWidth, contentHeight]
    });
    
    return (
      <div className="w-full h-full relative overflow-hidden">
        {/* Debug overlay for development */}
        {process.env.NODE_ENV === 'development' && (
          <div 
            className="absolute border-2 border-red-500 opacity-50 pointer-events-none"
            style={{
              left: '25%',
              top: '25%', 
              width: '50%',
              height: '50%'
            }}
            title="Content bounds visualization"
          />
        )}
        
        <div
          className="w-full h-full"
          style={{
            transform: `translate(${translateX}, ${translateY})`,
            transformOrigin: 'top left',
            overflow: 'visible'
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    );
  };
  
  return renderWithContentBounds();
}