import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertProjectSchema, insertLogoSchema, insertCanvasElementSchema, updateCanvasElementSchema } from "@shared/schema";
import { fromPath } from "pdf2pic";
import { exec } from "child_process";
import { promisify } from "util";
import { pdfGenerator } from "./pdf-generator";

const execAsync = promisify(exec);

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, SVG, and PDF files are allowed.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Template sizes
  app.get("/api/template-sizes", async (req, res) => {
    try {
      const sizes = await storage.getTemplateSizes();
      res.json(sizes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch template sizes" });
    }
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const validatedData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validatedData);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ message: "Invalid project data" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  // Logos
  app.get("/api/projects/:projectId/logos", async (req, res) => {
    try {
      const logos = await storage.getLogosByProject(req.params.projectId);
      res.json(logos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch logos" });
    }
  });

  app.post("/api/projects/:projectId/logos", upload.array('files'), async (req, res) => {
    try {
      const files = req.files as any[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const logos = [];
      for (const file of files) {
        let finalFilename = file.filename;
        let finalMimeType = file.mimetype;
        let finalUrl = `/uploads/${file.filename}`;

        // If it's a PDF, convert it using ImageMagick for better compatibility
        if (file.mimetype === 'application/pdf') {
          try {
            // Try PNG conversion using ImageMagick convert command
            const pngFilename = `${file.filename}.png`;
            const pngPath = path.join(uploadDir, pngFilename);
            
            // ImageMagick convert with specific PDF handling
            const convertCommand = `convert -density 300 -quality 90 "${file.path}[0]" "${pngPath}"`;
            
            await execAsync(convertCommand);
            
            if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
              finalFilename = pngFilename;
              finalMimeType = 'image/png';
              finalUrl = `/uploads/${finalFilename}`;
              
              console.log(`PDF converted to PNG using ImageMagick: ${finalFilename}`);
            } else {
              throw new Error('ImageMagick conversion failed');
            }
          } catch (convertError) {
            console.error('PDF conversion failed:', convertError);
            
            // Final fallback: Try with mutool (if available)
            try {
              const pngFilename = `${file.filename}.png`;
              const pngPath = path.join(uploadDir, pngFilename);
              
              const mutoolCommand = `mutool draw -r 300 -o "${pngPath}" "${file.path}" 1`;
              await execAsync(mutoolCommand);
              
              if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                finalFilename = pngFilename;
                finalMimeType = 'image/png';
                finalUrl = `/uploads/${finalFilename}`;
                
                console.log(`PDF converted to PNG using mutool: ${finalFilename}`);
              } else {
                throw new Error('All conversion methods failed');
              }
            } catch (mutoolError) {
              console.error('All PDF conversion methods failed:', mutoolError);
            }
          }
        }

        // Get dimensions from the final display file (PNG)
        let actualWidth = null;
        let actualHeight = null;
        try {
          const { stdout } = await execAsync(`identify -format "%w %h" "${path.join(uploadDir, finalFilename)}"`);
          const [w, h] = stdout.trim().split(' ').map(Number);
          actualWidth = w;
          actualHeight = h;
        } catch (error) {
          console.error('Failed to get image dimensions:', error);
        }

        const logoData = {
          projectId: req.params.projectId,
          filename: finalFilename,
          originalName: file.originalname,
          mimeType: finalMimeType,
          size: file.size,
          width: actualWidth,
          height: actualHeight,
          url: finalUrl,
          // Store original PDF data for vector output if it was converted
          originalFilename: file.mimetype === 'application/pdf' ? file.filename : null,
          originalMimeType: file.mimetype === 'application/pdf' ? file.mimetype : null,
          originalUrl: file.mimetype === 'application/pdf' ? `/uploads/${file.filename}` : null,
        };

        const validatedData = insertLogoSchema.parse(logoData);
        const logo = await storage.createLogo(validatedData);
        logos.push(logo);

        // Create canvas element for the logo using actual dimensions scaled to mm
        // For 300 DPI images (our ImageMagick conversion), use 0.08466667 mm per pixel
        const scaleFactor = 0.08466667; // Convert 300 DPI pixels to mm (25.4mm / 300px)
        let displayWidth = actualWidth ? Math.round(actualWidth * scaleFactor) : 200;
        let displayHeight = actualHeight ? Math.round(actualHeight * scaleFactor) : 150;
        
        // For A3 PDFs, ensure we match A3 dimensions (297x420mm)
        if (file.mimetype === 'application/pdf') {
          // Check if this looks like an A3 ratio
          const aspectRatio = actualWidth / actualHeight;
          const a3LandscapeRatio = 420 / 297; // ~1.414 A3 landscape ratio (wider than tall)
          const a3PortraitRatio = 297 / 420;   // ~0.707 A3 portrait ratio (taller than wide)
          
          console.log(`PDF aspect ratio: ${aspectRatio.toFixed(3)}, A3 landscape: ${a3LandscapeRatio.toFixed(3)}, A3 portrait: ${a3PortraitRatio.toFixed(3)}`);
          
          if (Math.abs(aspectRatio - a3LandscapeRatio) < 0.05) {
            // Landscape A3 (wider than tall)
            displayWidth = 420;
            displayHeight = 297;
            console.log('Detected A3 landscape');
          } else if (Math.abs(aspectRatio - a3PortraitRatio) < 0.05) {
            // Portrait A3 (taller than wide)
            displayWidth = 297;
            displayHeight = 420;
            console.log('Detected A3 portrait');
          } else {
            console.log('PDF does not match A3 ratio, using scale factor');
          }
        }
        
        const canvasElementData = {
          projectId: req.params.projectId,
          logoId: logo.id,
          x: 50 + (logos.length - 1) * 20,
          y: 50 + (logos.length - 1) * 20,
          width: displayWidth,
          height: displayHeight,
          rotation: 0,
          zIndex: logos.length - 1,
          isVisible: true,
          isLocked: false
        };

        await storage.createCanvasElement(canvasElementData);
      }

      res.status(201).json(logos);
    } catch (error) {
      res.status(500).json({ message: "Failed to upload logos" });
    }
  });

  // Delete logo
  app.delete("/api/logos/:id", async (req, res) => {
    try {
      const logoId = req.params.id;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }
      
      // Delete the file from disk
      const filePath = path.join(uploadDir, logo.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Delete canvas elements using this logo
      await storage.deleteCanvasElementsByLogo(logoId);
      
      // Delete the logo record
      const deleted = await storage.deleteLogo(logoId);
      if (!deleted) {
        return res.status(404).json({ message: "Logo not found" });
      }
      
      res.json({ message: "Logo deleted successfully" });
    } catch (error) {
      console.error('Delete logo error:', error);
      res.status(500).json({ message: "Failed to delete logo" });
    }
  });

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
  app.use("/uploads", express.static(uploadDir));

  // Canvas elements
  app.get("/api/projects/:projectId/canvas-elements", async (req, res) => {
    try {
      const elements = await storage.getCanvasElementsByProject(req.params.projectId);
      res.json(elements);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch canvas elements" });
    }
  });

  app.patch("/api/canvas-elements/:id", async (req, res) => {
    try {
      const validatedData = updateCanvasElementSchema.parse(req.body);
      const element = await storage.updateCanvasElement(req.params.id, validatedData);
      if (!element) {
        return res.status(404).json({ message: "Canvas element not found" });
      }
      res.json(element);
    } catch (error) {
      res.status(400).json({ message: "Invalid canvas element data" });
    }
  });

  app.delete("/api/canvas-elements/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCanvasElement(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Canvas element not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete canvas element" });
    }
  });

  // Generate PDF with vector preservation
  app.get("/api/projects/:projectId/generate-pdf", async (req, res) => {
    try {
      const projectId = req.params.projectId;
      
      // Get project data
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const logos = await storage.getLogosByProject(projectId);
      const canvasElements = await storage.getCanvasElementsByProject(projectId);
      const templateSize = await storage.getTemplateSize(project.templateSize);
      
      if (!templateSize) {
        return res.status(400).json({ message: "Template size not found" });
      }

      // Generate PDF with vector preservation
      const pdfBuffer = await pdfGenerator.generateProductionPDF({
        projectId,
        templateSize,
        canvasElements,
        logos
      });

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
