import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { IStorage } from './storage';
import { 
  insertProjectSchema, 
  insertLogoSchema, 
  insertCanvasElementSchema 
} from '@shared/schema';
import { z } from 'zod';
import { calculateSVGContentBounds } from './svg-color-utils';
import { detectDimensionsFromSVG, validateDimensionAccuracy } from './dimension-utils';

const execAsync = promisify(exec);

const uploadDir = path.resolve('./uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export async function registerRoutes(app: express.Application) {
  const { MemStorage } = await import('./storage');
  const { setupImpositionRoutes } = await import('./imposition-routes');
  const storage = new MemStorage();
  
  // PDF Generation endpoint - Must be before other routes
  app.get('/api/projects/:projectId/generate-pdf', async (req, res) => {
    try {
      console.log(`📄 PDF Generation requested for project: ${req.params.projectId}`);
      const projectId = req.params.projectId;
      const project = await storage.getProject(projectId);
      
      if (!project) {
        console.error(`❌ Project not found: ${projectId}`);
        return res.status(404).json({ error: 'Project not found' });
      }

      console.log(`✅ Project found: ${project.name || 'Untitled'}`);

      // Get project data
      const logos = await storage.getLogosForProject(projectId);
      const canvasElements = await storage.getCanvasElementsForProject(projectId);
      const templateSizes = await storage.getTemplateSizes();
      
      console.log(`📊 Project data - Logos: ${logos.length}, Elements: ${canvasElements.length}`);
      
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      if (!templateSize) {
        console.error(`❌ Invalid template size: ${project.templateSize}`);
        return res.status(400).json({ error: 'Invalid template size' });
      }

      console.log(`📐 Template size: ${templateSize.name} (${templateSize.width}×${templateSize.height}mm)`);

      // Import the EnhancedCMYKGenerator
      const { EnhancedCMYKGenerator } = await import('./enhanced-cmyk-generator');
      const generator = new EnhancedCMYKGenerator();

      // Generate PDF using EnhancedCMYKGenerator
      const pdfData = {
        projectId,
        templateSize,
        canvasElements,
        logos,
        garmentColor: project.garmentColor,
        appliqueBadgesForm: project.appliqueBadgesForm
      };

      console.log(`🔄 Generating PDF with EnhancedCMYKGenerator...`);
      const pdfBuffer = await generator.generatePDF(pdfData, project);
      console.log(`✅ PDF generated successfully - Size: ${pdfBuffer.length} bytes`);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name || 'project'}_cmyk.pdf"`);
      res.send(pdfBuffer);
      
    } catch (error) {
      console.error('❌ PDF generation error:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  });
  
  // Setup imposition routes
  setupImpositionRoutes(app, storage);
  // File upload endpoint
  app.post('/api/projects/:projectId/logos', upload.array('files'), async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const logos = [];
      
      for (const file of files) {
        let finalFilename = file.filename;
        let finalMimeType = file.mimetype;
        let finalUrl = `/uploads/${file.filename}`;

        // If it's a PDF, convert to SVG for editing capabilities
        if (file.mimetype === 'application/pdf') {
          try {
            const svgFilename = `${file.filename}.svg`;
            const svgPath = path.join(uploadDir, svgFilename);
            
            // Use pdf2svg for conversion
            let svgCommand;
            try {
              await execAsync('which pdf2svg');
              svgCommand = `pdf2svg "${path.join(uploadDir, file.filename)}" "${svgPath}"`;
            } catch {
              svgCommand = `convert -density 300 -background none "${path.join(uploadDir, file.filename)}[0]" "${svgPath}"`;
            }
            
            await execAsync(svgCommand);
            
            if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
              finalFilename = svgFilename;
              finalMimeType = 'image/svg+xml';
              finalUrl = `/uploads/${finalFilename}`;
            }
          } catch (error) {
            console.error('PDF conversion failed:', error);
            // Continue with original PDF
          }
        }

        // Create logo record
        const logo = await storage.createLogo({
          projectId,
          filename: finalFilename,
          originalName: file.originalname,
          mimeType: finalMimeType,
          size: file.size,
          url: finalUrl
        });

        logos.push(logo);

        // Create canvas element with proper sizing
        let displayWidth = 200;
        let displayHeight = 150;

        try {
          if (finalMimeType === 'image/svg+xml') {
            const svgPath = path.join(uploadDir, finalFilename);
            
            // Check viewBox first - most reliable for A3 detection
            const svgContent = fs.readFileSync(svgPath, 'utf8');
            const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
            let isA3Document = false;
            
            if (viewBoxMatch) {
              const viewBoxValues = viewBoxMatch[1].split(' ').map(parseFloat);
              if (viewBoxValues.length >= 4) {
                const [vbX, vbY, vbWidth, vbHeight] = viewBoxValues;
                
                // Check for large format documents - A3, A4, or similar sizes
                const isA3 = (vbWidth > 800 && vbHeight > 1100) || (vbWidth > 1100 && vbHeight > 800);  // A3: 842×1191
                const isA4 = (vbWidth > 580 && vbHeight > 800) || (vbWidth > 800 && vbHeight > 580);    // A4: 595×842
                const isLargeFormat = isA3 || isA4;
                
                console.log(`ViewBox: ${vbWidth}×${vbHeight}, A3: ${isA3}, A4: ${isA4}, Large format: ${isLargeFormat}`);
                
                if (isLargeFormat) {
                  isA3Document = true; // Mark as large format for later processing
                }
              }
            }
            
            // Always try to get actual content bounds first, regardless of document format
            const contentBounds = calculateSVGContentBounds(svgContent);
            
            // Crop SVG to actual content bounds to remove whitespace
            if (contentBounds && contentBounds.minX !== undefined && contentBounds.minY !== undefined && 
                contentBounds.maxX !== undefined && contentBounds.maxY !== undefined) {
              
              const croppedWidth = contentBounds.maxX - contentBounds.minX;
              const croppedHeight = contentBounds.maxY - contentBounds.minY;
              
              // Create new viewBox that crops to actual content
              const newViewBox = `${contentBounds.minX} ${contentBounds.minY} ${croppedWidth} ${croppedHeight}`;
              
              // Update SVG with cropped viewBox
              let updatedSvgContent = svgContent.replace(
                /viewBox="[^"]*"/,
                `viewBox="${newViewBox}"`
              );
              
              // Also update width and height to match aspect ratio
              updatedSvgContent = updatedSvgContent.replace(
                /width="[^"]*"/,
                `width="${croppedWidth}"`
              );
              updatedSvgContent = updatedSvgContent.replace(
                /height="[^"]*"/,
                `height="${croppedHeight}"`
              );
              
              console.log(`Cropped SVG viewBox from full page to content: ${newViewBox} (${croppedWidth.toFixed(1)}×${croppedHeight.toFixed(1)})`);
              
              // Write the cropped SVG back to file
              fs.writeFileSync(svgPath, updatedSvgContent, 'utf8');
            }
            
            // ROBUST DIMENSION SYSTEM: Use centralized dimension calculation
            const updatedSvgContent2 = fs.readFileSync(svgPath, 'utf8');
            const dimensionResult = detectDimensionsFromSVG(updatedSvgContent2, contentBounds);
            
            // Validate accuracy and log any issues
            validateDimensionAccuracy(dimensionResult);
            
            // Use the calculated mm dimensions directly
            displayWidth = dimensionResult.widthMm;
            displayHeight = dimensionResult.heightMm;
            
            console.log(`🎯 ROBUST DIMENSIONS: ${dimensionResult.widthPx}×${dimensionResult.heightPx}px → ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm (${dimensionResult.accuracy} accuracy, ${dimensionResult.source})`);
            
            } else {
              // Fallback: for large documents with no detectable content bounds
              console.log(`Large format document with no detectable content bounds, using conservative sizing`);
              displayWidth = 200;
              displayHeight = 150;
          }
        } catch (error) {
          console.error('Failed to calculate content bounds:', error);
        }

        // Get template size for centering
        const templateSize = await storage.getTemplateSize(project.templateSize);
        if (!templateSize) {
          throw new Error('Template size not found');
        }

        // Calculate centered position
        const centerX = Math.max(0, (templateSize.width - displayWidth) / 2);
        const centerY = Math.max(0, (templateSize.height - displayHeight) / 2);

        const canvasElementData = {
          projectId: projectId,
          logoId: logo.id,
          x: centerX,
          y: centerY,
          width: displayWidth,
          height: displayHeight,
          rotation: 0,
          zIndex: logos.length - 1,
          isVisible: true,
          isLocked: false,
          colorOverrides: null
        };

        await storage.createCanvasElement(canvasElementData);
      }

      res.json(logos);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Other essential routes
  app.get('/api/projects/:projectId', async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get project' });
    }
  });

  app.get('/api/projects/:projectId/logos', async (req, res) => {
    try {
      const logos = await storage.getLogosByProject(req.params.projectId);
      res.json(logos);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get logos' });
    }
  });

  app.get('/api/projects/:projectId/canvas-elements', async (req, res) => {
    try {
      const elements = await storage.getCanvasElementsByProject(req.params.projectId);
      res.json(elements);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get canvas elements' });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const projectData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: 'Invalid project data' });
    }
  });

  app.patch('/api/projects/:projectId', async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.projectId, req.body);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  app.get('/api/template-sizes', async (req, res) => {
    try {
      const templateSizes = await storage.getTemplateSizes();
      res.json(templateSizes);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get template sizes' });
    }
  });

  // Delete logo endpoint with proper cleanup
  app.delete('/api/logos/:logoId', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      
      // Get the logo first to check if it exists
      const logo = await storage.getLogo(logoId);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Delete all canvas elements that use this logo
      await storage.deleteCanvasElementsByLogo(logoId);
      console.log(`🗑️ Cleaned up canvas elements for deleted logo: ${logoId}`);
      
      // Delete the logo from storage
      const deleted = await storage.deleteLogo(logoId);
      if (!deleted) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Clean up physical files
      try {
        const uploadsDir = path.resolve('./uploads');
        const files = [
          path.join(uploadsDir, logo.filename),
          path.join(uploadsDir, `${logo.filename}.svg`),
          path.join(uploadsDir, `${logoId}_modified.svg`),
          path.join(uploadsDir, `${logoId}_color_managed.png`)
        ];
        
        files.forEach(filePath => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Deleted file: ${filePath}`);
          }
        });
      } catch (fileError) {
        console.warn('Warning: Failed to delete some logo files:', fileError);
      }
      
      res.json({ success: true, message: 'Logo and associated elements deleted successfully' });
    } catch (error) {
      console.error('Delete logo error:', error);
      res.status(500).json({ error: 'Failed to delete logo' });
    }
  });

  // Static file serving with fallback
  app.use('/uploads', express.static(uploadDir));

  // Update canvas element endpoint
  app.patch('/api/canvas-elements/:elementId', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      const updates = req.body;
      
      console.log(`🔄 Updating canvas element: ${elementId}`, updates);
      
      const updatedElement = await storage.updateCanvasElement(elementId, updates);
      
      if (!updatedElement) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      console.log(`✅ Successfully updated element: ${elementId}`);
      res.json(updatedElement);
    } catch (error) {
      console.error('Update canvas element error:', error);
      res.status(500).json({ error: 'Failed to update canvas element' });
    }
  });

  // Delete canvas element endpoint
  app.delete('/api/canvas-elements/:elementId', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      const deleted = await storage.deleteCanvasElement(elementId);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      res.json({ success: true, message: 'Canvas element deleted successfully' });
    } catch (error) {
      console.error('Delete canvas element error:', error);
      res.status(500).json({ error: 'Failed to delete canvas element' });
    }
  });

  // Duplicate canvas element endpoint
  app.post('/api/canvas-elements/:elementId/duplicate', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      console.log(`🔄 Duplicating canvas element: ${elementId}`);
      
      const duplicatedElement = await storage.duplicateCanvasElement(elementId);
      
      if (!duplicatedElement) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      console.log(`✅ Successfully duplicated element: ${elementId} → ${duplicatedElement.id}`);
      res.json(duplicatedElement);
    } catch (error) {
      console.error('Duplicate canvas element error:', error);
      res.status(500).json({ error: 'Failed to duplicate canvas element' });
    }
  });

  // Ink recolor endpoint (simplified)
  app.get('/uploads/:filename', (req, res, next) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      // Try fallback to original PDF if SVG doesn't exist
      const pdfFilename = filename.replace('.svg', '');
      const pdfPath = path.join(uploadDir, pdfFilename);
      
      if (fs.existsSync(pdfPath)) {
        res.sendFile(pdfPath);
      } else {
        next();
      }
    }
  });

  return app;
}