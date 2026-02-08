import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CanvasElement, Logo, Project, TemplateSize } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Image, Eye, EyeOff, Lock, Unlock, CheckCircle, AlertTriangle, Copy, Grid, ChevronDown, ChevronRight, Settings, Layers, Move, Package, RotateCw, Palette } from "lucide-react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical
} from "lucide-react";

import CMYKColorModal from "./cmyk-color-modal";
import GarmentColorModal from "./garment-color-modal";
import ImpositionModal from "./imposition-modal";
import TemplateSelectorModal from "./template-selector-modal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { manufacturerColors } from "@shared/garment-colors";

import TShirtSwatch from "@/components/ui/tshirt-swatch";
import { useToast } from "@/hooks/use-toast";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Professional color palette
const quickColors = [
  { name: "White", hex: "#FFFFFF", rgb: "255, 255, 255", cmyk: "0, 0, 0, 0", inkType: "Process" },
  { name: "Black", hex: "#171816", rgb: "23, 24, 22", cmyk: "0, 0, 0, 100", inkType: "Process" },
  { name: "Navy", hex: "#201C3A", rgb: "32, 28, 58", cmyk: "100, 92, 36, 39", inkType: "Process" },
  { name: "Royal Blue", hex: "#221866", rgb: "34, 24, 102", cmyk: "100, 95, 5, 0", inkType: "Process" },
  { name: "Kelly Green", hex: "#3C8A35", rgb: "60, 138, 53", cmyk: "85, 10, 100, 0", inkType: "Process" },
  { name: "Red", hex: "#C02300", rgb: "192, 35, 0", cmyk: "0, 99, 97, 0", inkType: "Process" },
  { name: "Yellow", hex: "#F0F42A", rgb: "240, 244, 42", cmyk: "5, 0, 90, 0", inkType: "Process" },
  { name: "Purple", hex: "#4C0A6A", rgb: "76, 10, 106", cmyk: "75, 100, 0, 0", inkType: "Process" },
  { name: "Hi Viz", hex: "#D2E31D", rgb: "210, 227, 29", cmyk: "20, 0, 100, 0", inkType: "Spot" },
  { name: "Hi Viz Orange", hex: "#D98F17", rgb: "217, 143, 23", cmyk: "0, 51, 93, 0", inkType: "Spot" }
];

