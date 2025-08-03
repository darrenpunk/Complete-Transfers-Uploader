export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX?: number;
  scaleY?: number;
}

export const mmToPx = (mm: number, dpi: number = 72): number => {
  return (mm * dpi) / 25.4;
};

export const pxToMm = (px: number, dpi: number = 72): number => {
  return (px * 25.4) / dpi;
};

export const snapToGrid = (value: number, gridSize: number = 10): number => {
  return Math.round(value / gridSize) * gridSize;
};

export const constrainToCanvas = (
  transform: Transform,
  canvasSize: Size,
  safetyMarginMm: number = 3
): Transform => {
  // Convert safety margin from mm to pixels (using 0.35mm per pixel)
  const safetyMarginPx = safetyMarginMm / 0.35;
  
  const constrainedX = Math.max(safetyMarginPx, Math.min(transform.x, canvasSize.width - transform.width - safetyMarginPx));
  const constrainedY = Math.max(safetyMarginPx, Math.min(transform.y, canvasSize.height - transform.height - safetyMarginPx));
  
  return {
    ...transform,
    x: constrainedX,
    y: constrainedY,
  };
};

export const calculateAspectRatio = (width: number, height: number): number => {
  return width / height;
};

export const maintainAspectRatio = (
  newSize: Partial<Size>,
  currentSize: Size,
  aspectRatio: number
): Size => {
  if (newSize.width !== undefined) {
    return {
      width: newSize.width,
      height: newSize.width / aspectRatio,
    };
  } else if (newSize.height !== undefined) {
    return {
      width: newSize.height * aspectRatio,
      height: newSize.height,
    };
  }
  return currentSize;
};

export const rotatePoint = (point: Point, center: Point, angle: number): Point => {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

export const getBoundingBox = (transforms: Transform[]): Transform | null => {
  if (transforms.length === 0) return null;
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  transforms.forEach(transform => {
    minX = Math.min(minX, transform.x);
    minY = Math.min(minY, transform.y);
    maxX = Math.max(maxX, transform.x + transform.width);
    maxY = Math.max(maxY, transform.y + transform.height);
  });
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    rotation: 0,
  };
};

export const alignElements = (
  elements: Transform[],
  alignType: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
  canvasSize?: Size,
  safetyMarginMm: number = 3
): Transform[] => {
  if (elements.length === 0) return elements;
  
  const boundingBox = getBoundingBox(elements);
  if (!boundingBox) return elements;
  
  // Convert safety margin from mm to pixels (using 0.35mm per pixel)
  const safetyMarginPx = safetyMarginMm / 0.35;
  
  return elements.map(element => {
    switch (alignType) {
      case 'left':
        return { ...element, x: safetyMarginPx };
      case 'center':
        if (canvasSize) {
          const safeZoneWidth = canvasSize.width - (2 * safetyMarginPx);
          const safeZoneCenterX = safetyMarginPx + (safeZoneWidth / 2);
          return { ...element, x: safeZoneCenterX - (element.width / 2) };
        }
        return { ...element, x: boundingBox.x + (boundingBox.width - element.width) / 2 };
      case 'right':
        if (canvasSize) {
          return { ...element, x: canvasSize.width - safetyMarginPx - element.width };
        }
        return { ...element, x: boundingBox.x + boundingBox.width - element.width };
      case 'top':
        return { ...element, y: safetyMarginPx };
      case 'middle':
        if (canvasSize) {
          const safeZoneHeight = canvasSize.height - (2 * safetyMarginPx);
          const safeZoneCenterY = safetyMarginPx + (safeZoneHeight / 2);
          return { ...element, y: safeZoneCenterY - (element.height / 2) };
        }
        return { ...element, y: boundingBox.y + (boundingBox.height - element.height) / 2 };
      case 'bottom':
        if (canvasSize) {
          return { ...element, y: canvasSize.height - safetyMarginPx - element.height };
        }
        return { ...element, y: boundingBox.y + boundingBox.height - element.height };
      default:
        return element;
    }
  });
};

export const distributeElements = (
  elements: Transform[],
  direction: 'horizontal' | 'vertical'
): Transform[] => {
  if (elements.length < 3) return elements;
  
  const sorted = [...elements].sort((a, b) => 
    direction === 'horizontal' ? a.x - b.x : a.y - b.y
  );
  
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  const totalSpace = direction === 'horizontal' 
    ? last.x - first.x - first.width
    : last.y - first.y - first.height;
    
  const spacing = totalSpace / (sorted.length - 1);
  
  return sorted.map((element, index) => {
    if (index === 0 || index === sorted.length - 1) {
      return element;
    }
    
    const position = direction === 'horizontal'
      ? first.x + first.width + spacing * index
      : first.y + first.height + spacing * index;
      
    return {
      ...element,
      [direction === 'horizontal' ? 'x' : 'y']: position
    };
  });
};
