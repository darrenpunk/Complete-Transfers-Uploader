import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Download, AlertCircle, ZoomIn, ZoomOut, Maximize2, Grid, Palette, Wand2, Trash2, Eye, Columns2, Lock, Unlock, HelpCircle, Pipette, Crop, Settings, Move, Check, X, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import CompleteTransferLogo from "./complete-transfer-logo";
import { useToast } from "@/hooks/use-toast";
import { SimpleCropInterface } from "./simple-crop-interface";

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
  const [qualityWarning, setQualityWarning] = useState<{
    issues: string[];
    recommendation: string;
    originalFileName: string;
  } | null>(null); // Track vectorization quality issues
  const [isEyedropperActive, setIsEyedropperActive] = useState(false); // Eyedropper mode
  const [eyedropperColor, setEyedropperColor] = useState<string | null>(null); // Selected color to apply
  const [enableTightCropping, setEnableTightCropping] = useState(false); // Disable tight cropping to prevent content loss
  const [showCropInterface, setShowCropInterface] = useState(false); // Show pre-crop interface
  const [cropArea, setCropArea] = useState<{x: number, y: number, width: number, height: number} | null>(null); // Crop selection
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null); // Original image for cropping
  const [shapeStacking, setShapeStacking] = useState<'cut_out' | 'stack'>('cut_out'); // Shape stacking mode: cut_out = transparent holes, stack = black areas

  
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
      // Initialize modal state but don't auto-process (let user choose to crop first)
      const url = URL.createObjectURL(imageFile);
      setPreviewUrl(url);
      setOriginalImageUrl(url);
      setError(null);
      setVectorSvg(null);
      setColoredSvg(null);
      setDetectedColors([]);
      setQualityWarning(null);
      setShowCropInterface(false);
      setCropArea(null);
      console.log('Created image preview URL for cropping:', url);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [open, imageFile]);

  // Only log crop area changes, don't auto-vectorize
  useEffect(() => {
    if (cropArea) {
      console.log('🎯 CROP AREA SET (waiting for confirmation):', cropArea);
    }
  }, [cropArea]);

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
      // Check if there's a cropped file to use instead of the original
      const fileToUse = (window as any).croppedImageFile || imageFile;
      
      // Show preview of the file we're using
      console.log('Creating preview for image:', {
        name: fileToUse.name,
        type: fileToUse.type,
        size: fileToUse.size,
        isCropped: !!(window as any).croppedImageFile
      });
      
      // Validate that the file is a valid File/Blob
      if (!fileToUse || !(fileToUse instanceof File || fileToUse instanceof Blob)) {
        console.error('Invalid image file:', fileToUse);
        throw new Error('Invalid image file provided');
      }
      
      // Check if file has content
      if (fileToUse.size === 0) {
        console.error('Image file is empty');
        throw new Error('Image file is empty');
      }
      
      const imageUrl = URL.createObjectURL(fileToUse);
      console.log('Created preview URL:', imageUrl);
      setPreviewUrl(imageUrl);
      
      // Call our backend API in preview mode (no credits consumed)
      const formData = new FormData();
      formData.append('image', fileToUse);
      formData.append('preview', 'true'); // This ensures no credits are consumed
      formData.append('removeBackground', 'false');
      formData.append('enableTightCropping', 'false'); // Disable tight cropping to prevent content loss
      formData.append('shapeStacking', shapeStacking); // Shape stacking mode for deleted colors
      console.log(`🔧 CLIENT PREVIEW: Disabling tight cropping to preserve full content`);
      console.log(`🔄 CLIENT PREVIEW: Shape stacking = ${shapeStacking} (deleted colors will be ${shapeStacking === 'cut_out' ? 'transparent' : 'black'})`);
      
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
      
      // Check for quality warning from backend
      if (result.qualityWarning) {
        console.log('Quality warning received:', result.qualityWarning);
        setQualityWarning(result.qualityWarning);
        toast({
          title: "Vectorization Quality Warning",
          description: `${result.qualityWarning.issues.length} issues detected. Check the quality notice below.`,
          variant: "destructive",
        });
      } else {
        setQualityWarning(null);
      }
      
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
        formData.append('enableTightCropping', 'false'); // Disable tight cropping to prevent content loss
        formData.append('shapeStacking', shapeStacking); // Shape stacking mode for deleted colors
        console.log(`🔧 CLIENT PRODUCTION: Disabling tight cropping to preserve full content`);
        console.log(`🔄 CLIENT PRODUCTION: Shape stacking = ${shapeStacking} (deleted colors will be ${shapeStacking === 'cut_out' ? 'transparent' : 'black'})`);
        
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

  // Function to replace colors in SVG with robust color matching
  const replaceColorInSvg = (svg: string, oldColor: string, newColor: string): string => {
    // Normalize colors to hex format for consistent matching
    const normalizeColor = (color: string): string => {
      color = color.toLowerCase().trim();
      
      // Convert rgb to hex
      if (color.startsWith('rgb')) {
        const match = color.match(/rgb\s*\(\s*(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)\s*\)/);
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
      }
      
      // Ensure hex colors start with #
      if (!color.startsWith('#') && /^[0-9a-f]{6}$/.test(color)) {
        return '#' + color;
      }
      
      return color;
    };
    
    const normalizedOldColor = normalizeColor(oldColor);
    const normalizedNewColor = normalizeColor(newColor);
    
    // Replace in various attribute formats
    let updatedSvg = svg;
    
    // Replace both original and normalized color formats to ensure compatibility
    const colorsToReplace = [oldColor, normalizedOldColor];
    console.log(`🎨 RECOLOR: Replacing ${oldColor} → ${normalizedNewColor}`, { normalizedOldColor, normalizedNewColor });
    
    let replacementCount = 0;
    colorsToReplace.forEach(colorToReplace => {
      if (colorToReplace) {
        // Replace fill attributes
        const beforeFill = updatedSvg;
        updatedSvg = updatedSvg.replace(
          new RegExp(`fill\\s*=\\s*["']${escapeRegExp(colorToReplace)}["']`, 'gi'),
          `fill="${normalizedNewColor}"`
        );
        if (updatedSvg !== beforeFill) {
          replacementCount++;
          console.log(`🎨 FILL REPLACED: ${colorToReplace} → ${normalizedNewColor}`);
        }
        
        // Replace stroke attributes
        const beforeStroke = updatedSvg;
        updatedSvg = updatedSvg.replace(
          new RegExp(`stroke\\s*=\\s*["']${escapeRegExp(colorToReplace)}["']`, 'gi'),
          `stroke="${normalizedNewColor}"`
        );
        if (updatedSvg !== beforeStroke) {
          replacementCount++;
          console.log(`🎨 STROKE REPLACED: ${colorToReplace} → ${normalizedNewColor}`);
        }
        
        // Replace style attributes
        const beforeStyleFill = updatedSvg;
        updatedSvg = updatedSvg.replace(
          new RegExp(`fill\\s*:\\s*${escapeRegExp(colorToReplace)}`, 'gi'),
          `fill:${normalizedNewColor}`
        );
        if (updatedSvg !== beforeStyleFill) {
          replacementCount++;
          console.log(`🎨 STYLE FILL REPLACED: ${colorToReplace} → ${normalizedNewColor}`);
        }
        
        const beforeStyleStroke = updatedSvg;
        updatedSvg = updatedSvg.replace(
          new RegExp(`stroke\\s*:\\s*${escapeRegExp(colorToReplace)}`, 'gi'),
          `stroke:${normalizedNewColor}`
        );
        if (updatedSvg !== beforeStyleStroke) {
          replacementCount++;
          console.log(`🎨 STYLE STROKE REPLACED: ${colorToReplace} → ${normalizedNewColor}`);
        }
      }
    });
    
    console.log(`🎨 RECOLOR COMPLETE: Made ${replacementCount} replacements`);
    
    return updatedSvg;
  };
  
  // Helper function to escape special regex characters
  const escapeRegExp = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };


  // Function to detect all colors in SVG
  const detectColorsInSvg = (svg: string): {color: string, count: number}[] => {
    const colorMap = new Map<string, number>();
    
    // Also check for colors in style attributes and CSS
    const extractColorsFromText = (text: string) => {
      // Find hex colors
      const hexMatches = text.match(/#[0-9a-f]{6}/gi);
      if (hexMatches) {
        hexMatches.forEach(color => {
          const normalizedColor = color.toLowerCase();
          colorMap.set(normalizedColor, (colorMap.get(normalizedColor) || 0) + 1);
        });
      }
      
      // Find rgb colors
      const rgbMatches = text.match(/rgb\s*\(\s*\d+%?\s*,\s*\d+%?\s*,\s*\d+%?\s*\)/gi);
      if (rgbMatches) {
        rgbMatches.forEach(color => {
          const match = color.match(/rgb\s*\(\s*(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)\s*\)/);
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
            const hexColor = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
            colorMap.set(hexColor, (colorMap.get(hexColor) || 0) + 1);
          }
        });
      }
    };
    
    // Extract colors directly from SVG text to catch all formats
    extractColorsFromText(svg);
    
    // Also parse DOM for structured analysis
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      
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
    } catch (error) {
      console.warn('Error parsing SVG for color detection:', error);
    }
    
    // Convert map to array and sort by count
    return Array.from(colorMap.entries())
      .map(([color, count]) => ({color, count}))
      .sort((a, b) => b.count - a.count);
  };

  // Function to remove specific color from SVG
  const removeColorFromSvg = (svg: string, colorToRemove: string, stackingMode: 'cut_out' | 'stack' = 'cut_out'): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    
    // Normalize the color to remove (ensure lowercase and consistent format)
    const normalizedColorToRemove = colorToRemove.toLowerCase().trim();
    
    console.log('Removing color:', normalizedColorToRemove);
    
    let removedCount = 0;
    const isRemovingWhite = normalizedColorToRemove === '#ffffff' || normalizedColorToRemove === '#fefefe';
    
    // CRITICAL FIX: Force SVG root to be transparent and remove black backgrounds
    const svgElement = doc.querySelector('svg');
    if (svgElement) {
      // Force SVG root to be transparent
      svgElement.style.background = 'transparent';
      svgElement.style.backgroundColor = 'transparent';
      svgElement.setAttribute('style', 'background: transparent !important; background-color: transparent !important;');
      console.log('🔧 FORCED SVG ROOT TO TRANSPARENT');
    }
    
    // CRITICAL FIX: Handle elements with no fill (they default to black!) AND black strokes
    const allShapeElements = doc.querySelectorAll('path, rect, circle, ellipse, polygon');
    allShapeElements.forEach(el => {
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      
      // If element has no fill attribute, it defaults to BLACK in SVG!
      if (!fill || fill === '' || fill === 'none') {
        console.log('🔧 FORCING UNFILLED ELEMENT TO TRANSPARENT:', el.tagName);
        el.setAttribute('fill', 'transparent');
        el.setAttribute('fill-opacity', '0');
      }
      // Remove explicit black fills
      else if (fill && (fill.toLowerCase() === '#000000' || fill.toLowerCase() === 'black' || fill.toLowerCase() === '#000')) {
        console.log('🗑️ REMOVING BLACK FILL ELEMENT:', el.tagName, 'with fill:', fill);
        el.remove();
        removedCount++;
        return; // Skip stroke check since element is removed
      }
      
      // ALSO handle black strokes that are revealed when fills are removed
      if (stroke && (stroke.toLowerCase() === '#000000' || stroke.toLowerCase() === 'black' || stroke.toLowerCase() === '#000')) {
        console.log('🔧 FORCING BLACK STROKE TO TRANSPARENT:', el.tagName, 'stroke:', stroke);
        el.setAttribute('stroke', 'transparent');
        el.setAttribute('stroke-opacity', '0');
      }
    });
    
    // CRITICAL FIX: Remove full-canvas boundary paths (the actual cause of black background)
    const viewBox = svgElement?.getAttribute('viewBox')?.split(' ').map(parseFloat) || [0, 0, 100, 100];
    const svgWidth = viewBox[2];
    const svgHeight = viewBox[3];
    
    const allPaths = doc.querySelectorAll('path');
    allPaths.forEach(path => {
      const d = path.getAttribute('d') || '';
      
      // Check if this path defines the exact canvas boundary (regardless of fill)
      const isCanvasBoundary = d.includes(`M ${svgWidth}.00 0.00`) &&
                               d.includes(`L ${svgWidth}.00 ${svgHeight}.00`) &&
                               d.includes(`L 0.00 ${svgHeight}.00`) &&
                               d.includes(`L 0.00 0.00`) &&
                               d.includes('Z');
      
      if (isCanvasBoundary) {
        console.log('🗑️ REMOVING FULL-CANVAS BOUNDARY PATH (the black background culprit)');
        console.log('Path coordinates:', d.substring(0, 100));
        path.remove();
        removedCount++;
      }
    });
    
    // Remove any rect elements that might be black backgrounds
    const allRects = doc.querySelectorAll('rect');
    allRects.forEach(rect => {
      const fill = rect.getAttribute('fill')?.toLowerCase();
      const width = parseFloat(rect.getAttribute('width') || '0');
      const height = parseFloat(rect.getAttribute('height') || '0');
      const x = parseFloat(rect.getAttribute('x') || '0');
      const y = parseFloat(rect.getAttribute('y') || '0');
      
      // Remove large rectangles that could be backgrounds
      if ((width > svgWidth * 0.8 || height > svgHeight * 0.8) && (x <= 10 && y <= 10)) {
        console.log('REMOVING LARGE BACKGROUND RECT:', { width, height, x, y, fill });
        rect.remove();
        removedCount++;
      }
    });
    
    // Remove elements with matching fill
    const elementsWithFill = doc.querySelectorAll('*[fill]');
    
    elementsWithFill.forEach((el) => {
      const fill = el.getAttribute('fill')?.toLowerCase().trim();
      
      if (!fill || fill === 'none') {
        return;
      }
      
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
        
        // CRITICAL FIX: Use Shape Stacking setting to control deletion behavior
        if (stackingMode === 'cut_out') {
          // Cut-out mode: Remove elements completely (like removeWhiteFromSvg)
          el.remove();
          console.log('Removed element completely for transparent cut-out (Shape Stacking: cut_out)');
          removedCount++;
        } else {
          // Stack mode: Remove elements completely (original behavior)
          if (['rect', 'path', 'circle', 'ellipse', 'polygon', 'g'].includes(el.tagName.toLowerCase())) {
            el.remove();
            removedCount++;
          } else {
            el.removeAttribute('fill');
            console.log('Removed fill attribute from non-shape element:', el.tagName);
          }
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
    // Fix duplicate attributes that break XML parsing
    let cleanSvg = svg.replace(/data-content-extracted="true"\s+data-content-extracted="true"/g, 'data-content-extracted="true"');
    cleanSvg = cleanSvg.replace(/data-crop-extracted="true"\s+data-crop-extracted="true"/g, 'data-crop-extracted="true"');
    cleanSvg = cleanSvg.replace(/data-ai-vectorized="true"\s+data-ai-vectorized="true"/g, 'data-ai-vectorized="true"');
    
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanSvg, 'image/svg+xml');
    
    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.error('SVG parsing error:', parserError.textContent);
      return svg; // Return original if parsing fails
    }
    
    // Get the SVG's viewBox dimensions
    const svgElement = doc.querySelector('svg');
    const viewBox = svgElement?.getAttribute('viewBox')?.split(' ').map(parseFloat) || [0, 0, 100, 100];
    const svgWidth = viewBox[2];
    const svgHeight = viewBox[3];
    
    if (mode === 'background') {
      // Conservative mode: Only remove obvious background elements
      console.log('SVG viewBox:', svgWidth, 'x', svgHeight);
      
      // Find all white elements
      const allWhiteElements = doc.querySelectorAll('*[fill="#ffffff"], *[fill="#FFFFFF"], *[fill="white"], *[fill="rgb(255,255,255)"], *[fill="rgb(100%,100%,100%)"], *[fill="rgb(255, 255, 255)"]');
      console.log('Found white elements:', allWhiteElements.length);
      
      // Check if there are any non-white elements (content)
      const nonWhiteElements = doc.querySelectorAll('*[fill]:not([fill="#ffffff"]):not([fill="#FFFFFF"]):not([fill="white"]):not([fill="rgb(255,255,255)"]):not([fill="rgb(100%,100%,100%)"]):not([fill="rgb(255, 255, 255)"]):not([fill="none"])');
      console.log('Found non-white content elements:', nonWhiteElements.length);
      
      // Effective removal: Remove white elements while preserving small details
      let removedCount = 0;
      
      // If there are very few non-white elements, be more careful
      const isMainlyWhite = nonWhiteElements.length < 5;
      
      allWhiteElements.forEach(el => {
        let shouldRemove = false;
        
        if (el.tagName === 'rect') {
          const width = parseFloat(el.getAttribute('width') || '0');
          const height = parseFloat(el.getAttribute('height') || '0');
          
          // Remove rectangles that are medium-large (50%+ of canvas)
          if (width >= svgWidth * 0.5 || height >= svgHeight * 0.5) {
            shouldRemove = true;
            console.log('Removing large white rectangle:', {width, height});
          }
        } else if (el.tagName === 'path') {
          const d = el.getAttribute('d') || '';
          
          // Remove most white paths, but preserve very small ones (likely details)
          if (d.length > 100) {
            shouldRemove = true;
            console.log('Removing white path (length:', d.length, ')');
          } else {
            console.log('Preserving small white path (likely content detail)');
          }
        } else {
          // For other elements (circle, ellipse), remove unless very small
          const r = parseFloat(el.getAttribute('r') || '0');
          const rx = parseFloat(el.getAttribute('rx') || '0');
          const ry = parseFloat(el.getAttribute('ry') || '0');
          
          if (r > 10 || rx > 10 || ry > 10) {
            shouldRemove = true;
            console.log('Removing white', el.tagName, '(size:', r || Math.max(rx, ry), ')');
          } else {
            console.log('Preserving small white', el.tagName, '(likely content detail)');
          }
        }
        
        if (shouldRemove) {
          el.remove();
          removedCount++;
        }
      });
      
      console.log(`Removed ${removedCount} white elements (${isMainlyWhite ? 'careful mode' : 'normal mode'})`);
      
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
      modifiedSvg = removeColorFromSvg(modifiedSvg, colorToRemove, shapeStacking);
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

  // Function to apply crop and start vectorization
  const applyCropAndVectorize = async () => {
    if (!cropArea || !imageFile || !originalImageUrl) return;
    
    try {
      setIsProcessing(true);
      
      // Create temporary image to get actual dimensions
      const tempImg = new Image();
      
      await new Promise((resolve, reject) => {
        tempImg.onload = resolve;
        tempImg.onerror = reject;
        tempImg.src = originalImageUrl;
      });
      
      // Calculate scale factor between displayed image and actual image  
      const displayedImg = document.querySelector('img.crop-interface') as HTMLImageElement;
      if (!displayedImg) {
        console.error('🚨 Could not find img.crop-interface, available images:', document.querySelectorAll('img'));
        console.error('Available images with src containing blob:', Array.from(document.querySelectorAll('img')).filter(img => img.src.includes('blob')));
        throw new Error('Could not find displayed image');
      }
      
      // Get the container that the image is inside (where crop coordinates are relative to)
      const cropContainer = displayedImg.parentElement as HTMLElement;
      if (!cropContainer) {
        throw new Error('Could not find crop container');
      }
      
      console.log('✅ Found displayed image and container:', {
        image: { width: displayedImg.clientWidth, height: displayedImg.clientHeight },
        container: { width: cropContainer.clientWidth, height: cropContainer.clientHeight }
      });
      
      // For object-contain, calculate actual displayed image dimensions within the container
      const containerWidth = cropContainer.clientWidth;
      const containerHeight = cropContainer.clientHeight;
      const imageAspect = tempImg.naturalWidth / tempImg.naturalHeight;
      const containerAspect = containerWidth / containerHeight;
      
      let actualDisplayedWidth, actualDisplayedHeight, offsetX = 0, offsetY = 0;
      
      if (imageAspect > containerAspect) {
        // Image is wider - fits to width, height is smaller with vertical padding
        actualDisplayedWidth = containerWidth;
        actualDisplayedHeight = containerWidth / imageAspect;
        offsetY = (containerHeight - actualDisplayedHeight) / 2;
      } else {
        // Image is taller - fits to height, width is smaller with horizontal padding  
        actualDisplayedHeight = containerHeight;
        actualDisplayedWidth = containerHeight * imageAspect;
        offsetX = (containerWidth - actualDisplayedWidth) / 2;
      }
      
      console.log('🎯 OBJECT-CONTAIN CALCULATION:', {
        container: { width: containerWidth, height: containerHeight },
        actualDisplayed: { width: actualDisplayedWidth, height: actualDisplayedHeight },
        offset: { x: offsetX, y: offsetY },
        imageAspect,
        containerAspect
      });
      
      const scaleX = tempImg.naturalWidth / actualDisplayedWidth;
      const scaleY = tempImg.naturalHeight / actualDisplayedHeight;
      
      // Convert container-relative crop coordinates to image pixel coordinates
      // First, convert from container coords to displayed image coords (accounting for object-contain padding)
      const imageRelativeX = Math.max(0, cropArea.x - offsetX);
      const imageRelativeY = Math.max(0, cropArea.y - offsetY);
      const imageRelativeWidth = Math.min(actualDisplayedWidth, cropArea.width);
      const imageRelativeHeight = Math.min(actualDisplayedHeight, cropArea.height);
      
      // Then scale to actual image pixel coordinates
      const actualCropArea = {
        x: Math.round(imageRelativeX * scaleX),
        y: Math.round(imageRelativeY * scaleY),
        width: Math.round(imageRelativeWidth * scaleX),
        height: Math.round(imageRelativeHeight * scaleY)
      };
      
      console.log('🎯 CROP DIMENSIONS:', {
        container: { width: containerWidth, height: containerHeight },
        originalCrop: cropArea,
        imageDisplayed: { width: actualDisplayedWidth, height: actualDisplayedHeight, offsetX, offsetY },
        imageRelative: { x: imageRelativeX, y: imageRelativeY, width: imageRelativeWidth, height: imageRelativeHeight },
        scale: { scaleX, scaleY },
        actualPixels: actualCropArea,
        imageSize: { width: tempImg.naturalWidth, height: tempImg.naturalHeight }
      });
      
      // Validate crop dimensions
      if (actualCropArea.width <= 0 || actualCropArea.height <= 0) {
        throw new Error(`Invalid crop dimensions: ${actualCropArea.width}×${actualCropArea.height}`);
      }
      
      if (actualCropArea.x < 0 || actualCropArea.y < 0 || 
          actualCropArea.x + actualCropArea.width > tempImg.naturalWidth ||
          actualCropArea.y + actualCropArea.height > tempImg.naturalHeight) {
        throw new Error('Crop area extends beyond image boundaries');
      }
      
      // Create cropped image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      canvas.width = actualCropArea.width;
      canvas.height = actualCropArea.height;
      
      // Draw cropped portion
      ctx.drawImage(
        tempImg,
        actualCropArea.x, actualCropArea.y, actualCropArea.width, actualCropArea.height, // Source
        0, 0, actualCropArea.width, actualCropArea.height // Destination
      );
      
      // Convert to blob and create new file
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, imageFile.type, 0.95);
      });
      
      const croppedFile = new File([blob], imageFile.name, { type: imageFile.type });
      
      // Update the component state with cropped file
      const newUrl = URL.createObjectURL(croppedFile);
      setPreviewUrl(newUrl);
      
      // Replace the imageFile reference for vectorization
      Object.defineProperty(window, 'croppedImageFile', {
        value: croppedFile,
        writable: true
      });
      
      // Close crop interface and start vectorization with cropped file
      setShowCropInterface(false);
      
      // Process vectorization with the cropped file and crop dimensions
      await processVectorizationWithFile(croppedFile, actualCropArea);
      
    } catch (error) {
      console.error('🚨 CROP FAILED:', error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('Crop area that failed:', cropArea);
      console.error('Image file that failed:', imageFile);
      
      setIsProcessing(false);
      toast({
        title: "Crop Failed",
        description: error instanceof Error ? error.message : "Failed to apply crop. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Modified vectorization function to accept a specific file and optional crop dimensions
  const processVectorizationWithFile = async (fileToProcess: File = imageFile, cropDimensions?: { x: number; y: number; width: number; height: number }) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('image', fileToProcess);
      formData.append('shapeStacking', shapeStacking); // Shape stacking mode for deleted colors
      
      // Add crop dimensions if provided (from crop interface)
      if (cropDimensions) {
        formData.append('cropWidth', cropDimensions.width.toString());
        formData.append('cropHeight', cropDimensions.height.toString());
        console.log(`🎯 CROP DIMENSIONS: Sending ${cropDimensions.width}×${cropDimensions.height}px to vectorization API`);
      }
      
      console.log(`🔄 CROP+VECTORIZE: Shape stacking = ${shapeStacking} (deleted colors will be ${shapeStacking === 'cut_out' ? 'transparent' : 'black'})`);
      
      const response = await fetch('/api/vectorize', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Vectorization failed');
      }
      
      const data = await response.json();
      
      if (data.svg) {
        setVectorSvg(data.svg);
        setColoredSvg(data.svg);
        
        // Extract colors directly from SVG if server didn't detect any
        let colors = data.detectedColors || [];
        if (colors.length === 0) {
          console.log('🎨 Server detected no colors, extracting from SVG...');
          // Use the existing color extraction logic that's already in the component
          const colorMap = new Map<string, number>();
          const extractColorsFromText = (text: string) => {
            const hexMatches = text.match(/#[0-9a-f]{6}/gi);
            if (hexMatches) {
              hexMatches.forEach(color => {
                const normalizedColor = color.toLowerCase();
                colorMap.set(normalizedColor, (colorMap.get(normalizedColor) || 0) + 1);
              });
            }
          };
          extractColorsFromText(data.svg);
          
          colors = Array.from(colorMap.entries()).map(([color, count]) => ({
            color,
            count,
            isCMYK: false
          }));
          console.log('🎨 Extracted colors from SVG:', colors);
        }
        
        setDetectedColors(colors);
        setQualityWarning(data.qualityWarning || null);
        
        console.log('Vectorization successful:', {
          svgLength: data.svg.length,
          colorsDetected: colors.length,
          hasQualityWarning: !!data.qualityWarning
        });
      }
    } catch (error) {
      console.error('Vectorization error:', error);
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };





    

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="vectorizer-modal w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden flex flex-col resize">
          <DialogHeader className="flex-shrink-0">
            <CompleteTransferLogo size="xs" className="mb-1" />
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

            {/* Vectorization Settings */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4 text-gray-600" />
                <h3 className="font-medium text-gray-800">Vectorization Settings</h3>
              </div>
              
              {/* Processing Options */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-blue-600" />
                    <Label className="text-sm font-medium text-blue-800">
                      Processing Options
                    </Label>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => setShowCropInterface(true)}
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 flex items-center gap-2"
                  >
                    <Crop className="w-4 h-4" />
                    Crop First
                  </Button>
                  
                  <Button
                    onClick={processVectorization}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                    <Wand2 className="w-4 h-4" />
                    Vectorize Now
                  </Button>
                </div>
                
                <p className="text-xs text-blue-700 mt-2">
                  Choose to crop the image first or vectorize the entire image directly.
                </p>
              </div>
              
              {/* Tight Cropping */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crop className="w-4 h-4 text-gray-600" />
                  <Label htmlFor="tight-cropping" className="text-sm font-medium">
                    Auto Tight Cropping
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="tight-cropping"
                    checked={enableTightCropping}
                    onCheckedChange={setEnableTightCropping}
                    data-testid="switch-tight-cropping"
                  />
                  <span className="text-xs text-gray-500">
                    {enableTightCropping ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Automatically crop the vectorized result to remove excess whitespace and focus on the actual content.
              </p>
              
              {/* Shape Stacking Setting */}
              <div className="space-y-3 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-gray-600" />
                  <Label className="text-sm font-medium flex items-center gap-1">
                    Shape Stacking
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="w-3 h-3 text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Controls how deleted colors are handled:<br/>
                          • Cut-outs = Transparent holes (recommended)<br/>
                          • Stack = Black areas</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                </div>
                
                <div className="space-y-2 ml-6">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="shape-stacking-cutout"
                      name="shape-stacking"
                      value="cut_out"
                      checked={shapeStacking === 'cut_out'}
                      onChange={(e) => setShapeStacking(e.target.value as 'cut_out' | 'stack')}
                      className="text-primary focus:ring-primary"
                      data-testid="radio-shape-stacking-cutout"
                    />
                    <Label htmlFor="shape-stacking-cutout" className="text-sm text-gray-700 cursor-pointer">
                      Place shapes in cut-outs in shapes below
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="shape-stacking-stack"
                      name="shape-stacking"
                      value="stack"
                      checked={shapeStacking === 'stack'}
                      onChange={(e) => setShapeStacking(e.target.value as 'cut_out' | 'stack')}
                      className="text-primary focus:ring-primary"
                      data-testid="radio-shape-stacking-stack"
                    />
                    <Label htmlFor="shape-stacking-stack" className="text-sm text-gray-700 cursor-pointer">
                      Stack shapes on top of each other
                    </Label>
                  </div>
                </div>
                
                <p className="text-xs text-gray-600 ml-6">
                  {shapeStacking === 'cut_out' 
                    ? 'Deleted colors will create transparent holes (recommended for clean results)'
                    : 'Deleted colors will appear as black areas'
                  }
                </p>
              </div>
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
                          className="crop-interface"
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
            <div className="w-80 border-l border-gray-200 pl-4 flex flex-col overflow-hidden flex-shrink-0">
              {/* Color Management Section */}
              {detectedColors.length > 0 && (
                <>
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-5 h-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-800">
                        Color Tools ({detectedColors.length} colors)
                      </h3>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">
                      Click colors in the preview or use these tools to modify your vector:
                    </p>
                    
                    {/* Color Action Buttons */}
                    <div className="flex gap-2 mb-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isEyedropperActive ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setIsEyedropperActive(!isEyedropperActive);
                              setEyedropperColor(null);
                            }}
                            className={`flex-1 ${isEyedropperActive ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                            data-testid="button-eyedropper"
                          >
                            <Pipette className="w-3 h-3 mr-1" />
                            {isEyedropperActive ? 'Exit' : 'Recolor'}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isEyedropperActive ? 'Exit recolor mode' : 'Pick and apply colors'}</p>
                        </TooltipContent>
                      </Tooltip>
                      
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={undoLastDeletion}
                            disabled={deletionHistory.length === 0}
                            className="px-3"
                            data-testid="button-undo"
                          >
                            <Wand2 className="w-3 h-3 mr-1" />
                            Undo
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Undo last color change</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </>
              )}
              
              {detectedColors.length > 0 && (
                <div className="text-xs mb-4 p-3 bg-amber-50 border border-amber-200 rounded">
                  {isEyedropperActive ? (
                    <div className="flex items-center gap-1">
                      <Pipette className="w-3 h-3 text-blue-600" />
                      <span className="text-blue-700 font-medium">
                        Click any color below to see CMYK sliders appear in the sidebar
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        <Lock className="w-3 h-3 text-amber-600" />
                        <span className="text-gray-700 font-medium">Click colors in preview to lock/unlock them</span>
                      </div>
                      <div className="text-[10px] text-gray-600">
                        Locked colors (yellow border) are protected from deletion
                      </div>
                    </>
                  )}
                </div>
              )}
              
              {highlightedColor && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 border border-gray-300 rounded" 
                      style={{ backgroundColor: highlightedColor }}
                    />
                    <p className="text-sm text-red-700 font-medium">
                      Highlighting: {highlightedColor}
                    </p>
                  </div>
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
                            ? `Click to open CMYK color picker for ${colorItem.color}`
                            : `${colorItem.color} (${colorItem.count} elements) ${lockedColors.has(colorItem.color) ? '- LOCKED' : '- Click in preview to lock/unlock'}`
                        }
                        onClick={() => {
                          if (isEyedropperActive) {
                            // Highlight this color to show CMYK sliders in sidebar
                            setHighlightedColor(colorItem.color);
                            const currentSvg = coloredSvg || vectorSvg;
                            if (currentSvg) {
                              const highlighted = highlightColorInSvg(currentSvg, colorItem.color);
                              setHighlightedSvg(highlighted);
                            }
                            console.log(`🎨 Highlighting color for CMYK editing: ${colorItem.color}`);
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
                              
                              // Special handling for white colors - use smart background removal
                              let updatedSvg;
                              const isWhiteColor = colorItem.color.toLowerCase() === '#ffffff' || 
                                                  colorItem.color.toLowerCase() === '#fefefe' || 
                                                  colorItem.color.toLowerCase() === '#fdfdfd' || 
                                                  colorItem.color.toLowerCase() === '#fcfcfc' || 
                                                  colorItem.color.toLowerCase() === '#fbfbfb' ||
                                                  colorItem.color.toLowerCase() === 'white' ||
                                                  colorItem.color.toLowerCase() === 'rgb(255,255,255)' ||
                                                  colorItem.color.toLowerCase() === 'rgb(100%,100%,100%)';
                              
                              
                              // Always use proper color removal for individual color clicks
                              // This ensures Shape Stacking setting controls transparency vs black
                              updatedSvg = removeColorFromSvg(currentSvg, colorItem.color, shapeStacking);
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
                
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEyedropperActive(!isEyedropperActive);
                          if (!isEyedropperActive) {
                            setEyedropperColor(null);
                            toast({
                              title: "Eyedropper Activated",
                              description: "Click a color to pick it, then click another to apply it.",
                            });
                          } else {
                            setEyedropperColor(null);
                            toast({
                              title: "Eyedropper Deactivated",
                              description: "Color picking mode disabled.",
                            });
                          }
                        }}
                        className={`border-gray-600 text-gray-100 hover:bg-gray-700 ${
                          isEyedropperActive ? 'bg-blue-600 border-blue-500' : ''
                        }`}
                      >
                        <Pipette className="w-3 h-3 mr-1" />
                        Eyedropper
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle eyedropper mode to pick and apply colors</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEyedropperActive(false);
                          setEyedropperColor(null);
                          setHighlightedColor(null);
                          setHighlightedSvg(null);
                          setSvgRevision(prev => prev + 1);
                        }}
                        className="border-gray-600 text-gray-100 hover:bg-gray-700"
                      >
                        Clear
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Clear all selections and modes</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                
                
                {/* White Color Management */}
                <div className="grid grid-cols-1 gap-2 mb-3">
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
                      >Remove White Background</Button>
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
                              // Special handling for white colors - use smart background removal
                              const isWhiteColor = color.toLowerCase() === '#ffffff' || 
                                                  color.toLowerCase() === '#fefefe' || 
                                                  color.toLowerCase() === '#fdfdfd' || 
                                                  color.toLowerCase() === '#fcfcfc' || 
                                                  color.toLowerCase() === '#fbfbfb' ||
                                                  color.toLowerCase() === 'white' ||
                                                  color.toLowerCase() === 'rgb(255,255,255)' ||
                                                  color.toLowerCase() === 'rgb(100%,100%,100%)';
                              
                              
                              // Always use proper color removal for individual color clicks
                              // This ensures Shape Stacking setting controls transparency vs black
                              updatedSvg = removeColorFromSvg(updatedSvg, color, shapeStacking);
                              
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
    
    {/* Crop Interface Dialog */}
    <Dialog open={showCropInterface} onOpenChange={setShowCropInterface}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-5 h-5" />
            Pre-Crop Image: {fileName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Pre-Crop:</strong> Drag to select the area you want to vectorize. This removes background content before processing.
            </p>
          </div>
          
          {originalImageUrl && (
            <div className="flex-1 overflow-hidden bg-gray-100 rounded-lg relative">
              <SimpleCropInterface
                imageUrl={originalImageUrl}
                onCropChange={setCropArea}
                cropArea={cropArea}
                onApplyCrop={applyCropAndVectorize}
                isProcessing={isProcessing}
              />
            </div>
          )}
          
          <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
            <Button 
              onClick={() => setShowCropInterface(false)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
            
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => {
                  setCropArea(null);
                }}
                variant="outline"
                className="flex items-center gap-2"
              >
                Reset
              </Button>
              
              <Button 
                onClick={applyCropAndVectorize}
                disabled={!cropArea}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Check className="w-4 h-4" />
                Apply Crop & Vectorize
              </Button>
            </div>
          </div>
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