// Function to get color name from hex value
function getColorName(hex: string): string {
  // Check quick colors first
  const quickColor = quickColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  if (quickColor) {
    return quickColor.name;
  }

  // Check manufacturer colors
  for (const [manufacturerName, colorGroups] of Object.entries(manufacturerColors)) {
    for (const group of colorGroups) {
      const manufacturerColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
      if (manufacturerColor) {
        return `${manufacturerColor.name} (${manufacturerColor.code})`;
      }
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

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  selectedElements?: CanvasElement[]; // All selected elements for group operations
  canvasElements: CanvasElement[];
  logos: Logo[];
  project: Project;
  templateSizes: TemplateSize[];
  onTemplateChange: (templateId: string) => void;
  onAlignElement?: (elementId: string, alignment: { x?: number; y?: number }) => void;
  onAlignElements?: (updates: Array<{ id: string; x: number; y: number; rotation?: number }>) => void;
  onCenterAllElements?: () => void;
  maintainAspectRatio?: boolean;
  onMaintainAspectRatioChange?: (maintain: boolean) => void;
  isAppliqueTemplate?: boolean;
}

export default function PropertiesPanel({
  selectedElement,
  selectedElements = [],
  canvasElements,
  logos,
  project,
  templateSizes,
  onTemplateChange,
  onAlignElement,
  onAlignElements,
  onCenterAllElements,
  maintainAspectRatio: propMaintainAspectRatio = true,
  onMaintainAspectRatioChange,
  isAppliqueTemplate = false
}: PropertiesPanelProps) {
  const { toast } = useToast();
  
  // Use prop if provided, otherwise fallback to local state
  const [localMaintainAspectRatio, setLocalMaintainAspectRatio] = useState(true);
  const maintainAspectRatio = propMaintainAspectRatio;
  const setMaintainAspectRatio = onMaintainAspectRatioChange || setLocalMaintainAspectRatio;
  const [showCMYKModal, setShowCMYKModal] = useState(false);
  const [showImpositionModal, setShowImpositionModal] = useState(false);
  const [showTemplateSelectorModal, setShowTemplateSelectorModal] = useState(false);
  
  // Local state for input values to prevent glitchy behavior
  const [localInputValues, setLocalInputValues] = useState({
    x: '',
    y: '',
    width: '',
    height: '',
    opacity: ''
  });
  
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);

  const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(false);
  const [preflightPanelCollapsed, setPreflightPanelCollapsed] = useState(false);
  
  // Get the current element data from canvasElements to ensure it's up-to-date
  // Always prefer the cached data over the props to ensure UI synchronization
  const currentElement = selectedElement 
    ? canvasElements.find(el => el.id === selectedElement.id) ?? selectedElement
    : null;
  
  // Get the current logo for the selected element
  const currentLogo = currentElement 
    ? logos.find(logo => logo.id === currentElement.logoId)
    : null;
    
  // Update local input values when the current element changes
  useEffect(() => {
    if (currentElement) {
      // When rotated 90° or 270°, visual dimensions are swapped
      const isRotated = currentElement.rotation === 90 || currentElement.rotation === 270;
      const visualWidth = isRotated ? currentElement.height : currentElement.width;
      const visualHeight = isRotated ? currentElement.width : currentElement.height;
      
      setLocalInputValues({
        x: (currentElement.x || 0).toFixed(2),
        y: (currentElement.y || 0).toFixed(2),
        width: (visualWidth || 0).toFixed(2),
        height: (visualHeight || 0).toFixed(2),
        opacity: Math.round((currentElement.opacity || 1) * 100).toString()
      });
    }
  }, [currentElement?.id, currentElement?.x, currentElement?.y, currentElement?.width, currentElement?.height, currentElement?.opacity, currentElement?.rotation]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debouncedUpdateRef.current) {
        clearTimeout(debouncedUpdateRef.current);
      }
    };
  }, []);

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      const response = await apiRequest("PATCH", `/api/projects/${project.id}`, updates);
      return response.json();
    },
    onSuccess: (updatedProject) => {
      // Update the project name in the parent component
      queryClient.setQueryData(["/api/projects", project.id], updatedProject);
    },
  });
  




  // Alignment handlers
  const getElementVisualDims = (el: CanvasElement) => {
    const rot = ((el.rotation || 0) % 360 + 360) % 360;
    const isRot = rot === 90 || rot === 270;
    return { w: isRot ? el.height : el.width, h: isRot ? el.width : el.height };
  };

  const handleAlign = (alignment: 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right') => {
    if (!currentElement || !onAlignElement) return;
    
    const currentTemplate = templateSizes.find(t => t.id === project.templateSize);
    if (!currentTemplate) return;
    
    const safetyMarginMm = 3;
    const templateHalfWidth = currentTemplate.width / 2;
    const templateHalfHeight = currentTemplate.height / 2;
    
    const elementsToAlign = selectedElements.length > 1 ? selectedElements : [currentElement];
    
    let groupMinX = Infinity, groupMinY = Infinity, groupMaxX = -Infinity, groupMaxY = -Infinity;
    elementsToAlign.forEach(el => {
      const { w, h } = getElementVisualDims(el);
      groupMinX = Math.min(groupMinX, el.x - w / 2);
      groupMinY = Math.min(groupMinY, el.y - h / 2);
      groupMaxX = Math.max(groupMaxX, el.x + w / 2);
      groupMaxY = Math.max(groupMaxY, el.y + h / 2);
    });
    
    const groupWidth = groupMaxX - groupMinX;
    const groupHeight = groupMaxY - groupMinY;
    const groupCenterX = (groupMinX + groupMaxX) / 2;
    const groupCenterY = (groupMinY + groupMaxY) / 2;
    const groupHalfWidth = groupWidth / 2;
    const groupHalfHeight = groupHeight / 2;
    
    let targetCenterX = groupCenterX;
    let targetCenterY = groupCenterY;
    
    switch (alignment) {
      case 'top-left':
        targetCenterX = -templateHalfWidth + safetyMarginMm + groupHalfWidth;
        targetCenterY = -templateHalfHeight + safetyMarginMm + groupHalfHeight;
        break;
      case 'top-center':
        targetCenterX = 0;
        targetCenterY = -templateHalfHeight + safetyMarginMm + groupHalfHeight;
        break;
      case 'top-right':
        targetCenterX = templateHalfWidth - safetyMarginMm - groupHalfWidth;
        targetCenterY = -templateHalfHeight + safetyMarginMm + groupHalfHeight;
        break;
      case 'middle-left':
        targetCenterX = -templateHalfWidth + safetyMarginMm + groupHalfWidth;
        targetCenterY = 0;
        break;
      case 'center':
        targetCenterX = 0;
        targetCenterY = 0;
        break;
      case 'middle-right':
        targetCenterX = templateHalfWidth - safetyMarginMm - groupHalfWidth;
        targetCenterY = 0;
        break;
      case 'bottom-left':
        targetCenterX = -templateHalfWidth + safetyMarginMm + groupHalfWidth;
        targetCenterY = templateHalfHeight - safetyMarginMm - groupHalfHeight;
        break;
      case 'bottom-center':
        targetCenterX = 0;
        targetCenterY = templateHalfHeight - safetyMarginMm - groupHalfHeight;
        break;
      case 'bottom-right':
        targetCenterX = templateHalfWidth - safetyMarginMm - groupHalfWidth;
        targetCenterY = templateHalfHeight - safetyMarginMm - groupHalfHeight;
        break;
    }
    
    const deltaX = targetCenterX - groupCenterX;
    const deltaY = targetCenterY - groupCenterY;
    
    if (elementsToAlign.length > 1 && onAlignElements) {
      const updates = elementsToAlign.map(el => ({
        id: el.id,
        x: Math.round(el.x + deltaX),
        y: Math.round(el.y + deltaY),
      }));
      onAlignElements(updates);
    } else {
      onAlignElement(elementsToAlign[0].id, { 
        x: Math.round(elementsToAlign[0].x + deltaX), 
        y: Math.round(elementsToAlign[0].y + deltaY) 
      });
    }
  };

  // Helper function for optimistic updates with fallback
  const updateElementDirect = async (id: string, updates: Partial<CanvasElement>) => {
    try {
      console.log('Properties updateElementDirect called:', { id, updates });
      
      // Optimistic update for immediate visual feedback
      queryClient.setQueryData(
        ["/api/projects", currentElement?.projectId, "canvas-elements"],
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
          queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
        });
      } else {
        console.log('✅ Properties API update successful');
        // Invalidate to ensure selectedElements syncs with latest data
        queryClient.invalidateQueries({
          queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
        });
      }
    } catch (error) {
      console.error('Failed to update element:', error);
      // Revert optimistic update on error
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
      });
    }
  };

  // Keep legacy mutation for compatibility but prefer direct updates
  const updateElementMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CanvasElement> }) => {
      const response = await apiRequest("PATCH", `/api/canvas-elements/${id}`, updates);
      return response.json();
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
      });

      // Snapshot the previous value
      const previousElements = queryClient.getQueryData(["/api/projects", currentElement?.projectId, "canvas-elements"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["/api/projects", currentElement?.projectId, "canvas-elements"], (old: CanvasElement[] | undefined) => {
        if (!old) return old;
        return old.map((element) => 
          element.id === id ? { ...element, ...updates } : element
        );
      });

      console.log('Properties panel mutation optimistic update:', { id, updates });
      // Return a context object with the snapshotted value
      return { previousElements };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousElements) {
        queryClient.setQueryData(["/api/projects", currentElement?.projectId, "canvas-elements"], context.previousElements);
      }
    },
    onSuccess: () => {
      // Just invalidate to refresh from server
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
      });
    },
  });

  // Duplicate logo mutation
  const duplicateLogoMutation = useMutation({
    mutationFn: async (elementId: string) => {
      console.log('🔄 Duplicating element:', elementId);
      const response = await apiRequest("POST", `/api/canvas-elements/${elementId}/duplicate`);
      return response.json();
    },
    onSuccess: (duplicatedElement) => {
      console.log('✅ Duplicate successful:', duplicatedElement);
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", currentElement?.projectId, "canvas-elements"]
      });
      toast({
        title: "Success",
        description: "Logo duplicated successfully",
      });
    },
    onError: (error) => {
      console.error('❌ Duplicate error:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate logo. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle garment color change for individual logos
  const handleGarmentColorChange = (color: string) => {
    if (currentElement) {
      updateElementDirect(currentElement.id, { garmentColor: color });
    }
  };





  // Debounced update function
  const debouncedUpdateRef = useRef<NodeJS.Timeout>();
  
  const handleInputChange = (property: keyof CanvasElement, value: string) => {
    if (!currentElement) return;
    
    // Update local state immediately for responsive UI
    setLocalInputValues(prev => ({
      ...prev,
      [property]: value
    }));
    
    // Clear previous timeout
    if (debouncedUpdateRef.current) {
      clearTimeout(debouncedUpdateRef.current);
    }
    
    // Set new timeout to update the server
    debouncedUpdateRef.current = setTimeout(() => {
      // For rotated elements, swap width/height back before saving
      const isRotated = currentElement?.rotation === 90 || currentElement?.rotation === 270;
      let actualProperty = property;
      if (isRotated && property === 'width') {
        actualProperty = 'height';
      } else if (isRotated && property === 'height') {
        actualProperty = 'width';
      }
      handlePropertyChange(actualProperty as keyof CanvasElement, value);
    }, 500); // 500ms delay
  };

  const handlePropertyChange = (property: keyof CanvasElement, value: any) => {
    if (!currentElement) return;

    console.log('Property change:', property, 'from', currentElement[property], 'to', value);

    // Convert string inputs to numbers for numeric properties
    let processedValue = value;
    if (property === 'x' || property === 'y' || property === 'width' || property === 'height' || property === 'rotation' || property === 'canvasIndex') {
      processedValue = parseFloat(value);
      if (isNaN(processedValue)) {
        console.log('Invalid number input, ignoring');
        return;
      }
    }
    
    // For rotation changes, apply to ALL selected elements
    if (property === 'rotation' && selectedElements.length > 1) {
      console.log('Applying rotation to all selected elements:', selectedElements.length);
      selectedElements.forEach(element => {
        updateElementDirect(element.id, { rotation: processedValue });
      });
      return;
    }

    // Handle opacity as percentage
    if (property === 'opacity') {
      processedValue = parseFloat(value) / 100;
      if (isNaN(processedValue)) {
        console.log('Invalid opacity input, ignoring');
        return;
      }
    }

    // Handle null values for garment color
    if (property === 'garmentColor' && value === null) {
      processedValue = null;
    }

    // Add constraints to prevent unreasonable values based on current template
    const currentTemplate = templateSizes.find(t => t.id === project.templateSize);
    const maxTemplateWidth = currentTemplate?.width || 297;
    const maxTemplateHeight = currentTemplate?.height || 210;
    
    if (property === 'width' && (processedValue < 1 || processedValue > maxTemplateWidth)) {
      console.log('Width out of range, clamping');
      processedValue = Math.max(1, Math.min(maxTemplateWidth, processedValue));
    }
    if (property === 'height' && (processedValue < 1 || processedValue > maxTemplateHeight)) {
      console.log('Height out of range, clamping');
      processedValue = Math.max(1, Math.min(maxTemplateHeight, processedValue));
    }
    let updates: Partial<CanvasElement>;
    
    // Simple property update without any rotation-specific logic
    updates = { [property]: processedValue };

    // Handle aspect ratio maintenance for width/height changes (only if not a rotation change)
    if (maintainAspectRatio && (property === 'width' || property === 'height')) {
      // Use visual dimensions for aspect ratio when rotated
      const isRotated = currentElement.rotation === 90 || currentElement.rotation === 270;
      const visualWidth = isRotated ? currentElement.height : currentElement.width;
      const visualHeight = isRotated ? currentElement.width : currentElement.height;
      const aspectRatio = visualWidth / visualHeight;
      
      if (property === 'width') {
        // When updating width visually, calculate new height
        const newVisualHeight = Math.round(processedValue / aspectRatio);
        if (isRotated) {
          // For rotated: visual width -> stored height, visual height -> stored width
          updates.height = processedValue;
          updates.width = newVisualHeight;
        } else {
          // For normal: visual width -> stored width, visual height -> stored height
          updates.width = processedValue;
          updates.height = newVisualHeight;
        }
      } else {
        // When updating height visually, calculate new width
        const newVisualWidth = Math.round(processedValue * aspectRatio);
        if (isRotated) {
          // For rotated: visual height -> stored width, visual width -> stored height
          updates.width = processedValue;
          updates.height = newVisualWidth;
        } else {
          // For normal: visual height -> stored height, visual width -> stored width
          updates.height = processedValue;
          updates.width = newVisualWidth;
        }
      }
    }

    const sendUpdate = () => {
      console.log('Sending updates:', updates);
      // Use direct API call to avoid conflicts
      updateElementDirect(currentElement.id, updates);
    };

    sendUpdate();
  };

  const toggleVisibility = (element: CanvasElement) => {
    updateElementDirect(element.id, { isVisible: !element.isVisible });
  };

  const toggleLock = (element: CanvasElement) => {
    updateElementDirect(element.id, { isLocked: !element.isLocked });
  };



  // Dynamic pre-flight check results based on current project data
  const preflightChecks = useMemo(() => {
    if (!currentElement) return [];
    
    const logo = logos.find(l => l.id === currentElement.logoId);
    const checks = [];
    
    // File Resolution Check - skip for vector files as they're resolution-independent
    if (logo) {
      const isVector = logo.mimeType === 'image/svg+xml' || logo.originalMimeType === 'application/pdf';
      
      if (isVector) {
        checks.push({
          name: "Print Resolution",
          status: "pass",
          value: "Vector (Resolution Independent)"
        });
      } else {
        // Calculate effective resolution for raster files only
        const scaleX = currentElement.width / (logo.width || 1);
        const scaleY = currentElement.height / (logo.height || 1);
        const effectiveResolution = Math.min(logo.width || 0, logo.height || 0) / Math.max(scaleX, scaleY);
        const hasGoodResolution = effectiveResolution >= 150; // 150 DPI minimum for print
        
        checks.push({
          name: "Print Resolution",
          status: hasGoodResolution ? "pass" : "warning",
          value: hasGoodResolution ? `${Math.round(effectiveResolution)} DPI` : "Low DPI"
        });
      }
      
      // File Format Check
      checks.push({
        name: "File Format",
        status: isVector ? "pass" : "warning",
        value: isVector ? "Vector" : "Raster"
      });
      
      // Color Mode Check
      const svgAnalysis = logo.svgColors as any;
      let colorStatus = "warning";
      let colorValue = "No Colors";
      
      if (svgAnalysis && typeof svgAnalysis === 'object') {
        if (svgAnalysis.colors && Array.isArray(svgAnalysis.colors) && svgAnalysis.colors.length > 0) {
          colorStatus = "pass";
          colorValue = `${svgAnalysis.colors.length} Colors Detected`;
        } else if (svgAnalysis.strokeWidths && Array.isArray(svgAnalysis.strokeWidths)) {
          // Has stroke analysis but no colors - might be pure strokes
          colorValue = "Analyzed (No Fill Colors)";
          colorStatus = "pass";
        }
      } else if (Array.isArray(svgAnalysis) && svgAnalysis.length > 0) {
        // Legacy format - array of colors
        colorStatus = "pass";
        colorValue = `${svgAnalysis.length} Colors`;
      }
      
      checks.push({
        name: "Color Analysis",
        status: colorStatus,
        value: colorValue
      });
    }
    
    // Position Check - ensure content is within canvas bounds
    const currentTemplate = templateSizes.find(t => t.id === project.templateSize);
    const templateWidth = currentTemplate?.width || 297;
    const templateHeight = currentTemplate?.height || 210;
    
    // Center-based coordinate system - (0,0) is at the center of the template
    const templateHalfWidth = templateWidth / 2;
    const templateHalfHeight = templateHeight / 2;
    
    // Use content bounds if available, otherwise use full element bounds
    let contentWidth = currentElement.width;
    let contentHeight = currentElement.height;
    let contentOffsetX = 0;
    let contentOffsetY = 0;
    
    if (logo?.contentBounds) {
      const cb = logo.contentBounds as any;
      if (cb.xMin !== undefined && cb.yMin !== undefined && cb.xMax !== undefined && cb.yMax !== undefined) {
        // Content bounds are in pixels, convert to mm
        const isPdfDerived = currentElement.width > 200 || currentElement.height > 200;
        const mmToPixelRatio = isPdfDerived ? 2.834645669 : ((currentTemplate?.pixelWidth || 842) / templateWidth);
        
        const contentWidthMm = cb.width / mmToPixelRatio;
        const contentHeightMm = cb.height / mmToPixelRatio;
        const contentXMinMm = cb.xMin / mmToPixelRatio;
        const contentYMinMm = cb.yMin / mmToPixelRatio;
        const contentXMaxMm = cb.xMax / mmToPixelRatio;
        const contentYMaxMm = cb.yMax / mmToPixelRatio;
        
        const isRotated = currentElement.rotation === 90 || currentElement.rotation === 270;
        if (isRotated) {
          contentWidth = contentHeightMm;
          contentHeight = contentWidthMm;
        } else {
          contentWidth = contentWidthMm;
          contentHeight = contentHeightMm;
        }
        
        // Calculate offset from element center to content center
        const viewBoxWidth = isRotated ? currentElement.height : currentElement.width;
        const viewBoxHeight = isRotated ? currentElement.width : currentElement.height;
        const contentCenterX = (contentXMinMm + contentXMaxMm) / 2;
        const contentCenterY = (contentYMinMm + contentYMaxMm) / 2;
        const viewBoxCenterX = viewBoxWidth / 2;
        const viewBoxCenterY = viewBoxHeight / 2;
        
        if (isRotated) {
          contentOffsetX = contentCenterY - viewBoxCenterY;
          contentOffsetY = -(contentCenterX - viewBoxCenterX);
        } else {
          contentOffsetX = contentCenterX - viewBoxCenterX;
          contentOffsetY = contentCenterY - viewBoxCenterY;
        }
      }
    } else {
      // Fall back to full element bounds
      const isRotated = currentElement.rotation === 90 || currentElement.rotation === 270;
      contentWidth = isRotated ? currentElement.height : currentElement.width;
      contentHeight = isRotated ? currentElement.width : currentElement.height;
    }
    
    // Calculate content bounds from center position
    const contentHalfWidth = contentWidth / 2;
    const contentHalfHeight = contentHeight / 2;
    const contentCenterX = currentElement.x + contentOffsetX;
    const contentCenterY = currentElement.y + contentOffsetY;
    
    // Content edges in center-based coordinates
    const contentLeft = contentCenterX - contentHalfWidth;
    const contentRight = contentCenterX + contentHalfWidth;
    const contentTop = contentCenterY - contentHalfHeight;
    const contentBottom = contentCenterY + contentHalfHeight;
    
    // Check against canvas bounds (not safety margins)
    const canvasLeft = -templateHalfWidth;
    const canvasRight = templateHalfWidth;
    const canvasTop = -templateHalfHeight;
    const canvasBottom = templateHalfHeight;
    
    const isWithinCanvas = contentLeft >= canvasLeft && 
                           contentRight <= canvasRight && 
                           contentTop >= canvasTop && 
                           contentBottom <= canvasBottom;
    
    checks.push({
      name: "Position",
      status: isWithinCanvas ? "pass" : "warning",
      value: isWithinCanvas ? "Within Canvas" : "Extends Beyond Canvas"
    });
    
    // Size Check - reasonable print size
    // Use visual dimensions for rotated elements
    const isRotated = currentElement.rotation === 90 || currentElement.rotation === 270;
    const visualWidth = isRotated ? currentElement.height : currentElement.width;
    const visualHeight = isRotated ? currentElement.width : currentElement.height;
    
    const maxWidth = Math.min(templateWidth * 0.95, 500); // Allow up to 95% of template width or 500mm max
    const maxHeight = Math.min(templateHeight * 0.95, 500); // Allow up to 95% of template height or 500mm max
    const hasReasonableSize = visualWidth >= 5 && visualHeight >= 5 &&
                             visualWidth <= maxWidth && visualHeight <= maxHeight;
    checks.push({
      name: "Print Size",
      status: hasReasonableSize ? "pass" : "warning",
      value: `${Math.round(visualWidth)}×${Math.round(visualHeight)}mm`
    });


    
    return checks;
  }, [currentElement, logos]);

  return (
    <TooltipProvider>
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">



      {/* Logo Properties */}
      {currentElement && (
        <Card className="rounded-none border-x-0 border-t-0">
          <CardHeader className="cursor-pointer" onClick={() => setPropertiesPanelCollapsed(!propertiesPanelCollapsed)}>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Logo Properties
              </span>
              {propertiesPanelCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </CardTitle>
          </CardHeader>
          {!propertiesPanelCollapsed && (
            <CardContent className="space-y-4">
            {/* Position */}
            <div>
              <Label className="text-sm font-medium">Position</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <Label className="text-xs text-gray-500">X (mm)</Label>
                  <Input
                    type="number"
                    value={localInputValues.x}
                    onChange={(e) => handleInputChange('x', e.target.value)}
                    className="text-sm"
                    step="1"
                    min="0"
                    max="297"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Y (mm)</Label>
                  <Input
                    type="number"
                    value={localInputValues.y}
                    onChange={(e) => handleInputChange('y', e.target.value)}
                    className="text-sm"
                    step="1" 
                    min="0"
                    max="420"
                  />
                </div>
              </div>
            </div>

            {/* Size */}
            <div>
              <Label className="text-sm font-medium">Size</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <Label className="text-xs text-gray-500">
                    Width (mm) {(currentElement?.rotation === 90 || currentElement?.rotation === 270) && "(↔️ visual)"}
                  </Label>
                  <Input
                    type="number"
                    value={localInputValues.width}
                    onChange={(e) => handleInputChange('width', e.target.value)}
                    className="text-sm"
                    step="1"
                    min="1"
                    max="297"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">
                    Height (mm) {(currentElement?.rotation === 90 || currentElement?.rotation === 270) && "(↕️ visual)"}
                  </Label>
                  <Input
                    type="number"
                    value={localInputValues.height}
                    onChange={(e) => handleInputChange('height', e.target.value)}
                    className="text-sm"
                    step="1"
                    min="1"
                    max="420"
                  />
                </div>
              </div>
              <div className="flex items-center mt-2">
                <Checkbox
                  id="maintain-aspect"
                  checked={maintainAspectRatio}
                  onCheckedChange={(checked) => setMaintainAspectRatio(checked === true)}
                />
                <Label htmlFor="maintain-aspect" className="ml-2 text-sm">
                  Maintain aspect ratio
                </Label>
              </div>
            </div>

            {/* Rotation */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Rotation ({currentElement.rotation || 0}°)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Reset rotation for all selected elements
                    if (selectedElements.length > 1) {
                      selectedElements.forEach(element => {
                        updateElementDirect(element.id, { rotation: 0 });
                      });
                    } else {
                      handlePropertyChange('rotation', 0);
                    }
                  }}
                  className="h-8"
                  data-testid="button-reset-rotation"
                >
                  Reset to 0°
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (selectedElements.length > 1 && onAlignElements) {
                      let sumCx = 0, sumCy = 0;
                      selectedElements.forEach(el => {
                        sumCx += el.x + (el.width || 0) / 2;
                        sumCy += el.y + (el.height || 0) / 2;
                      });
                      const gcx = sumCx / selectedElements.length;
                      const gcy = sumCy / selectedElements.length;

                      const updates = selectedElements.map(el => {
                        const cx = el.x + (el.width || 0) / 2;
                        const cy = el.y + (el.height || 0) / 2;
                        const relX = cx - gcx;
                        const relY = cy - gcy;
                        const newCx = gcx + relY;
                        const newCy = gcy - relX;
                        const newRotation = ((el.rotation || 0) + 90) % 360;
                        return {
                          id: el.id,
                          x: Math.round((newCx - (el.width || 0) / 2) * 10) / 10,
                          y: Math.round((newCy - (el.height || 0) / 2) * 10) / 10,
                          rotation: newRotation,
                        };
                      });
                      onAlignElements(updates);
                    } else {
                      const currentRotation = currentElement.rotation || 0;
                      const newRotation = (currentRotation + 90) % 360;
                      handlePropertyChange('rotation', newRotation);
                    }
                  }}
                  className="h-8"
                  data-testid="button-rotate-90"
                >
                  Rotate 90°
                </Button>
              </div>
            </div>

            {/* Shape Properties - only show for shape elements */}
            {(currentElement.elementType === 'rectangle' || currentElement.elementType === 'ellipse' || currentElement.elementType === 'circle' || currentElement.elementType === 'line') && (
              <div className="space-y-3">
                <Label className="text-sm font-medium mb-2 block">Shape Properties</Label>
                
                {currentElement.elementType !== 'line' && (
                  <div>
                    <Label className="text-xs text-gray-500">Fill Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={currentElement.fillColor === 'none' ? '#ffffff' : (currentElement.fillColor || '#000000')}
                        onChange={(e) => handlePropertyChange('fillColor', e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Button
                        variant={currentElement.fillColor === 'none' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handlePropertyChange('fillColor', currentElement.fillColor === 'none' ? '#000000' : 'none')}
                        className="text-xs h-8"
                      >
                        {currentElement.fillColor === 'none' ? 'No Fill' : 'Remove Fill'}
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-gray-500">Stroke Color</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={currentElement.strokeColor || '#000000'}
                      onChange={(e) => handlePropertyChange('strokeColor', e.target.value)}
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">{currentElement.strokeColor || '#000000'}</span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-gray-500">Stroke Width (mm)</Label>
                  <Input
                    type="number"
                    value={currentElement.strokeWidth || 1}
                    onChange={(e) => handlePropertyChange('strokeWidth', parseFloat(e.target.value) || 1)}
                    className="text-sm"
                    step="0.5"
                    min="0.5"
                    max="20"
                  />
                </div>

                {currentElement.elementType === 'rectangle' && (
                  <div>
                    <Label className="text-xs text-gray-500">Corner Radius</Label>
                    <Input
                      type="number"
                      value={currentElement.cornerRadius || 0}
                      onChange={(e) => handlePropertyChange('cornerRadius', parseFloat(e.target.value) || 0)}
                      className="text-sm"
                      step="1"
                      min="0"
                      max="100"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Canvas Assignment - for applique templates */}
            {isAppliqueTemplate && (
              <div className="space-y-2">
                <Label className="text-sm font-medium mb-2 block">Canvas Assignment</Label>
                <div className="flex gap-2">
                  <Button
                    variant={(currentElement.canvasIndex || 0) === 0 ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => handlePropertyChange('canvasIndex' as keyof CanvasElement, 0)}
                  >
                    Badge Artwork
                  </Button>
                  <Button
                    variant={(currentElement.canvasIndex || 0) === 1 ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => handlePropertyChange('canvasIndex' as keyof CanvasElement, 1)}
                  >
                    Embroidery
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  {(currentElement.canvasIndex || 0) === 0 
                    ? 'This element is on the Badge (printed) canvas' 
                    : 'This element is on the Embroidery (stitched) canvas'}
                </p>
              </div>
            )}

            {/* Alignment Tools */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Alignment</Label>
              <div className="grid grid-cols-3 gap-1 mb-4">
                {/* Top row */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Top Left" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('top-left')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-0 left-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Top Center" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('top-center')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Top Right" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('top-right')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                
                {/* Middle row */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Middle Left" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('middle-left')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Center" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('center')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Middle Right" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('middle-right')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                
                {/* Bottom row */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Bottom Left" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('bottom-left')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute bottom-0 left-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Bottom Center" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('bottom-center')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  title="Align Bottom Right" 
                  disabled={!currentElement} 
                  className="h-8 p-1"
                  onClick={() => handleAlign('bottom-right')}
                >
                  <div className="w-5 h-5 border border-gray-400 relative">
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500"></div>
                  </div>
                </Button>
              </div>
              
              {/* Quick Actions */}
              <div className="space-y-2">
              </div>
            </div>

            {/* Individual Logo Garment Color */}
            <div>
              <Label className="text-sm font-medium">Logo Garment Color</Label>
              <div className="space-y-3 mt-2">
                {/* Current Selection Display */}
                {currentElement.garmentColor && (
                  <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <TShirtSwatch
                      color={currentElement.garmentColor}
                      size="sm"
                      selected={false}
                    />
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">Selected Color</div>
                      <div className="text-gray-600">{getColorName(currentElement.garmentColor)}</div>
                    </div>
                  </div>
                )}

                {/* Garment Color Modal Trigger */}
                <GarmentColorModal
                  currentColor={currentElement.garmentColor || ""}
                  onColorChange={handleGarmentColorChange}
                  trigger={
                    <Button 
                      variant={currentElement.garmentColor ? "outline" : "default"} 
                      className="w-full hover:bg-gray-400"
                      size="sm"
                    >
                      <Palette className="w-4 h-4 mr-2" />
                      {currentElement.garmentColor ? "Change Garment Color" : "Select Garment Color"}
                    </Button>
                  }
                />

                {!currentElement.garmentColor && (
                  <p className="text-xs text-gray-500">
                    Apply a different garment colour to this specific logo
                  </p>
                )}
              </div>
            </div>

            {/* Dropbox Upload Link - Only show for placeholders */}
            {currentLogo?.isPlaceholder && currentLogo?.externalFileUrl && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L7 6.5 12 11 7 15.5 12 20l5-4.5L12 11l5-4.5z"/>
                    <path d="M7 15.5L2 11l5-4.5L12 11z" opacity="0.7"/>
                    <path d="M17 6.5L22 11l-5 4.5L12 11z" opacity="0.7"/>
                  </svg>
                  <Label className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    Dropbox Upload Required
                  </Label>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                  This is a placeholder. Upload your file to complete your design.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => currentLogo?.externalFileUrl && window.open(currentLogo.externalFileUrl, '_blank')}
                  data-testid="button-open-dropbox-upload"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Open Dropbox Upload Link
                </Button>
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div>
              <Label className="text-sm font-medium">Actions</Label>
              <div className="space-y-2 mt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => duplicateLogoMutation.mutate(currentElement.id)}
                      disabled={duplicateLogoMutation.isPending}
                      className="w-full"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {duplicateLogoMutation.isPending ? "Duplicating..." : "Duplicate Logo"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Create a copy of this logo that you can position independently</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowImpositionModal(true)}
                      className="w-full"
                    >
                      <Grid className="w-4 h-4 mr-2" />
                      Imposition Tool
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Create multiple copies of this logo in a grid layout</p>
                  </TooltipContent>
                </Tooltip>

                
                <p className="text-xs text-gray-500 mt-1">
                  Duplicate or replicate logos for multi-placement designs
                </p>
              </div>
            </div>
          </CardContent>
          )}
        </Card>
      )}







      {/* Layer Management */}
      <Card className="rounded-none border-x-0 border-t-0">
        <CardHeader className="cursor-pointer" onClick={() => setLayersPanelCollapsed(!layersPanelCollapsed)}>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Layers ({canvasElements.length})
            </span>
            {layersPanelCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </CardTitle>
        </CardHeader>
        {!layersPanelCollapsed && (
          <CardContent>
            {canvasElements.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No elements on canvas
              </div>
            ) : (
              <div className="space-y-2">
                {canvasElements
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((element) => {
                    const logo = logos.find(l => l.id === element.logoId);
                    const isShapeElement = element.elementType === 'rectangle' || element.elementType === 'ellipse' || element.elementType === 'circle' || element.elementType === 'line';
                    if (!logo && !isShapeElement) return null;

                    const isSelected = currentElement?.id === element.id;

                    const getShapeIcon = () => {
                      switch (element.elementType) {
                        case 'rectangle': return <div className="w-4 h-3 border-2 border-gray-600 rounded-sm" />;
                        case 'ellipse': case 'circle': return <div className="w-4 h-4 border-2 border-gray-600 rounded-full" />;
                        case 'line': return <div className="w-4 h-0.5 bg-gray-600" />;
                        default: return <Image className="w-4 h-4 text-gray-600" />;
                      }
                    };

                    const getElementName = () => {
                      if (isShapeElement) {
                        return element.elementType!.charAt(0).toUpperCase() + element.elementType!.slice(1);
                      }
                      return logo?.originalName || 'Unknown';
                    };

                    return (
                      <div
                        key={element.id}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                          isSelected ? 'bg-blue-50 border border-blue-200' : 'border border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          console.log('Select element:', element.id);
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          {isShapeElement ? getShapeIcon() : <Image className="w-4 h-4 text-gray-600" />}
                          <div className="flex flex-col">
                            <span className="text-sm font-medium truncate max-w-[120px]">
                              {getElementName()}
                            </span>
                            <span className="text-xs text-gray-500">
                              {(() => {
                                const isRotated = element.rotation === 90 || element.rotation === 270;
                                const visualWidth = isRotated ? element.height : element.width;
                                const visualHeight = isRotated ? element.width : element.height;
                                return `${Math.round(visualWidth)}×${Math.round(visualHeight)}mm`;
                              })()} 
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleVisibility(element);
                                }}
                                className="h-6 w-6 p-0"
                              >
                                {element.isVisible ? (
                                  <Eye className="w-3 h-3" />
                                ) : (
                                  <EyeOff className="w-3 h-3 text-gray-400" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{element.isVisible ? "Hide logo" : "Show logo"}</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLock(element);
                                }}
                                className="h-6 w-6 p-0"
                              >
                                {element.isLocked ? (
                                  <Lock className="w-3 h-3" />
                                ) : (
                                  <Unlock className="w-3 h-3" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{element.isLocked ? "Unlock logo (allow editing)" : "Lock logo (prevent changes)"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        )}
      </Card>





      {/* CMYK Color Modal */}
      <CMYKColorModal
        initialColor={currentElement?.garmentColor || "#FFFFFF"}
        onChange={(color: string) => {
          handlePropertyChange('garmentColor', color);
          setShowCMYKModal(false);
        }}
        label="Select Garment Color"
        currentColor={currentElement?.garmentColor || "#FFFFFF"}
      />

      {/* Imposition Modal */}
      {currentElement && (
        <ImpositionModal
          open={showImpositionModal}
          onOpenChange={setShowImpositionModal}
          selectedElement={currentElement}
          template={templateSizes.find(t => t.id === project.templateSize)!}
        />
      )}

      {/* Template Selector Modal */}
      <TemplateSelectorModal
        open={showTemplateSelectorModal}
        templates={templateSizes}
        onSelectTemplate={(templateId) => {
          onTemplateChange(templateId);
          setShowTemplateSelectorModal(false);
        }}
        onClose={() => setShowTemplateSelectorModal(false)}
      />


    </div>
    </TooltipProvider>
  );
}
