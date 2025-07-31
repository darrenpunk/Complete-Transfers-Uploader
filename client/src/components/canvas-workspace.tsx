import { useRef, useEffect, useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Logo, CanvasElement, TemplateSize, ContentBounds } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Grid3X3, AlignCenter, Undo, Redo, Upload, Trash2, Maximize2, RotateCw, Move, Maximize } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ColorManagementToggle from "./color-management-toggle";
import { RasterWarningModal } from "./raster-warning-modal";
import { VectorizerModal } from "./vectorizer-modal";
import { useCleanupOrphanedElements } from '@/hooks/use-cleanup-orphaned-elements';

// Import garment color utilities from shared module
import { gildanColors, fruitOfTheLoomColors, type ManufacturerColor } from "@shared/garment-colors";

function getColorName(hex: string): string {
  // Check quick Hi-Viz colors first (from garment color selector)
  const hiVizColors = [
    { name: "Hi Viz", hex: "#D2E31D" },
    { name: "Hi Viz Orange", hex: "#D98F17" }
  ];
  
  const hiVizColor = hiVizColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  if (hiVizColor) {
    return hiVizColor.name;
  }

  // Check Gildan colors
  for (const group of gildanColors) {
    const gildanColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
    if (gildanColor) {
      return `${gildanColor.name} (${gildanColor.code})`;
    }
  }

  // Check Fruit of the Loom colors
  for (const group of fruitOfTheLoomColors) {
    const fotlColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
    if (fotlColor) {
      return `${fotlColor.name} (${fotlColor.code})`;
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
  selectedElement: CanvasElement | null;
  onElementSelect: (element: CanvasElement | null) => void;
  onLogoUpload?: (files: File[]) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  maintainAspectRatio?: boolean;
}

// Helper function to check if logo has valid content bounds
function hasValidContentBounds(logo: Logo): logo is Logo & { contentBounds: ContentBounds } {
  return logo.contentBounds != null && 
         typeof logo.contentBounds === 'object' &&
         'minX' in logo.contentBounds &&
         'minY' in logo.contentBounds &&
         'maxX' in logo.contentBounds &&
         'maxY' in logo.contentBounds &&
         typeof logo.contentBounds.minX === 'number' &&
         typeof logo.contentBounds.minY === 'number' &&
         typeof logo.contentBounds.maxX === 'number' &&
         typeof logo.contentBounds.maxY === 'number';
}

export default function CanvasWorkspace({
  project,
  template,
  logos,
  canvasElements,
  selectedElement,
  onElementSelect,
  onLogoUpload,
  isUploading = false,
  uploadProgress = 0,
  maintainAspectRatio = true
}: CanvasWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Core UI state
  const [zoom, setZoom] = useState(75); // Start at higher zoom for better visibility
  const [colorManagementEnabled, setColorManagementEnabled] = useState(true);
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
  
  // History state for undo/redo functionality
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

 // Canvas rotation in degrees

  // Helper function for optimistic updates with fallback
  const updateElementDirect = async (id: string, updates: Partial<CanvasElement>) => {
    try {
      console.log('Canvas updateElementDirect called:', { id, updates });
      
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
  };

  // No longer need server-side color management - using CSS filters instead

  // Delete element mutation
  const deleteElementMutation = useMutation({
    mutationFn: async (elementId: string) => {
      const response = await apiRequest("DELETE", `/api/canvas-elements/${elementId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "canvas-elements"] });
      onElementSelect(null); // Deselect the deleted element
    },
  });

  const handleZoomIn = () => {
    setZoom(Math.min(zoom + 25, 400));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(zoom - 25, 10));
  };

  const handleZoomToFill = () => {
    if (!template) return;
    
    // Get workspace container dimensions (accounting for padding and UI elements)
    const workspaceWidth = window.innerWidth - 400; // Subtract sidebar width
    const workspaceHeight = window.innerHeight - 200; // Subtract header and padding
    
    // Calculate the aspect ratios
    const canvasAspectRatio = template.width / template.height;
    const workspaceAspectRatio = workspaceWidth / workspaceHeight;
    
    let optimalZoom;
    
    if (canvasAspectRatio > workspaceAspectRatio) {
      // Canvas is wider relative to workspace, fit to width
      optimalZoom = (workspaceWidth * 0.85) / template.width * 100 / 2.834; // Convert mm to px with some margin
    } else {
      // Canvas is taller relative to workspace, fit to height
      optimalZoom = (workspaceHeight * 0.85) / template.height * 100 / 2.834; // Convert mm to px with some margin
    }
    
    // Clamp zoom to reasonable bounds
    const clampedZoom = Math.max(10, Math.min(300, Math.round(optimalZoom)));
    
    console.log('🔍 Zoom to fill calculation:', {
      workspaceWidth,
      workspaceHeight,
      templateWidth: template.width,
      templateHeight: template.height,
      canvasAspectRatio,
      workspaceAspectRatio,
      optimalZoom,
      clampedZoom
    });
    
    setZoom(clampedZoom);
  };

  // Skip history updates during undo/redo operations
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState(false);

  // History management
  const saveToHistory = useCallback((elements: CanvasElement[]) => {
    if (isUndoRedoOperation) return; // Don't save during undo/redo operations
    
    console.log('🏛️ Saving to history, elements count:', elements.length);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...elements]);
    
    // Limit history to 50 entries to prevent memory issues
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryIndex(newHistory.length - 1);
    }
    
    setHistory(newHistory);
  }, [history, historyIndex, isUndoRedoOperation]);

  const handleUndo = useCallback(() => {
    console.log('🔙 Undo requested, historyIndex:', historyIndex, 'history length:', history.length);
    if (historyIndex > 0) {
      setIsUndoRedoOperation(true);
      const previousState = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      
      console.log('🔙 Restoring previous state with', previousState.length, 'elements');
      
      // Force update the query cache with previous state
      queryClient.setQueryData(
        ["/api/projects", project.id, "canvas-elements"],
        [...previousState]
      );
      
      setTimeout(() => setIsUndoRedoOperation(false), 100);
    }
  }, [historyIndex, history, project.id]);

  const handleRedo = useCallback(() => {
    console.log('🔜 Redo requested, historyIndex:', historyIndex, 'history length:', history.length);
    if (historyIndex < history.length - 1) {
      setIsUndoRedoOperation(true);
      const nextState = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      
      console.log('🔜 Restoring next state with', nextState.length, 'elements');
      
      // Force update the query cache with next state
      queryClient.setQueryData(
        ["/api/projects", project.id, "canvas-elements"],
        [...nextState]
      );
      
      setTimeout(() => setIsUndoRedoOperation(false), 100);
    }
  }, [historyIndex, history, project.id]);

  // Helper function to detect raster files
  const isRasterFile = (file: File): boolean => {
    return file.type === 'image/png' || file.type === 'image/jpeg';
  };

  // Handle file uploads with raster detection
  const handleCanvasFileUpload = (files: File[]) => {
    const rasterFiles = files.filter(isRasterFile);
    const vectorFiles = files.filter(file => !isRasterFile(file));
    
    // Process vector files immediately
    if (vectorFiles.length > 0 && onLogoUpload) {
      onLogoUpload(vectorFiles);
    }
    
    // Handle raster files one by one with warning modal
    if (rasterFiles.length > 0) {
      const firstRasterFile = rasterFiles[0];
      setPendingRasterFile({ file: firstRasterFile, fileName: firstRasterFile.name });
      setShowRasterWarning(true);
    }
  };

  // Automatic cleanup of orphaned canvas elements
  useCleanupOrphanedElements({
    projectId: project.id,
    canvasElements,
    logos
  });

  // Raster warning modal handlers
  const handlePhotographicApprove = () => {
    if (pendingRasterFile && onLogoUpload) {
      onLogoUpload([pendingRasterFile.file]);
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

  const handleVectorDownload = (vectorSvg: string) => {
    console.log('handleVectorDownload called', { hasPendingRasterFile: !!pendingRasterFile, hasOnLogoUpload: !!onLogoUpload });
    if (pendingRasterFile && onLogoUpload) {
      // Convert SVG string to File object
      const svgBlob = new Blob([vectorSvg], { type: 'image/svg+xml' });
      const svgFile = new File([svgBlob], pendingRasterFile.fileName.replace(/\.(png|jpg|jpeg)$/i, '.svg') || 'vectorized.svg', {
        type: 'image/svg+xml'
      });
      
      console.log('Uploading vectorized SVG:', svgFile.name, svgFile.type, svgFile.size);
      onLogoUpload([svgFile]);
      setPendingRasterFile(null);
      setShowVectorizer(false);
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
    if (canvasElements.length > 0 && !isUndoRedoOperation) {
      // Always save the current state, but debounce to avoid excessive saves
      const timeoutId = setTimeout(() => {
        saveToHistory(canvasElements);
      }, 500); // 500ms debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [canvasElements, saveToHistory, isUndoRedoOperation]);

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

  // Color management now handled purely with CSS filters - no server processing needed

  // Function to get the image URL for display
  const getImageUrl = (logo: Logo): string => {
    // For PDF files, use the SVG conversion
    if (logo.mimeType === 'application/pdf') {
      // Check if filename already ends with .svg (for processed files)
      if (logo.filename.endsWith('.svg')) {
        return `/uploads/${logo.filename}`;
      }
      // Otherwise, append .svg to the PDF filename
      return `/uploads/${logo.filename}.svg`;
    }
    // For other image files, use original
    return `/uploads/${logo.filename}`;
  };

  const handleElementClick = (element: CanvasElement, event: React.MouseEvent) => {
    event.stopPropagation();
    onElementSelect(element);
  };

  const handleCanvasClick = () => {
    onElementSelect(null);
  };

  const handleResizeStart = (event: React.MouseEvent, element: CanvasElement, handle: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    setIsResizing(true);
    setResizeHandle(handle);
    setInitialSize({ width: element.width, height: element.height });
    setInitialPosition({ x: element.x, y: element.y });
    onElementSelect(element);
  };

  const handleMouseDown = (element: CanvasElement, event: React.MouseEvent) => {
    if (!element) return;
    
    event.preventDefault();
    setIsDragging(true);
    onElementSelect(element);
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect && template) {
      // Convert mm to pixels for drag offset calculation
      const mmToPixelRatio = template.pixelWidth / template.width;
      setDragOffset({
        x: event.clientX - rect.left - element.x * mmToPixelRatio * (zoom / 100),
        y: event.clientY - rect.top - element.y * mmToPixelRatio * (zoom / 100)
      });
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

      updateTimeout = setTimeout(() => {
        if (isDragging && selectedElement && template) {
          // Convert pixels back to mm for storage
          const mmToPixelRatio = template.pixelWidth / template.width;
          const newX = (event.clientX - rect.left - dragOffset.x) / scaleFactor / mmToPixelRatio;
          const newY = (event.clientY - rect.top - dragOffset.y) / scaleFactor / mmToPixelRatio;

          updateElementDirect(selectedElement.id, { 
            x: Math.max(0, newX), 
            y: Math.max(0, newY) 
          });
        } else if (isResizing && selectedElement && resizeHandle && template) {
          // Convert pixels back to mm for storage
          const mmToPixelRatio = template.pixelWidth / template.width;
          const mouseX = (event.clientX - rect.left) / scaleFactor / mmToPixelRatio;
          const mouseY = (event.clientY - rect.top) / scaleFactor / mmToPixelRatio;

          let newWidth = initialSize.width;
          let newHeight = initialSize.height;
          let newX = initialPosition.x;
          let newY = initialPosition.y;

          // Calculate aspect ratio from initial size
          const aspectRatio = initialSize.width / initialSize.height;
          
          // Calculate new dimensions based on resize handle
          switch (resizeHandle) {
            case 'se': // Southeast
              newWidth = Math.max(20, mouseX - initialPosition.x);
              newHeight = Math.max(20, mouseY - initialPosition.y);
              
              if (maintainAspectRatio) {
                // Use the dimension that changed the most
                const widthChange = Math.abs(newWidth - initialSize.width);
                const heightChange = Math.abs(newHeight - initialSize.height);
                
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newWidth = newHeight * aspectRatio;
                }
              }
              break;
              
            case 'sw': // Southwest
              newWidth = Math.max(20, initialPosition.x + initialSize.width - mouseX);
              newHeight = Math.max(20, mouseY - initialPosition.y);
              newX = Math.min(mouseX, initialPosition.x + initialSize.width - 20);
              
              if (maintainAspectRatio) {
                const widthChange = Math.abs(newWidth - initialSize.width);
                const heightChange = Math.abs(newHeight - initialSize.height);
                
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newWidth = newHeight * aspectRatio;
                  newX = initialPosition.x + initialSize.width - newWidth;
                }
              }
              break;
              
            case 'ne': // Northeast
              newWidth = Math.max(20, mouseX - initialPosition.x);
              newHeight = Math.max(20, initialPosition.y + initialSize.height - mouseY);
              newY = Math.min(mouseY, initialPosition.y + initialSize.height - 20);
              
              if (maintainAspectRatio) {
                const widthChange = Math.abs(newWidth - initialSize.width);
                const heightChange = Math.abs(newHeight - initialSize.height);
                
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                  newY = initialPosition.y + initialSize.height - newHeight;
                } else {
                  newWidth = newHeight * aspectRatio;
                }
              }
              break;
              
            case 'nw': // Northwest
              newWidth = Math.max(20, initialPosition.x + initialSize.width - mouseX);
              newHeight = Math.max(20, initialPosition.y + initialSize.height - mouseY);
              newX = Math.min(mouseX, initialPosition.x + initialSize.width - 20);
              newY = Math.min(mouseY, initialPosition.y + initialSize.height - 20);
              
              if (maintainAspectRatio) {
                const widthChange = Math.abs(newWidth - initialSize.width);
                const heightChange = Math.abs(newHeight - initialSize.height);
                
                if (widthChange > heightChange) {
                  newHeight = newWidth / aspectRatio;
                  newY = initialPosition.y + initialSize.height - newHeight;
                } else {
                  newWidth = newHeight * aspectRatio;
                  newX = initialPosition.x + initialSize.width - newWidth;
                }
              }
              break;
              
            case 'e': // East
              newWidth = Math.max(20, mouseX - initialPosition.x);
              if (maintainAspectRatio) {
                newHeight = newWidth / aspectRatio;
              }
              break;
              
            case 'w': // West
              newWidth = Math.max(20, initialPosition.x + initialSize.width - mouseX);
              newX = Math.min(mouseX, initialPosition.x + initialSize.width - 20);
              if (maintainAspectRatio) {
                newHeight = newWidth / aspectRatio;
              }
              break;
              
            case 'n': // North
              newHeight = Math.max(20, initialPosition.y + initialSize.height - mouseY);
              newY = Math.min(mouseY, initialPosition.y + initialSize.height - 20);
              if (maintainAspectRatio) {
                newWidth = newHeight * aspectRatio;
              }
              break;
              
            case 's': // South
              newHeight = Math.max(20, mouseY - initialPosition.y);
              if (maintainAspectRatio) {
                newWidth = newHeight * aspectRatio;
              }
              break;
          }

          updateElementDirect(selectedElement.id, { 
            width: Math.round(newWidth), 
            height: Math.round(newHeight),
            x: Math.round(newX),
            y: Math.round(newY)
          });
        }
      }, 16); // Throttle to ~60fps for smoother interaction
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
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
  }, [isDragging, isResizing, selectedElement, dragOffset, resizeHandle, initialSize, initialPosition, zoom, template]);

  // Calculate optimal zoom level to fit template within workspace
  const calculateOptimalZoom = (template: TemplateSize) => {
    // Get the actual workspace dimensions
    // Account for padding (8px * 2), toolbar height (~80px), and some margin
    const workspaceElement = canvasRef.current?.parentElement;
    const maxWorkspaceWidth = (workspaceElement?.clientWidth || window.innerWidth * 0.6) - 64; // 64px for padding
    const maxWorkspaceHeight = (window.innerHeight - 140 - 80 - 100); // 140px header, 80px toolbar, 100px bottom bar
    
    // Calculate scale factors for width and height
    const scaleX = maxWorkspaceWidth / template.pixelWidth;
    const scaleY = maxWorkspaceHeight / template.pixelHeight;
    
    // Use the smaller scale factor to ensure template fits within bounds
    const optimalScale = Math.min(scaleX, scaleY);
    
    // Convert to percentage - allow wider range from 25% to 400%
    const optimalZoom = Math.min(Math.max(optimalScale * 100, 25), 400);
    
    return Math.round(optimalZoom);
  };

  // Auto-adjust zoom when template changes
  useEffect(() => {
    if (template) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const optimalZoom = calculateOptimalZoom(template);
        setZoom(optimalZoom);
      }, 100);
    }
  }, [template?.id]);









  // Function to fit all content within safety margins
  const handleFitToBounds = () => {
    if (!template || !canvasElements || canvasElements.length === 0) {
      console.log('❌ Cannot fit to bounds: missing template or elements');
      return;
    }
    
    // Calculate 3mm safety margins
    const safetyMarginMm = 3;
    const safeWidth = template.width - (safetyMarginMm * 2);
    const safeHeight = template.height - (safetyMarginMm * 2);
    
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
    
    if (scaleFactor < 1) {
      console.log(`🎯 Scaling content by ${(scaleFactor * 100).toFixed(0)}% to fit within safety margins`);
      
      // Scale and reposition all elements
      canvasElements.forEach(element => {
        const relativeX = element.x - minX;
        const relativeY = element.y - minY;
        
        const newWidth = Math.round(element.width * scaleFactor);
        const newHeight = Math.round(element.height * scaleFactor);
        const newX = Math.round(safetyMarginMm + (relativeX * scaleFactor));
        const newY = Math.round(safetyMarginMm + (relativeY * scaleFactor));
        
        updateElementDirect(element.id, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        });
      });
    } else {
      // Just center the content if it already fits
      const centerOffsetX = (safeWidth - contentWidth) / 2 + safetyMarginMm;
      const centerOffsetY = (safeHeight - contentHeight) / 2 + safetyMarginMm;
      
      console.log('🎯 Centering content within safety margins');
      
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

  if (!template) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading canvas...</div>
      </div>
    );
  }

  const canvasWidth = template.pixelWidth * (zoom / 100);
  const canvasHeight = template.pixelHeight * (zoom / 100);

  return (
    <TooltipProvider>
    <div className="flex-1 flex flex-col">
      {/* Garment Color Required Warning */}
      {!project.garmentColor && (
        <div className="bg-red-500 text-white px-4 py-2 text-sm font-medium">
          ⚠️ Please select a garment color in the sidebar before uploading logos
        </div>
      )}
      
      {/* Canvas Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left section - Upload and Controls */}
          <div className="flex items-center space-x-4">
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
                  <Button variant="outline" size="sm" onClick={handleZoomToFill}>
                    <Maximize className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Zoom to fill workspace</p>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="h-6 w-px bg-gray-300"></div>
            
            {/* Grid and Guide Controls */}
            <div className="flex items-center space-x-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showGrid ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowGrid(!showGrid)}
                  >
                    <Grid3X3 className="w-4 h-4 mr-1" />
                    Grid
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle grid overlay for precise alignment</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showGuides ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowGuides(!showGuides)}
                  >
                    <AlignCenter className="w-4 h-4 mr-1" />
                    Guides
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle alignment guides for positioning elements</p>
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

            </div>

            <div className="h-6 w-px bg-gray-300"></div>

            {/* Color Management Toggle */}
            <ColorManagementToggle
              enabled={colorManagementEnabled}
              onToggle={setColorManagementEnabled}
              iccProfileName="PSO Coated FOGRA51 (EFI)"
            />


          </div>
          
          {/* Right section - Undo/Redo */}
          <div className="flex items-center space-x-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyIndex <= 0}>
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
                <Button variant="outline" size="sm" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
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
      <div className="flex-1 p-8 overflow-auto" style={{ backgroundColor: '#606060' }}>
        <div className="flex items-center justify-center min-h-full" style={{ padding: '100px 0' }}>
          <div className="relative">

            <div
              ref={canvasRef}
              className="relative shadow-xl rounded-lg overflow-hidden"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                backgroundColor: project.garmentColor || '#EAEAEA'
              }}
              onClick={handleCanvasClick}
            >
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
                      {/* Warning message */}
                      <div 
                        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                                   bg-red-50 border border-red-300 rounded-lg px-4 py-3 max-w-md text-center"
                        style={{ 
                          opacity: canvasElements.length === 0 ? 0.9 : 0,
                          pointerEvents: 'none',
                          transition: 'opacity 0.3s ease-in-out'
                        }}
                      >
                        <p className="text-sm text-red-800 font-medium">
                          Safety Zone Warning
                        </p>
                        <p className="text-xs text-red-700 mt-1">
                          Keep all content within the red guide lines (3mm from edges) to avoid clipping during production
                        </p>
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

              const isSelected = selectedElement?.id === element.id;
              
              // Check if this is a Single Colour Transfer template requiring ink color recoloring
              const isSingleColourTemplate = template?.group === "Single Colour Transfers";
              const shouldRecolorForInk = isSingleColourTemplate && project.inkColor && logo;
              
              // Debug: Log color overrides for this element
              if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
                console.log(`Element ${element.id} has color overrides:`, element.colorOverrides);
              }
              
              // Convert mm to pixels for display (using template's pixel ratio)
              const mmToPixelRatio = template.pixelWidth / template.width; // pixels per mm
              
              // Always use the database dimensions directly - they're already swapped by the backend
              const elementWidth = element.width * mmToPixelRatio * (zoom / 100);
              const elementHeight = element.height * mmToPixelRatio * (zoom / 100);
              const elementX = element.x * mmToPixelRatio * (zoom / 100);
              const elementY = element.y * mmToPixelRatio * (zoom / 100);
              
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
                  className={`absolute cursor-move ${
                    isSelected ? 'border-2 border-primary bg-blue-50 bg-opacity-50' : 'border border-gray-300 hover:border-gray-400'
                  }`}
                  style={{
                    left: elementX,
                    top: elementY,
                    width: elementWidth,
                    height: elementHeight,
                    zIndex: element.zIndex,
                    transform: `rotate(${element.rotation || 0}deg)`,
                    transformOrigin: 'center'
                  }}
                  onClick={(e) => handleElementClick(element, e)}
                  onMouseDown={(e) => handleMouseDown(element, e)}
                >
                  {/* Element Content */}
                  <div 
                    className="w-full h-full flex items-center justify-center border border-gray-200 rounded overflow-hidden" 
                    style={{ 
                      background: 'transparent', 
                      backgroundColor: 'transparent'
                    }}
                  >
                    {/* Logo Elements */}

                    {(element.elementType === 'logo' || (!element.elementType && element.logoId)) && logo ? (
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
                          filter: colorManagementEnabled 
                            ? "brightness(0.98) contrast(1.02) saturate(0.95)" 
                            : "none",
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
                          console.error('Failed to load image:', logo ? getImageUrl(logo) : 'unknown');
                          // Show fallback icon if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && logo) {
                            parent.innerHTML = `
                              <div class="flex flex-col items-center justify-center text-gray-500 p-2">
                                <svg class="w-8 h-8 mb-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
                                </svg>
                                <span class="text-xs">${logo.originalName}</span>
                              </div>
                            `;
                          }
                        }}
                      />
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
                  {isSelected && (
                    <>
                      {/* Corner handles with resize functionality */}
                      <div 
                        className="absolute -top-1 -left-1 w-3 h-3 bg-primary border border-white rounded-full cursor-nw-resize" 
                        onMouseDown={(e) => handleResizeStart(e, element, 'nw')}
                      />
                      <div 
                        className="absolute -top-1 left-1/2 w-3 h-3 bg-primary border border-white rounded-full cursor-n-resize transform -translate-x-1/2" 
                        onMouseDown={(e) => handleResizeStart(e, element, 'n')}
                      />
                      <div 
                        className="absolute -top-1 -right-1 w-3 h-3 bg-primary border border-white rounded-full cursor-ne-resize" 
                        onMouseDown={(e) => handleResizeStart(e, element, 'ne')}
                      />
                      <div 
                        className="absolute top-1/2 -right-1 w-3 h-3 bg-primary border border-white rounded-full cursor-e-resize transform -translate-y-1/2" 
                        onMouseDown={(e) => handleResizeStart(e, element, 'e')}
                      />
                      <div 
                        className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary border border-white rounded-full cursor-se-resize" 
                        onMouseDown={(e) => handleResizeStart(e, element, 'se')}
                      />
                      <div 
                        className="absolute -bottom-1 left-1/2 w-3 h-3 bg-primary border border-white rounded-full cursor-s-resize transform -translate-x-1/2" 
                        onMouseDown={(e) => handleResizeStart(e, element, 's')}
                      />
                      <div 
                        className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary border border-white rounded-full cursor-sw-resize" 
                        onMouseDown={(e) => handleResizeStart(e, element, 'sw')}
                      />
                      <div 
                        className="absolute top-1/2 -left-1 w-3 h-3 bg-primary border border-white rounded-full cursor-w-resize transform -translate-y-1/2" 
                        onMouseDown={(e) => handleResizeStart(e, element, 'w')}
                      />
                      
                      {/* Rotation Handle - Positioned above element */}
                      <div 
                        className="absolute left-1/2 transform -translate-x-1/2 cursor-grab z-20 bg-white shadow-lg rounded-full p-2 border-2 border-primary"
                        style={{ 
                          top: '-30px',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          let rotationTimeout: NodeJS.Timeout;
                          
                          const handleRotationMouseMove = (moveEvent: MouseEvent) => {
                            if (!canvasRef.current) return;
                            
                            clearTimeout(rotationTimeout);
                            
                            rotationTimeout = setTimeout(async () => {
                              const rect = canvasRef.current!.getBoundingClientRect();
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
                            }, 50);
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
                        <RotateCw className="w-4 h-4 text-primary" title="Drag to rotate" />
                      </div>

                      {/* Delete Handle - show for all elements when selected */}
                      <div 
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 border-2 border-white rounded-full cursor-pointer flex items-center justify-center shadow-lg z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Prevent multiple rapid clicks
                          if (!deleteElementMutation.isPending) {
                            deleteElementMutation.mutate(element.id);
                          }
                        }}
                        title="Delete element"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Canvas Info */}
            <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-white px-2 py-1 rounded">
              {template.label} ({template.width}×{template.height}mm) • {project.garmentColor ? getColorName(project.garmentColor) : 'No Color'} Garment
              {colorManagementEnabled && (
                <span className="ml-2 px-1 bg-primary text-primary-foreground rounded text-xs">
                  ICC Preview
                </span>
              )}
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
          onVectorizeWithAI={handleVectorizeWithAI}
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
