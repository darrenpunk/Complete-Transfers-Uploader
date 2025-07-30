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
  const storage = new MemStorage();
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
                  // Get template size to determine proper scaling
                  const templateSize = await storage.getTemplateSize(project.templateSize);
                  if (templateSize) {
                    if (isA3) {
                      // True A3 content - use full template size
                      displayWidth = Math.min(297, templateSize.width);
                      displayHeight = Math.min(420, templateSize.height);
                      console.log(`A3 document detected, using full template size: ${displayWidth}×${displayHeight}mm`);
                    } else if (isA4) {
                      // A4 content in any template - scale to fit nicely
                      // A4 is 210×297mm, scale it to fit template with some padding
                      const scaleToFit = Math.min(templateSize.width / 210, templateSize.height / 297);
                      displayWidth = Math.round(210 * scaleToFit * 0.7); // 70% of available space
                      displayHeight = Math.round(297 * scaleToFit * 0.7);
                      console.log(`A4 document detected, using scaled size: ${displayWidth}×${displayHeight}mm (scale: ${scaleToFit.toFixed(2)})`);
                    }
                  }
                  isA3Document = true; // Use large format handling
                }
              }
            }
            
            if (!isA3Document) {
              // For non-A3 content, try to get actual content bounds
              const contentBounds = calculateSVGContentBounds(svgPath);
              if (contentBounds) {
                const scaleFactor = 0.35;
                displayWidth = Math.round(contentBounds.width * scaleFactor);
                displayHeight = Math.round(contentBounds.height * scaleFactor);
                
                // Apply reasonable limits for logos
                displayWidth = Math.min(displayWidth, 150);
                displayHeight = Math.min(displayHeight, 150);
                console.log(`Logo content detected, using scaled size: ${displayWidth}×${displayHeight}mm`);
              }
            }
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

  // Static file serving with fallback
  app.use('/uploads', express.static(uploadDir));
  
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