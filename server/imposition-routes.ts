import type { Express } from "express";
import type { IStorage } from "./storage";

export function setupImpositionRoutes(app: Express, storage: IStorage) {
  // Create imposition grid
  app.post("/api/canvas-elements/:id/imposition", async (req, res) => {
    try {
      const elementId = req.params.id;
      const { rows, columns, horizontalSpacing, verticalSpacing, centerOnCanvas } = req.body;

      // Validate inputs
      if (!rows || !columns || rows < 1 || columns < 1 || rows > 20 || columns > 20) {
        return res.status(400).json({ message: "Invalid grid dimensions. Rows and columns must be between 1 and 20." });
      }

      // Get the original element
      const originalElement = await storage.getCanvasElement(elementId);
      if (!originalElement) {
        return res.status(404).json({ message: "Canvas element not found" });
      }

      const createdElements = [];
      
      console.log('Original element:', { 
        id: originalElement.id, 
        x: originalElement.x, 
        y: originalElement.y, 
        width: originalElement.width, 
        height: originalElement.height 
      });
      
      // Calculate grid dimensions
      const totalGridWidth = (columns * originalElement.width) + ((columns - 1) * (horizontalSpacing || 0));
      const totalGridHeight = (rows * originalElement.height) + ((rows - 1) * (verticalSpacing || 0));
      
      console.log('Grid calculations:', {
        rows, columns, horizontalSpacing, verticalSpacing,
        elementSize: { width: originalElement.width, height: originalElement.height },
        totalGridSize: { width: totalGridWidth, height: totalGridHeight }
      });
      
      // Calculate starting position (top-left of grid in center-based coordinate system)
      let startX = originalElement.x;
      let startY = originalElement.y;
      
      if (centerOnCanvas) {
        // Get template size for centering
        const project = await storage.getProject(originalElement.projectId);
        const templateSize = project ? await storage.getTemplateSize(project.templateSize) : null;
        
        if (templateSize) {
          // In center-based system: (0,0) is at template center
          // To center the grid, the top-left corner should be at:
          // x: -totalGridWidth/2 (negative = left of center)
          // y: -totalGridHeight/2 (negative = above center)
          startX = -totalGridWidth / 2;
          startY = -totalGridHeight / 2;
          
          console.log('Center-based grid centering:', {
            templateSize: { width: templateSize.width, height: templateSize.height },
            gridSize: { width: totalGridWidth, height: totalGridHeight },
            centerBasedStart: { x: startX, y: startY },
            description: 'Grid centered at template origin (0,0)'
          });
          
          // Update original element position if centering
          await storage.updateCanvasElement(originalElement.id, {
            x: startX,
            y: startY,
            width: originalElement.width,
            height: originalElement.height,
            rotation: originalElement.rotation,
            zIndex: originalElement.zIndex,
            isVisible: originalElement.isVisible,
            isLocked: originalElement.isLocked,
            colorOverrides: originalElement.colorOverrides,
            garmentColor: originalElement.garmentColor || null
          });
        }
      }
      
      // Create grid of duplicates
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          // Skip the original position (0,0)
          if (row === 0 && col === 0) continue;
          
          // Calculate position for this grid cell
          const xOffset = col * (originalElement.width + (horizontalSpacing || 0));
          const yOffset = row * (originalElement.height + (verticalSpacing || 0));
          
          console.log(`Creating element at grid position [${row}, ${col}]:`, {
            startX, startY, xOffset, yOffset,
            finalX: startX + xOffset,
            finalY: startY + yOffset,
            elementSize: { width: originalElement.width, height: originalElement.height },
            spacing: { horizontal: horizontalSpacing, vertical: verticalSpacing }
          });
          
          const newElement = await storage.createCanvasElement({
            projectId: originalElement.projectId,
            logoId: originalElement.logoId,
            x: startX + xOffset,
            y: startY + yOffset,
            width: originalElement.width,
            height: originalElement.height,
            rotation: originalElement.rotation,
            zIndex: originalElement.zIndex + 1, // Ensure new elements are above original
            isVisible: originalElement.isVisible,
            isLocked: originalElement.isLocked,
            colorOverrides: originalElement.colorOverrides as any,
            garmentColor: originalElement.garmentColor || null
          });
          
          createdElements.push(newElement);
        }
      }

      res.json({
        message: `Created ${rows}×${columns} imposition grid`,
        totalElements: rows * columns,
        newElements: createdElements.length,
        elements: createdElements
      });

    } catch (error) {
      console.error('Imposition creation error:', error);
      res.status(500).json({ message: "Failed to create imposition grid" });
    }
  });
}