import { useRef, useEffect, useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Logo, CanvasElement, TemplateSize, ContentBounds } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Grid3X3, AlignCenter, Undo, Redo, Upload, Trash2, Maximize2, RotateCw, Move, ArrowRight, CheckSquare, Group, Ungroup } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

import { RasterWarningModal } from "./raster-warning-modal";
import { VectorizerModal } from "./vectorizer-modal";
import { useCleanupOrphanedElements } from '@/hooks/use-cleanup-orphaned-elements';
import SvgInlineRenderer from "./svg-inline-renderer";


// Import garment color utilities from shared module
import { gildanColors, fruitOfTheLoomColors, type ManufacturerColor } from "@shared/garment-colors";

function getColorName(hex: string): string {
  // Professional Colors (same as in garment color modal)
  const quickColors = [
    { name: "White", hex: "#FFFFFF" },
    { name: "Black", hex: "#171816" },
    { name: "Natural", hex: "#F3F0E4" },
    { name: "Pastel Yellow", hex: "#F3F590" },
    { name: "Yellow", hex: "#F0F42A" },
    { name: "Hi Viz", hex: "#D2E31D" },
    { name: "Hi Viz Orange", hex: "#D98F17" },
    { name: "HiViz Green", hex: "#388032" },
    { name: "HIViz Pink", hex: "#BF0072" },
    { name: "Sports Grey", hex: "#767878" },
    { name: "Light Grey Marl", hex: "#919393" },
    { name: "Ash Grey", hex: "#A6A9A2" },
    { name: "Light Grey", hex: "#BCBFBB" },
    { name: "Charcoal Grey", hex: "#353330" },
    { name: "Pastel Blue", hex: "#B9DBEA" },
    { name: "Sky Blue", hex: "#5998D4" },
    { name: "Navy", hex: "#201C3A" },
    { name: "Royal Blue", hex: "#221866" },
    { name: "Pastel Green", hex: "#B5D55E" },
    { name: "Lime Green", hex: "#90BF33" },
    { name: "Kelly Green", hex: "#3C8A35" },
    { name: "Pastel Pink", hex: "#E7BBD0" },
    { name: "Light Pink", hex: "#D287A2" },
    { name: "Fuchsia Pink", hex: "#C42469" },
    { name: "Red", hex: "#C02300" },
    { name: "Burgundy", hex: "#762009" },
    { name: "Purple", hex: "#4C0A6A" }
  ];
  
  // Check quick colors first
  const quickColor = quickColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  if (quickColor) {
    return quickColor.name;
  }

  // Check Gildan colors
  for (const group of gildanColors) {
    const gildanColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
    if (gildanColor) {
      return gildanColor.name; // Show just the name without code
    }
  }

  // Check Fruit of the Loom colors
  for (const group of fruitOfTheLoomColors) {
    const fotlColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
    if (fotlColor) {
      return fotlColor.name; // Show just the name without code
    }
  }

  // Convert hex to RGB for color analysis
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      };
    }
    return null;
  };

  // Generate descriptive color name for unmatched colors
  const rgb = hexToRgb(hex);
  if (rgb) {
    const { r, g, b } = rgb;
    
    // Determine the dominant color family
    if (r > g && r > b) {
      if (g > 100 && b < 50) return `Orange`;
      if (g < 100 && b < 100) return `Red`;
      if (g > 150 && b > 150) return `Pink`;
    } else if (g > r && g > b) {
      if (r < 100 && b < 100) return `Green`;
      if (r > 150 && b < 100) return `Yellow`;
    } else if (b > r && b > g) {
      if (r < 100 && g < 100) return `Blue`;
      if (r > 150 && g > 150) return `Purple`;
    } else if (r === g && g === b) {
      if (r < 50) return `Black`;
      if (r > 200) return `White`;
      return `Gray`;
    }
  }

  // If no pattern found, return hex code
  return hex;
}

interface CanvasWorkspaceProps {
  project: Project;
  template?: TemplateSize;
  logos: Logo[];
  canvasElements: CanvasElement[];
  selectedElements: CanvasElement[];
  onElementsSelect: (elements: CanvasElement[]) => void;
  onLogoUpload?: (files: File[]) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  maintainAspectRatio?: boolean;
  onContinue?: () => void;
  currentStep?: number;
  isFullscreen?: boolean;
  onReenterFullscreen?: () => void;
}

// Helper function to check if logo has valid content bounds
function hasValidContentBounds(logo: Logo): logo is Logo & { contentBounds: ContentBounds } {
  return logo.contentBounds != null && 
         typeof logo.contentBounds === 'object' &&
         'xMin' in logo.contentBounds &&
         'yMin' in logo.contentBounds &&
         'xMax' in logo.contentBounds &&
         'yMax' in logo.contentBounds &&
         typeof logo.contentBounds.xMin === 'number' &&
         typeof logo.contentBounds.yMin === 'number' &&
         typeof logo.contentBounds.xMax === 'number' &&
         typeof logo.contentBounds.yMax === 'number';
}

