import React, { useState, useRef, useEffect } from 'react';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SimpleCropInterfaceProps {
  imageUrl: string;
  onCropChange: (area: CropArea | null) => void;
  cropArea: CropArea | null;
  onApplyCrop: () => void;
  isProcessing: boolean;
}

export const SimpleCropInterface: React.FC<SimpleCropInterfaceProps> = ({
  imageUrl,
  onCropChange,
  cropArea,
  onApplyCrop,
  isProcessing
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState('');
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get mouse position constrained to the actual displayed image area
  const getRelativePos = (e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    
    const img = containerRef.current.querySelector('img') as HTMLImageElement;
    if (!img) return { x: 0, y: 0 };
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    
    // Calculate actual displayed image dimensions and position with object-contain
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    const imageAspect = img.naturalWidth / img.naturalHeight;
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
    
    // Constrain coordinates to only be within the displayed image bounds
    const x = Math.max(offsetX, Math.min(offsetX + actualDisplayedWidth, mouseX));
    const y = Math.max(offsetY, Math.min(offsetY + actualDisplayedHeight, mouseY));
    
    return { x, y }; // Return container coordinates constrained to image area
  };

  // Handle mouse down for new selection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && e.target !== containerRef.current?.querySelector('img')) return;
    
    e.preventDefault();
    const pos = getRelativePos(e);
    setIsDrawing(true);
    setStartPos(pos);
    onCropChange(null); // Clear existing crop
  };

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
    setStartPos(getRelativePos(e));
  };

  // Global mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!startPos) return;
      
      const pos = getRelativePos(e);

      if (isDrawing) {
        // Create new selection
        const rect = {
          x: Math.min(startPos.x, pos.x),
          y: Math.min(startPos.y, pos.y),
          width: Math.abs(pos.x - startPos.x),
          height: Math.abs(pos.y - startPos.y)
        };
        if (rect.width > 5 && rect.height > 5) {
          onCropChange(rect);
        }
      } else if (isResizing && cropArea) {
        // Resize existing selection
        const deltaX = pos.x - startPos.x;
        const deltaY = pos.y - startPos.y;
        let newArea = { ...cropArea };

        switch (resizeHandle) {
          case 'nw':
            newArea.x += deltaX;
            newArea.y += deltaY;
            newArea.width -= deltaX;
            newArea.height -= deltaY;
            break;
          case 'ne':
            newArea.y += deltaY;
            newArea.width += deltaX;
            newArea.height -= deltaY;
            break;
          case 'sw':
            newArea.x += deltaX;
            newArea.width -= deltaX;
            newArea.height += deltaY;
            break;
          case 'se':
            newArea.width += deltaX;
            newArea.height += deltaY;
            break;
        }

        // Ensure minimum size
        newArea.width = Math.max(20, newArea.width);
        newArea.height = Math.max(20, newArea.height);
        newArea.x = Math.max(0, newArea.x);
        newArea.y = Math.max(0, newArea.y);

        onCropChange(newArea);
        setStartPos(pos); // Update for next delta calculation
      }
    };

    const handleMouseUp = () => {
      setIsDrawing(false);
      setIsResizing(false);
      setResizeHandle('');
      setStartPos(null);
    };

    if (isDrawing || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDrawing, isResizing, startPos, cropArea, resizeHandle, onCropChange]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-gray-100 cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
    >
      <img
        src={imageUrl}
        alt="Crop preview"
        className="crop-interface absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* DEBUG: Visual indicator showing actual image boundaries */}
      <div 
        className="absolute border-2 border-red-500 opacity-50 pointer-events-none"
        style={{
          left: `${containerRef.current ? (() => {
            const img = containerRef.current.querySelector('img') as HTMLImageElement;
            if (!img) return 0;
            const containerRect = containerRef.current.getBoundingClientRect();
            const imageAspect = img.naturalWidth / img.naturalHeight;
            const containerAspect = containerRect.width / containerRect.height;
            if (imageAspect > containerAspect) {
              return 0;
            } else {
              return (containerRect.width - (containerRect.height * imageAspect)) / 2;
            }
          })() : 0}px`,
          top: `${containerRef.current ? (() => {
            const img = containerRef.current.querySelector('img') as HTMLImageElement;
            if (!img) return 0;
            const containerRect = containerRef.current.getBoundingClientRect();
            const imageAspect = img.naturalWidth / img.naturalHeight;
            const containerAspect = containerRect.width / containerRect.height;
            if (imageAspect > containerAspect) {
              return (containerRect.height - (containerRect.width / imageAspect)) / 2;
            } else {
              return 0;
            }
          })() : 0}px`,
          width: `${containerRef.current ? (() => {
            const img = containerRef.current.querySelector('img') as HTMLImageElement;
            if (!img) return '100%';
            const containerRect = containerRef.current.getBoundingClientRect();
            const imageAspect = img.naturalWidth / img.naturalHeight;
            const containerAspect = containerRect.width / containerRect.height;
            if (imageAspect > containerAspect) {
              return containerRect.width;
            } else {
              return containerRect.height * imageAspect;
            }
          })() : '100%'}px`,
          height: `${containerRef.current ? (() => {
            const img = containerRef.current.querySelector('img') as HTMLImageElement;
            if (!img) return '100%';
            const containerRect = containerRef.current.getBoundingClientRect();
            const imageAspect = img.naturalWidth / img.naturalHeight;
            const containerAspect = containerRect.width / containerRect.height;
            if (imageAspect > containerAspect) {
              return containerRect.width / imageAspect;
            } else {
              return containerRect.height;
            }
          })() : '100%'}px`
        }}
      >
        <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-1 py-0.5 rounded">
          Image Area
        </div>
      </div>
      
      {/* Crop overlay */}
      {cropArea && (
        <div>
          {/* Selection rectangle */}
          <div 
            className="absolute border-2 border-blue-500 bg-blue-200 bg-opacity-20"
            style={{
              left: cropArea.x,
              top: cropArea.y,
              width: cropArea.width,
              height: cropArea.height,
            }}
          />
          
          {/* Resize handles */}
          <div 
            className="absolute w-3 h-3 bg-blue-500 border border-white cursor-nw-resize"
            style={{ left: cropArea.x - 6, top: cropArea.y - 6 }}
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
          />
          <div 
            className="absolute w-3 h-3 bg-blue-500 border border-white cursor-ne-resize"
            style={{ left: cropArea.x + cropArea.width - 6, top: cropArea.y - 6 }}
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
          />
          <div 
            className="absolute w-3 h-3 bg-blue-500 border border-white cursor-sw-resize"
            style={{ left: cropArea.x - 6, top: cropArea.y + cropArea.height - 6 }}
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
          />
          <div 
            className="absolute w-3 h-3 bg-blue-500 border border-white cursor-se-resize"
            style={{ left: cropArea.x + cropArea.width - 6, top: cropArea.y + cropArea.height - 6 }}
            onMouseDown={(e) => handleResizeStart(e, 'se')}
          />
        </div>
      )}
      
      {/* Action buttons */}
      {cropArea && (
        <div className="absolute bottom-4 left-4 flex gap-2">
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium shadow-lg"
            onClick={onApplyCrop}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Apply Crop & Vectorize'}
          </button>
          <button
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium shadow-lg"
            onClick={() => onCropChange(null)}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};