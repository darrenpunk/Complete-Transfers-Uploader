import { useRef, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Logo, CanvasElement, TemplateSize } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Grid3X3, AlignCenter, Undo, Redo, Upload, Trash2 } from "lucide-react";
import ColorManagementToggle from "./color-management-toggle";

interface CanvasWorkspaceProps {
  project: Project;
  template?: TemplateSize;
  logos: Logo[];
  canvasElements: CanvasElement[];
  selectedElement: CanvasElement | null;
  onElementSelect: (element: CanvasElement | null) => void;
  onLogoUpload?: (files: File[]) => void;
}

export default function CanvasWorkspace({
  project,
  template,
  logos,
  canvasElements,
  selectedElement,
  onElementSelect,
  onLogoUpload
}: CanvasWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [colorManagementEnabled, setColorManagementEnabled] = useState(true);
  const [colorManagedUrls, setColorManagedUrls] = useState<Record<string, string>>({});

  // Set default zoom based on template size
  useEffect(() => {
    if (template) {
      // Set 25% zoom for large DTF template (1000x550mm)
      if (template.width === 1000 && template.height === 550) {
        setZoom(25);
      } else {
        setZoom(100);
      }
    }
  }, [template]);
  const [showGrid, setShowGrid] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [initialSize, setInitialSize] = useState({ width: 0, height: 0 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Update canvas element mutation
  const updateElementMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CanvasElement> }) => {
      const response = await apiRequest("PATCH", `/api/canvas-elements/${id}`, updates);
      return response.json();
    },
    onSuccess: (updatedElement) => {
      // Force invalidation to ensure UI updates
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", project.id, "canvas-elements"]
      });
      
      // Save to history after successful update (with small delay to get updated state)
      setTimeout(() => {
        if (canvasElements.length > 0) {
          saveToHistory(canvasElements);
        }
      }, 50);
    },
  });

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
    setZoom(Math.min(zoom + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(zoom - 25, 25));
  };

  // History management
  const saveToHistory = (elements: CanvasElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...elements]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      
      // Apply the previous state to all canvas elements
      previousState.forEach(historicalElement => {
        updateElementMutation.mutate({
          id: historicalElement.id,
          updates: {
            x: historicalElement.x,
            y: historicalElement.y,
            width: historicalElement.width,
            height: historicalElement.height,
            rotation: historicalElement.rotation
          }
        });
      });
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      
      // Apply the next state to all canvas elements
      nextState.forEach(historicalElement => {
        updateElementMutation.mutate({
          id: historicalElement.id,
          updates: {
            x: historicalElement.x,
            y: historicalElement.y,
            width: historicalElement.width,
            height: historicalElement.height,
            rotation: historicalElement.rotation
          }
        });
      });
    }
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

  // Color management now handled purely with CSS filters - no server processing needed

  // Function to get the image URL for display (now always uses original)
  const getImageUrl = (logo: Logo): string => {
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
      if (!canvasRef.current || updateElementMutation.isPending) return;

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

          updateElementMutation.mutate({
            id: selectedElement.id,
            updates: { x: Math.max(0, newX), y: Math.max(0, newY) }
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

          // Calculate new dimensions based on resize handle
          switch (resizeHandle) {
            case 'se': // Southeast
              newWidth = Math.max(20, mouseX - initialPosition.x);
              newHeight = Math.max(20, mouseY - initialPosition.y);
              break;
            case 'sw': // Southwest
              newWidth = Math.max(20, initialPosition.x + initialSize.width - mouseX);
              newHeight = Math.max(20, mouseY - initialPosition.y);
              newX = Math.min(mouseX, initialPosition.x + initialSize.width - 20);
              break;
            case 'ne': // Northeast
              newWidth = Math.max(20, mouseX - initialPosition.x);
              newHeight = Math.max(20, initialPosition.y + initialSize.height - mouseY);
              newY = Math.min(mouseY, initialPosition.y + initialSize.height - 20);
              break;
            case 'nw': // Northwest
              newWidth = Math.max(20, initialPosition.x + initialSize.width - mouseX);
              newHeight = Math.max(20, initialPosition.y + initialSize.height - mouseY);
              newX = Math.min(mouseX, initialPosition.x + initialSize.width - 20);
              newY = Math.min(mouseY, initialPosition.y + initialSize.height - 20);
              break;
            case 'e': // East
              newWidth = Math.max(20, mouseX - initialPosition.x);
              break;
            case 'w': // West
              newWidth = Math.max(20, initialPosition.x + initialSize.width - mouseX);
              newX = Math.min(mouseX, initialPosition.x + initialSize.width - 20);
              break;
            case 'n': // North
              newHeight = Math.max(20, initialPosition.y + initialSize.height - mouseY);
              newY = Math.min(mouseY, initialPosition.y + initialSize.height - 20);
              break;
            case 's': // South
              newHeight = Math.max(20, mouseY - initialPosition.y);
              break;
          }

          updateElementMutation.mutate({
            id: selectedElement.id,
            updates: { 
              width: Math.round(newWidth), 
              height: Math.round(newHeight),
              x: Math.round(newX),
              y: Math.round(newY)
            }
          });
        }
      }, 50); // Throttle to 20fps
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
  }, [isDragging, isResizing, selectedElement, dragOffset, resizeHandle, initialSize, initialPosition, zoom, updateElementMutation]);

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
                  if (files.length > 0 && onLogoUpload) {
                    onLogoUpload(files);
                    e.target.value = '';
                  }
                }}
              />
              <Button 
                variant="default" 
                size="sm"
                disabled={!project.garmentColor}
                onClick={() => document.getElementById('canvas-upload-input')?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Logos
              </Button>
              
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
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[60px] text-center">{zoom}%</span>
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="h-6 w-px bg-gray-300"></div>
            
            {/* Grid and Guide Controls */}
            <div className="flex items-center space-x-2">
              <Button
                variant={showGrid ? "default" : "outline"}
                size="sm"
                onClick={() => setShowGrid(!showGrid)}
              >
                <Grid3X3 className="w-4 h-4 mr-1" />
                Grid
              </Button>
              <Button
                variant={showGuides ? "default" : "outline"}
                size="sm"
                onClick={() => setShowGuides(!showGuides)}
              >
                <AlignCenter className="w-4 h-4 mr-1" />
                Guides
              </Button>
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
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyIndex <= 0}>
              <Undo className="w-4 h-4 mr-1" />
              Undo
            </Button>
            <Button variant="outline" size="sm" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
              <Redo className="w-4 h-4 mr-1" />
              Redo
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="flex-1 p-8 overflow-auto" style={{ backgroundColor: '#606060' }}>
        <div className="flex items-center justify-center min-h-full">
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

            {/* Canvas Elements */}
            {canvasElements.map((element) => {
              const logo = logos.find(l => l.id === element.logoId);
              if (!logo || !element.isVisible) return null;

              const isSelected = selectedElement?.id === element.id;
              
              // Check if this is a Single Colour Transfer template requiring ink color recoloring
              const isSingleColourTemplate = template?.group === "Single Colour Transfers";
              const shouldRecolorForInk = isSingleColourTemplate && project.inkColor;
              
              // Debug: Log color overrides for this element
              if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
                console.log(`Element ${element.id} has color overrides:`, element.colorOverrides);
              }
              
              // Convert mm to pixels for display (using template's pixel ratio)
              const mmToPixelRatio = template.pixelWidth / template.width; // pixels per mm
              const elementWidth = element.width * mmToPixelRatio * (zoom / 100);
              const elementHeight = element.height * mmToPixelRatio * (zoom / 100);
              const elementX = element.x * mmToPixelRatio * (zoom / 100);
              const elementY = element.y * mmToPixelRatio * (zoom / 100);

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
                    transform: `rotate(${element.rotation}deg)`,
                    zIndex: element.zIndex
                  }}
                  onClick={(e) => handleElementClick(element, e)}
                  onMouseDown={(e) => handleMouseDown(element, e)}
                >
                  {/* Logo Content */}
                  <div className="w-full h-full flex items-center justify-center border border-gray-200 rounded overflow-hidden" style={{ background: 'transparent', backgroundColor: 'transparent' }}>
                    {logo.mimeType?.startsWith('image/') ? (
                      <img
                        src={
                          // Priority 1: Element has individual color overrides
                          element.colorOverrides && Object.keys(element.colorOverrides).length > 0 
                            ? `/uploads/${element.id}_modified.svg?t=${Date.now()}`
                            // Priority 2: Single Colour Transfer with ink color selected
                            : shouldRecolorForInk 
                              ? `/uploads/${logo.filename}?inkColor=${encodeURIComponent(project.inkColor)}&recolor=true&t=${Date.now()}`
                              // Priority 3: Original image
                              : getImageUrl(logo)
                        }
                        alt={logo.originalName}
                        className="w-full h-full object-fill"
                        style={{ 
                          background: 'transparent', 
                          backgroundColor: 'transparent',
                          filter: colorManagementEnabled 
                            ? "brightness(0.98) contrast(1.02) saturate(0.95)" 
                            : "none"
                        }}
                        draggable={false}
                        onLoad={() => {
                          const imageUrl = element.colorOverrides && Object.keys(element.colorOverrides).length > 0 
                            ? `/uploads/${element.id}_modified.svg`
                            : shouldRecolorForInk 
                              ? `/uploads/${logo.filename}?inkColor=${project.inkColor}&recolor=true`
                              : getImageUrl(logo);
                          console.log('Image loaded:', imageUrl);
                        }}
                        onError={(e) => {
                          console.error('Failed to load image:', getImageUrl(logo));
                          // Show fallback icon if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
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
                    ) : logo.mimeType === 'application/pdf' ? (
                      <div className="flex flex-col items-center justify-center text-red-600 p-2 bg-red-50 border border-red-200 rounded">
                        <svg className="w-12 h-12 mb-2" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                          <path d="M10.5,11.5C10.5,12.3 9.8,13 9,13H8V15H6.5V9H9C9.8,9 10.5,9.7 10.5,10.5V11.5M9,10.5H8V11.5H9V10.5Z" />
                          <path d="M12.5,9H14.5C15.3,9 16,9.7 16,10.5V11C16,11.8 15.3,12.5 14.5,12.5H13V15H12.5V9M14.5,10.5H13V11H14.5V10.5Z" />
                          <path d="M18.5,9V15H17V13H16V15H14.5V9H16V11.5H17V9H18.5Z" />
                        </svg>
                        <div className="text-center">
                          <div className="text-xs font-bold text-red-800">PDF UPLOAD FAILED</div>
                          <div className="text-xs mt-1 text-red-700">Conversion needed</div>
                          <div className="text-xs mt-1 px-1 max-w-full break-words text-gray-600">{logo.originalName}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-500 p-2">
                        <svg className="w-8 h-8 mb-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs text-center break-all">{logo.originalName}</span>
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
                      
                      {/* Rotation Handle */}
                      <div 
                        className="absolute -top-6 left-1/2 transform -translate-x-1/2 cursor-grab"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          let rotationTimeout: NodeJS.Timeout;
                          
                          const handleRotationMouseMove = (moveEvent: MouseEvent) => {
                            if (!canvasRef.current) return;
                            
                            clearTimeout(rotationTimeout);
                            
                            rotationTimeout = setTimeout(() => {
                              if (!updateElementMutation.isPending) {
                                const rect = canvasRef.current!.getBoundingClientRect();
                                const centerX = elementX + elementWidth / 2;
                                const centerY = elementY + elementHeight / 2;
                                
                                const angle = Math.atan2(
                                  moveEvent.clientY - rect.top - centerY,
                                  moveEvent.clientX - rect.left - centerX
                                ) * (180 / Math.PI);
                                
                                updateElementMutation.mutate({
                                  id: element.id,
                                  updates: { rotation: Math.round(angle) }
                                });
                              }
                            }, 100);
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
                        <div className="w-1 h-4 bg-primary" />
                        <div className="w-4 h-4 bg-primary border-2 border-white rounded-full" />
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
              {template.label} ({template.width}×{template.height}mm) • {project.garmentColor} Background
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
  );
}
