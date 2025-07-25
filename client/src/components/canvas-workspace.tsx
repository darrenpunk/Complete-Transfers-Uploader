import { useRef, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Logo, CanvasElement, TemplateSize } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Grid3X3, AlignCenter, Undo, Redo } from "lucide-react";

interface CanvasWorkspaceProps {
  project: Project;
  template?: TemplateSize;
  logos: Logo[];
  canvasElements: CanvasElement[];
  selectedElement: CanvasElement | null;
  onElementSelect: (element: CanvasElement | null) => void;
}

export default function CanvasWorkspace({
  project,
  template,
  logos,
  canvasElements,
  selectedElement,
  onElementSelect
}: CanvasWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Update canvas element mutation
  const updateElementMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CanvasElement> }) => {
      const response = await apiRequest("PATCH", `/api/canvas-elements/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "canvas-elements"] });
    },
  });

  const handleZoomIn = () => {
    setZoom(Math.min(zoom + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(zoom - 25, 25));
  };

  const handleElementClick = (element: CanvasElement, event: React.MouseEvent) => {
    event.stopPropagation();
    onElementSelect(element);
  };

  const handleCanvasClick = () => {
    onElementSelect(null);
  };

  const handleMouseDown = (element: CanvasElement, event: React.MouseEvent) => {
    if (!element) return;
    
    event.preventDefault();
    setIsDragging(true);
    onElementSelect(element);
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: event.clientX - rect.left - element.x * (zoom / 100),
        y: event.clientY - rect.top - element.y * (zoom / 100)
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging || !selectedElement || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const newX = (event.clientX - rect.left - dragOffset.x) / (zoom / 100);
      const newY = (event.clientY - rect.top - dragOffset.y) / (zoom / 100);

      // Update element position
      updateElementMutation.mutate({
        id: selectedElement.id,
        updates: { x: Math.max(0, newX), y: Math.max(0, newY) }
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, selectedElement, dragOffset, zoom, updateElementMutation]);

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
      {/* Canvas Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
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
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Undo className="w-4 h-4 mr-1" />
              Undo
            </Button>
            <Button variant="outline" size="sm">
              <Redo className="w-4 h-4 mr-1" />
              Redo
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="flex-1 bg-gray-100 p-8 overflow-auto">
        <div className="flex items-center justify-center min-h-full">
          <div
            ref={canvasRef}
            className="relative bg-white shadow-xl rounded-lg overflow-hidden"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              backgroundColor: project.garmentColor
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
              const elementWidth = element.width * (zoom / 100);
              const elementHeight = element.height * (zoom / 100);
              const elementX = element.x * (zoom / 100);
              const elementY = element.y * (zoom / 100);

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
                  <div className="w-full h-full flex items-center justify-center bg-white border border-gray-200 rounded overflow-hidden">
                    <img
                      src={logo.url}
                      alt={logo.originalName}
                      className="max-w-full max-h-full object-contain"
                      draggable={false}
                    />
                  </div>

                  {/* Transformation Handles */}
                  {isSelected && (
                    <>
                      {/* Corner handles */}
                      <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary border border-white rounded-full cursor-nw-resize" />
                      <div className="absolute -top-1 left-1/2 w-3 h-3 bg-primary border border-white rounded-full cursor-n-resize transform -translate-x-1/2" />
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary border border-white rounded-full cursor-ne-resize" />
                      <div className="absolute top-1/2 -right-1 w-3 h-3 bg-primary border border-white rounded-full cursor-e-resize transform -translate-y-1/2" />
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary border border-white rounded-full cursor-se-resize" />
                      <div className="absolute -bottom-1 left-1/2 w-3 h-3 bg-primary border border-white rounded-full cursor-s-resize transform -translate-x-1/2" />
                      <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary border border-white rounded-full cursor-sw-resize" />
                      <div className="absolute top-1/2 -left-1 w-3 h-3 bg-primary border border-white rounded-full cursor-w-resize transform -translate-y-1/2" />
                      
                      {/* Rotation Handle */}
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                        <div className="w-1 h-4 bg-primary" />
                        <div className="w-4 h-4 bg-primary border-2 border-white rounded-full cursor-grab" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Canvas Info */}
            <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-white px-2 py-1 rounded">
              {template.label} ({template.width}×{template.height}mm) • {project.garmentColor} Background
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
