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
          // Check if this is a PDF-derived SVG with significant padding
          const viewBoxValues = viewBoxMatch[1].split(/\s+/).map(Number);
          let scaleTransform = '';
          
          if (viewBoxValues.length >= 4 && logo.filename.includes('.pdf.svg')) {
            const vbWidth = viewBoxValues[2];
            const vbHeight = viewBoxValues[3];
            
            // Calculate actual content bounds from the SVG
            const pathMatches = cleanedSvg.match(/<path[^>]*d="([^"]*)"[^>]*>/g) || [];
            if (pathMatches.length > 0) {
              // Estimate content bounds from path coordinates
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              
              pathMatches.forEach(pathMatch => {
                const pathData = pathMatch.match(/d="([^"]*)"/) ?.[1] || '';
                const coords = pathData.match(/[-]?\d+\.?\d*/g) || [];
                
                for (let i = 0; i < coords.length; i += 2) {
                  const x = parseFloat(coords[i]);
                  const y = parseFloat(coords[i + 1]);
                  if (!isNaN(x) && !isNaN(y)) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                  }
                }
              });
              
              if (minX !== Infinity && maxX !== -Infinity) {
                const contentWidth = maxX - minX;
                const contentHeight = maxY - minY;
                
                // If there's significant padding (>10px), apply scaling correction
                const paddingX = vbWidth - contentWidth;
                const paddingY = vbHeight - contentHeight;
                
                if (paddingX > 10 || paddingY > 10) {
                  const scaleX = vbWidth / contentWidth;
                  const scaleY = vbHeight / contentHeight;
                  const scale = Math.min(scaleX, scaleY);
                  
                  if (scale > 1.05) {
                    scaleTransform = ` transform="scale(${scale.toFixed(3)})" transform-origin="center"`;
                    console.log(`🎯 PDF content scaling correction applied: ${scale.toFixed(2)}x for ${logo.filename}`);
                  }
                }
              }
            }
          }
          
          // Add width="100%" height="100%" for full container fit with optional scaling
          if (!cleanedSvg.includes('width="100%"')) {
            cleanedSvg = cleanedSvg.replace(/<svg([^>]*)>/, `<svg$1 width="100%" height="100%" style="display:block"${scaleTransform}>`);
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
        display: 'block',
        padding: 0,
        margin: 0,
        lineHeight: 0,
        fontSize: 0
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}