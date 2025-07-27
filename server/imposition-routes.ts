import type { Express } from "express";
import type { IStorage } from "./storage";

export function setupImpositionRoutes(app: Express, storage: IStorage) {
  // Create imposition grid
  app.post("/api/canvas-elements/:id/imposition", async (req, res) => {
    try {
      const elementId = req.params.id;
      const { rows, columns, horizontalSpacing, verticalSpacing } = req.body;

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
      
      // Create grid of duplicates
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          // Skip the original position (0,0)
          if (row === 0 && col === 0) continue;
          
          const xOffset = col * (originalElement.width + (horizontalSpacing || 0));
          const yOffset = row * (originalElement.height + (verticalSpacing || 0));
          
          const newElement = await storage.createCanvasElement({
            projectId: originalElement.projectId,
            logoId: originalElement.logoId,
            x: originalElement.x + xOffset,
            y: originalElement.y + yOffset,
            width: originalElement.width,
            height: originalElement.height,
            rotation: originalElement.rotation,
            zIndex: originalElement.zIndex,
            isVisible: originalElement.isVisible,
            isLocked: originalElement.isLocked,
            colorOverrides: originalElement.colorOverrides,
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