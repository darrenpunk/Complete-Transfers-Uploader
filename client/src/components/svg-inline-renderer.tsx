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
        
        // ARCHITECT SOLUTION: Remove explicit width/height, set proper preserveAspectRatio
        // Remove existing width/height attributes to let viewBox control sizing
        cleanedSvg = cleanedSvg.replace(/\s*width\s*=\s*["'][^"']*["']/gi, '');
        cleanedSvg = cleanedSvg.replace(/\s*height\s*=\s*["'][^"']*["']/gi, '');
        
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
    
    if (!hasContentBounds) {
      console.log('🔍 No contentBounds available, using default centering');
      // Fallback to default centering
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