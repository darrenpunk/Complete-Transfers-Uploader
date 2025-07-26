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
import { extractSVGColors, applySVGColorChanges } from "./svg-color-utils";

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

        // If it's a PDF, try to convert to SVG first for color editing capabilities
        if (file.mimetype === 'application/pdf') {
          try {
            // Try PDF to SVG conversion first for color manipulation
            const svgFilename = `${file.filename}.svg`;
            const svgPath = path.join(uploadDir, svgFilename);
            
            // Use pdf2svg with post-processing to remove white backgrounds
            let svgCommand;
            try {
              // Check if pdf2svg is available
              await execAsync('which pdf2svg');
              svgCommand = `pdf2svg "${file.path}" "${svgPath}"`;
              console.log('Using pdf2svg for conversion');
            } catch {
              // Fallback to ImageMagick SVG conversion
              svgCommand = `convert -density 300 -background none "${file.path}[0]" "${svgPath}"`;
              console.log('Using ImageMagick for SVG conversion');
            }
            
            await execAsync(svgCommand);
            
            if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
              // Post-process SVG to remove white backgrounds and fix transparency
              try {
                let svgContent = fs.readFileSync(svgPath, 'utf8');
                
                // Remove white backgrounds from various formats
                svgContent = svgContent.replace(/fill\s*=\s*["']#ffffff["']/gi, 'fill="none"');
                svgContent = svgContent.replace(/fill\s*=\s*["']white["']/gi, 'fill="none"');
                svgContent = svgContent.replace(/fill\s*=\s*["']rgb\(255,\s*255,\s*255\)["']/gi, 'fill="none"');
                svgContent = svgContent.replace(/fill\s*=\s*["']rgb\(100%,\s*100%,\s*100%\)["']/gi, 'fill="none"');
                
                // Remove white rectangles that might be backgrounds (common in pdf2svg output)
                svgContent = svgContent.replace(/<rect[^>]*fill\s*=\s*["'](?:#ffffff|white|rgb\(255,\s*255,\s*255\)|rgb\(100%,\s*100%,\s*100%\))["'][^>]*\/?>(?:<\/rect>)?/gi, '');
                
                // Also remove rect elements that are purely white without other attributes
                svgContent = svgContent.replace(/<rect[^>]*fill\s*=\s*["'](?:#ffffff|white)["'][^>]*>\s*<\/rect>/gi, '');
                
                // Remove full-page background rectangles (common in pdf2svg output)
                svgContent = svgContent.replace(/<rect\s+x="0"\s+y="0"\s+width="[^"]*"\s+height="[^"]*"\s+fill="[^"]*"[^>]*\/?>/, '');
                svgContent = svgContent.replace(/<rect\s+fill="[^"]*"\s+x="0"\s+y="0"\s+width="[^"]*"\s+height="[^"]*"[^>]*\/?>/, '');
                
                // More aggressive white background removal - match any rect that fills entire canvas
                svgContent = svgContent.replace(/<rect[^>]*width="841\.89"[^>]*height="1190\.55"[^>]*fill="[^"]*"[^>]*\/?>/, '');
                svgContent = svgContent.replace(/<rect[^>]*height="1190\.55"[^>]*width="841\.89"[^>]*fill="[^"]*"[^>]*\/?>/, '');
                
                // Remove any rect elements that are at position 0,0 and cover full dimensions
                svgContent = svgContent.replace(/<rect[^>]*x="0"[^>]*y="0"[^>]*width="841\.89"[^>]*height="1190\.55"[^>]*\/?>/, '');
                svgContent = svgContent.replace(/<rect[^>]*y="0"[^>]*x="0"[^>]*width="841\.89"[^>]*height="1190\.55"[^>]*\/?>/, '');
                
                // Complete background removal strategy
                console.log('Original SVG first 500 chars:', svgContent.substring(0, 500));
                
                // 1. Remove any rect elements that could be backgrounds
                svgContent = svgContent.replace(/<rect[^>]*>/g, (match) => {
                  console.log('Found rect element:', match);
                  // Keep rects that are clearly not backgrounds (have specific positioning)
                  if (match.includes('x="0"') && match.includes('y="0"')) {
                    console.log('Removing background rect:', match);
                    return '';
                  }
                  if (match.includes('width="841.89"') || match.includes('height="1190.55"')) {
                    console.log('Removing full-canvas rect:', match);
                    return '';
                  }
                  return match;
                });
                
                // 2. Remove any path elements that span the entire canvas or are at origin
                const pathRegex = /<path[^>]*>/g;
                let pathMatch;
                while ((pathMatch = pathRegex.exec(svgContent)) !== null) {
                  const pathElement = pathMatch[0];
                  // Look for paths that might be backgrounds - typically have large coordinate ranges
                  if (pathElement.includes('M 0 0') || 
                      pathElement.includes('fill="white"') || 
                      pathElement.includes('fill="rgb(100%, 100%, 100%)"') ||
                      pathElement.includes('fill="#ffffff"')) {
                    console.log('Removing suspected background path:', pathElement.substring(0, 100) + '...');
                    svgContent = svgContent.replace(pathElement, '');
                  }
                }
                
                // 3. Force complete transparency
                svgContent = svgContent.replace('<svg', '<svg style="background:transparent !important"');
                svgContent = svgContent.replace('</svg>', `
                  <defs>
                    <style>
                      svg { background: transparent !important; }
                      rect[fill="white"], rect[fill="#ffffff"], rect[fill="rgb(100%, 100%, 100%)"] { display: none !important; }
                      path[fill="white"], path[fill="#ffffff"], path[fill="rgb(100%, 100%, 100%)"] { display: none !important; }
                    </style>
                  </defs>
                </svg>`);
                
                console.log('Processed SVG first 500 chars:', svgContent.substring(0, 500));
                
                fs.writeFileSync(svgPath, svgContent);
                console.log('Removed white backgrounds from SVG');
              } catch (postProcessError) {
                console.error('SVG post-processing failed:', postProcessError);
              }
              
              finalFilename = svgFilename;
              finalMimeType = 'image/svg+xml';
              finalUrl = `/uploads/${finalFilename}`;
              
              console.log(`PDF converted to SVG for color editing: ${finalFilename}`);
            } else {
              throw new Error('SVG conversion failed');
            }
          } catch (svgError) {
            console.error('SVG conversion failed, falling back to PNG with Ghostscript:', svgError);
            
            // Fallback to PNG conversion with Ghostscript for color preservation
            try {
              const pngFilename = `${file.filename}.png`;
              const pngPath = path.join(uploadDir, pngFilename);
              
              // Ghostscript command with color profile preservation
              const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r300 -dUseCropBox -sOutputFile="${pngPath}" "${file.path}"`;
              await execAsync(gsCommand);
              
              if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                finalFilename = pngFilename;
                finalMimeType = 'image/png';
                finalUrl = `/uploads/${finalFilename}`;
                
                console.log(`PDF converted to PNG using Ghostscript with alpha: ${finalFilename}`);
              } else {
                throw new Error('Ghostscript PNG conversion also failed');
              }
            } catch (gsError) {
              console.error('Ghostscript conversion also failed, trying ImageMagick PNG:', gsError);
              
              // Final fallback to ImageMagick PNG
              try {
                const pngFilename = `${file.filename}.png`;
                const pngPath = path.join(uploadDir, pngFilename);
                
                const basicCommand = `convert -density 300 "${file.path}[0]" "${pngPath}"`;
                await execAsync(basicCommand);
                
                if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                  finalFilename = pngFilename;
                  finalMimeType = 'image/png';
                  finalUrl = `/uploads/${finalFilename}`;
                  
                  console.log(`PDF converted using basic ImageMagick PNG: ${finalFilename}`);
                }
              } catch (basicError) {
                console.error('All conversion attempts failed:', basicError);
              }
            }
          }
        }

        // Get dimensions from the final display file (SVG/PNG)
        let actualWidth = null;
        let actualHeight = null;
        try {
          // Use ImageMagick identify for all formats to get accurate dimensions
          const { stdout } = await execAsync(`identify -format "%w %h" "${path.join(uploadDir, finalFilename)}"`);
          const [w, h] = stdout.trim().split(' ').map(Number);
          if (w && h) {
            actualWidth = w;
            actualHeight = h;
          }
        } catch (error) {
          console.error('Failed to get image dimensions:', error);
        }

        // Extract SVG colors if it's an SVG file or was converted from PDF to SVG
        let svgColors = null;
        if (finalMimeType === 'image/svg+xml' || file.mimetype === 'image/svg+xml') {
          try {
            const svgPath = path.join(uploadDir, finalFilename);
            const colors = extractSVGColors(svgPath);
            if (colors.length > 0) {
              svgColors = colors;
              console.log(`Extracted ${colors.length} colors from SVG:`, colors.map(c => c.originalColor));
            }
          } catch (error) {
            console.error('Failed to extract SVG colors:', error);
          }
        }

        const logoData = {
          projectId: req.params.projectId,
          filename: finalFilename,
          originalName: file.originalname,
          mimeType: finalMimeType,
          size: file.size,
          width: actualWidth || 0,
          height: actualHeight || 0,
          url: finalUrl,
          // Store original PDF data for vector output if it was converted
          originalFilename: file.mimetype === 'application/pdf' ? file.filename : null,
          originalMimeType: file.mimetype === 'application/pdf' ? file.mimetype : null,
          originalUrl: file.mimetype === 'application/pdf' ? `/uploads/${file.filename}` : null,
          svgColors: svgColors,
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
        if (file.mimetype === 'application/pdf' && actualWidth && actualHeight) {
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
          isLocked: false,
          colorOverrides: null // Initialize with no color overrides
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

  // Apply SVG color changes to canvas element
  app.post("/api/canvas-elements/:id/update-colors", async (req, res) => {
    try {
      const elementId = req.params.id;
      const { colorOverrides } = req.body;

      // Get the canvas element and associated logo
      const element = await storage.getCanvasElement(elementId);
      if (!element) {
        return res.status(404).json({ message: "Canvas element not found" });
      }

      const logo = await storage.getLogo(element.logoId);
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }

      // Only process SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ message: "Color changes only supported for SVG files" });
      }

      // Apply color changes to create a modified SVG
      const originalSvgPath = path.join(uploadDir, logo.filename);
      const modifiedSvgContent = applySVGColorChanges(originalSvgPath, colorOverrides);
      
      if (!modifiedSvgContent) {
        return res.status(500).json({ message: "Failed to apply color changes" });
      }

      // Save modified SVG with unique filename
      const modifiedFilename = `${element.id}_modified.svg`;
      const modifiedSvgPath = path.join(uploadDir, modifiedFilename);
      fs.writeFileSync(modifiedSvgPath, modifiedSvgContent);

      // Update canvas element with color overrides
      const updatedElement = await storage.updateCanvasElement(elementId, {
        colorOverrides: colorOverrides
      });

      res.json({
        element: updatedElement,
        modifiedSvgUrl: `/uploads/${modifiedFilename}`,
        message: "Colors updated successfully"
      });
    } catch (error) {
      console.error('Error updating SVG colors:', error);
      res.status(500).json({ message: "Failed to update colors" });
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
