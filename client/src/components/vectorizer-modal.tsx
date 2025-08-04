import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Download, AlertCircle, ZoomIn, ZoomOut, Maximize2, Grid, Palette, Wand2, Trash2, Eye, Columns2, Lock, Unlock, HelpCircle, Pipette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import CompleteTransferLogo from "./complete-transfer-logo";
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
  const [zoom, setZoom] = useState<number>(125); // Zoom percentage
  const [showGrid, setShowGrid] = useState<boolean>(true); // Show transparency grid

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
  const [svgRevision, setSvgRevision] = useState(0); // Force re-render counter
  const svgContainerRef = useRef<HTMLDivElement>(null); // Direct DOM reference
  const [lockedColors, setLockedColors] = useState<Set<string>>(new Set()); // Track locked colors
  const [showHelp, setShowHelp] = useState(false); // Show help dialog
  const [deletedColors, setDeletedColors] = useState<Set<string>>(new Set()); // Track deleted colors
  const [isEyedropperActive, setIsEyedropperActive] = useState(false); // Eyedropper mode
  const [eyedropperColor, setEyedropperColor] = useState<string | null>(null); // Selected color to apply

  
  // Removed size editor state - users will resize on canvas

  // Debug logging
  console.log('VectorizerModal render:', { 
    open, 
    fileName, 
    hasImageFile: !!imageFile,
    fileSize: imageFile?.size,
    fileType: imageFile?.type,
    fileInstance: imageFile instanceof File ? 'File' : imageFile instanceof Blob ? 'Blob' : typeof imageFile
  });

  // Removed sizing functions - users will resize on canvas


  useEffect(() => {
    console.log('VectorizerModal useEffect:', { open, hasImageFile: !!imageFile, fileName });
    if (open && imageFile) {
      processVectorization();
    }
  }, [open, imageFile]);

  // Direct DOM update when SVG changes with click interaction
  useEffect(() => {
    if (svgContainerRef.current) {
      const currentSvg = highlightedSvg || coloredSvg || vectorSvg || '';
      
      // Clear container first
      svgContainerRef.current.innerHTML = '';
      
      if (currentSvg) {
        console.log('Attempting to render SVG with length:', currentSvg.length);
        console.log('SVG preview (first 500 chars):', currentSvg.substring(0, 500));
        
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (svgContainerRef.current) {
            console.log('SVG container ref exists, creating element');
            // Create interactive SVG element instead of img
            const tempDiv = document.createElement('div');
            
            // Clean up XML declaration if present
            let cleanSvg = currentSvg;
            if (currentSvg.includes('<?xml')) {
              cleanSvg = currentSvg.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/, '');
            }
            
            tempDiv.innerHTML = cleanSvg;
            let svgElement = tempDiv.querySelector('svg');
            console.log('SVG element found:', !!svgElement);
            
            if (svgElement) {
              // Style the SVG for proper display - let it use its natural dimensions
              svgElement.style.width = 'auto';
              svgElement.style.height = 'auto';
              svgElement.style.maxWidth = '100%';
              svgElement.style.maxHeight = '100%';
              svgElement.style.cursor = 'crosshair';
              svgElement.style.display = 'block';
              
              // Keep the original viewBox - don't force normalization
              const viewBox = svgElement.getAttribute('viewBox');
              console.log('Current viewBox:', viewBox);
              
              // Only set preserveAspectRatio if not already set
              if (!svgElement.hasAttribute('preserveAspectRatio')) {
                svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
              }
              
              // Add click event listener to detect color clicks
              const handleSvgClick = (event: Event) => {
                const target = event.target as SVGElement;
                if (target && (target.tagName === 'path' || target.tagName === 'ellipse' || target.tagName === 'rect' || target.tagName === 'circle')) {
                  const fill = target.getAttribute('fill');
                  const stroke = target.getAttribute('stroke');
                  const clickedColor = fill || stroke;
                  
                  if (clickedColor && clickedColor !== 'none') {
                    console.log('Color clicked in SVG:', clickedColor);
                    setSelectedColor(clickedColor);
                    
                    // Toggle lock status for this color
                    setLockedColors(prev => {
                      const newSet = new Set(prev);
                      const wasLocked = newSet.has(clickedColor);
                      
                      if (wasLocked) {
                        newSet.delete(clickedColor);
                      } else {
                        newSet.add(clickedColor);
                      }
                      
                      // Use setTimeout to avoid React warning about updating components during render
                      setTimeout(() => {
                        toast({
                          title: wasLocked ? "Color Unlocked" : "Color Locked",
                          description: `${wasLocked ? 'Unlocked' : 'Locked'} color ${clickedColor}`,
                        });
                      }, 0);
                      
                      return newSet;
                    });
                  }
                }
              };
              
              svgElement.addEventListener('click', handleSvgClick);
              
              // Ensure container is truly empty before appending
              while (svgContainerRef.current.firstChild) {
                svgContainerRef.current.removeChild(svgContainerRef.current.firstChild);
              }
              
              svgContainerRef.current.appendChild(svgElement);
              console.log('Direct DOM update with interactive SVG length:', currentSvg.length);
              console.log('SVG appended to container successfully');
            } else {
              console.error('SVG element not found in parsed content');
              console.log('Parsed content:', tempDiv.innerHTML.substring(0, 200));
            }
          }
        }); // Use requestAnimationFrame
      }
    }
  }, [highlightedSvg, coloredSvg, vectorSvg, svgRevision]);



  const processVectorization = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Show preview of original image
      console.log('Creating preview for image:', {
        name: imageFile.name,
        type: imageFile.type,
        size: imageFile.size
      });
      
      // Validate that imageFile is a valid File/Blob
      if (!imageFile || !(imageFile instanceof File || imageFile instanceof Blob)) {
        console.error('Invalid image file:', imageFile);
        throw new Error('Invalid image file provided');
      }
      
      // Check if file has content
      if (imageFile.size === 0) {
        console.error('Image file is empty');
        throw new Error('Image file is empty');
      }
      
      const imageUrl = URL.createObjectURL(imageFile);
      console.log('Created preview URL:', imageUrl);
      setPreviewUrl(imageUrl);
      
      // Call our backend API in preview mode (no credits consumed)
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('preview', 'true'); // This ensures no credits are consumed
      formData.append('removeBackground', 'false');
      
      // Mark if this PNG was extracted from a PDF (so server skips deduplication)
      // Check if filename suggests it was originally a PDF that was converted to PNG
      const wasExtractedFromPdf = imageFile.name.endsWith('.png') && 
                                  (imageFile.name.includes('_raster') || 
                                   imageFile.name.replace('.png', '.pdf') !== imageFile.name);
      if (wasExtractedFromPdf) {
        formData.append('fromPdfExtraction', 'true');
        console.log('🔍 Marking PNG as extracted from PDF, will skip deduplication');
      }
      
      const response = await fetch('/api/vectorize?preview=true', {
        method: 'POST',
        body: formData,
      });
      
      console.log('Vectorize API response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Vectorization error:', errorData);
        throw new Error(errorData.error || 'Vectorization failed');
      }
      
      const result = await response.json();
      console.log('Vectorization result:', {
        hasSvg: !!result.svg,
        svgPreview: result.svg?.substring(0, 200) + '...',
        svgLength: result.svg?.length,
        containsSvgTag: result.svg?.includes('<svg'),
        containsViewBox: result.svg?.includes('viewBox')
      });
      
      // Use the SVG as-is without modifications
      const fixedSvg = result.svg;
      
      console.log('Setting vector SVG:', {
        svgLength: fixedSvg?.length,
        isString: typeof fixedSvg === 'string',
        svgPreview: fixedSvg?.substring(0, 100)
      });
      
      setVectorSvg(fixedSvg);
      setColoredSvg(null); // Don't initialize colored SVG
      
      // No size editor - users will resize on canvas
      
      // Detect colors in the SVG
      const colors = detectColorsInSvg(fixedSvg);
      console.log('Detected colors:', colors);
      setDetectedColors(colors);
      setOriginalDetectedColors(colors); // Store original for undo
      
      // Color palette always visible now
      setIsProcessing(false);
      
      console.log('Vectorization complete. States set:', {
        hasVectorSvg: !!fixedSvg,
        hasPreviewUrl: !!previewUrl,
        colorsDetected: colors.length,
        isProcessing: false
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vectorization failed');
      setIsProcessing(false);
    }
  };

  // Removed sizing functions - users will resize on canvas

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
        formData.append('removeBackground', 'false');
        
        // Mark if this PNG was extracted from a PDF (so server skips deduplication)
        const wasExtractedFromPdf = imageFile.name.endsWith('.png') && 
                                    (imageFile.name.includes('_raster') || 
                                     imageFile.name.replace('.png', '.pdf') !== imageFile.name);
        if (wasExtractedFromPdf) {
          formData.append('fromPdfExtraction', 'true');
          console.log('🔍 Production call: Marking PNG as extracted from PDF, will skip deduplication');
        }
        
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
        
        // Use the production-quality SVG from the API response
        // If user made color changes, we need to apply them to the production SVG
        let finalSvg = svgToDownload !== vectorSvg ? svgToDownload : result.svg;
        
        // No custom sizing - users will resize on canvas
        
        console.log('Calling onVectorDownload with', { 
          usedModifiedVersion: svgToDownload !== vectorSvg,
          finalSvgLength: finalSvg?.length
        });
        onVectorDownload(finalSvg);
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

  // Function to apply all color adjustments to the provided SVG
  const applyAllColorAdjustments = (baseSvg: string, adjustments: {[color: string]: any}): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(baseSvg, 'image/svg+xml');
    
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

  // Helper function to apply color adjustments and update all states
  const updateColoredSvgWithAdjustments = (updatedColorAdjustments: typeof colorAdjustments) => {
    // Start from the original vectorSvg to apply adjustments
    const originalSvg = vectorSvg;
    if (originalSvg) {
      // First apply all color adjustments to the original
      const adjustedSvg = applyAllColorAdjustments(originalSvg, updatedColorAdjustments);
      
      // Then apply any deletions that were made
      let finalSvg = adjustedSvg;
      if (coloredSvg && deletedColors.size > 0) {
        // Apply deletions to the adjusted SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(adjustedSvg, 'image/svg+xml');
        
        deletedColors.forEach(deletedColor => {
          const normalizedColor = deletedColor.toLowerCase();
          
          // Remove fill elements
          const elementsWithFill = doc.querySelectorAll(`*[fill="${normalizedColor}"]`);
          elementsWithFill.forEach(el => el.remove());
          
          // Remove stroke elements
          const elementsWithStroke = doc.querySelectorAll(`*[stroke="${normalizedColor}"]`);
          elementsWithStroke.forEach(el => el.remove());
        });
        
        finalSvg = new XMLSerializer().serializeToString(doc.documentElement);
      }
      
      setColoredSvg(finalSvg);
      
      // Clear highlighting so adjusted colors show in preview
      setHighlightedSvg(null);
      
      const newColors = detectColorsInSvg(finalSvg);
      setDetectedColors(newColors);
      setSvgRevision(prev => prev + 1); // Force re-render
    }
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
    setSvgRevision(prev => prev + 1); // Force re-render
    
    // Remove this state from history
    setDeletionHistory(prev => prev.slice(0, -1));
    
    // Clear deleted colors tracking since we're restoring
    setDeletedColors(new Set());
    
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
        <DialogContent className="vectorizer-modal w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden flex flex-col resize">
          <DialogHeader className="flex-shrink-0">
            <CompleteTransferLogo size="md" className="mb-4" />
            <div className="flex items-center justify-between">
              <DialogTitle>AI Vectorization: {imageFile?.name || fileName}</DialogTitle>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => setViewMode(viewMode === 'comparison' ? 'preview' : 'comparison')}
                      className="px-3 py-2"
                    >
                      {viewMode === 'comparison' ? <Eye className="h-5 w-5 mr-2" /> : <Columns2 className="h-5 w-5 mr-2" />}
                      {viewMode === 'comparison' ? 'Preview' : 'Compare'}
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
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="default"
                      onClick={() => setShowHelp(true)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700"
                    >
                      <HelpCircle className="h-5 w-5 mr-2" />
                      Help Guide
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Learn how to use the vectorizer</p>
                  </TooltipContent>
                </Tooltip>

              </div>
            </div>
          </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex max-h-[80vh]">
          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col pr-4 min-w-0">
            {/* Cost Information */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex-shrink-0">
              <p className="text-sm text-blue-800">
                <strong>Free Preview:</strong> This preview uses test mode and consumes no credits. $2.50 ex VAT will only be charged when you approve and download the final result.
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
          {console.log('Preview state check:', { previewUrl: !!previewUrl, isProcessing, error, vectorSvg: !!vectorSvg })}
          {previewUrl && !isProcessing && !error && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Zoom Controls */}
              <div className="flex items-center justify-between gap-4 mb-4 flex-shrink-0">
                {/* Zoom Controls */}
                <div className="flex items-center gap-4">
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
                          max={800}
                          step={25}
                          className="flex-1"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Adjust zoom level (25% - 800%)</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-sm font-medium w-12">{zoom}%</span>
                </div>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom(Math.min(800, zoom + 25))}
                      disabled={zoom >= 800}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Zoom in (max 800%)</p>
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
                

              </div>



              <div className={`flex-1 ${viewMode === 'comparison' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'flex flex-col'} overflow-hidden`}>
                {/* Original - Only show in comparison mode */}
                {viewMode === 'comparison' && (
                  <div className="flex flex-col overflow-hidden">
                    <h3 className="font-semibold mb-2 text-center">Original RGB Image</h3>
                    <div 
                      className={`flex-1 border rounded-lg overflow-auto ${
                        showGrid ? 'transparency-grid' : 'bg-white'
                      }`}
                    >
                      <div 
                        className="flex items-center justify-center min-h-full"
                        style={{ 
                          padding: '2rem',
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s ease'
                        }}
                      >
                        <img 
                          src={previewUrl} 
                          alt="Original" 
                          style={{ 
                            imageRendering: zoom > 200 ? 'pixelated' : 'auto',
                            width: 'auto',
                            height: 'auto',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            display: 'block'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Vectorized Preview */}
                <div className="flex flex-col overflow-hidden">
                  <h3 className="font-semibold mb-2 text-center">
                    {viewMode === 'comparison' ? 'Vectorised CMYK Result' : 'Vector Preview'}
                  </h3>
                  
                  {/* Click instruction banner */}
                  <div className="text-xs text-center text-gray-600 mb-2 py-1 px-2 bg-yellow-50 border border-yellow-200 rounded">
                    <Lock className="w-3 h-3 inline mr-1 text-yellow-600" />
                    Click any color in preview to lock/unlock it
                  </div>
                  <div 
                    className={`flex-1 border rounded-lg overflow-auto ${
                      showGrid ? 'transparency-grid' : 'bg-gray-100'
                    }`}
                  >
                    {(highlightedSvg || coloredSvg || vectorSvg) ? (
                      <div 
                        key={`preview-wrapper-${(highlightedSvg || coloredSvg || vectorSvg || '').length}-${svgRevision}`}
                        className="flex items-center justify-center min-h-full"
                        style={{ 
                          padding: '2rem',
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s ease'
                        }}
                      >
                        <div 
                          className="vector-preview-wrapper"
                          style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            position: 'relative',
                            width: '100%',
                            height: '100%'
                          }}
                        >
                          <div 
                            ref={svgContainerRef}
                            style={{
                              display: 'block',
                              width: '100%',
                              height: '100%',
                              backgroundColor: 'transparent'
                            }}
                          />
                        </div>
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

          {/* Right Sidebar - Color Management Only */}
          {vectorSvg && (
            <div className="w-80 border-l border-gray-700 pl-4 flex flex-col overflow-hidden flex-shrink-0">
              {/* Color Management Section */}
              {detectedColors.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Palette className="w-5 h-5 text-gray-100" />
                    <h3 className="font-semibold text-gray-100">
                      Detected Colors ({detectedColors.length})
                    </h3>
                  </div>
                </>
              )}
              
              {detectedColors.length > 0 && (
                <div className="text-xs text-gray-400 mb-4 p-2 bg-gray-800 rounded border border-gray-700">
                  {isEyedropperActive ? (
                    <div className="flex items-center gap-1">
                      <Pipette className="w-3 h-3 text-blue-500" />
                      <span className="text-blue-400">
                        {eyedropperColor 
                          ? `Click any color to change it to ${eyedropperColor}`
                          : 'Click a color to pick it'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        <Lock className="w-3 h-3 text-yellow-500" />
                        <span>Click colors in preview to lock/unlock them</span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Locked colors (yellow border) are protected from deletion
                      </div>
                    </>
                  )}
                </div>
              )}
              
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
                          isEyedropperActive && eyedropperColor === colorItem.color
                            ? 'border-blue-500 border-2 shadow-lg ring-2 ring-blue-400/50'
                            : highlightedColor === colorItem.color 
                            ? 'border-red-500 border-2 shadow-lg' 
                            : lockedColors.has(colorItem.color) 
                              ? 'border-yellow-500 border-2'
                              : 'border-gray-600'
                        } ${isEyedropperActive ? 'cursor-crosshair' : ''}`}
                        style={{ backgroundColor: colorItem.color }}
                        title={
                          isEyedropperActive 
                            ? (eyedropperColor === colorItem.color 
                              ? 'Selected color - Click another color to apply it' 
                              : eyedropperColor 
                                ? `Click to change this color to ${eyedropperColor}` 
                                : 'Click to pick this color')
                            : `${colorItem.color} (${colorItem.count} elements) ${lockedColors.has(colorItem.color) ? '- LOCKED' : '- Click in preview to lock/unlock'}`
                        }
                        onClick={() => {
                          if (isEyedropperActive) {
                            if (!eyedropperColor) {
                              // First click - pick the color
                              setEyedropperColor(colorItem.color);
                              toast({
                                title: "Color Picked",
                                description: `Picked ${colorItem.color}. Now click another color to apply it.`,
                              });
                            } else if (eyedropperColor !== colorItem.color) {
                              // Second click - apply the color
                              const currentSvg = coloredSvg || vectorSvg;
                              if (currentSvg) {
                                // Save state for undo
                                setDeletionHistory(prev => [...prev, {
                                  svg: currentSvg,
                                  colors: [...detectedColors]
                                }]);
                                
                                // Replace the target color with the picked color
                                const updatedSvg = currentSvg.replace(
                                  new RegExp(`fill="${colorItem.color}"`, 'gi'),
                                  `fill="${eyedropperColor}"`
                                ).replace(
                                  new RegExp(`stroke="${colorItem.color}"`, 'gi'),
                                  `stroke="${eyedropperColor}"`
                                );
                                
                                setColoredSvg(updatedSvg);
                                const newColors = detectColorsInSvg(updatedSvg);
                                setDetectedColors(newColors);
                                setSvgRevision(prev => prev + 1);
                                
                                toast({
                                  title: "Color Applied",
                                  description: `Changed ${colorItem.color} to ${eyedropperColor}`,
                                });
                                
                                // Reset eyedropper
                                setIsEyedropperActive(false);
                                setEyedropperColor(null);
                              }
                            }
                          } else {
                            // Normal highlight functionality
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
                          }
                        }}
                      >
                        {/* Lock indicator - always visible when locked */}
                        {lockedColors.has(colorItem.color) && (
                          <div className="absolute -top-1 -left-1 w-4 h-4 bg-yellow-500 text-black rounded-full flex items-center justify-center shadow-md z-10">
                            <Lock className="h-2 w-2" />
                          </div>
                        )}
                        
                        {/* Delete button - hidden for locked colors */}
                        {!lockedColors.has(colorItem.color) && (
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
                              
                              // Track deleted color
                              setDeletedColors(prev => new Set([...prev, colorItem.color.toLowerCase()]));
                              
                              // Always clear highlighting when a color is removed
                              setHighlightedColor(null);
                              setHighlightedSvg(null);
                              
                              const newColors = detectColorsInSvg(updatedSvg);
                              setDetectedColors(newColors);
                              setSvgRevision(prev => prev + 1); // Force re-render
                              
                              // Force complete refresh
                              setVectorSvg(null);
                              setTimeout(() => {
                                setVectorSvg(vectorSvg);
                              }, 10);
                              
                              toast({
                                title: "Color Removed",
                                description: `Removed ${colorItem.color} from the image.`,
                              });
                            }}
                            title="Delete this color"
                          >
                            <Trash2 className="h-2 w-2" />
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 text-center leading-tight mt-1">{colorItem.count}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Color Adjustment Sliders - Only show when a color is highlighted */}
              {!highlightedColor && detectedColors.length > 0 && (
                <div className="border-t border-gray-700 pt-4 mb-4 text-center">
                  <p className="text-sm text-gray-400">
                    Hover over a color swatch above to adjust its CMYK values
                  </p>
                </div>
              )}
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
                            
                            // Apply all adjustments with proper re-render
                            updateColoredSvgWithAdjustments(updatedColorAdjustments);
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
                              
                              // Apply all adjustments with proper re-render
                              updateColoredSvgWithAdjustments(updatedColorAdjustments);
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
                              
                              // Apply all adjustments with proper re-render
                              updateColoredSvgWithAdjustments(updatedColorAdjustments);
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
                              
                              // Apply all adjustments with proper re-render
                              updateColoredSvgWithAdjustments(updatedColorAdjustments);
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
                              
                              // Apply all adjustments with proper re-render
                              updateColoredSvgWithAdjustments(updatedColorAdjustments);
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
                
                {/* Eyedropper Tool */}
                <div className="mb-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isEyedropperActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setIsEyedropperActive(!isEyedropperActive);
                          if (!isEyedropperActive) {
                            setEyedropperColor(null);
                            toast({
                              title: "Eyedropper Mode",
                              description: "Click a color below to pick it, then click another color to apply it.",
                            });
                          }
                        }}
                        className={`w-full ${
                          isEyedropperActive 
                            ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" 
                            : "border-gray-600 text-gray-100 hover:bg-gray-700"
                        }`}
                      >
                        <Pipette className="w-4 h-4 mr-2" />
                        {isEyedropperActive 
                          ? (eyedropperColor 
                            ? `Apply ${eyedropperColor}` 
                            : "Pick a Color") 
                          : "Eyedropper"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Use eyedropper to copy colors from one element to another</p>
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
                            // Save current state for undo
                            setDeletionHistory(prev => [...prev, {
                              svg: currentSvg,
                              colors: [...detectedColors]
                            }]);
                            
                            // Remove white color and update states immediately
                            const updatedSvg = removeColorFromSvg(currentSvg, '#ffffff');
                            const newColors = detectColorsInSvg(updatedSvg);
                            
                            console.log('Before white removal:', currentSvg.substring(0, 200));
                            console.log('After white removal:', updatedSvg.substring(0, 200));
                            console.log('SVG length changed from', currentSvg.length, 'to', updatedSvg.length);
                            
                            // Clear all highlighting first
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                            
                            // Update immediately like individual color deletion does
                            setColoredSvg(updatedSvg);
                            setDetectedColors(newColors);
                            setDeletedColors(prev => new Set([...prev, '#ffffff']));
                            setSvgRevision(prev => prev + 1); // Force re-render
                            
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
                            // Save current state for undo
                            setDeletionHistory(prev => [...prev, {
                              svg: currentSvg,
                              colors: [...detectedColors]
                            }]);
                            
                            // Use the smart background white removal function
                            const updatedSvg = removeWhiteFromSvg(currentSvg, 'background');
                            const newColors = detectColorsInSvg(updatedSvg);
                            
                            // Clear all highlighting first
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                            
                            // Update state
                            setColoredSvg(updatedSvg);
                            setDetectedColors(newColors);
                            setSvgRevision(prev => prev + 1);
                            
                            toast({
                              title: "Background White Removed",
                              description: "Removed background white elements while preserving text/details.",
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
                      <p>Remove white background elements only (preserves text and details)</p>
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
                            // Save current state for undo
                            setDeletionHistory(prev => [...prev, {
                              svg: currentSvg,
                              colors: [...detectedColors]
                            }]);
                            
                            let updatedSvg = currentSvg;
                            let totalRemoved = 0;
                            
                            // Use smart background removal that only removes background white elements
                            console.log('Applying smart white background removal');
                            updatedSvg = removeWhiteFromSvg(currentSvg, 'background');
                            
                            // Mark white colors as deleted for UI purposes
                            const whiteVariations = detectedColors
                              .filter(colorItem => {
                                const color = colorItem.color.toLowerCase();
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
                            
                            whiteVariations.forEach(whiteColor => {
                              setDeletedColors(prev => new Set([...prev, whiteColor.toLowerCase()]));
                            });
                            totalRemoved = whiteVariations.length;
                            
                            const newColors = detectColorsInSvg(updatedSvg);
                            
                            console.log('Remove all white - Before:', currentSvg.substring(0, 200));
                            console.log('Remove all white - After:', updatedSvg.substring(0, 200));
                            console.log('Remove all white - SVG length changed from', currentSvg.length, 'to', updatedSvg.length);
                            
                            // Clear all highlighting first
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                            
                            // Update immediately like individual color deletion does
                            setColoredSvg(updatedSvg);
                            setDetectedColors(newColors);
                            setSvgRevision(prev => prev + 1); // Force re-render
                            
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
                
                {/* Delete Unlocked Colors Button */}
                {lockedColors.size > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentSvg = coloredSvg || vectorSvg;
                          if (currentSvg) {
                            // Save current state for undo
                            setDeletionHistory(prev => [...prev, {
                              svg: currentSvg,
                              colors: [...detectedColors]
                            }]);
                            
                            // Find all unlocked colors
                            const unlockedColors = detectedColors
                              .filter(colorItem => !lockedColors.has(colorItem.color))
                              .map(colorItem => colorItem.color);
                            
                            console.log('Removing unlocked colors:', unlockedColors);
                            console.log('Keeping locked colors:', Array.from(lockedColors));
                            
                            let updatedSvg = currentSvg;
                            let totalRemoved = 0;
                            
                            // Remove each unlocked color
                            unlockedColors.forEach(color => {
                              updatedSvg = removeColorFromSvg(updatedSvg, color);
                              setDeletedColors(prev => new Set([...prev, color.toLowerCase()]));
                              totalRemoved++;
                            });
                            
                            const newColors = detectColorsInSvg(updatedSvg);
                            
                            // Clear all highlighting first
                            setHighlightedColor(null);
                            setHighlightedSvg(null);
                            
                            // Update immediately
                            setColoredSvg(updatedSvg);
                            setDetectedColors(newColors);
                            setSvgRevision(prev => prev + 1); // Force re-render
                            
                            toast({
                              title: "Unlocked Colors Removed",
                              description: `Removed ${totalRemoved} unlocked colors, kept ${lockedColors.size} locked colors.`,
                            });
                          }
                        }}
                        className="w-full border-red-600 text-red-100 hover:bg-red-700 mb-3"
                        disabled={lockedColors.size === 0 || detectedColors.every(c => lockedColors.has(c.color))}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Unlocked Colors ({detectedColors.filter(c => !lockedColors.has(c.color)).length})
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove all colors that are not locked, keeping only the locked colors</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setColoredSvg(vectorSvg);
                        setHighlightedColor(null);
                        setHighlightedSvg(null);
                        setDeletedColors(new Set());
                        setDeletionHistory([]);
                        setLockedColors(new Set()); // Clear locked colors on reset
                        const colors = detectColorsInSvg(vectorSvg);
                        setDetectedColors(colors);
                        setOriginalDetectedColors(colors);
                        setSvgRevision(prev => prev + 1); // Force re-render
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
    
    {/* Help Dialog */}
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">AI Vectorization Help Guide</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 text-sm">
          {/* Introduction */}
          <div>
            <h3 className="font-semibold text-lg mb-2">What is AI Vectorization?</h3>
            <p className="text-muted-foreground">
              AI Vectorization converts your raster images (JPG, PNG, etc.) into scalable vector graphics (SVG). 
              This process creates sharp, clean lines that can be scaled to any size without losing quality - 
              perfect for professional transfers and printing.
            </p>
          </div>

          {/* Main Features */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Key Features</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <Columns2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">View Modes</h4>
                  <p className="text-muted-foreground">Toggle between side-by-side comparison and full preview mode to see the vectorization results.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <Grid className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Transparency Grid</h4>
                  <p className="text-muted-foreground">Shows a checkerboard pattern to clearly see transparent areas in your image.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <ZoomIn className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Zoom Controls</h4>
                  <p className="text-muted-foreground">Zoom in up to 800% to inspect fine details and ensure quality.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Color Management */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Color Management</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Color Locking</h4>
                  <p className="text-muted-foreground">Click any color in the preview to lock/unlock it. Locked colors (shown with yellow border) are protected from deletion.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <Trash2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Color Removal</h4>
                  <p className="text-muted-foreground">
                    • Hover over color swatches and click the trash icon to delete individual colors<br/>
                    • Use "Remove White" to eliminate white backgrounds<br/>
                    • Use "Delete Unlocked Colors" to remove all non-protected colors at once
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <Palette className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Color Adjustment</h4>
                  <p className="text-muted-foreground">Hover over any color swatch to reveal CMYK adjustment sliders. Fine-tune colors using Cyan, Magenta, Yellow, Black, and Saturation controls.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Tips */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Recommended Workflow</h3>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Wait for the AI to process your image (free preview mode)</li>
              <li>Click colors in the preview to lock the ones you want to keep</li>
              <li>Use "Delete Unlocked Colors" to remove all unwanted colors at once</li>
              <li>Fine-tune remaining colors with CMYK sliders if needed</li>
              <li>Check the result at high zoom to ensure quality</li>
              <li>Click "Approve & Upload" to finalize ($2.50 charge)</li>
            </ol>
          </div>

          {/* Important Notes */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2">Important Notes</h3>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Preview mode is completely free - no credits are used</li>
              <li>$2.50 is only charged when you approve and download the final result</li>
              <li>All color edits and adjustments are applied to the final download</li>
              <li>The vectorized file will be automatically sized on the canvas after upload</li>
              <li>Use the "Undo" button to reverse the last color deletion</li>
              <li>Use "Reset All" to start over with the original vectorized image</li>
            </ul>
          </div>
        </div>
        
        <div className="flex justify-end mt-6">
          <Button onClick={() => setShowHelp(false)}>
            Got it, thanks!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    </TooltipProvider>
  );
}