export default function CanvasWorkspace({
  project,
  template,
  logos,
  canvasElements,
  selectedElements,
  onElementsSelect,
  onLogoUpload,
  isUploading = false,
  uploadProgress = 0,
  maintainAspectRatio = true,
  onContinue,
  currentStep = 1,
  isFullscreen = false,
  onReenterFullscreen
}: CanvasWorkspaceProps) {
  // Helper to get first selected element (for backwards compatibility with single-select operations)
  const selectedElement = selectedElements.length > 0 ? selectedElements[0] : null;
  
  // Helper to check if an element is selected
  const isElementSelected = (elementId: string) => selectedElements.some(el => el.id === elementId);
  
  // Helper to select all elements
  const selectAllElements = () => {
    onElementsSelect([...canvasElements]);
  };
  
  // Helper to group selected elements
  const groupSelectedElements = async () => {
    if (selectedElements.length < 2) return;
    
    const groupId = `group-${Date.now()}`;
    
    // Update all selected elements with the same groupId
    for (const element of selectedElements) {
      await apiRequest("PATCH", `/api/canvas-elements/${element.id}`, { groupId });
    }
    
    // Optimistically update selected elements with new groupId
    const updatedSelection = selectedElements.map(el => ({ ...el, groupId }));
    onElementsSelect(updatedSelection);
    
    // Invalidate cache to refresh
    queryClient.invalidateQueries({ queryKey: ['/api/projects', project?.id, 'canvas-elements'] });
    toast({
      title: "Elements grouped",
      description: `${selectedElements.length} elements have been grouped together`,
    });
  };
  
  // Helper to ungroup selected elements
  const ungroupSelectedElements = async () => {
    const groupedElements = selectedElements.filter(el => el.groupId);
    if (groupedElements.length === 0) return;
    
    // Get all unique groupIds from selected elements
    const groupIds = new Set(groupedElements.map(el => el.groupId));
    
    // Find all elements with those groupIds (to ungroup entire groups)
    const elementsToUngroup = canvasElements.filter(el => el.groupId && groupIds.has(el.groupId));
    
    // Remove groupId from all elements in those groups
    for (const element of elementsToUngroup) {
      await apiRequest("PATCH", `/api/canvas-elements/${element.id}`, { groupId: null });
    }
    
    // Optimistically update selected elements to clear groupId
    const ungroupedIds = new Set(elementsToUngroup.map(e => e.id));
    const updatedSelection = selectedElements.map(el => 
      ungroupedIds.has(el.id) ? { ...el, groupId: null } : el
    );
    onElementsSelect(updatedSelection);
    
    // Invalidate cache to refresh
    queryClient.invalidateQueries({ queryKey: ['/api/projects', project?.id, 'canvas-elements'] });
    toast({
      title: "Elements ungrouped",
      description: `${elementsToUngroup.length} elements have been ungrouped`,
    });
  };
  
  // Check if any selected elements are in a group
  const hasGroupedElements = selectedElements.some(el => el.groupId);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Core UI state
  const [zoom, setZoom] = useState(75); // Start at higher zoom for better visibility
 // Default to OFF (RGB preview)
  const [showGrid, setShowGrid] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  
  // File upload state
  const [pendingRasterFile, setPendingRasterFile] = useState<{ file: File; fileName: string } | null>(null);
  const [showRasterWarning, setShowRasterWarning] = useState(false);
  const [showVectorizer, setShowVectorizer] = useState(false);

  // Debug: Monitor state changes
  useEffect(() => {
    console.log('Canvas state update:', { showVectorizer, hasPendingRasterFile: !!pendingRasterFile });
  }, [showVectorizer, pendingRasterFile]);
  
  // Canvas dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Canvas element resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [initialSize, setInitialSize] = useState({ width: 0, height: 0 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });
  const [initialMousePos, setInitialMousePos] = useState({ x: 0, y: 0 });
  // Store computed local handle at resize start (stable during drag)
  const localHandleRef = useRef<string | null>(null);
  // Store initial positions of ALL selected elements for group dragging - use REFS for synchronous access
  const initialElementPositionsRef = useRef<Map<string, {x: number, y: number}>>(new Map());
  const initialDragMousePosRef = useRef({ x: 0, y: 0 });
  const dragMmToPixelRatioRef = useRef(1);
  const dragSelectedElementIdsRef = useRef<string[]>([]); // Store IDs of elements being dragged
  
  // Keep a ref to the latest selectedElements to avoid stale closures
  const selectedElementsRef = useRef(selectedElements);
  useEffect(() => {
    selectedElementsRef.current = selectedElements;
  }, [selectedElements]);
  
  // Group resize/rotate state - store initial state of all group elements (IMMUTABLE during operation)
  const groupResizeStateRef = useRef<{
    groupBounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; centerX: number; centerY: number };
    elements: Map<string, { x: number; y: number; width: number; height: number; rotation: number; offsetX: number; offsetY: number }>;
    groupRotation: number;
  } | null>(null);
  const isGroupResize = useRef(false);
  
  // History state for undo/redo functionality
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // History management
  const saveToHistory = useCallback((elements: CanvasElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...elements]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

 // Canvas rotation in degrees

  // Helper function for optimistic updates with fallback
  const updateElementDirect = useCallback(async (id: string, updates: Partial<CanvasElement>, saveHistory = true) => {
    try {
      console.log('Canvas updateElementDirect called:', { id, updates });
      
      // Save current state to history before making changes (but only if not from undo/redo)
      if (saveHistory && canvasElements) {
        saveToHistory(canvasElements);
      }
      
      // Optimistic update for immediate visual feedback
      queryClient.setQueryData(
        ["/api/projects", project.id, "canvas-elements"],
        (oldData: CanvasElement[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(element =>
            element.id === id ? { ...element, ...updates } : element
          );
        }
      );

      // Send update to server
      const response = await fetch(`/api/canvas-elements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        console.error('Failed to update element - server error:', response.status);
        // Revert optimistic update on failure
        queryClient.invalidateQueries({
          queryKey: ["/api/projects", project.id, "canvas-elements"]
        });
      } else {
        console.log('✅ Canvas API update successful');
      }
    } catch (error) {
      console.error('Failed to update element:', error);
      // Revert optimistic update on error
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", project.id, "canvas-elements"]
      });
    }
  }, [canvasElements, saveToHistory, queryClient, project.id]);

  // No longer need server-side color management - using CSS filters instead

  // Delete element mutation
  const deleteElementMutation = useMutation({
    mutationFn: async (elementId: string) => {
      const response = await apiRequest("DELETE", `/api/canvas-elements/${elementId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "canvas-elements"] });
      onElementsSelect([]); // Deselect the deleted element
    },
  });

  const handleZoomIn = () => {
    setZoom(Math.min(zoom + 10, 400));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(zoom - 10, 25));
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      
      // Apply the previous state to all canvas elements (don't save to history)
      previousState.forEach(historicalElement => {
        updateElementDirect(historicalElement.id, {
          x: historicalElement.x,
          y: historicalElement.y,
          width: historicalElement.width,
          height: historicalElement.height,
          rotation: historicalElement.rotation
        }, false);
      });
    }
  }, [historyIndex, history, updateElementDirect]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      
      // Apply the next state to all canvas elements (don't save to history)
      nextState.forEach(historicalElement => {
        updateElementDirect(historicalElement.id, {
          x: historicalElement.x,
          y: historicalElement.y,
          width: historicalElement.width,
          height: historicalElement.height,
          rotation: historicalElement.rotation
        }, false);
      });
    }
  }, [historyIndex, history, updateElementDirect]);

  // Helper function to detect raster files
  const isRasterFile = (file: File): boolean => {
    return file.type === 'image/png' || file.type === 'image/jpeg';
  };
  
  // Helper function to detect vector files
  const isVectorFile = (file: File): boolean => {
    return file.type === 'image/svg+xml' || file.type === 'application/pdf';
  };

  // Handle file uploads with raster detection
  const handleCanvasFileUpload = (files: File[]) => {
    const rasterFiles = files.filter(isRasterFile);
    const vectorFiles = files.filter(file => !isRasterFile(file));
    
    // Process vector files immediately with notification
    if (vectorFiles.length > 0 && onLogoUpload) {
      onLogoUpload(vectorFiles);
      // Show color workflow notification for vector files
      toast({
        title: "Vector Files Uploaded",
        description: "CMYK colors will be preserved. RGB colors will be converted to CMYK for accurate print output.",
        variant: "default",
      });
    }
    
    // Handle raster files one by one with warning modal
    if (rasterFiles.length > 0) {
      const firstRasterFile = rasterFiles[0];
      setPendingRasterFile({ file: firstRasterFile, fileName: firstRasterFile.name });
      setShowRasterWarning(true);
    }
  };

  // Initialize toast
  const { toast } = useToast();

  // Automatic cleanup of orphaned canvas elements
  useCleanupOrphanedElements({
    projectId: project.id,
    canvasElements,
    logos
  });

  // Raster warning modal handlers
  const handlePhotographicApprove = async () => {
    if (pendingRasterFile && onLogoUpload) {
      // Store the file name to mark as photographic after upload
      const fileName = pendingRasterFile.file.name;
      
      onLogoUpload([pendingRasterFile.file]);
      
      // Wait a moment for upload to complete, then mark as photographic
      setTimeout(async () => {
        try {
          // Find the uploaded logo by filename
          const uploadedLogo = logos.find(logo => logo.originalName === fileName);
          if (uploadedLogo) {
            // Mark the logo as photographic
            await fetch(`/api/logos/${uploadedLogo.id}/photographic`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isPhotographic: true })
            });
            
            // Refresh logos to get updated data
            queryClient?.invalidateQueries({ queryKey: ["/api/projects", project.id, "logos"] });
          }
        } catch (error) {
          console.error('Failed to mark logo as photographic:', error);
        }
      }, 1000);
      
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleVectorizeWithAI = useCallback(() => {
    console.log('handleVectorizeWithAI called', { pendingRasterFile: !!pendingRasterFile, showVectorizer });
    if (pendingRasterFile) {
      console.log('Setting vectorizer modal to true');
      // Important: Close warning modal first, then open vectorizer
      setShowRasterWarning(false);
      setShowVectorizer(true);
    }
  }, [pendingRasterFile]);

  const handleVectorizeWithService = () => {
    if (pendingRasterFile) {
      // Show message about vectorization service
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleVectorDownload = async (vectorSvg: string) => {
    console.log('handleVectorDownload called', { hasPendingRasterFile: !!pendingRasterFile, hasOnLogoUpload: !!onLogoUpload });
    if (pendingRasterFile && onLogoUpload) {
      // Convert SVG string to File object
      const svgBlob = new Blob([vectorSvg], { type: 'image/svg+xml' });
      const svgFile = new File([svgBlob], pendingRasterFile.fileName.replace(/\.(png|jpg|jpeg)$/i, '.svg') || 'vectorized.svg', {
        type: 'image/svg+xml'
      });
      
      console.log('Uploading vectorized SVG:', svgFile.name, svgFile.type, svgFile.size);
      
      try {
        // Find the old raster logo that needs to be replaced
        const oldRasterLogo = logos.find(logo => 
          logo.originalName === pendingRasterFile.fileName || 
          logo.filename === pendingRasterFile.fileName
        );
        
        // Upload the new vectorized SVG
        onLogoUpload([svgFile]);
        
        // If we found the old logo, we'll need to update canvas elements to reference the new one
        // This will be handled after the upload completes via the useEffect that watches logos
        if (oldRasterLogo) {
          console.log('Found old raster logo to replace:', oldRasterLogo.id);
        }
        
        setPendingRasterFile(null);
        setShowVectorizer(false);
      } catch (error) {
        console.error('Error handling vector download:', error);
        setPendingRasterFile(null);
        setShowVectorizer(false);
      }
    }
  };

  const handleCloseRasterWarning = () => {
    // Only clear pendingRasterFile if we're truly closing (not transitioning to vectorizer)
    setShowRasterWarning(false);
    // Give time for the vectorizer modal to open before clearing the file
    setTimeout(() => {
      if (!showVectorizer) {
        setPendingRasterFile(null);
      }
    }, 100);
  };

  const handleCloseVectorizer = () => {
    setPendingRasterFile(null);
    setShowVectorizer(false);
  };



  // Save to history when elements change (but avoid infinite loops)
  useEffect(() => {
    if (canvasElements.length > 0 && history.length === 0) {
      saveToHistory(canvasElements);
    }
  }, [canvasElements]);

  // Add keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        handleRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Add clipboard paste support for SVG import from Illustrator
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      // Only process paste if canvas area is focused (not in input fields)
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      console.log('📋 Paste event detected');
      
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        console.log('⚠️ No clipboard data');
        return;
      }

      // Try to get SVG from clipboard
      let svgContent: string | null = null;
      
      // Check for SVG in different clipboard types
      const types = clipboardData.types;
      console.log('📋 Clipboard types:', types);

      // Try text/plain FIRST (Illustrator puts SVG here)
      if (types.includes('text/plain')) {
        const text = clipboardData.getData('text/plain');
        console.log('📋 text/plain content length:', text.length);
        console.log('📋 text/plain starts with:', text.substring(0, 100));
        // Check if contains SVG (may start with <?xml or <svg)
        if (text.includes('<svg') && text.includes('</svg>')) {
          svgContent = text;
          console.log('✅ Found SVG in text/plain');
        }
      }
      // Try text/html (fallback)
      if (!svgContent && types.includes('text/html')) {
        const html = clipboardData.getData('text/html');
        console.log('📋 text/html content length:', html.length);
        // Extract SVG from HTML if present
        const svgMatch = html.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
        if (svgMatch) {
          svgContent = svgMatch[0];
          console.log('✅ Extracted SVG from text/html');
        }
      }
      // Try image/svg+xml (least reliable)
      if (!svgContent && types.includes('image/svg+xml')) {
        const svg = clipboardData.getData('image/svg+xml');
        console.log('📋 image/svg+xml content length:', svg.length);
        if (svg) {
          svgContent = svg;
          console.log('✅ Found SVG in image/svg+xml');
        }
      }

      if (!svgContent) {
        console.log('ℹ️ No SVG content found in clipboard');
        return;
      }

      event.preventDefault();
      console.log('🎯 Processing pasted SVG content');

      try {
        // CRITICAL FIX: Trim leading/trailing whitespace (Illustrator adds tab before <?xml)
        // XML declaration MUST be the absolute first thing in the file
        svgContent = svgContent.trim();
        
        // Create a File object from the SVG string
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const filename = `pasted-artwork-${Date.now()}.svg`;
        const file = new File([blob], filename, { type: 'image/svg+xml' });

        console.log('📦 Created file from pasted SVG:', filename);

        // Show success toast
        toast({
          title: "✅ SVG Pasted",
          description: "Artwork imported from clipboard with perfect dimensions!",
        });

        // Upload using existing handler
        if (onLogoUpload) {
          onLogoUpload([file]);
        }
      } catch (error) {
        console.error('❌ Failed to process pasted SVG:', error);
        toast({
          variant: "destructive",
          title: "❌ Paste Failed",
          description: "Could not import SVG from clipboard. Try uploading the file instead.",
        });
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onLogoUpload, toast]);

  // Color management now handled purely with CSS filters - no server processing needed

  // Function to get the image URL for display
  const getImageUrl = (logo: Logo): string => {
    // For complex files using PNG fallback (e.g., very complex PDFs >15000 paths)
    // The filename already points to the _preview.png file
    if ((logo as any).isComplexFilePngFallback) {
      console.log('📷 Using complex file PNG preview:', logo.filename);
      return `/uploads/${logo.filename}`;
    }
    
    // For PDF files, check if we have a preview image (for CMYK PDFs)
    if (logo.mimeType === 'application/pdf') {
      // Check if a preview filename exists (for CMYK PDFs)
      if ((logo as any).previewFilename) {
        return `/uploads/${(logo as any).previewFilename}`;
      }
      // Otherwise, check if SVG conversion exists (for RGB PDFs)
      if (logo.filename.endsWith('.svg')) {
        return `/uploads/${logo.filename}`;
      }
      // Check if .svg version exists
      return `/uploads/${logo.filename}.svg`;
    }
    // For SVG and other image files, use original
    return `/uploads/${logo.filename}`;
  };

  const handleElementClick = (element: CanvasElement, event: React.MouseEvent) => {
    event.stopPropagation();
    
    // If element is in a group, get all elements in that group
    const getGroupElements = (el: CanvasElement): CanvasElement[] => {
      if (el.groupId) {
        return canvasElements.filter(ce => ce.groupId === el.groupId);
      }
      return [el];
    };
    
    const elementsToSelect = getGroupElements(element);
    
    // Shift+click for multi-select
    if (event.shiftKey) {
      if (isElementSelected(element.id)) {
        // Deselect entire group if already selected
        const groupIds = new Set(elementsToSelect.map(e => e.id));
        onElementsSelect(selectedElements.filter(el => !groupIds.has(el.id)));
      } else {
        // Add entire group to selection
        const existingIds = new Set(selectedElements.map(e => e.id));
        const newElements = elementsToSelect.filter(e => !existingIds.has(e.id));
        onElementsSelect([...selectedElements, ...newElements]);
      }
    } else {
      // Regular click - select entire group
      onElementsSelect(elementsToSelect);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent) => {
    // Only deselect if clicking on the canvas itself, not on child elements
    if (event.target === event.currentTarget) {
      onElementsSelect([]);
    }
  };

  const handleResizeStart = (event: React.MouseEvent, element: CanvasElement, handle: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!canvasRef.current || !template) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleFactor = zoom / 100;
    let mmToPixelRatio = template.pixelWidth / template.width;
    
    // Use proper DPI for PDF-derived elements
    const isPdfDerived = element.width > 200 || element.height > 200;
    if (isPdfDerived) {
      mmToPixelRatio = 2.834645669; // 72 DPI conversion
    }
    
    // Capture initial mouse position in mm coordinates
    const mouseX = (event.clientX - rect.left) / scaleFactor / mmToPixelRatio;
    const mouseY = (event.clientY - rect.top) / scaleFactor / mmToPixelRatio;
    
    setIsResizing(true);
    setResizeHandle(handle);
    setInitialMousePos({ x: mouseX, y: mouseY });
    
    // Check if we're resizing multiple selected elements (group resize)
    console.log('🔍 handleResizeStart - selectedElements.length:', selectedElements.length, 'ids:', selectedElements.map(e => e.id));
    if (selectedElements.length > 1) {
      isGroupResize.current = true;
      console.log('✅ Group resize detected');
      
      // Save history once at start
      if (canvasElements) {
        saveToHistory(canvasElements);
      }
      
      // Determine group rotation from the first element (all grouped elements share rotation)
      const groupRotation = selectedElements[0]?.rotation || 0;
      
      // Calculate group bounding box using VISUAL (rotation-aware) dimensions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selectedElements.forEach(el => {
        const rot = el.rotation || 0;
        const isSwapped = rot === 90 || rot === 270;
        const visualW = isSwapped ? el.height : el.width;
        const visualH = isSwapped ? el.width : el.height;
        const left = el.x - visualW / 2;
        const right = el.x + visualW / 2;
        const top = el.y - visualH / 2;
        const bottom = el.y + visualH / 2;
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
      });
      
      const groupWidth = maxX - minX;
      const groupHeight = maxY - minY;
      const groupCenterX = (minX + maxX) / 2;
      const groupCenterY = (minY + maxY) / 2;
      
      // Store each element's ABSOLUTE initial position, size, and offset from group center
      const elements = new Map<string, { x: number; y: number; width: number; height: number; rotation: number; offsetX: number; offsetY: number }>();
      selectedElements.forEach(el => {
        elements.set(el.id, {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          rotation: el.rotation || 0,
          offsetX: el.x - groupCenterX,
          offsetY: el.y - groupCenterY,
        });
      });
      
      groupResizeStateRef.current = {
        groupBounds: { minX, minY, maxX, maxY, width: groupWidth, height: groupHeight, centerX: groupCenterX, centerY: groupCenterY },
        elements,
        groupRotation,
      };
      
      // Use group bounds as initial size
      setInitialSize({ width: groupWidth, height: groupHeight });
      setInitialPosition({ x: groupCenterX, y: groupCenterY });
    } else {
      // Single element resize - clear group state explicitly
      isGroupResize.current = false;
      groupResizeStateRef.current = null;
      setInitialSize({ width: element.width, height: element.height });
      setInitialPosition({ x: element.x, y: element.y });
      // Handles are already in local space (positioned on the rotated element)
      // No mapping needed - just store the handle directly
      localHandleRef.current = handle;
    }
    
    if (!isElementSelected(element.id)) {
      onElementsSelect([element]);
    }
  };

  const handleMouseDown = (element: CanvasElement, event: React.MouseEvent) => {
    if (!element) return;
    
    console.log(`🎯 Mouse down on element ${element.id}, starting drag, shiftKey=${event.shiftKey}`);
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
    
    // Helper to get all elements in same group
    const getGroupElements = (el: CanvasElement): CanvasElement[] => {
      if (el.groupId) {
        return canvasElements.filter(ce => ce.groupId === el.groupId);
      }
      return [el];
    };
    
    const elementsToSelect = getGroupElements(element);
    
    // Handle selection based on shift key
    if (event.shiftKey) {
      // Shift+click: toggle selection of entire group
      if (isElementSelected(element.id)) {
        // Already selected - remove entire group from selection
        const groupIds = new Set(elementsToSelect.map(e => e.id));
        onElementsSelect(selectedElements.filter(el => !groupIds.has(el.id)));
      } else {
        // Add entire group to selection
        const existingIds = new Set(selectedElements.map(e => e.id));
        const newElements = elementsToSelect.filter(e => !existingIds.has(e.id));
        onElementsSelect([...selectedElements, ...newElements]);
      }
    } else if (!isElementSelected(element.id)) {
      // Regular click on unselected element - select entire group
      onElementsSelect(elementsToSelect);
    }
    // If element is already selected (without shift), keep current selection for group drag
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect && template) {
      // Convert mm to pixels for drag offset calculation
      let mmToPixelRatio = template.pixelWidth / template.width;
      
      // Use proper DPI for PDF-derived elements
      const isPdfDerived = element.width > 200 || element.height > 200;
      if (isPdfDerived) {
        mmToPixelRatio = 2.834645669; // 72 DPI conversion
      }
      // Convert element center position to screen coordinates
      // Account for bleed margin offset if present
      const bleedMm = (template as any).bleedMargin || 0;
      const bleedOffset = bleedMm * mmToPixelRatio * (zoom / 100);
      const templateCenterX = (template.width * mmToPixelRatio * (zoom / 100)) / 2 + bleedOffset;
      const templateCenterY = (template.height * mmToPixelRatio * (zoom / 100)) / 2 + bleedOffset;
      const elementCenterX = templateCenterX + element.x * mmToPixelRatio * (zoom / 100);
      const elementCenterY = templateCenterY + element.y * mmToPixelRatio * (zoom / 100);
      
      // Calculate drag offset from mouse to element center
      const dragOffsetX = event.clientX - rect.left - elementCenterX;
      const dragOffsetY = event.clientY - rect.top - elementCenterY;
      
      console.log(`🎯 Drag offset calculated: (${dragOffsetX.toFixed(1)}, ${dragOffsetY.toFixed(1)})`);
      setDragOffset({
        x: dragOffsetX,
        y: dragOffsetY
      });
      
      // Store initial mouse position in mm for group dragging - use REFS for synchronous access
      const mouseXmm = (event.clientX - rect.left) / (zoom / 100) / mmToPixelRatio;
      const mouseYmm = (event.clientY - rect.top) / (zoom / 100) / mmToPixelRatio;
      initialDragMousePosRef.current = { x: mouseXmm, y: mouseYmm };
      dragMmToPixelRatioRef.current = mmToPixelRatio;
      
      // Determine which elements are being dragged (including all grouped elements)
      const groupElementIds = elementsToSelect.map(e => e.id);
      let currentSelectionIds: string[];
      
      if (event.shiftKey) {
        if (isElementSelected(element.id)) {
          // Remove entire group from selection
          const groupIdSet = new Set(groupElementIds);
          currentSelectionIds = selectedElements.filter(el => !groupIdSet.has(el.id)).map(el => el.id);
        } else {
          // Add entire group to selection
          const existingIds = new Set(selectedElements.map(e => e.id));
          const newIds = groupElementIds.filter(id => !existingIds.has(id));
          currentSelectionIds = [...selectedElements.map(el => el.id), ...newIds];
        }
      } else {
        currentSelectionIds = isElementSelected(element.id) 
          ? selectedElements.map(el => el.id) 
          : groupElementIds;
      }
      
      // Save history ONCE at drag start for undo capability
      if (canvasElements) {
        saveToHistory(canvasElements);
      }
      
      // Get positions from canvasElements (source of truth), not from selectedElements
      const positions = new Map<string, {x: number, y: number}>();
      currentSelectionIds.forEach(id => {
        const el = canvasElements?.find(ce => ce.id === id);
        if (el) {
          positions.set(id, { x: el.x, y: el.y });
        }
      });
      initialElementPositionsRef.current = positions;
      dragSelectedElementIdsRef.current = currentSelectionIds;
      console.log(`🎯 Stored initial positions for ${positions.size} elements:`, Array.from(positions.entries()));
    }
  };

  useEffect(() => {
    let updateTimeout: NodeJS.Timeout;

    const handleMouseMove = (event: MouseEvent) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleFactor = zoom / 100;

      // Clear previous timeout
      clearTimeout(updateTimeout);

      // Use requestAnimationFrame for smoother updates instead of setTimeout
      requestAnimationFrame(() => {
        if (isDragging && template && initialElementPositionsRef.current.size > 0) {
          // Use the SAME mmToPixelRatio that was stored at drag start for consistent delta calculation
          const mmToPixelRatio = dragMmToPixelRatioRef.current;
          
          // Convert current mouse position to mm coordinates using same ratio as initial
          const mouseX = (event.clientX - rect.left) / scaleFactor / mmToPixelRatio;
          const mouseY = (event.clientY - rect.top) / scaleFactor / mmToPixelRatio;
          
          // Calculate displacement from initial mouse position (in mm)
          const deltaX = mouseX - initialDragMousePosRef.current.x;
          const deltaY = mouseY - initialDragMousePosRef.current.y;
          
          // Move ALL selected elements by adding delta to their INITIAL positions
          // Use the element IDs stored at drag start, not from React state (which may be stale)
          dragSelectedElementIdsRef.current.forEach(elementId => {
            const initialPos = initialElementPositionsRef.current.get(elementId);
            if (initialPos) {
              const newX = initialPos.x + deltaX;
              const newY = initialPos.y + deltaY;
              
              // Use more precise rounding for smoother dragging
              // Don't save history during drag - only at drag start/end
              updateElementDirect(elementId, { 
                x: Math.round(newX * 10) / 10, 
                y: Math.round(newY * 10) / 10
              }, false);
            }
          });
        } else if (isResizing && resizeHandle && template) {
          // Convert pixels back to mm for storage
          let mmToPixelRatio = template.pixelWidth / template.width;
          
          // Use proper DPI for PDF-derived elements (check first selected element)
          const refElement = selectedElement || selectedElements[0];
          if (refElement) {
            const isPdfDerived = refElement.width > 200 || refElement.height > 200;
            if (isPdfDerived) {
              mmToPixelRatio = 2.834645669; // 72 DPI conversion
            }
          }
          const mouseX = (event.clientX - rect.left) / scaleFactor / mmToPixelRatio;
          const mouseY = (event.clientY - rect.top) / scaleFactor / mmToPixelRatio;

          // Calculate delta from initial mouse position (screen space)
          const deltaX = mouseX - initialMousePos.x;
          const deltaY = mouseY - initialMousePos.y;

          // For group resize with rotated elements, remap handle from local to screen space
          // CSS rotate(90deg) CW: local NW→screen NE, local E→screen S, etc.
          let effectiveHandle = resizeHandle;
          if (isGroupResize.current && groupResizeStateRef.current) {
            const gr = groupResizeStateRef.current.groupRotation;
            if (gr === 90) {
              const map: Record<string, string> = { nw: 'ne', n: 'e', ne: 'se', e: 's', se: 'sw', s: 'w', sw: 'nw', w: 'n' };
              effectiveHandle = map[resizeHandle] || resizeHandle;
            } else if (gr === 180) {
              const map: Record<string, string> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };
              effectiveHandle = map[resizeHandle] || resizeHandle;
            } else if (gr === 270) {
              const map: Record<string, string> = { nw: 'sw', n: 'w', ne: 'nw', e: 'n', se: 'ne', s: 'e', sw: 'se', w: 's' };
              effectiveHandle = map[resizeHandle] || resizeHandle;
            }
          }

          // Calculate new group/element dimensions based on resize handle
          let newWidth = initialSize.width;
          let newHeight = initialSize.height;
          let newCenterX = initialPosition.x;
          let newCenterY = initialPosition.y;

          // Calculate aspect ratio from initial size
          const aspectRatio = initialSize.width / initialSize.height;
          
          // Calculate new dimensions based on resize handle using deltas
          switch (effectiveHandle) {
            case 'se': // Southeast
              newWidth = Math.max(20, initialSize.width + deltaX);
              newHeight = Math.max(20, initialSize.height + deltaY);
              if (maintainAspectRatio) {
                const widthChange = Math.abs(deltaX);
                const heightChange = Math.abs(deltaY);
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newWidth = newHeight * aspectRatio;
                }
              }
              // Center moves by half the size change
              newCenterX = initialPosition.x + (newWidth - initialSize.width) / 2;
              newCenterY = initialPosition.y + (newHeight - initialSize.height) / 2;
              break;
              
            case 'sw': // Southwest
              newWidth = Math.max(20, initialSize.width - deltaX);
              newHeight = Math.max(20, initialSize.height + deltaY);
              if (maintainAspectRatio) {
                const widthChange = Math.abs(deltaX);
                const heightChange = Math.abs(deltaY);
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newWidth = newHeight * aspectRatio;
                }
              }
              newCenterX = initialPosition.x - (newWidth - initialSize.width) / 2;
              newCenterY = initialPosition.y + (newHeight - initialSize.height) / 2;
              break;
              
            case 'ne': // Northeast
              newWidth = Math.max(20, initialSize.width + deltaX);
              newHeight = Math.max(20, initialSize.height - deltaY);
              if (maintainAspectRatio) {
                const widthChange = Math.abs(deltaX);
                const heightChange = Math.abs(deltaY);
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newWidth = newHeight * aspectRatio;
                }
              }
              newCenterX = initialPosition.x + (newWidth - initialSize.width) / 2;
              newCenterY = initialPosition.y - (newHeight - initialSize.height) / 2;
              break;
              
            case 'nw': // Northwest
              newWidth = Math.max(20, initialSize.width - deltaX);
              newHeight = Math.max(20, initialSize.height - deltaY);
              if (maintainAspectRatio) {
                const widthChange = Math.abs(deltaX);
                const heightChange = Math.abs(deltaY);
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newWidth = newHeight * aspectRatio;
                }
              }
              newCenterX = initialPosition.x - (newWidth - initialSize.width) / 2;
              newCenterY = initialPosition.y - (newHeight - initialSize.height) / 2;
              break;
              
            case 'e': // East
              newWidth = Math.max(20, initialSize.width + deltaX);
              if (maintainAspectRatio) {
                newHeight = newWidth / aspectRatio;
              }
              newCenterX = initialPosition.x + (newWidth - initialSize.width) / 2;
              break;
              
            case 'w': // West
              newWidth = Math.max(20, initialSize.width - deltaX);
              if (maintainAspectRatio) {
                newHeight = newWidth / aspectRatio;
              }
              newCenterX = initialPosition.x - (newWidth - initialSize.width) / 2;
              break;
              
            case 'n': // North
              newHeight = Math.max(20, initialSize.height - deltaY);
              if (maintainAspectRatio) {
                newWidth = newHeight * aspectRatio;
              }
              newCenterY = initialPosition.y - (newHeight - initialSize.height) / 2;
              break;
              
            case 's': // South
              newHeight = Math.max(20, initialSize.height + deltaY);
              if (maintainAspectRatio) {
                newWidth = newHeight * aspectRatio;
              }
              newCenterY = initialPosition.y + (newHeight - initialSize.height) / 2;
              break;
          }

          // GROUP RESIZE: Scale all elements proportionally using IMMUTABLE initial state
          if (isGroupResize.current && groupResizeStateRef.current) {
            const groupState = groupResizeStateRef.current;
            const initialGroupWidth = groupState.groupBounds.width;
            const initialGroupHeight = groupState.groupBounds.height;
            const { minX, minY, maxX, maxY } = groupState.groupBounds;
            
            // Calculate scale factors from initial group size
            const scaleX = newWidth / (initialGroupWidth || 1);
            const scaleY = newHeight / (initialGroupHeight || 1);
            
            console.log('🔄 Group resize - initialSize:', initialSize, 'groupBounds:', groupState.groupBounds);
            console.log('🔄 Group resize - newWidth:', newWidth, 'newHeight:', newHeight, 'scaleX:', scaleX.toFixed(3), 'scaleY:', scaleY.toFixed(3));
            
            // Determine anchor point based on the EFFECTIVE (screen-space) handle
            let anchorX = minX;
            let anchorY = minY;
            
            switch (effectiveHandle) {
              case 'se':
                anchorX = minX;
                anchorY = minY;
                break;
              case 'sw':
                anchorX = maxX;
                anchorY = minY;
                break;
              case 'ne':
                anchorX = minX;
                anchorY = maxY;
                break;
              case 'nw':
                anchorX = maxX;
                anchorY = maxY;
                break;
              case 'e':
                anchorX = minX;
                anchorY = (minY + maxY) / 2;
                break;
              case 'w':
                anchorX = maxX;
                anchorY = (minY + maxY) / 2;
                break;
              case 'n':
                anchorX = (minX + maxX) / 2;
                anchorY = maxY;
                break;
              case 's':
                anchorX = (minX + maxX) / 2;
                anchorY = minY;
                break;
            }
            
            // Update each element using its IMMUTABLE initial state
            groupState.elements.forEach((initial, elementId) => {
              const offsetFromAnchorX = initial.x - anchorX;
              const offsetFromAnchorY = initial.y - anchorY;
              
              const scaledOffsetX = offsetFromAnchorX * scaleX;
              const scaledOffsetY = offsetFromAnchorY * scaleY;
              
              const newElX = anchorX + scaledOffsetX;
              const newElY = anchorY + scaledOffsetY;
              
              // For rotated elements, swap scale axes for stored dimensions
              // Screen scaleX affects visual width, which is stored height for 90°/270° rotated elements
              const isSwapped = initial.rotation === 90 || initial.rotation === 270;
              const newElWidth = Math.max(10, initial.width * (isSwapped ? scaleY : scaleX));
              const newElHeight = Math.max(10, initial.height * (isSwapped ? scaleX : scaleY));
              
              console.log(`📐 Resizing element ${elementId}: initial(${initial.x.toFixed(1)}, ${initial.y.toFixed(1)}) anchor(${anchorX.toFixed(1)}, ${anchorY.toFixed(1)}) -> new(${newElX.toFixed(1)}, ${newElY.toFixed(1)})`);
              
              updateElementDirect(elementId, { 
                x: Math.round(newElX * 10) / 10,
                y: Math.round(newElY * 10) / 10,
                width: Math.round(newElWidth * 10) / 10, 
                height: Math.round(newElHeight * 10) / 10
              }, false);
            });
          } else if (selectedElement) {
            // SINGLE ELEMENT RESIZE with proper rotation handling
            const rotation = selectedElement.rotation || 0;
            const rotationRad = (rotation * Math.PI) / 180;
            const cosR = Math.cos(rotationRad);
            const sinR = Math.sin(rotationRad);
            
            // Use the pre-computed local handle (stable during drag)
            const localHandle = localHandleRef.current || resizeHandle;
            
            // Transform screen deltas to element-local coordinates
            const cosInv = Math.cos(-rotationRad);
            const sinInv = Math.sin(-rotationRad);
            const localDeltaX = deltaX * cosInv - deltaY * sinInv;
            const localDeltaY = deltaX * sinInv + deltaY * cosInv;
            
            // Calculate new dimensions and local center offset based on LOCAL handle
            let singleNewWidth = initialSize.width;
            let singleNewHeight = initialSize.height;
            let localOffsetX = 0;
            let localOffsetY = 0;
            
            switch (localHandle) {
              case 'se':
                singleNewWidth = Math.max(20, initialSize.width + localDeltaX);
                singleNewHeight = Math.max(20, initialSize.height + localDeltaY);
                if (maintainAspectRatio) {
                  if (Math.abs(localDeltaX) > Math.abs(localDeltaY)) {
                    singleNewHeight = singleNewWidth / aspectRatio;
                  } else {
                    singleNewWidth = singleNewHeight * aspectRatio;
                  }
                }
                localOffsetX = (singleNewWidth - initialSize.width) / 2;
                localOffsetY = (singleNewHeight - initialSize.height) / 2;
                break;
              case 'sw':
                singleNewWidth = Math.max(20, initialSize.width - localDeltaX);
                singleNewHeight = Math.max(20, initialSize.height + localDeltaY);
                if (maintainAspectRatio) {
                  if (Math.abs(localDeltaX) > Math.abs(localDeltaY)) {
                    singleNewHeight = singleNewWidth / aspectRatio;
                  } else {
                    singleNewWidth = singleNewHeight * aspectRatio;
                  }
                }
                localOffsetX = -(singleNewWidth - initialSize.width) / 2;
                localOffsetY = (singleNewHeight - initialSize.height) / 2;
                break;
              case 'ne':
                singleNewWidth = Math.max(20, initialSize.width + localDeltaX);
                singleNewHeight = Math.max(20, initialSize.height - localDeltaY);
                if (maintainAspectRatio) {
                  if (Math.abs(localDeltaX) > Math.abs(localDeltaY)) {
                    singleNewHeight = singleNewWidth / aspectRatio;
                  } else {
                    singleNewWidth = singleNewHeight * aspectRatio;
                  }
                }
                localOffsetX = (singleNewWidth - initialSize.width) / 2;
                localOffsetY = -(singleNewHeight - initialSize.height) / 2;
                break;
              case 'nw':
                singleNewWidth = Math.max(20, initialSize.width - localDeltaX);
                singleNewHeight = Math.max(20, initialSize.height - localDeltaY);
                if (maintainAspectRatio) {
                  if (Math.abs(localDeltaX) > Math.abs(localDeltaY)) {
                    singleNewHeight = singleNewWidth / aspectRatio;
                  } else {
                    singleNewWidth = singleNewHeight * aspectRatio;
                  }
                }
                localOffsetX = -(singleNewWidth - initialSize.width) / 2;
                localOffsetY = -(singleNewHeight - initialSize.height) / 2;
                break;
              case 'e':
                singleNewWidth = Math.max(20, initialSize.width + localDeltaX);
                if (maintainAspectRatio) singleNewHeight = singleNewWidth / aspectRatio;
                localOffsetX = (singleNewWidth - initialSize.width) / 2;
                break;
              case 'w':
                singleNewWidth = Math.max(20, initialSize.width - localDeltaX);
                if (maintainAspectRatio) singleNewHeight = singleNewWidth / aspectRatio;
                localOffsetX = -(singleNewWidth - initialSize.width) / 2;
                break;
              case 'n':
                singleNewHeight = Math.max(20, initialSize.height - localDeltaY);
                if (maintainAspectRatio) singleNewWidth = singleNewHeight * aspectRatio;
                localOffsetY = -(singleNewHeight - initialSize.height) / 2;
                break;
              case 's':
                singleNewHeight = Math.max(20, initialSize.height + localDeltaY);
                if (maintainAspectRatio) singleNewWidth = singleNewHeight * aspectRatio;
                localOffsetY = (singleNewHeight - initialSize.height) / 2;
                break;
            }
            
            // Transform local offset back to screen space
            const screenOffsetX = localOffsetX * cosR - localOffsetY * sinR;
            const screenOffsetY = localOffsetX * sinR + localOffsetY * cosR;
            
            const singleNewX = initialPosition.x + screenOffsetX;
            const singleNewY = initialPosition.y + screenOffsetY;

            updateElementDirect(selectedElement.id, { 
              width: Math.round(singleNewWidth * 10) / 10, 
              height: Math.round(singleNewHeight * 10) / 10,
              x: Math.round(singleNewX * 10) / 10,
              y: Math.round(singleNewY * 10) / 10
            });
          }
        }
      }); // Use requestAnimationFrame for smooth 60fps updates
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
      // Clear group resize state
      isGroupResize.current = false;
      groupResizeStateRef.current = null;
      // Clear local handle ref
      localHandleRef.current = null;
      clearTimeout(updateTimeout);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      clearTimeout(updateTimeout);
    };
  }, [isDragging, isResizing, selectedElements, dragOffset, resizeHandle, initialSize, initialPosition, initialMousePos, zoom, template]);

  // Calculate optimal zoom level to fit template within workspace
  const calculateOptimalZoom = (template: TemplateSize) => {
    // Use window dimensions as fallback
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate available workspace area
    // Account for sidebars (320px each), header (64px), toolbar (80px), bottom bar (80px)
    const sidebarWidth = 320 * 2; // Left and right sidebars
    const headerHeight = 64;
    const toolbarHeight = 80;
    const bottomBarHeight = 80;
    const padding = 80; // Extra padding for comfortable viewing
    
    const maxWorkspaceWidth = viewportWidth - sidebarWidth - padding;
    const maxWorkspaceHeight = viewportHeight - headerHeight - toolbarHeight - bottomBarHeight - padding;
    
    // Ensure minimum workspace size
    const workspaceWidth = Math.max(maxWorkspaceWidth, 400);
    const workspaceHeight = Math.max(maxWorkspaceHeight, 300);
    
    // Calculate scale factors for width and height
    const scaleX = workspaceWidth / template.pixelWidth;
    const scaleY = workspaceHeight / template.pixelHeight;
    
    // Use the smaller scale factor to ensure template fits within bounds
    const optimalScale = Math.min(scaleX, scaleY);
    
    // Convert to percentage with a more aggressive approach
    // For smaller templates, aim to fill more of the available space
    const sizeRatio = (template.pixelWidth * template.pixelHeight) / (600 * 600); // Compare to A3 size
    const fillFactor = sizeRatio < 0.5 ? 0.95 : 0.85; // Fill more aggressively for smaller templates
    
    const targetScale = optimalScale * fillFactor;
    
    // Allow wider range from 50% to 400% for better flexibility
    const optimalZoom = Math.min(Math.max(targetScale * 100, 50), 400);
    
    console.log(`Template ${template.name}: ${template.pixelWidth}x${template.pixelHeight}px, Workspace: ${workspaceWidth}x${workspaceHeight}, Zoom: ${Math.round(optimalZoom)}%`);
    
    return Math.round(optimalZoom);
  };

  // Auto-adjust zoom when template changes
  useEffect(() => {
    if (template) {
      // Longer delay to ensure DOM is fully ready and measurements are accurate
      const timeoutId = setTimeout(() => {
        const optimalZoom = calculateOptimalZoom(template);
        setZoom(optimalZoom);
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }
  }, [template?.id]);
  
  // Also recalculate zoom when window resizes
  useEffect(() => {
    if (!template) return;
    
    let resizeTimeout: NodeJS.Timeout;
    
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const optimalZoom = calculateOptimalZoom(template);
        setZoom(optimalZoom);
      }, 300);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [template]);









  // Function to fit all content within safety margins
  const handleFitToBounds = () => {
    if (!template || !canvasElements || canvasElements.length === 0) {
      console.log('❌ Cannot fit to bounds: missing template or elements');
      return;
    }
    
    // Calculate safety margins - DTF templates need more generous scaling
    const isDTFTemplate = template.id === 'dtf-large' || template.name === 'large_dtf';
    const safetyMarginMm = 3; // Keep standard 3mm for all templates
    const safeWidth = template.width - (safetyMarginMm * 2);
    const safeHeight = template.height - (safetyMarginMm * 2);
    
    console.log(`🎯 ${isDTFTemplate ? 'DTF' : 'Standard'} template fit-to-bounds: ${safeWidth}×${safeHeight}mm usable area (${safetyMarginMm}mm margins)`);
    
    // Find the bounding box of all elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    canvasElements.forEach(element => {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Calculate scale factor to fit within safety margins
    const scaleX = safeWidth / contentWidth;
    const scaleY = safeHeight / contentHeight;
    const scaleFactor = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
    
    // DTF template-specific positioning adjustments (already defined above)
    
    if (scaleFactor < 1) {
      console.log(`🎯 Scaling content by ${(scaleFactor * 100).toFixed(0)}% to fit within safety margins`);
      
      // Scale and reposition all elements
      canvasElements.forEach(element => {
        const relativeX = element.x - minX;
        const relativeY = element.y - minY;
        
        const newWidth = Math.round(element.width * scaleFactor);
        const newHeight = Math.round(element.height * scaleFactor);
        
        let newX, newY;
        if (isDTFTemplate) {
          // DTF: Center horizontally, position higher for better visibility
          const scaledContentWidth = contentWidth * scaleFactor;
          const scaledContentHeight = contentHeight * scaleFactor;
          newX = Math.round((template.width - scaledContentWidth) / 2 + (relativeX * scaleFactor));
          newY = Math.round(safetyMarginMm + (relativeY * scaleFactor));
        } else {
          // Standard templates: existing behavior
          newX = Math.round(safetyMarginMm + (relativeX * scaleFactor));
          newY = Math.round(safetyMarginMm + (relativeY * scaleFactor));
        }
        
        updateElementDirect(element.id, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        });
      });
    } else {
      // Just center the content if it already fits
      let centerOffsetX, centerOffsetY;
      
      if (isDTFTemplate) {
        // DTF: Center horizontally, position closer to top
        centerOffsetX = (template.width - contentWidth) / 2;
        centerOffsetY = safetyMarginMm + (safeHeight - contentHeight) / 4; // 25% from top of safe area
        console.log('🎯 DTF template: Centering horizontally, positioning towards top');
      } else {
        // Standard templates: existing behavior
        centerOffsetX = (safeWidth - contentWidth) / 2 + safetyMarginMm;
        centerOffsetY = (safeHeight - contentHeight) / 2 + safetyMarginMm;
        console.log('🎯 Standard template: Centering content within safety margins');
      }
      
      canvasElements.forEach(element => {
        const relativeX = element.x - minX;
        const relativeY = element.y - minY;
        
        updateElementDirect(element.id, {
          x: Math.round(centerOffsetX + relativeX),
          y: Math.round(centerOffsetY + relativeY)
        });
      });
    }
  };

  // Function to center all content on canvas without scaling
  const handleCenterOnCanvas = () => {
    if (!template || !canvasElements || canvasElements.length === 0) {
      console.log('❌ Cannot center: missing template or elements');
      return;
    }
    
    // Find the bounding box of all elements (using center-based coordinates)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    canvasElements.forEach(element => {
      const isRotated = element.rotation === 90 || element.rotation === 270;
      const visualWidth = isRotated ? element.height : element.width;
      const visualHeight = isRotated ? element.width : element.height;
      
      const left = element.x - visualWidth / 2;
      const right = element.x + visualWidth / 2;
      const top = element.y - visualHeight / 2;
      const bottom = element.y + visualHeight / 2;
      
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    
    // The canvas center is at (0, 0) in our coordinate system
    const offsetX = -contentCenterX;
    const offsetY = -contentCenterY;
    
    console.log(`🎯 Centering content on canvas: offset (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})mm`);
    
    // Move all elements by the offset to center them
    canvasElements.forEach(element => {
      updateElementDirect(element.id, {
        x: element.x + offsetX,
        y: element.y + offsetY
      });
    });
  };

  if (!template) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading canvas...</div>
      </div>
    );
  }

  // Calculate bleed margin in pixels (if template has bleedMargin property)
  const bleedMarginMm = (template as any).bleedMargin || 0;
  const mmToPixels = template.pixelWidth / template.width; // pixels per mm at 100% zoom
  const bleedInPixels = bleedMarginMm * mmToPixels * (zoom / 100);
  
  // Canvas dimensions including bleed
  const canvasWidth = (template.pixelWidth * (zoom / 100)) + (bleedInPixels * 2);
  const canvasHeight = (template.pixelHeight * (zoom / 100)) + (bleedInPixels * 2);
  
  // Inner canvas dimensions (the original template size without bleed)
  const innerCanvasWidth = template.pixelWidth * (zoom / 100);
  const innerCanvasHeight = template.pixelHeight * (zoom / 100);

  // Compute if any elements are outside canvas bounds (not safety margins)
  const hasElementsOutsideCanvas = canvasElements.some(element => {
    if (!element.isVisible) return false;
    
    // Only warn when elements extend beyond the actual canvas bounds (0mm margin)
    const templateHalfWidth = template.width / 2;
    const templateHalfHeight = template.height / 2;
    
    const isRotated = element.rotation === 90 || element.rotation === 270;
    const visualWidth = isRotated ? element.height : element.width;
    const visualHeight = isRotated ? element.width : element.height;
    
    const elementHalfWidth = visualWidth / 2;
    const elementHalfHeight = visualHeight / 2;
    
    const elementLeft = element.x - elementHalfWidth;
    const elementRight = element.x + elementHalfWidth;
    const elementTop = element.y - elementHalfHeight;
    const elementBottom = element.y + elementHalfHeight;
    
    // Check against canvas bounds (no safety margin offset)
    return elementLeft < -templateHalfWidth || elementTop < -templateHalfHeight || 
           elementRight > templateHalfWidth || elementBottom > templateHalfHeight;
  });

  return (
    <TooltipProvider>
    <div className="flex-1 flex flex-col">
      {/* Position Warning Banner - Only when elements are outside canvas bounds */}
      {hasElementsOutsideCanvas && (
        <div className="bg-red-50 border-b border-red-300 px-4 py-2 text-center">
          <p className="text-sm text-red-800 font-medium">
            ⚠️ Position Warning
          </p>
          <p className="text-xs text-red-700">
            Some elements extend beyond the canvas bounds and will be clipped in the final output.
          </p>
        </div>
      )}
      
      {/* Garment Color Required Warning */}
      {!project.garmentColor && (
        <div className="bg-red-500 text-white px-4 py-2 text-sm font-medium">
          ⚠️ Please select a garment color in the sidebar before uploading logos
        </div>
      )}
      
      {/* Canvas Toolbar */}
      <div className="bg-white border-b border-gray-200 px-2 md:px-6 py-2 md:py-4">
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          {/* Upload and Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Upload Section */}
            <div className="flex items-center space-x-3">
              <input
                id="canvas-upload-input"
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.svg,.pdf"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    handleCanvasFileUpload(files);
                    e.target.value = '';
                  }
                  if (isFullscreen && onReenterFullscreen) {
                    setTimeout(() => onReenterFullscreen(), 100);
                  }
                }}
              />
              <div className="flex flex-col">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="default" 
                      size="sm"
                      disabled={!project.garmentColor || isUploading}
                      onClick={() => document.getElementById('canvas-upload-input')?.click()}
                    >
                      <Upload className={`w-4 h-4 mr-2 ${isUploading ? 'animate-pulse' : ''}`} />
                      {isUploading ? `Uploading... ${uploadProgress}%` : 'Upload Logos'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Upload PDF, SVG, PNG, or JPEG files to add logos to your design</p>
                  </TooltipContent>
                </Tooltip>
                
                {/* Upload Progress Bar */}
                {isUploading && (
                  <div className="mt-1 w-32">
                    <Progress value={uploadProgress} className="h-1" />
                  </div>
                )}
              </div>
              
              {/* Logo Count Display */}
              {logos && logos.length > 0 && (
                <>
                  <div className="h-6 w-px bg-gray-300"></div>
                  <span className="text-sm text-gray-600">
                    {logos.length} logo{logos.length !== 1 ? 's' : ''}
                  </span>
                  
                  {/* Quick Logo Preview */}
                  <div className="flex items-center space-x-1">
                    {logos.slice(0, 3).map((logo, index) => (
                      <div key={logo.id} className="w-6 h-6 bg-gray-100 border border-gray-200 rounded flex items-center justify-center text-xs">
                        {logo.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
                      </div>
                    ))}
                    {logos.length > 3 && (
                      <div className="w-6 h-6 bg-gray-100 border border-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
                        +{logos.length - 3}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            
            <div className="h-6 w-px bg-gray-300"></div>
            
            {/* Zoom Controls */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Zoom:</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleZoomOut}>
                    <Minus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Zoom out (10% minimum)</p>
                </TooltipContent>
              </Tooltip>
              <span className="text-sm font-medium min-w-[60px] text-center">{zoom}%</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleZoomIn}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Zoom in (400% maximum)</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      const optimalZoom = calculateOptimalZoom(template);
                      setZoom(optimalZoom);
                    }}
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Fit template to workspace</p>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="h-6 w-px bg-gray-300"></div>
            
            {/* Grid and Guide Controls */}
            <div className="flex items-center space-x-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showGrid ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowGrid(!showGrid)}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle grid</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showGuides ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowGuides(!showGuides)}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle guides</p>
                </TooltipContent>
              </Tooltip>
              {/* Fit to Bounds Button - show when elements exist on canvas */}
              {canvasElements && canvasElements.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFitToBounds}
                    >
                      <Maximize2 className="w-4 h-4 mr-1" />
                      Fit in Bounds
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Scale and center all content within safety margins</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Center on Canvas Button - show when elements exist on canvas */}
              {canvasElements && canvasElements.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCenterOnCanvas}
                    >
                      <AlignCenter className="w-4 h-4 mr-1" />
                      Center
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Center all content on canvas without scaling</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Select All Button - show when multiple elements exist on canvas */}
              {canvasElements && canvasElements.length > 1 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={selectedElements.length === canvasElements.length ? "default" : "outline"}
                      size="sm"
                      onClick={selectAllElements}
                      data-testid="button-select-all"
                    >
                      <CheckSquare className="w-4 h-4 mr-1" />
                      Select All
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select all elements on canvas to move them together</p>
                  </TooltipContent>
                </Tooltip>
              )}
              
              {/* Group Button - show when 2+ elements are selected */}
              {selectedElements.length >= 2 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={groupSelectedElements}
                      data-testid="button-group"
                    >
                      <Group className="w-4 h-4 mr-1" />
                      Group
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Group selected elements so they move together</p>
                  </TooltipContent>
                </Tooltip>
              )}
              
              {/* Ungroup Button - show when grouped elements are selected */}
              {hasGroupedElements && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={ungroupSelectedElements}
                      data-testid="button-ungroup"
                    >
                      <Ungroup className="w-4 h-4 mr-1" />
                      Ungroup
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Ungroup elements so they can be moved individually</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Continue Button - green color */}
              {onContinue && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      onClick={onContinue}
                      disabled={currentStep === 5}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {currentStep === 2 ? "Continue to Pre-flight Check" : "Continue"}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Continue to the next step</p>
                  </TooltipContent>
                </Tooltip>
              )}

            </div>

          </div>
          
          {/* Undo/Redo */}
          <div className="flex items-center gap-2 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleUndo} 
                  disabled={historyIndex <= 0}
                >
                  <Undo className="w-4 h-4 mr-1" />
                  Undo
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Undo last action (Ctrl+Z)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRedo} 
                  disabled={historyIndex >= history.length - 1}
                >
                  <Redo className="w-4 h-4 mr-1" />
                  Redo
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Redo last undone action (Ctrl+Y)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: '#606060' }}>
        <div 
          className="w-full h-full overflow-auto"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            style={{
              width: `${canvasWidth + 40}px`,
              height: `${canvasHeight + 40}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <div
              ref={canvasRef}
              className="relative shadow-xl rounded-lg overflow-hidden"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                backgroundColor: bleedMarginMm > 0 ? '#808080' : (project.garmentColor || '#EAEAEA')
              }}
              onClick={handleCanvasClick}
            >
            {/* Bleed Area Indicator - shows inner canvas area for templates with bleed margin */}
            {bleedMarginMm > 0 && (
              <div 
                className="absolute pointer-events-none"
                style={{
                  left: bleedInPixels,
                  top: bleedInPixels,
                  width: innerCanvasWidth,
                  height: innerCanvasHeight,
                  backgroundColor: project.garmentColor || '#EAEAEA',
                  border: '2px dashed rgba(0, 0, 0, 0.3)'
                }}
              >
                {/* Labels showing canvas dimensions (original size, not including bleed) */}
                <div 
                  className="absolute text-xs font-medium text-gray-600 bg-white/80 px-1 rounded"
                  style={{ top: 4, left: 4 }}
                >
                  {template.width}×{template.height}mm
                </div>
                <div 
                  className="absolute text-xs text-gray-500 bg-white/80 px-1 rounded"
                  style={{ bottom: 4, right: 4 }}
                >
                  Canvas (Bleed: {bleedMarginMm}mm)
                </div>
              </div>
            )}
            
            {/* Grid Pattern Overlay */}
            {showGrid && (
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
                  backgroundSize: `${20 * (zoom / 100)}px ${20 * (zoom / 100)}px`
                }}
              />
            )}

            {/* Center Guidelines */}
            {showGuides && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-blue-300 opacity-50 transform -translate-y-1/2" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-blue-300 opacity-50 transform -translate-x-1/2" />
              </div>
            )}

            {/* 3mm Safety Margin for All Templates */}
            {template && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Calculate 3mm margin in pixels */}
                {(() => {
                  // Always use template's actual pixel ratio for consistent margins across all templates
                  const mmToPixelRatio = template.pixelWidth / template.width; // pixels per mm
                  
                  const marginInPixels = 3 * mmToPixelRatio * (zoom / 100); // 3mm margin
                  
                  return (
                    <>
                      {/* Top margin line */}
                      <div 
                        className="absolute left-0 right-0 h-px bg-red-400 opacity-60"
                        style={{ top: marginInPixels }}
                      />
                      {/* Bottom margin line */}
                      <div 
                        className="absolute left-0 right-0 h-px bg-red-400 opacity-60"
                        style={{ bottom: marginInPixels }}
                      />
                      {/* Left margin line */}
                      <div 
                        className="absolute top-0 bottom-0 w-px bg-red-400 opacity-60"
                        style={{ left: marginInPixels }}
                      />
                      {/* Right margin line */}
                      <div 
                        className="absolute top-0 bottom-0 w-px bg-red-400 opacity-60"
                        style={{ right: marginInPixels }}
                      />
                      {/* Corner indicators for clarity */}
                      <div 
                        className="absolute text-xs text-red-400 opacity-60"
                        style={{ top: marginInPixels + 4, left: marginInPixels + 4 }}
                      >
                        3mm
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Canvas Elements */}
            {canvasElements
              .filter((element) => {
                // Always show visible elements
                if (!element.isVisible) return false;
                
                // For elements with logoId, ensure the logo exists
                if (element.logoId) {
                  const logo = logos.find(l => l.id === element.logoId);
                  if (!logo) {
                    console.warn(`🧹 Canvas element ${element.id} references missing logo ${element.logoId}, filtering out`);
                    return false;
                  }
                }
                
                return true;
              })
              .map((element) => {
              // For logo elements, find the associated logo
              const logo = element.logoId ? logos.find(l => l.id === element.logoId) : null;

              const isSelected = isElementSelected(element.id);
              
              // Check if this is a Single Colour Transfer template requiring ink color recoloring
              const isSingleColourTemplate = template?.group === "Screen Printed Transfers" && 
                (template?.label?.includes("Single Colour") || template?.label?.includes("Zero"));
              const shouldRecolorForInk = isSingleColourTemplate && !!project.inkColor && !!logo;
              
              // Debug: Log color overrides for this element
              if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
                console.log(`Element ${element.id} has color overrides:`, element.colorOverrides);
              }
              
              // Convert mm to pixels for display
              // For PDF-derived large format elements, use proper DPI conversion instead of template workspace ratio
              let mmToPixelRatio = template.pixelWidth / template.width; // Default template ratio
              
              // Check if this is a PDF-derived element (large format) by checking dimensions
              const isPdfDerived = element.width > 200 || element.height > 200; // Large elements are likely PDF-derived
              
              if (isPdfDerived) {
                // Use standard 72 DPI conversion for PDF-derived elements: 1mm = 2.834645669 pixels
                mmToPixelRatio = 2.834645669; // 72 DPI conversion
                console.log(`🔍 PDF-derived element detected, using 72 DPI conversion: ${mmToPixelRatio} px/mm`);
              }
              
              // Always use the database dimensions directly - they're already swapped by the backend
              // Apply zoom to match the canvas scaling
              const elementWidth = element.width * mmToPixelRatio * (zoom / 100);
              const elementHeight = element.height * mmToPixelRatio * (zoom / 100);
              
              // Convert center-based coordinates to top-left for rendering
              // element.x/y is the center position relative to template center
              // Template center in pixels (account for bleed margin offset if present)
              const bleedMm = (template as any).bleedMargin || 0;
              const bleedOffset = bleedMm * mmToPixelRatio * (zoom / 100);
              const templateCenterX = (template.width * mmToPixelRatio * (zoom / 100)) / 2 + bleedOffset;
              const templateCenterY = (template.height * mmToPixelRatio * (zoom / 100)) / 2 + bleedOffset;
              
              // Convert center position to top-left corner for CSS positioning
              const elementX = templateCenterX + (element.x * mmToPixelRatio * (zoom / 100)) - elementWidth / 2;
              const elementY = templateCenterY + (element.y * mmToPixelRatio * (zoom / 100)) - elementHeight / 2;
              
              // For the bounding box, we need the exact content size without extra padding
              // The element dimensions from the database should already be cropped to content
              const boundingBoxWidth = elementWidth;
              const boundingBoxHeight = elementHeight;
              
              // Debug: Log element dimensions when selected
              if (isSelected) {
                console.log(`Canvas element ${element.id} dimensions:`, {
                  dbWidth: element.width,
                  dbHeight: element.height,
                  pixelWidth: elementWidth,
                  pixelHeight: elementHeight,
                  rotation: element.rotation
                });
              }

              return (
                <div
                  key={element.id}
                  className={`canvas-element absolute ${isDragging && isSelected ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{
                    left: elementX,
                    top: elementY,
                    width: elementWidth,
                    height: elementHeight,
                    zIndex: element.zIndex,
                    transform: `rotate(${element.rotation || 0}deg)`,
                    transformOrigin: 'center',
                    outline: isSelected 
                      ? `2px solid #961E75` 
                      : `1px solid #d1d5db`,
                    outlineOffset: '-2px',
                    boxSizing: 'border-box'
                  }}
                  onMouseDown={(e) => handleMouseDown(element, e)}
                >
                  {/* Element Content with Garment Background */}
                  <div 
                    className="absolute inset-0" 
                    style={{ 
                      backgroundColor: element.garmentColor || 'transparent',
                      padding: 0,
                      margin: 0,
                      display: 'block',
                      lineHeight: 0,
                      fontSize: 0,
                      overflow: 'visible'
                    }}
                  >
                    {/* Logo Elements */}

                    {(element.elementType === 'logo' || (!element.elementType && element.logoId)) && logo ? (
                      // Check if this is an SVG file that should be rendered inline
                      logo.mimeType === 'image/svg+xml' ? (
                        <SvgInlineRenderer 
                          element={element}
                          logo={logo}
                          project={project}
                          shouldRecolorForInk={shouldRecolorForInk}
                        />
                      ) : (
                        // For non-SVG files (PNG, JPEG), use regular img element
                        <img
                          src={(() => {
                            // Priority 1: Color overrides exist - use modified SVG endpoint
                            if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
                              return `/api/canvas-elements/${element.id}/modified-svg?t=${Date.now()}`;
                            }
                            // Priority 2: Single Colour Transfer with ink color selected
                            if (shouldRecolorForInk) {
                              return `/uploads/${logo.filename}?inkColor=${encodeURIComponent(project.inkColor || '')}&recolor=true&t=${Date.now()}`;
                            }
                            // Priority 3: Original image
                            const url = getImageUrl(logo);
                            console.log('🖼️ Using image URL:', url, 'for logo:', logo.filename, logo.mimeType);
                            return url;
                          })()}
                          alt={logo.originalName}
                          className="w-full h-full"
                          style={{ 
                            background: 'transparent', 
                            backgroundColor: 'transparent',
                            filter: "none",
                            objectFit: 'contain',
                            width: '100%',
                            height: '100%',

                          }}
                          draggable={false}
                          onLoad={() => {
                            const imageUrl = element.colorOverrides && Object.keys(element.colorOverrides).length > 0 
                              ? `/uploads/${element.id}_modified.svg`
                              : shouldRecolorForInk 
                                ? `/uploads/${logo.filename}?inkColor=${project.inkColor}&recolor=true`
                                : getImageUrl(logo);
                            console.log('✅ Image loaded successfully:', imageUrl);
                            console.log('Logo details:', { 
                              filename: logo.filename, 
                              mimeType: logo.mimeType,
                              originalName: logo.originalName
                            });
                          }}
                          onError={(e) => {
                            const failedUrl = getImageUrl(logo);
                            console.error('❌ IMAGE LOAD FAILED');
                            console.error('   URL:', failedUrl);
                            console.error('   Logo filename:', logo?.filename);
                            console.error('   Logo mime type:', logo?.mimeType);
                            console.error('   Logo original name:', logo?.originalName);
                            console.error('   Element ID:', element.id);
                            console.error('   Browser:', navigator.userAgent);
                            
                            // Try to fetch the image to get detailed error info
                            fetch(failedUrl).then(response => {
                              console.error('   HTTP Status:', response.status, response.statusText);
                              if (!response.ok) {
                                console.error('   Server response indicates file not found or inaccessible');
                              }
                            }).catch(err => {
                              console.error('   Network error:', err.message);
                            });
                            
                            // Show user-friendly error in toast
                            toast({
                              title: "Image Load Error",
                              description: `Failed to load ${logo?.originalName || 'image'}. Please refresh and try again.`,
                              variant: "destructive",
                            });
                          }}
                        />
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-500 p-2">
                        <svg className="w-8 h-8 mb-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs text-center break-all">{logo?.originalName || 'Unknown'}</span>
                      </div>
                    )}


                  </div>

                  {/* Transformation Handles */}
                  {isSelected && (() => {
                    // Calculate scaled handle size and positioning
                    const handleSize = 12; // Fixed 12px size
                    const handleOffset = 6; // Fixed 6px offset
                    const borderWidth = 2; // Fixed 2px border
                    
                    const handleStyle = {
                      width: `${handleSize}px`,
                      height: `${handleSize}px`,
                      borderWidth: `${borderWidth}px`,
                    };
                    
                    return (
                    <>
                      {/* Corner handles with resize functionality */}
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-nw-resize" 
                        style={{
                          ...handleStyle,
                          top: `-${handleOffset}px`,
                          left: `-${handleOffset}px`,
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 'nw')}
                      />
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-n-resize" 
                        style={{
                          ...handleStyle,
                          top: `-${handleOffset}px`,
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 'n')}
                      />
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-ne-resize" 
                        style={{
                          ...handleStyle,
                          top: `-${handleOffset}px`,
                          right: `-${handleOffset}px`,
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 'ne')}
                      />
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-e-resize" 
                        style={{
                          ...handleStyle,
                          top: '50%',
                          right: `-${handleOffset}px`,
                          transform: 'translateY(-50%)',
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 'e')}
                      />
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-se-resize" 
                        style={{
                          ...handleStyle,
                          bottom: `-${handleOffset}px`,
                          right: `-${handleOffset}px`,
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 'se')}
                      />
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-s-resize" 
                        style={{
                          ...handleStyle,
                          bottom: `-${handleOffset}px`,
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 's')}
                      />
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-sw-resize" 
                        style={{
                          ...handleStyle,
                          bottom: `-${handleOffset}px`,
                          left: `-${handleOffset}px`,
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 'sw')}
                      />
                      <div 
                        className="absolute bg-primary border-white rounded-full cursor-w-resize" 
                        style={{
                          ...handleStyle,
                          top: '50%',
                          left: `-${handleOffset}px`,
                          transform: 'translateY(-50%)',
                        }}
                        onMouseDown={(e) => handleResizeStart(e, element, 'w')}
                      />
                      
                      {/* Rotation Handle - Positioned above element */}
                      <div 
                        className="absolute left-1/2 cursor-grab z-20 bg-white shadow-lg rounded-full border-primary flex items-center justify-center"
                        style={{ 
                          top: '-30px',
                          width: '32px',
                          height: '32px',
                          transform: 'translateX(-50%)',
                          padding: '8px',
                          borderWidth: '2px',
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          let rotationTimeout: NodeJS.Timeout;
                          
                          // Use ref to get the LATEST selectedElements to avoid stale closures
                          const currentSelectedElements = selectedElementsRef.current;
                          
                          // Store initial state for group rotation
                          const isGroupRotation = currentSelectedElements.length > 1;
                          console.log('Rotation mousedown - isGroupRotation:', isGroupRotation, 'selectedElements count:', currentSelectedElements.length, 'element ids:', currentSelectedElements.map(el => el.id));
                          let groupCenter = { x: 0, y: 0 };
                          let initialGroupState: Map<string, { x: number; y: number; rotation: number; angleFromCenter: number; distanceFromCenter: number }> | null = null;
                          let initialMouseAngle = 0;
                          
                          if (isGroupRotation && canvasRef.current) {
                            // Calculate group center
                            let sumX = 0, sumY = 0;
                            currentSelectedElements.forEach(el => {
                              sumX += el.x;
                              sumY += el.y;
                            });
                            groupCenter = { x: sumX / currentSelectedElements.length, y: sumY / currentSelectedElements.length };
                            
                            // Store initial state of each element
                            initialGroupState = new Map();
                            currentSelectedElements.forEach(el => {
                              const dx = el.x - groupCenter.x;
                              const dy = el.y - groupCenter.y;
                              const distance = Math.sqrt(dx * dx + dy * dy);
                              const angle = Math.atan2(dy, dx);
                              initialGroupState!.set(el.id, {
                                x: el.x,
                                y: el.y,
                                rotation: el.rotation || 0,
                                angleFromCenter: angle,
                                distanceFromCenter: distance
                              });
                            });
                            
                            // Calculate initial mouse angle from group center
                            const rect = canvasRef.current.getBoundingClientRect();
                            const scaleFactor = zoom / 100;
                            const mmToPixelRatio = template ? template.pixelWidth / template.width : 1;
                            const groupCenterPixelX = groupCenter.x * mmToPixelRatio * scaleFactor;
                            const groupCenterPixelY = groupCenter.y * mmToPixelRatio * scaleFactor;
                            initialMouseAngle = Math.atan2(
                              e.clientY - rect.top - groupCenterPixelY,
                              e.clientX - rect.left - groupCenterPixelX
                            );
                            
                            // Save history at start
                            if (canvasElements) {
                              saveToHistory(canvasElements);
                            }
                          }
                          
                          const handleRotationMouseMove = (moveEvent: MouseEvent) => {
                            if (!canvasRef.current) return;
                            
                            clearTimeout(rotationTimeout);
                            
                            // Reduced timeout for smoother rotation (was 50ms)
                            rotationTimeout = setTimeout(async () => {
                              const rect = canvasRef.current!.getBoundingClientRect();
                              const scaleFactor = zoom / 100;
                              const mmToPixelRatio = template ? template.pixelWidth / template.width : 1;
                              
                              if (isGroupRotation && initialGroupState) {
                                // GROUP ROTATION: Rotate all elements around group center
                                console.log('🔄 Group rotation update - elements to rotate:', initialGroupState.size, 'ids:', Array.from(initialGroupState.keys()));
                                const groupCenterPixelX = groupCenter.x * mmToPixelRatio * scaleFactor;
                                const groupCenterPixelY = groupCenter.y * mmToPixelRatio * scaleFactor;
                                
                                // Calculate current mouse angle from group center
                                const currentMouseAngle = Math.atan2(
                                  moveEvent.clientY - rect.top - groupCenterPixelY,
                                  moveEvent.clientX - rect.left - groupCenterPixelX
                                );
                                
                                // Delta rotation in radians
                                const deltaRotation = currentMouseAngle - initialMouseAngle;
                                const deltaRotationDeg = deltaRotation * (180 / Math.PI);
                                
                                // Update each element
                                initialGroupState.forEach((initialState, elementId) => {
                                  // Rotate position around group center
                                  const newAngle = initialState.angleFromCenter + deltaRotation;
                                  const newX = groupCenter.x + Math.cos(newAngle) * initialState.distanceFromCenter;
                                  const newY = groupCenter.y + Math.sin(newAngle) * initialState.distanceFromCenter;
                                  
                                  // Add delta rotation to element's own rotation
                                  const newElementRotation = ((initialState.rotation + deltaRotationDeg) % 360 + 360) % 360;
                                  
                                  console.log(`🔃 Rotating element ${elementId}: initial(${initialState.x.toFixed(1)}, ${initialState.y.toFixed(1)}) -> new(${newX.toFixed(1)}, ${newY.toFixed(1)}) rot: ${initialState.rotation} -> ${Math.round(newElementRotation)}`);
                                  
                                  updateElementDirect(elementId, { 
                                    x: Math.round(newX * 10) / 10,
                                    y: Math.round(newY * 10) / 10,
                                    rotation: Math.round(newElementRotation) 
                                  }, false);
                                });
                              } else {
                                // SINGLE ELEMENT ROTATION (original behavior)
                                const centerX = elementX + elementWidth / 2;
                                const centerY = elementY + elementHeight / 2;
                                
                                // Calculate angle from center to mouse position
                                const angle = Math.atan2(
                                  moveEvent.clientY - rect.top - centerY,
                                  moveEvent.clientX - rect.left - centerX
                                ) * (180 / Math.PI);
                                
                                // Normalize angle to 0-360 degrees
                                const normalizedAngle = ((angle % 360) + 360) % 360;
                                
                                console.log('Rotation handle drag - updating to:', Math.round(normalizedAngle));
                                
                                // Use same direct update function as other operations
                                updateElementDirect(element.id, { 
                                  rotation: Math.round(normalizedAngle) 
                                });
                              }
                            }, 16); // Reduced from 50ms for smoother rotation (~60fps)
                          };
                          
                          const handleRotationMouseUp = () => {
                            clearTimeout(rotationTimeout);
                            document.removeEventListener('mousemove', handleRotationMouseMove);
                            document.removeEventListener('mouseup', handleRotationMouseUp);
                          };
                          
                          document.addEventListener('mousemove', handleRotationMouseMove);
                          document.addEventListener('mouseup', handleRotationMouseUp);
                        }}
                      >
                        <RotateCw style={{ width: '16px', height: '16px' }} className="text-primary" />
                      </div>

                      {/* Delete Handle - positioned at bottom-right, away from resize handles */}
                      <div 
                        className="absolute bg-red-600 hover:bg-red-700 border-2 border-white rounded-full cursor-pointer flex items-center justify-center shadow-lg z-10"
                        style={{
                          bottom: '-36px',
                          right: '50%',
                          transform: 'translateX(50%)',
                          width: '28px',
                          height: '28px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Prevent multiple rapid clicks
                          if (!deleteElementMutation.isPending) {
                            deleteElementMutation.mutate(element.id);
                          }
                        }}
                        title="Delete element"
                      >
                        <Trash2 style={{ width: '14px', height: '14px' }} className="text-white" />
                      </div>
                    </>
                    );
                  })()}
                </div>
              );
            })}

            {/* Canvas Info */}
            <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-white px-2 py-1 rounded">
              {template.label} ({template.width}×{template.height}mm) • {project.garmentColor ? getColorName(project.garmentColor) : 'No Color'} Garment
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Raster Warning Modal */}
      {pendingRasterFile && (
        <RasterWarningModal
          open={showRasterWarning}
          onClose={handleCloseRasterWarning}
          fileName={pendingRasterFile.fileName}
          onPhotographicApprove={handlePhotographicApprove}
          onVectorizeWithService={handleVectorizeWithService}
        />
      )}

      {/* Vectorizer Modal */}
      {pendingRasterFile && (
        <VectorizerModal
          open={showVectorizer}
          onClose={handleCloseVectorizer}
          fileName={pendingRasterFile.fileName}
          imageFile={pendingRasterFile.file}
          onVectorDownload={handleVectorDownload}
        />
      )}


    </div>
    </TooltipProvider>
  );
}
