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

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  useEffect(() => {
    const needsColorManipulation = (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) || shouldRecolorForInk;
    
    if (needsColorManipulation) {
      console.log(`🎨 Color manipulation needed, forcing SVG rendering (overrides: ${!!element.colorOverrides}, recolorForInk: ${shouldRecolorForInk})`);
      setUseFallbackImg(false);
    } else {
      const metrics = (logo as any).vectorComplexityMetrics;
      
      if (isSafari && (metrics?.hasSafariIncompatibleFeatures || hasComplexVectorFallback)) {
        console.log(`🍎 Safari: Using cropped safari-png endpoint (incompatible: ${metrics?.hasSafariIncompatibleFeatures}, complex: ${hasComplexVectorFallback})`);
        setUseFallbackImg(true);
        setIsLoading(false);
        return;
      }
      
      if (hasComplexVectorFallback) {
        console.log(`🎨 COMPLEX VECTOR: Using PNG fallback for canvas (paths: ${metrics?.pathCount || 'unknown'}, elements: ${metrics?.elementCount || 'unknown'})`);
        setUseFallbackImg(true);
        setIsLoading(false);
        return;
      }
      
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
          
          // CRITICAL FIX: Remove width/height from root <svg> to allow proper scaling with gradients/clipping masks
          // Fixed dimensions break gradient references when SVG is scaled to fit container
          simpleSvg = simpleSvg.replace(
            /(<svg[^>]*?)(\s+width\s*=\s*["'][^"']*["'])([^>]*?>)/i,
            '$1$3'
          );
          simpleSvg = simpleSvg.replace(
            /(<svg[^>]*?)(\s+height\s*=\s*["'][^"']*["'])([^>]*?>)/i,
            '$1$3'
          );
          
          // Ensure preserveAspectRatio for consistent scaling with gradients
          if (simpleSvg.includes('preserveAspectRatio')) {
            simpleSvg = simpleSvg.replace(/preserveAspectRatio\s*=\s*["'][^"']*["']/gi, 'preserveAspectRatio="xMidYMid meet"');
          } else {
            simpleSvg = simpleSvg.replace(/<svg([^>]*)>/, '<svg$1 preserveAspectRatio="xMidYMid meet">');
          }
          
          setSvgContent(simpleSvg);
          setIsLoading(false);
          return;
        }
        
        // Clean and normalize SVG for content-based centering
        let cleanedSvg = text;
        
        // Remove XML declaration if present
        cleanedSvg = cleanedSvg.replace(/<\?xml[^?]*\?>/g, '');
        cleanedSvg = cleanedSvg.replace(/<!DOCTYPE[^>]*>/g, '');
        
        // CRITICAL FIX: Detect gradients with userSpaceOnUse - they need width/height to scale properly
        // When width/height are removed, gradients with absolute coordinates break
        const hasUserSpaceGradients = text.includes('gradientUnits="userSpaceOnUse"');
        
        if (!hasUserSpaceGradients) {
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
        }
        
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
        
        if (isSafari && !needsColorManipulation) {
          const safariProblems: string[] = [];
          if (text.includes('xlink:href="#compositing-group') || /<feImage[^>]*xlink:href="#/.test(text)) {
            safariProblems.push('feImage fragment references');
          }
          if (/id="compositing-group-/.test(text)) {
            safariProblems.push('compositing groups');
          }
          if (/<feBlend[^>]*mode="(?!normal)[^"]*"/.test(text)) {
            safariProblems.push('non-normal blend modes');
          }
          if (safariProblems.length > 0) {
            console.log(`🍎 Safari detected with incompatible features (${safariProblems.join(', ')}) - switching to PNG fallback`);
            setUseFallbackImg(true);
            setSvgContent('');
            setIsLoading(false);
            return;
          }
        }
        
        setSvgContent(cleanedSvg);
      } catch (error) {
        console.error('Failed to load SVG content:', error);
        setSvgContent('');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSvg();
  }, [element.id, element.colorOverrides, logo.filename, shouldRecolorForInk, project.inkColor, isLargeSvg, logo.size, isSafari]);

  // PERFORMANCE FIX: Render complex vectors using PNG fallback or simplified SVG
  const renderSimplifiedLargeSvg = () => {
    if (isSafari) {
      console.log('🍎 Safari fallback: rendering via cropped safari-png endpoint');
      return (
        <div 
          className="w-full h-full"
          style={{
            overflow: 'visible'
          }}
        >
          <img 
            src={`/api/logos/${logo.id}/safari-png`}
            alt={logo.originalName}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill'
            }}
            draggable={false}
          />
        </div>
      );
    }
    
    if (hasComplexVectorFallback) {
      const pngUrl = `/uploads/${(logo as any).canvasFallbackFilename}`;
      const metrics = (logo as any).vectorComplexityMetrics;
      console.log('🎨 Rendering complex vector with PNG fallback:', { 
        pngUrl, 
        pathCount: metrics?.pathCount,
        elementCount: metrics?.elementCount
      });
      
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
    
    console.log('🎨 Rendering large SVG with simplified inline rendering:', { size: logo.size });
    
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
            overflow: 'visible'
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      );
    }
    
    const bounds = logo.contentBounds as ContentBounds;
    
    // CRITICAL FIX: For content extending beyond viewBox, use simplified rendering
    // This lets the browser's native SVG overflow handling work correctly
    // Convert bounds from pts to mm for comparison (1mm = 2.834645669pts)
    const ptsToMm = 1 / 2.834645669;
    const boundsWidthMm = bounds.width * ptsToMm;
    const boundsHeightMm = bounds.height * ptsToMm;
    
    // Check if SVG is already normalized (bounds start at 0,0)
    // Normalized SVGs have content translated to origin and viewBox starting at 0,0
    const isNormalized = bounds.xMin === 0 && bounds.yMin === 0;
    
    // For normalized SVGs (most PDF-converted files), simply render at full size
    // The SVG viewBox matches the element dimensions, so it should fill naturally
    if (isNormalized) {
      console.log('✅ Normalized SVG detected - rendering at full container size');
      console.log(`   Bounds: ${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}pts (${boundsWidthMm.toFixed(1)}×${boundsHeightMm.toFixed(1)}mm)`);
      console.log(`   Element: ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm`);
      
      // Ensure SVG has proper namespace declarations and overflow visible
      let processedSvg = svgContent;
      
      // Add xmlns:xlink if missing, set overflow visible, width/height to 100%
      // Also add preserveAspectRatio="none" to fill container completely without aspect ratio constraint
      processedSvg = processedSvg.replace(
        /<svg([^>]*)>/i,
        (match, attrs) => {
          let newAttrs = attrs;
          if (!attrs.includes('xmlns:xlink')) {
            newAttrs += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
          }
          // Override width/height to fill container exactly, use preserveAspectRatio="none" 
          // since element dimensions already match content aspect ratio
          return `<svg${newAttrs} preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible">`;
        }
      );
      
      // The SVG will fill the container (100% x 100%) and the viewBox ensures
      // the content scales correctly. No translation needed.
      return (
        <div 
          className="w-full h-full"
          style={{
            overflow: 'visible'
          }}
          dangerouslySetInnerHTML={{ __html: processedSvg }}
        />
      );
    }
    
    // Only detect overflow if bounds extend beyond element by more than 1mm tolerance
    const hasOverflow = bounds.xMin < 0 || bounds.yMin < 0 || 
                        boundsWidthMm > element.width + 1 || boundsHeightMm > element.height + 1;
    
    if (hasOverflow) {
      console.log('🎯 Content extends beyond bounds: Using simplified rendering for proper display');
      console.log(`   Content bounds: (${bounds.xMin}, ${bounds.yMin}) to (${bounds.xMax}, ${bounds.yMax})`);
      console.log(`   Element size: ${element.width} × ${element.height}px`);
      
      // Ensure SVG has proper namespace declarations for xlink (required for embedded images)
      let processedSvg = svgContent;
      if (!svgContent.includes('xmlns:xlink')) {
        processedSvg = svgContent.replace(
          /<svg([^>]*)>/i,
          '<svg$1 xmlns:xlink="http://www.w3.org/1999/xlink">'
        );
      }
      
      // Use simplified rendering - just render the SVG as-is
      // The browser handles SVG overflow naturally when not wrapped
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
    
    // Non-normalized SVG with non-zero origin - apply transform to center
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
    
    // Calculate transform to center the content
    const translateX = `calc(50% - ${contentCenterX}px)`;
    const translateY = `calc(50% - ${adjustedCenterY}px)`;
    
    return (
      <div className="w-full h-full relative overflow-visible">
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