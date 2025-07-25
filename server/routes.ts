import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertProjectSchema, insertLogoSchema, insertCanvasElementSchema, updateCanvasElementSchema } from "@shared/schema";

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
        const logoData = {
          projectId: req.params.projectId,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          width: null,
          height: null,
          url: `/uploads/${file.filename}`
        };

        const validatedData = insertLogoSchema.parse(logoData);
        const logo = await storage.createLogo(validatedData);
        logos.push(logo);

        // Create canvas element for the logo
        const canvasElementData = {
          projectId: req.params.projectId,
          logoId: logo.id,
          x: 50 + (logos.length - 1) * 20,
          y: 50 + (logos.length - 1) * 20,
          width: 200,
          height: 150,
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

  const httpServer = createServer(app);
  return httpServer;
}
