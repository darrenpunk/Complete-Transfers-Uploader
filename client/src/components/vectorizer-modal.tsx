import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Download, AlertCircle, ZoomIn, ZoomOut, Maximize2, Grid, Palette, Wand2, Trash2, Eye, Columns2 } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/hooks/use-toast";

interface VectorizerModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  imageFile: File;
  onVectorDownload: (vectorSvg: string) => void;
}

export function VectorizerModal({
  open,
  onClose,
  fileName,
  imageFile,
  onVectorDownload
}: VectorizerModalProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [vectorSvg, setVectorSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number>(2.50); // Base vectorization cost
  const [zoom, setZoom] = useState<number>(100); // Zoom percentage
  const [showGrid, setShowGrid] = useState<boolean>(true); // Show transparency grid
  const [showPalette, setShowPalette] = useState<boolean>(false); // Show color palette
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [coloredSvg, setColoredSvg] = useState<string | null>(null);
  const [detectedColors, setDetectedColors] = useState<{color: string, count: number}[]>([]);
  const [originalDetectedColors, setOriginalDetectedColors] = useState<{color: string, count: number}[]>([]);
  const [highlightedColor, setHighlightedColor] = useState<string | null>(null);
  const [highlightedSvg, setHighlightedSvg] = useState<string | null>(null);
  const [deletionHistory, setDeletionHistory] = useState<{svg: string, colors: {color: string, count: number}[]}[]>([]);
  const [viewMode, setViewMode] = useState<'comparison' | 'preview'>('comparison');
  const [colorAdjustments, setColorAdjustments] = useState<{[color: string]: {saturation: number, cyan: number, magenta: number, yellow: number, black: number}}>({});
  const [originalColorMap, setOriginalColorMap] = useState<{[originalColor: string]: string}>({});
  // Removed floating color window - using inline palette instead

  // Debug logging
  console.log('VectorizerModal render:', { open, fileName, hasImageFile: !!imageFile });

  useEffect(() => {
    console.log('VectorizerModal useEffect:', { open, hasImageFile: !!imageFile, fileName });
    if (open && imageFile) {
      processVectorization();
    }
  }, [open, imageFile]);

  const processVectorization = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Show preview of original image
      const imageUrl = URL.createObjectURL(imageFile);
      setPreviewUrl(imageUrl);
      
      // Call our backend API in preview mode (no credits consumed)
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('preview', 'true'); // This ensures no credits are consumed
      
      const response = await fetch('/api/vectorize?preview=true', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Vectorization failed');
      }
      
      const result = await response.json();
      console.log('Received SVG:', result.svg?.substring(0, 200) + '...');
      console.log('Full SVG length:', result.svg?.length);
      console.log('SVG contains svg tag:', result.svg?.includes('<svg'));
      console.log('SVG contains viewBox:', result.svg?.includes('viewBox'));
      setVectorSvg(result.svg);
      setColoredSvg(null); // Don't initialize colored SVG
      
      // Detect colors in the SVG
      const colors = detectColorsInSvg(result.svg);
      console.log('Detected colors:', colors);
      setDetectedColors(colors);
      setOriginalDetectedColors(colors); // Store original for undo
      
      setShowPalette(true); // Show palette when vector is ready
      setIsProcessing(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vectorization failed');
      setIsProcessing(false);
    }
  };

  const handleApproveVector = async () => {
    const svgToDownload = coloredSvg || vectorSvg;
    console.log('handleApproveVector called', { 
      hasColoredSvg: !!coloredSvg, 
      hasVectorSvg: !!vectorSvg,
      svgLength: svgToDownload?.length 
    });
    
    if (svgToDownload) {
      try {
        // Set processing state while generating production version
        setIsProcessing(true);
        
        // Now make the production API call (this will consume credits)
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('preview', 'false'); // Production mode
        
        const response = await fetch('/api/vectorize', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Production vectorization failed');
        }
        
        const result = await response.json();
        console.log('Production vectorization successful');
        
        // Use the production-quality SVG (or the modified preview if user made changes)
        console.log('Calling onVectorDownload');
        onVectorDownload(svgToDownload);
        onClose();
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate production vector');
        console.error('Production vectorization error:', err);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Function to detect all colors in SVG
  const detectColorsInSvg = (svg: string): {color: string, count: number}[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const colorMap = new Map<string, number>();
    
    // Find all elements with fill attribute
    const elementsWithFill = doc.querySelectorAll('*[fill]');
    elementsWithFill.forEach(el => {
      const fill = el.getAttribute('fill');
      if (fill && fill !== 'none' && !fill.startsWith('url(')) {
        // Normalize color format
        let normalizedColor = fill.toLowerCase();
        
        // Convert rgb to hex if needed
        if (normalizedColor.startsWith('rgb')) {
          const match = normalizedColor.match(/rgb\s*\(\s*(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)\s*\)/);
          if (match) {
            let r, g, b;
            if (match[1].includes('%')) {
              r = Math.round(parseFloat(match[1]) * 2.55);
              g = Math.round(parseFloat(match[2]) * 2.55);
              b = Math.round(parseFloat(match[3]) * 2.55);
            } else {
              r = parseInt(match[1]);
              g = parseInt(match[2]);
              b = parseInt(match[3]);
            }
            normalizedColor = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
          }
        }
        
        colorMap.set(normalizedColor, (colorMap.get(normalizedColor) || 0) + 1);
      }
    });
    
    // Find all elements with stroke attribute
    const elementsWithStroke = doc.querySelectorAll('*[stroke]');
    elementsWithStroke.forEach(el => {
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke !== 'none' && !stroke.startsWith('url(')) {
        let normalizedColor = stroke.toLowerCase();
        
        // Convert rgb to hex if needed
        if (normalizedColor.startsWith('rgb')) {
          const match = normalizedColor.match(/rgb\s*\(\s*(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)\s*\)/);
          if (match) {
            let r, g, b;
            if (match[1].includes('%')) {
              r = Math.round(parseFloat(match[1]) * 2.55);
              g = Math.round(parseFloat(match[2]) * 2.55);
              b = Math.round(parseFloat(match[3]) * 2.55);
            } else {
              r = parseInt(match[1]);
              g = parseInt(match[2]);
              b = parseInt(match[3]);
            }
            normalizedColor = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
          }
        }
        
        colorMap.set(normalizedColor, (colorMap.get(normalizedColor) || 0) + 1);
      }
    });
    
    // Convert map to array and sort by count
    return Array.from(colorMap.entries())
      .map(([color, count]) => ({color, count}))
      .sort((a, b) => b.count - a.count);
  };

  // Function to remove specific color from SVG
  const removeColorFromSvg = (svg: string, colorToRemove: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    
    // Normalize the color to remove (ensure lowercase and consistent format)
    const normalizedColorToRemove = colorToRemove.toLowerCase().trim();
    
    console.log('Removing color:', normalizedColorToRemove);
    
    let removedCount = 0;
    
    // Remove elements with matching fill
    const elementsWithFill = doc.querySelectorAll('*[fill]');
    elementsWithFill.forEach(el => {
      const fill = el.getAttribute('fill')?.toLowerCase().trim();
      if (!fill || fill === 'none') return;
      
      let shouldRemove = false;
      
      // Direct hex match
      if (fill === normalizedColorToRemove) {
        shouldRemove = true;
      }
      // RGB format match
      else if (fill.startsWith('rgb')) {
        const normalizedRgb = normalizeRgbToHex(fill);
        if (normalizedRgb === normalizedColorToRemove) {
          shouldRemove = true;
        }
      }
      
      if (shouldRemove) {
        console.log('Removing element with fill:', fill, 'tagName:', el.tagName);
        // Always remove the element completely for shape elements
        if (['rect', 'path', 'circle', 'ellipse', 'polygon', 'g'].includes(el.tagName.toLowerCase())) {
          el.remove();
          removedCount++;
        } else {
          // For other elements, just make fill transparent
          el.setAttribute('fill', 'none');
        }
      }
    });
    
    // Handle stroke separately (usually we don't want to remove stroke)
    const elementsWithStroke = doc.querySelectorAll('*[stroke]');
    elementsWithStroke.forEach(el => {
      const stroke = el.getAttribute('stroke')?.toLowerCase().trim();
      if (!stroke || stroke === 'none') return;
      
      let shouldRemove = false;
      
      if (stroke === normalizedColorToRemove) {
        shouldRemove = true;
      } else if (stroke.startsWith('rgb')) {
        const normalizedRgb = normalizeRgbToHex(stroke);
        if (normalizedRgb === normalizedColorToRemove) {
          shouldRemove = true;
        }
      }
      
      if (shouldRemove) {
        el.setAttribute('stroke', 'none');
      }
    });
    
    console.log(`Removed ${removedCount} elements with color ${normalizedColorToRemove}`);
    
    return new XMLSerializer().serializeToString(doc.documentElement);
  };

  // Helper function to normalize RGB to hex
  const normalizeRgbToHex = (rgb: string): string => {
    const match = rgb.match(/rgb\s*\(\s*(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)\s*\)/);
    if (match) {
      let r, g, b;
      if (match[1].includes('%')) {
        r = Math.round(parseFloat(match[1]) * 2.55);
        g = Math.round(parseFloat(match[2]) * 2.55);
        b = Math.round(parseFloat(match[3]) * 2.55);
      } else {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
      return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return rgb;
  };

  // Function to remove white backgrounds intelligently
  const removeWhiteFromSvg = (svg: string, mode: 'background' | 'all' = 'background') => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    
    // Get the SVG's viewBox dimensions
    const svgElement = doc.querySelector('svg');
    const viewBox = svgElement?.getAttribute('viewBox')?.split(' ').map(parseFloat) || [0, 0, 100, 100];
    const svgWidth = viewBox[2];
    const svgHeight = viewBox[3];
    
    if (mode === 'background') {
      // Smart mode: Remove ALL white background elements at once
      console.log('SVG viewBox:', svgWidth, 'x', svgHeight);
      
      // Find all white elements
      const allWhiteElements = doc.querySelectorAll('*[fill="#ffffff"], *[fill="#FFFFFF"], *[fill="white"], *[fill="rgb(255,255,255)"], *[fill="rgb(100%,100%,100%)"], *[fill="rgb(255, 255, 255)"]');
      console.log('Found white elements:', allWhiteElements.length);
      
      // Debug: Log details about white paths
      allWhiteElements.forEach((el, idx) => {
        if (el.tagName === 'path' && idx < 5) {
          const d = el.getAttribute('d') || '';
          console.log(`White path ${idx}: d="${d.substring(0, 100)}..."`);
        }
      });
      
      // Analyze the SVG structure to find the actual content bounds
      const nonWhiteElements = doc.querySelectorAll('*[fill]:not([fill="#ffffff"]):not([fill="#FFFFFF"]):not([fill="white"]):not([fill="rgb(255,255,255)"]):not([fill="rgb(100%,100%,100%)"]):not([fill="rgb(255, 255, 255)"]):not([fill="none"])');
      
      let contentMinX = Infinity, contentMinY = Infinity;
      let contentMaxX = -Infinity, contentMaxY = -Infinity;
      let hasContent = false;
      
      // Calculate the bounding box of non-white content
      // For vectorizer.ai SVGs, most elements are paths, not rects
      if (nonWhiteElements.length > 0) {
        hasContent = true;
        // Use a simpler approach - assume content is in the center 80% of the canvas
        const margin = svgWidth * 0.1;
        contentMinX = margin;
        contentMinY = margin;
        contentMaxX = svgWidth - margin;
        contentMaxY = svgHeight - margin;
      }
      
      // Add some padding around content
      const padding = Math.min(svgWidth, svgHeight) * 0.05;
      contentMinX -= padding;
      contentMinY -= padding;
      contentMaxX += padding;
      contentMaxY += padding;
      
      console.log('Content bounds:', {contentMinX, contentMinY, contentMaxX, contentMaxY});
      
      // Remove white elements - for vectorizer.ai, white backgrounds are usually early paths
      let removedCount = 0;
      const allPaths = Array.from(doc.querySelectorAll('path'));
      
      allWhiteElements.forEach(el => {
        let shouldRemove = false;
        
        if (el.tagName === 'rect') {
          const x = parseFloat(el.getAttribute('x') || '0');
          const y = parseFloat(el.getAttribute('y') || '0');
          const width = parseFloat(el.getAttribute('width') || '0');
          const height = parseFloat(el.getAttribute('height') || '0');
          
          // Remove if it's a full-canvas rectangle
          if (width >= svgWidth * 0.9 && height >= svgHeight * 0.9) {
            shouldRemove = true;
          }
        } else if (el.tagName === 'path') {
          // Get the path data to check if it's a background
          const d = el.getAttribute('d') || '';
          const index = allPaths.indexOf(el as SVGPathElement);
          
          // Check if path is at canvas edge (background paths usually start at edges)
          const touchesTopEdge = d.match(/[ML]\s*\d+\.?\d*\s+0\.0+/) || d.match(/^M\s*\d+\.?\d*\s+0[\s,]/);
          const touchesLeftEdge = d.match(/[ML]\s*0\.0+\s+\d+/) || d.match(/^M\s*0[\s,]+\d+/);
          const touchesRightEdge = d.match(new RegExp(`[ML]\\s*${svgWidth}\\.?0*\\s+\\d+`));
          const touchesBottomEdge = d.match(new RegExp(`[ML]\\s*\\d+\\.?\\d*\\s+${svgHeight}\\.?0*`));
          
          const touchesEdge = touchesTopEdge || touchesLeftEdge || touchesRightEdge || touchesBottomEdge;
          
          // Remove if it's white and clearly at the edge
          if (touchesEdge) {
            shouldRemove = true;
            console.log('Removing white edge path at index:', index);
          }
        }
        
        if (shouldRemove) {
          el.remove();
          removedCount++;
        }
      });
      
      console.log(`Removed ${removedCount} white background elements`);
      
    } else {
      // Aggressive mode: Remove ALL white elements
      const whiteElements = doc.querySelectorAll('*[fill="#ffffff"], *[fill="#FFFFFF"], *[fill="white"], *[fill="rgb(255,255,255)"], *[fill="rgb(100%,100%,100%)"]');
      whiteElements.forEach(el => {
        if (el.tagName === 'rect' || el.tagName === 'path') {
          el.remove();
        } else {
          el.setAttribute('fill', 'none');
        }
      });
      
      // Also check for near-white colors
      const allElements = doc.querySelectorAll('*[fill]');
      allElements.forEach(el => {
        const fill = el.getAttribute('fill');
        if (fill && fill.startsWith('rgb')) {
          const match = fill.match(/rgb\s*\(\s*(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)\s*\)/);
          if (match) {
            let r, g, b;
            if (match[1].includes('%')) {
              r = parseFloat(match[1]) * 2.55;
              g = parseFloat(match[2]) * 2.55;
              b = parseFloat(match[3]) * 2.55;
            } else {
              r = parseInt(match[1]);
              g = parseInt(match[2]);
              b = parseInt(match[3]);
            }
            if (r > 250 && g > 250 && b > 250) {
              if (el.tagName === 'rect' || el.tagName === 'path') {
                el.remove();
              } else {
                el.setAttribute('fill', 'none');
              }
            }
          }
        }
      });
    }
    
    return new XMLSerializer().serializeToString(doc.documentElement);
  };

  // Function to apply color to SVG
  const applyColorToSvg = (svg: string, color: string) => {
    // Parse the SVG and update all fill attributes except for 'none'
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    
    // Find all elements with fill attribute
    const elements = doc.querySelectorAll('*[fill]:not([fill="none"])');
    elements.forEach(el => {
      el.setAttribute('fill', color);
    });
    
    // Also update stroke for outlined elements
    const strokeElements = doc.querySelectorAll('*[stroke]:not([stroke="none"])');
    strokeElements.forEach(el => {
      el.setAttribute('stroke', color);
    });
    
    return new XMLSerializer().serializeToString(doc.documentElement);
  };

  // Function to highlight a specific color in the SVG
  const highlightColorInSvg = (svgString: string, targetColor: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    
    // Find all elements with fill or stroke attributes
    const allElements = doc.querySelectorAll('*');
    
    allElements.forEach(element => {
      const fill = element.getAttribute('fill');
      const stroke = element.getAttribute('stroke');
      
      if (fill && fill !== 'none') {
        if (fill.toLowerCase() === targetColor.toLowerCase()) {
          // Highlight the target color with a bright outline
          element.setAttribute('stroke', '#ff0000');
          element.setAttribute('stroke-width', '2');
          element.setAttribute('stroke-dasharray', '3,3');
        } else {
          // Dim other colors
          element.setAttribute('opacity', '0.3');
        }
      }
      
      if (stroke && stroke !== 'none' && stroke.toLowerCase() === targetColor.toLowerCase()) {
        // Highlight target stroke color
        element.setAttribute('stroke', '#ff0000');
        element.setAttribute('stroke-width', '3');
        element.setAttribute('stroke-dasharray', '3,3');
      }
    });
    
    return new XMLSerializer().serializeToString(doc.documentElement);
  };

  // Function to reduce colors to main logo colors (intelligent color grouping)
  const reduceColors = () => {
    if (originalDetectedColors.length === 0 || !vectorSvg) return;
    
    // Helper function to convert hex to RGB
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };
    
    // Helper function to calculate color distance
    const colorDistance = (color1: string, color2: string) => {
      const rgb1 = hexToRgb(color1);
      const rgb2 = hexToRgb(color2);
      if (!rgb1 || !rgb2) return 999;
      
      return Math.sqrt(
        Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2)
      );
    };
    
    // Sort colors by usage (highest first)
    const sortedColors = [...originalDetectedColors].sort((a, b) => b.count - a.count);
    
    // Start with top 5 most used colors as potential keepers
    const potentialMainColors = sortedColors.slice(0, 5);
    const finalMainColors: typeof sortedColors = [];
    
    // Always keep the top color (most used)
    finalMainColors.push(potentialMainColors[0]);
    
    // For remaining potential colors, only keep if they're significantly different
    potentialMainColors.slice(1).forEach(color => {
      const isDistinctColor = finalMainColors.every(existingColor => {
        const distance = colorDistance(color.color, existingColor.color);
        return distance > 60; // Must be at least 60 units different
      });
      
      // Also keep white/light colors regardless of similarity (important for text)
      const rgb = hexToRgb(color.color);
      const isWhiteOrLight = color.color.toLowerCase() === '#ffffff' || 
                            color.color.toLowerCase() === 'white' ||
                            (rgb && rgb.r > 200); // Light colors
      
      if (isDistinctColor || isWhiteOrLight) {
        finalMainColors.push(color);
      }
    });
    
    // Also check remaining colors for any high-contrast distinct colors we might have missed
    sortedColors.slice(5).forEach(color => {
      const isVeryDistinct = finalMainColors.every(existingColor => {
        const distance = colorDistance(color.color, existingColor.color);
        return distance > 100; // Very different colors (like magenta vs green)
      });
      
      // Only add if very distinct AND has reasonable usage
      if (isVeryDistinct && color.count >= 2 && finalMainColors.length < 6) {
        finalMainColors.push(color);
      }
    });
    
    const mainColorSet = new Set(finalMainColors.map(c => c.color.toLowerCase()));
    
    // Remove everything not in final main colors
    const colorsToRemove = sortedColors
      .filter(color => !mainColorSet.has(color.color.toLowerCase()))
      .map(c => c.color);
    
    // Always preserve white if it exists (important for text/details)
    const whiteIndex = colorsToRemove.findIndex(c => 
      c.toLowerCase() === '#ffffff' || c.toLowerCase() === 'white'
    );
    if (whiteIndex !== -1) {
      colorsToRemove.splice(whiteIndex, 1);
    }
    
    if (colorsToRemove.length === 0) {
      toast({
        title: "No Redundant Colors Found",
        description: "Logo already has a clean color palette",
      });
      return;
    }
    
    // Start with current SVG (could be modified) or original
    let modifiedSvg = coloredSvg || vectorSvg;
    
    // Remove each unwanted color from the SVG
    colorsToRemove.forEach(colorToRemove => {
      modifiedSvg = removeColorFromSvg(modifiedSvg, colorToRemove);
    });
    
    // Update the SVG and detected colors
    setColoredSvg(modifiedSvg);
    const newColors = detectColorsInSvg(modifiedSvg);
    setDetectedColors(newColors);
    
    const keptColors = originalDetectedColors.length - colorsToRemove.length;
    
    toast({
      title: "Colors Simplified",
      description: `Reduced to ${finalMainColors.length} main colors (removed ${colorsToRemove.length} similar variations)`,
    });
  };

  // Helper function to convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // Helper function to convert RGB to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  // Helper function to convert RGB to CMYK
  const rgbToCmyk = (r: number, g: number, b: number) => {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    
    const k = 1 - Math.max(rNorm, gNorm, bNorm);
    const c = k === 1 ? 0 : (1 - rNorm - k) / (1 - k);
    const m = k === 1 ? 0 : (1 - gNorm - k) / (1 - k);
    const y = k === 1 ? 0 : (1 - bNorm - k) / (1 - k);
    
    return {
      c: Math.round(c * 100),
      m: Math.round(m * 100),
      y: Math.round(y * 100),
      k: Math.round(k * 100)
    };
  };

  // Helper function to convert CMYK to RGB
  const cmykToRgb = (c: number, m: number, y: number, k: number) => {
    const cNorm = c / 100;
    const mNorm = m / 100;
    const yNorm = y / 100;
    const kNorm = k / 100;
    
    const r = Math.round(255 * (1 - cNorm) * (1 - kNorm));
    const g = Math.round(255 * (1 - mNorm) * (1 - kNorm));
    const b = Math.round(255 * (1 - yNorm) * (1 - kNorm));
    
    return { r, g, b };
  };

  // Function to apply color adjustments to SVG
  const applyColorAdjustment = (color: string, adjustments: {saturation: number, cyan: number, magenta: number, yellow: number, black: number}) => {
    // Apply CMYK adjustments first
    const newRgb = cmykToRgb(adjustments.cyan, adjustments.magenta, adjustments.yellow, adjustments.black);
    
    // Apply saturation adjustment
    const saturationFactor = adjustments.saturation / 100;
    const gray = 0.2989 * newRgb.r + 0.5870 * newRgb.g + 0.1140 * newRgb.b;
    
    const finalR = Math.round(gray + saturationFactor * (newRgb.r - gray));
    const finalG = Math.round(gray + saturationFactor * (newRgb.g - gray));
    const finalB = Math.round(gray + saturationFactor * (newRgb.b - gray));
    
    return rgbToHex(
      Math.max(0, Math.min(255, finalR)),
      Math.max(0, Math.min(255, finalG)),
      Math.max(0, Math.min(255, finalB))
    );
  };

  // Function to apply all color adjustments to the original SVG
  const applyAllColorAdjustments = (originalSvg: string, adjustments: {[color: string]: any}): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(originalSvg, 'image/svg+xml');
    
    let totalReplacements = 0;
    
    // Apply adjustments for each original color
    Object.entries(adjustments).forEach(([originalColor, colorAdjustment]) => {
      const adjustedColor = applyColorAdjustment(originalColor, colorAdjustment);
      const normalizedOriginalColor = originalColor.toLowerCase().trim();
      
      // Replace fill colors
      const elementsWithFill = doc.querySelectorAll('*[fill]');
      elementsWithFill.forEach(el => {
        const fill = el.getAttribute('fill')?.toLowerCase().trim();
        if (!fill || fill === 'none') return;
        
        let shouldReplace = false;
        
        // Direct hex match
        if (fill === normalizedOriginalColor) {
          shouldReplace = true;
        }
        // RGB format match
        else if (fill.startsWith('rgb')) {
          const normalizedRgb = normalizeRgbToHex(fill);
          if (normalizedRgb === normalizedOriginalColor) {
            shouldReplace = true;
          }
        }
        
        if (shouldReplace) {
          el.setAttribute('fill', adjustedColor);
          totalReplacements++;
        }
      });
      
      // Replace stroke colors
      const elementsWithStroke = doc.querySelectorAll('*[stroke]');
      elementsWithStroke.forEach(el => {
        const stroke = el.getAttribute('stroke')?.toLowerCase().trim();
        if (!stroke || stroke === 'none') return;
        
        let shouldReplace = false;
        
        if (stroke === normalizedOriginalColor) {
          shouldReplace = true;
        } else if (stroke.startsWith('rgb')) {
          const normalizedRgb = normalizeRgbToHex(stroke);
          if (normalizedRgb === normalizedOriginalColor) {
            shouldReplace = true;
          }
        }
        
        if (shouldReplace) {
          el.setAttribute('stroke', adjustedColor);
        }
      });
    });
    
    console.log(`Applied color adjustments: ${totalReplacements} total replacements`);
    
    return new XMLSerializer().serializeToString(doc.documentElement);
  };

  // Function to undo the last deletion only
  const undoLastDeletion = () => {
    if (deletionHistory.length === 0) {
      toast({
        title: "Nothing to Undo",
        description: "No color deletions to reverse.",
      });
      return;
    }
    
    // Get the last state from history
    const lastState = deletionHistory[deletionHistory.length - 1];
    
    // Restore the SVG and colors to that state
    setColoredSvg(lastState.svg);
    setDetectedColors(lastState.colors);
    
    // Remove this state from history
    setDeletionHistory(prev => prev.slice(0, -1));
    
    // Clear highlighting
    setHighlightedColor(null);
    setHighlightedSvg(null);
    
    toast({
      title: "Last Deletion Undone",
      description: "Restored the last deleted color.",
    });
  };

  const handleRetry = () => {
    processVectorization();
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden flex flex-col resize">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle>AI Vectorization: {fileName}</DialogTitle>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setViewMode(viewMode === 'comparison' ? 'preview' : 'comparison')}
                    >
                      {viewMode === 'comparison' ? <Eye className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{viewMode === 'comparison' ? 'Switch to preview mode' : 'Switch to side-by-side comparison'}</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowGrid(!showGrid)}
                    >
                      <Grid className={`h-4 w-4 ${showGrid ? 'text-primary' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle transparency grid to see transparent areas</p>
                  </TooltipContent>
                </Tooltip>

              </div>
            </div>
          </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex">
          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col pr-4">
            {/* Cost Information */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex-shrink-0">
              <p className="text-sm text-blue-800">
                <strong>Free Preview:</strong> This preview uses test mode and consumes no credits. ${cost.toFixed(2)} will only be charged when you approve and download the final result.
              </p>
            </div>

          {/* Processing State */}
          {isProcessing && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-lg font-medium">Processing image vectorization...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Converting your raster image to vector format. This may take a moment.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-500" />
              <p className="text-lg font-medium text-red-600">Vectorization Failed</p>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
              <Button onClick={handleRetry} className="mt-4">
                Try Again
              </Button>
            </div>
          )}

          {/* Preview State */}
          {previewUrl && !isProcessing && !error && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Zoom Controls */}
              <div className="flex items-center justify-center gap-4 mb-4 flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom(Math.max(25, zoom - 25))}
                      disabled={zoom <= 25}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Zoom out (min 25%)</p>
                  </TooltipContent>
                </Tooltip>
                
                <div className="flex items-center gap-2 min-w-[200px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1">
                        <Slider
                          value={[zoom]}
                          onValueChange={(value) => setZoom(value[0])}
                          min={25}
                          max={400}
                          step={25}
                          className="flex-1"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Adjust zoom level (25% - 400%)</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-sm font-medium w-12">{zoom}%</span>
                </div>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom(Math.min(400, zoom + 25))}
                      disabled={zoom >= 400}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Zoom in (max 400%)</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom(100)}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset to 100% zoom</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Detected Colors Button */}
              {vectorSvg && detectedColors.length > 0 && (
                <div className="mb-3 flex-shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={() => setShowPalette(!showPalette)}
                        className="border-gray-600 text-gray-100 hover:bg-gray-700"
                      >
                        <Palette className="w-4 h-4 mr-2" />
                        {showPalette ? 'Hide' : 'Show'} Colors ({detectedColors.length})
                        {highlightedColor && (
                          <span className="ml-2 text-red-400 font-semibold">• Highlighting {highlightedColor}</span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle color management panel to edit, remove, or highlight colors</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}

              <div className={`flex-1 ${viewMode === 'comparison' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'flex flex-col'} overflow-hidden`}>
                {/* Original - Only show in comparison mode */}
                {viewMode === 'comparison' && (
                  <div className="flex flex-col overflow-hidden">
                    <h3 className="font-semibold mb-2 text-center">Original Image</h3>
                    <div 
                      className={`flex-1 border rounded-lg overflow-auto ${
                        showGrid ? 'transparency-grid' : 'bg-white'
                      }`}
                    >
                      <div 
                        className="p-8 flex items-center justify-center min-h-full"
                        style={{ 
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s ease'
                        }}
                      >
                        <img 
                          src={previewUrl} 
                          alt="Original" 
                          className="max-w-none"
                          style={{ imageRendering: zoom > 200 ? 'pixelated' : 'auto' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Vectorized Preview */}
                <div className="flex flex-col overflow-hidden">
                  <h3 className="font-semibold mb-2 text-center">
                    {viewMode === 'comparison' ? 'Vectorized Result' : 'Vector Preview'}
                  </h3>
                  <div 
                    className={`flex-1 border rounded-lg overflow-auto ${
                      showGrid ? 'transparency-grid' : 'bg-white'
                    }`}
                  >
                    {(highlightedSvg || coloredSvg || vectorSvg) ? (
                      <div 
                        className="p-8 flex items-center justify-center min-h-full"
                        style={{ 
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s ease'
                        }}
                      >
                        <div 
                          className="vector-preview-wrapper"
                          style={{ 
                            width: '100%', 
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          dangerouslySetInnerHTML={{ __html: highlightedSvg || coloredSvg || vectorSvg || '' }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                          <p className="text-sm">Generating vector...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4 flex-shrink-0">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>How to use:</strong> This is a free preview - explore and edit colors without consuming credits. Use zoom controls to inspect details. Click color swatches to highlight or delete colors. Use "Reduce" to simplify colors automatically. Credits are only charged when you approve the final result.
                </p>
              </div>
            </div>
          )}

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-4 mt-4 border-t flex-shrink-0">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              
              <div className="flex gap-3">
                {vectorSvg && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={handleApproveVector} className="bg-green-600 hover:bg-green-700">
                        <Download className="h-4 w-4 mr-2" />
                        Approve & Download (${cost.toFixed(2)})
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Generate production-quality vector and add to canvas - charges ${cost.toFixed(2)} to your order</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Color Management */}
          {vectorSvg && detectedColors.length > 0 && (
            <div className="w-80 border-l border-gray-700 pl-4 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-5 h-5 text-gray-100" />
                <h3 className="font-semibold text-gray-100">
                  Detected Colors ({detectedColors.length})
                </h3>
              </div>
              
              {highlightedColor && (
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 mb-4">
                  <p className="text-sm text-red-400 font-medium">
                    Highlighting: {highlightedColor}
                  </p>
                </div>
              )}

              {/* Color Grid */}
              <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-6 gap-2 mb-4">
                  {detectedColors.map((colorItem, index) => (
                    <div key={index} className="relative group flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded border cursor-pointer hover:border-gray-400 transition-all relative ${
                          highlightedColor === colorItem.color 
                            ? 'border-red-500 border-2 shadow-lg' 
                            : 'border-gray-600'
                        }`}
                        style={{ backgroundColor: colorItem.color }}
                        title={`${colorItem.color} (${colorItem.count} elements) - Click to highlight`}
                        onClick={() => {
                          if (highlightedColor === colorItem.color) {
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                          } else {
                            setHighlightedColor(colorItem.color);
                            const currentSvg = coloredSvg || vectorSvg;
                            if (currentSvg) {
                              const highlighted = highlightColorInSvg(currentSvg, colorItem.color);
                              setHighlightedSvg(highlighted);
                            }
                          }
                        }}
                      >
                        <button
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            
                            const currentSvg = coloredSvg || vectorSvg;
                            if (currentSvg) {
                              setDeletionHistory(prev => [...prev, {
                                svg: currentSvg,
                                colors: [...detectedColors]
                              }]);
                            }
                            
                            const updatedSvg = removeColorFromSvg(currentSvg, colorItem.color);
                            setColoredSvg(updatedSvg);
                            
                            // Always clear highlighting when a color is removed
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                            
                            const newColors = detectColorsInSvg(updatedSvg);
                            setDetectedColors(newColors);
                            
                            toast({
                              title: "Color Removed",
                              description: `Removed ${colorItem.color} from the image.`,
                            });
                          }}
                          title="Delete this color"
                        >
                          <Trash2 className="h-2 w-2" />
                        </button>
                      </div>
                      <div className="text-[10px] text-gray-400 text-center leading-tight mt-1">{colorItem.count}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Color Adjustment Sliders - Only show when a color is highlighted */}
              {highlightedColor && (() => {
                const rgb = hexToRgb(highlightedColor);
                const currentCmyk = rgb ? rgbToCmyk(rgb.r, rgb.g, rgb.b) : { c: 0, m: 0, y: 0, k: 0 };
                const currentAdjustments = colorAdjustments[highlightedColor] || {
                  saturation: 100,
                  cyan: currentCmyk.c,
                  magenta: currentCmyk.m,
                  yellow: currentCmyk.y,
                  black: currentCmyk.k
                };

                return (
                  <div className="border-t border-gray-700 pt-4 mb-4">
                    <h4 className="text-sm font-semibold text-gray-100 mb-3">Adjust Selected Color</h4>
                    <div className="text-xs text-gray-400 mb-3">
                      Current: {highlightedColor} (C:{currentCmyk.c} M:{currentCmyk.m} Y:{currentCmyk.y} K:{currentCmyk.k})
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-300 mb-1 block">Saturation: {currentAdjustments.saturation}%</label>
                        <Slider
                          value={[currentAdjustments.saturation]}
                          max={200}
                          min={0}
                          step={5}
                          className="w-full"
                          onValueChange={(value) => {
                            const newAdjustments = { ...currentAdjustments, saturation: value[0] };
                            const updatedColorAdjustments = { ...colorAdjustments, [highlightedColor]: newAdjustments };
                            setColorAdjustments(updatedColorAdjustments);
                            
                            // Apply all adjustments to the original SVG
                            const originalSvg = vectorSvg;
                            if (originalSvg) {
                              const updatedSvg = applyAllColorAdjustments(originalSvg, updatedColorAdjustments);
                              setColoredSvg(updatedSvg);
                              
                              // Update detected colors to reflect the change
                              const newColors = detectColorsInSvg(updatedSvg);
                              setDetectedColors(newColors);
                            }
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-gray-300 mb-1 block">C: {currentAdjustments.cyan}%</label>
                          <Slider
                            value={[currentAdjustments.cyan]}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                            onValueChange={(value) => {
                              const newAdjustments = { ...currentAdjustments, cyan: value[0] };
                              const updatedColorAdjustments = { ...colorAdjustments, [highlightedColor]: newAdjustments };
                              setColorAdjustments(updatedColorAdjustments);
                              
                              const originalSvg = vectorSvg;
                              if (originalSvg) {
                                const updatedSvg = applyAllColorAdjustments(originalSvg, updatedColorAdjustments);
                                setColoredSvg(updatedSvg);
                                
                                const newColors = detectColorsInSvg(updatedSvg);
                                setDetectedColors(newColors);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-gray-300 mb-1 block">M: {currentAdjustments.magenta}%</label>
                          <Slider
                            value={[currentAdjustments.magenta]}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                            onValueChange={(value) => {
                              const newAdjustments = { ...currentAdjustments, magenta: value[0] };
                              const updatedColorAdjustments = { ...colorAdjustments, [highlightedColor]: newAdjustments };
                              setColorAdjustments(updatedColorAdjustments);
                              
                              const originalSvg = vectorSvg;
                              if (originalSvg) {
                                const updatedSvg = applyAllColorAdjustments(originalSvg, updatedColorAdjustments);
                                setColoredSvg(updatedSvg);
                                
                                const newColors = detectColorsInSvg(updatedSvg);
                                setDetectedColors(newColors);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-gray-300 mb-1 block">Y: {currentAdjustments.yellow}%</label>
                          <Slider
                            value={[currentAdjustments.yellow]}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                            onValueChange={(value) => {
                              const newAdjustments = { ...currentAdjustments, yellow: value[0] };
                              const updatedColorAdjustments = { ...colorAdjustments, [highlightedColor]: newAdjustments };
                              setColorAdjustments(updatedColorAdjustments);
                              
                              const originalSvg = vectorSvg;
                              if (originalSvg) {
                                const updatedSvg = applyAllColorAdjustments(originalSvg, updatedColorAdjustments);
                                setColoredSvg(updatedSvg);
                                
                                const newColors = detectColorsInSvg(updatedSvg);
                                setDetectedColors(newColors);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-gray-300 mb-1 block">K: {currentAdjustments.black}%</label>
                          <Slider
                            value={[currentAdjustments.black]}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                            onValueChange={(value) => {
                              const newAdjustments = { ...currentAdjustments, black: value[0] };
                              const updatedColorAdjustments = { ...colorAdjustments, [highlightedColor]: newAdjustments };
                              setColorAdjustments(updatedColorAdjustments);
                              
                              const originalSvg = vectorSvg;
                              if (originalSvg) {
                                const updatedSvg = applyAllColorAdjustments(originalSvg, updatedColorAdjustments);
                                setColoredSvg(updatedSvg);
                                
                                const newColors = detectColorsInSvg(updatedSvg);
                                setDetectedColors(newColors);
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Quick Actions */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={reduceColors}
                        className="border-gray-600 text-gray-100 hover:bg-gray-700"
                        disabled={originalDetectedColors.length === 0}
                      >
                        <Wand2 className="w-3 h-3 mr-1" />
                        Reduce
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Automatically reduce to main logo colors only</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={undoLastDeletion}
                        className="border-gray-600 text-gray-100 hover:bg-gray-700"
                        disabled={deletionHistory.length === 0}
                      >
                        ↶ Undo
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Undo the last color deletion</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                {/* White Color Management */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentSvg = coloredSvg || vectorSvg;
                          if (currentSvg) {
                            setDeletionHistory(prev => [...prev, {
                              svg: currentSvg,
                              colors: [...detectedColors]
                            }]);
                            
                            const updatedSvg = removeColorFromSvg(currentSvg, '#ffffff');
                            setColoredSvg(updatedSvg);
                            
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                            
                            const newColors = detectColorsInSvg(updatedSvg);
                            setDetectedColors(newColors);
                            
                            toast({
                              title: "White Removed",
                              description: "Removed white color from the image.",
                            });
                          }
                        }}
                        className="border-gray-600 text-gray-100 hover:bg-gray-700"
                        disabled={!detectedColors.some(c => c.color.toLowerCase() === '#ffffff')}
                      >
                        Remove White
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove pure white color from the vectorized image</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentSvg = coloredSvg || vectorSvg;
                          if (currentSvg) {
                            setDeletionHistory(prev => [...prev, {
                              svg: currentSvg,
                              colors: [...detectedColors]
                            }]);
                            
                            let updatedSvg = currentSvg;
                            let totalRemoved = 0;
                            
                            // Only remove colors that are actually detected as white variations
                            const whiteVariations = detectedColors
                              .filter(colorItem => {
                                const color = colorItem.color.toLowerCase();
                                // Check for white variations
                                return color === '#ffffff' || 
                                       color === '#fefefe' || 
                                       color === '#fdfdfd' || 
                                       color === '#fcfcfc' || 
                                       color === '#fbfbfb' ||
                                       color === 'white' ||
                                       color === 'rgb(255,255,255)' ||
                                       color === 'rgb(100%,100%,100%)';
                              })
                              .map(colorItem => colorItem.color);
                            
                            console.log('Removing white variations:', whiteVariations);
                            
                            whiteVariations.forEach(whiteColor => {
                              updatedSvg = removeColorFromSvg(updatedSvg, whiteColor);
                              totalRemoved++;
                            });
                            
                            setColoredSvg(updatedSvg);
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                            
                            const newColors = detectColorsInSvg(updatedSvg);
                            setDetectedColors(newColors);
                            
                            toast({
                              title: "White Colors Removed",
                              description: `Removed ${totalRemoved} white color variations.`,
                            });
                          }
                        }}
                        className="border-gray-600 text-gray-100 hover:bg-gray-700"
                        disabled={!detectedColors.some(c => {
                          const color = c.color.toLowerCase();
                          return color === '#ffffff' || color === '#fefefe' || color === '#fdfdfd' || 
                                 color === '#fcfcfc' || color === '#fbfbfb' || color === 'white';
                        })}
                      >
                        Remove All White
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove all white and off-white variations from the image</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setColoredSvg(vectorSvg);
                        setHighlightedColor(null);
                        setHighlightedSvg(null);
                        setDeletionHistory([]);
                        const colors = detectColorsInSvg(vectorSvg);
                        setDetectedColors(colors);
                        setOriginalDetectedColors(colors);
                      }}
                      className="w-full border-gray-600 text-gray-100 hover:bg-gray-700"
                    >
                      Reset All
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset to original vectorized image and restore all colors</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}