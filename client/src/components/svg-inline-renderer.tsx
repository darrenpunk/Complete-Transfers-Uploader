import React, { useEffect, useState } from 'react';
import type { Logo, CanvasElement, Project } from '@shared/schema';

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
        
        // Clean the SVG content to ensure proper rendering
        let cleanedSvg = text;
        
        // Remove XML declaration if present
        cleanedSvg = cleanedSvg.replace(/<\?xml[^?]*\?>/g, '');
        cleanedSvg = cleanedSvg.replace(/<!DOCTYPE[^>]*>/g, '');
        
        // Ensure viewBox is preserved for proper scaling
        const viewBoxMatch = cleanedSvg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
        if (viewBoxMatch) {
          // Check if this is oversized content that needs to be fitted
          const [, , vbWidth, vbHeight] = viewBoxMatch[1].split(' ').map(Number);
          const elementAspect = element.width / element.height;
          const viewBoxAspect = vbWidth / vbHeight;
          
          // Use "slice" for oversized content to ensure it fills the container and is centered
          // This prevents clipping at the edges when content is larger than the container
          const aspectRatio = Math.abs(elementAspect - viewBoxAspect) > 0.1 ? 'xMidYMid slice' : 'xMidYMid meet';
          
          if (!cleanedSvg.includes('width="100%"')) {
            cleanedSvg = cleanedSvg.replace(/<svg([^>]*)>/, `<svg$1 width="100%" height="100%" preserveAspectRatio="${aspectRatio}" style="display:block">`);
          }
        }
        
        // Remove any existing style attributes that might have background
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

  return (
    <div 
      className="w-full h-full"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        margin: 0,
        lineHeight: 0,
        fontSize: 0,
        overflow: 'hidden'
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}