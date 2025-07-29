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
import { extractSVGColors, applySVGColorChanges, analyzeSVG, calculateSVGContentBounds, normalizeVectorizedSVG } from "./svg-color-utils";
import { outlineFonts } from "./font-outliner";
import { ColorManagement } from "./color-management";
import { standardizeRgbToCmyk } from "./color-standardization";
import { setupImpositionRoutes } from "./imposition-routes";

import { EnhancedCMYKGenerator } from "./enhanced-cmyk-generator";
import { recolorSVG } from "./svg-recolor";

const execAsync = promisify(exec);

// Function to extract color information from raster images using ImageMagick
async function extractImageColors(imagePath: string): Promise<any> {
  try {
    // Use ImageMagick identify to get color space and other properties
    const { stdout: imageInfo } = await execAsync(`identify -verbose "${imagePath}"`);
    
    // Extract color space (RGB, CMYK, Grayscale, etc.)
    const colorspaceMatch = imageInfo.match(/Colorspace: (\w+)/);
    const colorspace = colorspaceMatch ? colorspaceMatch[1] : 'Unknown';
    
    // Extract depth
    const depthMatch = imageInfo.match(/Depth: (\d+)-bit/);
    const depth = depthMatch ? depthMatch[1] : 'Unknown';
    
    // Get unique colors count
    const { stdout: colorsOutput } = await execAsync(`identify -format "%k" "${imagePath}"`);
    const uniqueColors = parseInt(colorsOutput.trim()) || 0;
    
    // Determine if it's likely CMYK based on color space
    const isCMYK = colorspace.toLowerCase().includes('cmyk');
    const isRGB = colorspace.toLowerCase().includes('rgb') || colorspace.toLowerCase() === 'srgb';
    const isGrayscale = colorspace.toLowerCase().includes('gray') || colorspace.toLowerCase().includes('grey');
    
    return {
      type: 'raster',
      colorspace: colorspace,
      depth: `${depth}-bit`,
      uniqueColors: uniqueColors,
      mode: isCMYK ? 'CMYK' : (isRGB ? 'RGB' : (isGrayscale ? 'Grayscale' : colorspace))
    };
  } catch (error) {
    console.error('Error extracting image colors:', error);
    return null;
  }
}

// Function to recolor SVG content for Single Colour Transfer templates
function recolorSVGContent(svgContent: string, inkColor: string): string {
  // Convert the ink color to RGB values for consistent replacement
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  const rgbColor = hexToRgb(inkColor);
  if (!rgbColor) {
    console.warn('Invalid ink color format:', inkColor);
    return svgContent;
  }
  
  // Create RGB string for replacement
  const newRgbString = `rgb(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b})`;
  const newRgbPercentString = `rgb(${(rgbColor.r/255*100).toFixed(6)}%, ${(rgbColor.g/255*100).toFixed(6)}%, ${(rgbColor.b/255*100).toFixed(6)}%)`;
  
  console.log(`Recoloring to: ${newRgbString} / ${newRgbPercentString}`);
  
  // Replace all fill colors except white/transparent
  let recoloredContent = svgContent;
  
  // Replace fill attributes with hex colors (but preserve white)
  recoloredContent = recoloredContent.replace(/fill="([^"]+)"/g, (match, color) => {
    // Keep white colors, none, and transparent
    if (color === '#ffffff' || color === '#FFFFFF' || color === 'white' || 
        color === 'none' || color === 'transparent' || color.startsWith('url(')) {
      return match;
    }
    return `fill="${inkColor}"`;
  });
  
  // Replace fill attributes with rgb() colors (but preserve white)
  recoloredContent = recoloredContent.replace(/fill="rgb\(([^)]+)\)"/g, (match, rgbValues) => {
    // Check if it's white (255, 255, 255 or 100%, 100%, 100%)
    if (rgbValues === '255, 255, 255' || rgbValues === '100%, 100%, 100%' || 
        rgbValues.includes('255') && rgbValues.split(',').every((v: string) => parseInt(v.trim()) >= 250)) {
      return match; // Keep white
    }
    return `fill="${inkColor}"`;
  });
  
  // Replace stroke colors (but preserve white and none)
  recoloredContent = recoloredContent.replace(/stroke="([^"]+)"/g, (match, color) => {
    if (color === '#ffffff' || color === '#FFFFFF' || color === 'white' || 
        color === 'none' || color === 'transparent') {
      return match;
    }
    return `stroke="${inkColor}"`;
  });
  
  // Replace CSS fill properties in style attributes
  recoloredContent = recoloredContent.replace(/style="([^"]*)"/g, (match, styleContent) => {
    let newStyle = styleContent.replace(/fill:\s*([^;]+)/g, (fillMatch: string, fillColor: string) => {
      const cleanColor = fillColor.trim();
      if (cleanColor === '#ffffff' || cleanColor === '#FFFFFF' || cleanColor === 'white' || 
          cleanColor === 'none' || cleanColor === 'transparent') {
        return fillMatch;
      }
      return `fill:${inkColor}`;
    });
    
    newStyle = newStyle.replace(/stroke:\s*([^;]+)/g, (strokeMatch: string, strokeColor: string) => {
      const cleanColor = strokeColor.trim();
      if (cleanColor === '#ffffff' || cleanColor === '#FFFFFF' || cleanColor === 'white' || 
          cleanColor === 'none' || cleanColor === 'transparent') {
        return strokeMatch;
      }
      return `stroke:${inkColor}`;
    });
    
    return `style="${newStyle}"`;
  });
  
  console.log('SVG recolored for Single Colour Transfer');
  return recoloredContent;
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      // Generate unique filename with proper extension
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
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

      // Get project information to check if it's a Single Colour Transfer with ink color
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check if this is a Single Colour Transfer template
      const templateSizes = await storage.getTemplateSizes();
      const template = templateSizes.find(t => t.id === project.templateSize);
      const isSingleColourTransfer = template?.group === 'Single Colour Transfers';
      const shouldRecolor = isSingleColourTransfer && project.inkColor;
      
      console.log(`Project templateSize ID: "${project.templateSize}"`);
      console.log(`Found template:`, template ? `${template.name} (${template.group})` : 'NOT FOUND');
      console.log(`Is Single Colour Transfer: ${isSingleColourTransfer}, ink color: ${project.inkColor}, should recolor: ${shouldRecolor}`);

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
              svgCommand = `pdf2svg "${path.join(uploadDir, file.filename)}" "${svgPath}"`;
              console.log('Using pdf2svg for conversion');
            } catch {
              // Fallback to ImageMagick SVG conversion
              svgCommand = `convert -density 300 -background none "${path.join(uploadDir, file.filename)}[0]" "${svgPath}"`;
              console.log('Using ImageMagick for SVG conversion');
            }
            
            await execAsync(svgCommand);
            
            if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
              // Post-process SVG to remove white backgrounds and fix transparency
              try {
                let svgContent = fs.readFileSync(svgPath, 'utf8');
                
                // Calculate content bounds first
                const initialBbox = calculateSVGContentBounds(svgContent);
                if (initialBbox && initialBbox.minX !== undefined && initialBbox.minY !== undefined && initialBbox.maxX !== undefined && initialBbox.maxY !== undefined) {
                  console.log(`Content bounds: ${initialBbox.minX.toFixed(1)},${initialBbox.minY.toFixed(1)} to ${initialBbox.maxX.toFixed(1)},${initialBbox.maxY.toFixed(1)} = ${initialBbox.width.toFixed(1)}×${initialBbox.height.toFixed(1)} (colored content only, raw: ${initialBbox.width.toFixed(1)}×${initialBbox.height.toFixed(1)})`);
                }
                
                // SELECTIVE white background removal - only remove obvious page backgrounds
                console.log('Original SVG first 500 chars:', svgContent.substring(0, 500));
                
                // Only remove full-page background rectangles at origin with full dimensions
                svgContent = svgContent.replace(/<rect\s+x="0"\s+y="0"\s+width="841\.89"\s+height="1190\.55"\s+fill="[^"]*"[^>]*\/?>/, '');
                svgContent = svgContent.replace(/<rect\s+x="0"\s+y="0"\s+width="624\.703125"\s+height="[^"]*"\s+fill="[^"]*"[^>]*\/?>/, '');
                
                // Remove rect elements ONLY if they are at origin (0,0) AND cover full canvas dimensions
                svgContent = svgContent.replace(/<rect[^>]*>/g, (match) => {
                  // Only remove if it's clearly a full-page background (at origin with large dimensions)
                  const isAtOrigin = match.includes('x="0"') && match.includes('y="0"');
                  const isFullSize = match.includes('width="841.89"') || match.includes('width="624.703125"') || 
                                   match.includes('height="1190.55"') || match.includes('height="587.646"');
                  
                  if (isAtOrigin && isFullSize) {
                    console.log('Removing suspected background rect:', match.substring(0, 100) + '...');
                    return '';
                  }
                  // Keep all other rect elements, including white content
                  return match;
                });
                
                // DISABLE white path removal entirely to preserve white text content
                // Only remove paths that are clearly full-page backgrounds (VERY restrictive)
                const pathRegex = /<path[^>]*>/g;
                let pathMatch;
                while ((pathMatch = pathRegex.exec(svgContent)) !== null) {
                  const pathElement = pathMatch[0];
                  // Only remove paths that start at origin, go to EXACT full canvas corners, AND are white AND have specific simple shapes
                  const startsAtOrigin = pathElement.includes('M 0 0');
                  const goesToExactCorners = (pathElement.includes('L 624.703125 0') && pathElement.includes('L 624.703125 587.646') && pathElement.includes('L 0 587.646') && pathElement.includes('Z')) ||
                                           (pathElement.includes('L 841.89 0') && pathElement.includes('L 841.89 1190.55') && pathElement.includes('L 0 1190.55') && pathElement.includes('Z'));
                  const isWhiteFill = pathElement.includes('fill="white"') || 
                                    pathElement.includes('fill="rgb(100%, 100%, 100%)"') ||
                                    pathElement.includes('fill="#ffffff"');
                  const isSimpleRectangle = pathElement.includes('Z') && !pathElement.includes('C') && !pathElement.includes('Q'); // No curves
                  
                  // Only remove if ALL criteria match: origin start + exact corners + white + simple rectangle
                  if (startsAtOrigin && goesToExactCorners && isWhiteFill && isSimpleRectangle) {
                    console.log('Removing confirmed full-page background path:', pathElement.substring(0, 100) + '...');
                    svgContent = svgContent.replace(pathElement, '');
                  } else if (isWhiteFill && (startsAtOrigin || goesToExactCorners)) {
                    console.log('PRESERVING potential white content path (not exact background match):', pathElement.substring(0, 100) + '...');
                  }
                }
                
                // Apply content bounds cropping after background removal
                const finalBbox = calculateSVGContentBounds(svgContent);
                console.log('Final bbox result:', finalBbox);
                if (finalBbox && finalBbox.minX !== undefined && finalBbox.minY !== undefined && finalBbox.maxX !== undefined && finalBbox.maxY !== undefined && finalBbox.width > 0 && finalBbox.height > 0) {
                  // Use raw content dimensions for tight cropping
                  const rawWidth = finalBbox.maxX - finalBbox.minX;
                  const rawHeight = finalBbox.maxY - finalBbox.minY;
                  
                  console.log(`SVG cropping to content: ${finalBbox.minX.toFixed(1)},${finalBbox.minY.toFixed(1)} ${rawWidth.toFixed(1)}×${rawHeight.toFixed(1)}`);
                  
                  // Update SVG viewBox to crop to content bounds
                  const newViewBox = `viewBox="${finalBbox.minX} ${finalBbox.minY} ${rawWidth} ${rawHeight}"`;
                  const newWidth = `width="${rawWidth}"`;
                  const newHeight = `height="${rawHeight}"`;
                  
                  svgContent = svgContent.replace(/viewBox="[^"]*"/, newViewBox);
                  svgContent = svgContent.replace(/width="[^"]*"/, newWidth);
                  svgContent = svgContent.replace(/height="[^"]*"/, newHeight);
                  
                  console.log('SVG updated with new viewBox:', newViewBox);
                } else {
                  console.log('SVG cropping skipped - no valid content bounds found');
                }
                
                // Force SVG background transparency only
                svgContent = svgContent.replace('<svg', '<svg style="background:transparent !important"');
                
                // Apply ink color recoloring for Single Colour Transfer templates
                if (shouldRecolor && project.inkColor) {
                  console.log(`Recoloring SVG with ink color: ${project.inkColor}`);
                  svgContent = recolorSVGContent(svgContent, project.inkColor);
                }
                
                console.log('Processed SVG first 500 chars:', svgContent.substring(0, 500));
                
                fs.writeFileSync(svgPath, svgContent);
                console.log('Updated SVG with content bounds cropping');
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
              const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r300 -dUseCropBox -sOutputFile="${pngPath}" "${path.join(uploadDir, file.filename)}"`;
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
                
                const basicCommand = `convert -density 300 "${path.join(uploadDir, file.filename)}[0]" "${pngPath}"`;
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

        // Get dimensions from the final display file (SVG/PNG) and content bounds
        let actualWidth = null;
        let actualHeight = null;
        let contentBounds = null;
        try {
          if (finalMimeType === 'image/svg+xml') {
            // For SVG files, calculate actual content bounding box instead of viewBox
            let svgContent = fs.readFileSync(path.join(uploadDir, finalFilename), 'utf8');
            
            // Apply viewBox adjustment for vectorized SVGs
            const normalizedSvgContent = normalizeVectorizedSVG(svgContent);
            if (normalizedSvgContent !== svgContent) {
              console.log('Applied SVG viewBox adjustment for better display');
              fs.writeFileSync(path.join(uploadDir, finalFilename), normalizedSvgContent);
              svgContent = normalizedSvgContent;
            }
            
            const bbox = calculateSVGContentBounds(svgContent);
            if (bbox) {
              actualWidth = bbox.width;
              actualHeight = bbox.height;
              // Store content bounds coordinates for frontend cropping
              if (bbox.minX !== undefined && bbox.minY !== undefined && bbox.maxX !== undefined && bbox.maxY !== undefined) {
                contentBounds = {
                  minX: bbox.minX,
                  minY: bbox.minY,
                  maxX: bbox.maxX,
                  maxY: bbox.maxY
                };
              }
              console.log(`SVG content bounds: ${actualWidth}×${actualHeight} (was using viewBox dimensions)`);
            } else {
              // Fallback to viewBox if content bounds calculation fails
              const { stdout } = await execAsync(`identify -format "%w %h" "${path.join(uploadDir, finalFilename)}"`);
              const [w, h] = stdout.trim().split(' ').map(Number);
              if (w && h) {
                actualWidth = w;
                actualHeight = h;
              }
            }
          } else {
            // Use ImageMagick identify for raster formats
            const { stdout } = await execAsync(`identify -format "%w %h" "${path.join(uploadDir, finalFilename)}"`);
            const [w, h] = stdout.trim().split(' ').map(Number);
            if (w && h) {
              actualWidth = w;
              actualHeight = h;
            }
          }
        } catch (error) {
          console.error('Failed to get image dimensions:', error);
        }
        
        // Extract colors and fonts from different file types
        let svgColors = null;
        let svgFonts = null;
        let fontsOutlined = false;
        
        if (finalMimeType === 'image/svg+xml' || file.mimetype === 'image/svg+xml') {
          try {
            const svgPath = path.join(uploadDir, finalFilename);
            const svgAnalysis = analyzeSVG(svgPath);
            
            if (svgAnalysis.colors.length > 0 || svgAnalysis.fonts.length > 0) {
              // Check if original PDF was CMYK colorspace
              let isCmykPdf = false;
              if (file.mimetype === 'application/pdf') {
                try {
                  const { stdout: colorspaceOutput } = await execAsync(`identify -format "%[colorspace]" "${file.path}"`);
                  const colorspace = colorspaceOutput.trim().toLowerCase();
                  console.log('Original PDF colorspace:', colorspace);
                  isCmykPdf = colorspace.includes('cmyk');
                } catch (colorspaceError) {
                  console.warn('Could not determine PDF colorspace:', colorspaceError);
                }
              }
              
              // Mark colors as converted if original was CMYK
              svgColors = svgAnalysis.colors.map(color => ({
                ...color,
                converted: isCmykPdf
              }));
              
              svgFonts = svgAnalysis.fonts;
              // Check if text is already outlined (glyph definitions without references)
              const hasAlreadyOutlinedGlyphs = svgAnalysis.fonts.some(font => font.elementType === 'outlined-glyphs');
              const hasLiveText = svgAnalysis.fonts.some(font => 
                font.elementType === 'glyph-references' || 
                font.elementType === 'text' || 
                font.elementType === 'tspan'
              );
              fontsOutlined = hasAlreadyOutlinedGlyphs && !hasLiveText; // Only outlined if no live text
              
              console.log(`Extracted ${svgAnalysis.colors.length} colors from SVG:`, svgAnalysis.colors.map(c => `${c.originalColor} (${c.cmykColor})`));
              console.log(`Detected ${svgAnalysis.fonts.length} fonts:`, svgAnalysis.fonts.map(f => `${f.fontFamily} (${f.textContent.substring(0, 20)}...)`));
              
              if (isCmykPdf) {
                console.log('Original PDF was CMYK - auto-marking colors as converted');
              }
            }
          } catch (error) {
            console.error('Failed to extract SVG analysis:', error);
          }
        } else if (finalMimeType?.startsWith('image/')) {
          // Extract color information from raster images
          try {
            const imagePath = path.join(uploadDir, finalFilename);
            const colorInfo = await extractImageColors(imagePath);
            if (colorInfo) {
              svgColors = colorInfo;
              console.log(`Extracted color info from ${finalMimeType}:`, colorInfo);
            }
          } catch (error) {
            console.error('Failed to extract image colors:', error);
          }
        }

        // Store flag to recalculate dimensions after font outlining  
        const shouldRecalcAfterOutlining = finalMimeType === 'image/svg+xml' && 
          (svgFonts && svgFonts.length > 0 && !fontsOutlined);
          
        console.log(`Should recalculate after outlining: ${shouldRecalcAfterOutlining}, has fonts: ${svgFonts?.length || 0}, outlined: ${fontsOutlined}`);

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
          svgFonts: svgFonts,
          fontsOutlined: fontsOutlined,
          contentBounds: contentBounds, // Store content coordinates for proper cropping
        };

        const validatedData = insertLogoSchema.parse(logoData);
        const logo = await storage.createLogo(validatedData);
        logos.push(logo);

        // Create canvas element for the logo using actual content dimensions scaled to mm
        let displayWidth = 200;  // Default fallback
        let displayHeight = 150; // Default fallback
        
        if (actualWidth && actualHeight) {
          // For all files (including PDFs), use the actual content bounds calculated above
          // This ensures bounding boxes are tight around the content, not the full page
          
          if (file.mimetype === 'application/pdf' && contentBounds) {
            // For PDFs with content bounds, use the raw content size for tight bounding boxes
            const rawContentWidth = contentBounds.maxX - contentBounds.minX;
            const rawContentHeight = contentBounds.maxY - contentBounds.minY;
            
            console.log(`Using raw PDF content bounds: ${rawContentWidth.toFixed(1)}×${rawContentHeight.toFixed(1)} pixels`);
            
            // Convert pixels to mm at 72 DPI (PDF standard)
            // 1 inch = 25.4mm, 72 pixels = 1 inch, so 1 pixel = 25.4/72 mm = 0.352778 mm
            const pixelToMm = 0.352778;
            
            // Check if this is likely an A3 or other large format document
            const estimatedWidthMm = rawContentWidth * pixelToMm;
            const estimatedHeightMm = rawContentHeight * pixelToMm;
            
            console.log(`Estimated dimensions: ${estimatedWidthMm.toFixed(1)}×${estimatedHeightMm.toFixed(1)}mm`);
            
            // If the estimated size is reasonable for actual artwork (not a mistake), use it
            if (estimatedWidthMm > 50 && estimatedWidthMm < 500 && estimatedHeightMm > 50 && estimatedHeightMm < 500) {
              displayWidth = Math.round(estimatedWidthMm);
              displayHeight = Math.round(estimatedHeightMm);
              console.log(`Using actual PDF dimensions: ${displayWidth}×${displayHeight}mm`);
            } else {
              // For PDF content bounds, use a more appropriate scaling factor
              // Content bounds are in SVG units, roughly equivalent to points
              // 1 point = 0.352778 mm, but we need to account for the conversion scale
              const scaleFactor = 0.35; // Adjusted scale for PDF content bounds
              displayWidth = Math.round(rawContentWidth * scaleFactor);
              displayHeight = Math.round(rawContentHeight * scaleFactor);
              
              // Ensure minimum reasonable size
              if (displayWidth < 50) displayWidth = 100;
              if (displayHeight < 30) displayHeight = 70;
              
              console.log(`PDF raw content dimensions: ${rawContentWidth.toFixed(1)}×${rawContentHeight.toFixed(1)} SVG units -> ${displayWidth}×${displayHeight}mm`);
            }
          } else if (file.mimetype === 'application/pdf') {
            // Fallback for PDFs without content bounds data
            console.log(`Using padded PDF content bounds: ${actualWidth}×${actualHeight} pixels`);
            
            // Convert pixels to mm at 72 DPI (PDF standard)
            const pixelToMm = 0.352778;
            const estimatedWidthMm = actualWidth * pixelToMm;
            const estimatedHeightMm = actualHeight * pixelToMm;
            
            console.log(`Estimated dimensions: ${estimatedWidthMm.toFixed(1)}×${estimatedHeightMm.toFixed(1)}mm`);
            
            // If the estimated size is reasonable for actual artwork, use it
            if (estimatedWidthMm > 50 && estimatedWidthMm < 500 && estimatedHeightMm > 50 && estimatedHeightMm < 500) {
              displayWidth = Math.round(estimatedWidthMm);
              displayHeight = Math.round(estimatedHeightMm);
              console.log(`Using actual PDF dimensions: ${displayWidth}×${displayHeight}mm`);
            } else {
              // For PDF content bounds, use a more appropriate scaling factor
              const scaleFactor = 0.35; // Adjusted scale for PDF content bounds
              displayWidth = Math.round(actualWidth * scaleFactor);
              displayHeight = Math.round(actualHeight * scaleFactor);
              
              // Ensure minimum reasonable size
              if (displayWidth < 50) displayWidth = 100;
              if (displayHeight < 30) displayHeight = 70;
              
              console.log(`PDF content dimensions: ${actualWidth}×${actualHeight} SVG units -> ${displayWidth}×${displayHeight}mm`);
            }
          } else {
            // For non-PDF images and SVGs
            if (file.mimetype === 'image/svg+xml' && actualWidth > 300) {
              // For SVGs (especially vectorized ones), use the bounds as actual size
              // The calculateSVGContentBounds function returns reasonable pixel dimensions
              // that should be used more directly
              const scaleFactor = 0.264583; // 1 pixel = 0.264583mm at 96 DPI
              displayWidth = Math.round(actualWidth * scaleFactor);
              displayHeight = Math.round(actualHeight * scaleFactor);
              console.log(`SVG dimensions: ${actualWidth}×${actualHeight} pixels -> ${displayWidth}×${displayHeight}mm (using 96 DPI)`);
            } else {
              // For raster images, use 300 DPI scale
              const scaleFactor = 0.08466667;
              displayWidth = Math.round(actualWidth * scaleFactor);
              displayHeight = Math.round(actualHeight * scaleFactor);
              console.log(`Image dimensions: ${actualWidth}×${actualHeight} pixels -> ${displayWidth}×${displayHeight}mm`);
            }
          }
        } else {
          console.log('No content dimensions available, using fallback size');
        }
        
        // Get template size for centering (project already retrieved earlier)
        const templateSize = await storage.getTemplateSize(project.templateSize);
        if (!templateSize) {
          throw new Error('Template size not found');
        }
        
        // Calculate centered position
        const centerX = Math.max(0, (templateSize.width - displayWidth) / 2);
        const centerY = Math.max(0, (templateSize.height - displayHeight) / 2);
        
        console.log(`Centering logo on ${templateSize.width}×${templateSize.height}mm template: ${centerX.toFixed(1)},${centerY.toFixed(1)}`);
        
        const canvasElementData = {
          projectId: req.params.projectId,
          logoId: logo.id,
          x: centerX,
          y: centerY,
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

  // Convert RGB image to CMYK
  app.post("/api/logos/:id/convert-to-cmyk", async (req, res) => {
    try {
      const logoId = req.params.id;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }

      // Check if it's a vector file with RGB colors or a raster image
      const isVector = logo.mimeType === 'image/svg+xml' || logo.originalMimeType === 'application/pdf';
      const isRasterImage = logo.mimeType?.startsWith('image/') && !logo.mimeType.includes('svg');
      
      if (!isVector && !isRasterImage) {
        return res.status(400).json({ message: "Only images and vector files can be converted to CMYK" });
      }

      // Check if already CMYK (prevent duplicate conversions)
      const currentColors = logo.svgColors as any;
      if (isRasterImage && currentColors && currentColors.mode === 'CMYK') {
        return res.status(400).json({ message: "Image is already in CMYK format" });
      }
      
      // For vectors, check if already converted with our standardized algorithm
      if (isVector && Array.isArray(currentColors)) {
        const alreadyConverted = currentColors.some(color => color.converted);
        if (alreadyConverted) {
          return res.status(400).json({ message: "Vector already converted to standardized CMYK" });
        }
      }

      const originalPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(originalPath)) {
        return res.status(404).json({ message: "Original image file not found" });
      }

      let finalColorInfo;
      let cmykFilename;
      let cmykPath;

      if (isVector) {
        // For vector files, update the color information directly
        console.log('Converting vector colors using standardized RGB to CMYK algorithm');
        
        if (Array.isArray(currentColors)) {
          // Update existing SVG colors to indicate they've been "converted" to CMYK
          // Ensure consistent CMYK values by using our standard conversion
          finalColorInfo = currentColors.map(color => {
            // Extract RGB values and convert to standardized CMYK
            const rgbMatch = color.originalColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            let cmykColor = color.cmykColor;
            
            if (rgbMatch) {
              const r = parseInt(rgbMatch[1]);
              const g = parseInt(rgbMatch[2]); 
              const b = parseInt(rgbMatch[3]);
              
              // Use standardized conversion for consistent results across similar logos
              cmykColor = standardizeRgbToCmyk(r, g, b);
            }
            
            return {
              ...color,
              cmykColor,
              converted: true
            };
          });
        } else {
          finalColorInfo = [];
        }
        
        // Keep the same filename for vectors since we're not changing the actual file
        cmykFilename = logo.filename;
        cmykPath = originalPath;
        
      } else {
        // For raster images, do actual CMYK conversion
        console.log('Converting raster image to CMYK colorspace');
        
        // Create CMYK version filename (avoid duplicate _cmyk suffixes) 
        const originalName = path.parse(logo.filename).name.replace(/_cmyk$/, '');
        const extension = path.parse(logo.filename).ext || '.png'; // Ensure extension exists
        cmykFilename = `${originalName}_cmyk${extension}`;
        cmykPath = path.join(uploadDir, cmykFilename);
        
        console.log('Original filename:', logo.filename);
        console.log('CMYK filename will be:', cmykFilename);
        
        // First convert to TIFF to get proper CMYK, then back to original format for web display
        const tempTiffPath = path.join(uploadDir, `${originalName}_temp.tiff`);

        // Convert to CMYK using ImageMagick with perceptual intent for better color matching
        const cmykCommand = `convert "${originalPath}" -colorspace CMYK -intent perceptual -compress LZW "${tempTiffPath}"`;
        console.log('Executing CMYK conversion command:', cmykCommand);
        await execAsync(cmykCommand);

        if (!fs.existsSync(tempTiffPath) || fs.statSync(tempTiffPath).size === 0) {
          throw new Error('CMYK conversion failed');
        }

        // Verify the conversion worked by checking colorspace
        const { stdout: verifyOutput } = await execAsync(`identify -format "%[colorspace]" "${tempTiffPath}"`);
        console.log('Converted file colorspace:', verifyOutput.trim());
        
        // Get color information from CMYK TIFF file
        const cmykColorInfo = await extractImageColors(tempTiffPath);
        console.log('CMYK color info extracted:', cmykColorInfo);
        
        // Convert back to web-compatible format while preserving CMYK metadata
        const webCommand = `convert "${tempTiffPath}" "${cmykPath}"`;
        await execAsync(webCommand);
        
        // Clean up temporary TIFF
        try {
          fs.unlinkSync(tempTiffPath);
        } catch (cleanupError) {
          console.warn('Failed to clean up temp TIFF:', cleanupError);
        }
        
        // Ensure CMYK color info is preserved regardless of web format conversion
        finalColorInfo = cmykColorInfo && cmykColorInfo.mode === 'CMYK' ? cmykColorInfo : {
          type: 'raster',
          colorspace: 'CMYK',
          depth: cmykColorInfo?.depth || '8-bit',
          uniqueColors: cmykColorInfo?.uniqueColors || 0,
          mode: 'CMYK'
        };
      }
      
      console.log('Final color info being saved:', finalColorInfo);
      
      // Update logo record with CMYK version 
      const updatedData = {
        filename: cmykFilename,
        url: `/uploads/${cmykFilename}`,
        svgColors: finalColorInfo,
      };

      const updatedLogo = await storage.updateLogo(logoId, updatedData);
      
      // Clean up original RGB file only for raster images (vectors keep same file)
      if (isRasterImage && cmykPath !== originalPath) {
        try {
          fs.unlinkSync(originalPath);
        } catch (cleanupError) {
          console.warn('Failed to clean up original RGB file:', cleanupError);
        }
      }

      console.log(`Successfully converted ${logo.filename} to CMYK: ${cmykFilename}`);
      console.log('Updated logo data:', updatedLogo);
      res.json(updatedLogo);
    } catch (error) {
      console.error('CMYK conversion error:', error);
      res.status(500).json({ message: "Failed to convert image to CMYK" });
    }
  });

  // Generate color-managed preview using ICC profile
  app.post("/api/logos/:id/color-managed-preview", async (req, res) => {
    try {
      const logoId = req.params.id;
      const refresh = req.query.refresh === 'true'; // Allow forced refresh
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }

      const originalPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(originalPath)) {
        return res.status(404).json({ message: "Logo file not found" });
      }

      // Clean up existing color-managed file if refresh is requested
      if (refresh) {
        await ColorManagement.cleanupColorManagedFiles(logoId);
      }

      // Generate color-managed preview
      const colorManagedPath = await ColorManagement.generateColorManagedImage(logoId, originalPath);
      
      if (colorManagedPath) {
        const colorManagedUrl = ColorManagement.getColorManagedUrl(logoId);
        res.json({ 
          colorManagedUrl,
          message: "Color-managed preview generated successfully"
        });
      } else {
        res.json({ 
          message: "ICC profile not available, using original colors"
        });
      }
      
    } catch (error) {
      console.error('Color-managed preview error:', error);
      res.status(500).json({ message: "Failed to generate color-managed preview" });
    }
  });

  // Get color-managed preview URL if exists
  app.get("/api/logos/:id/color-managed-url", async (req, res) => {
    try {
      const logoId = req.params.id;
      const colorManagedUrl = ColorManagement.getColorManagedUrl(logoId);
      
      if (colorManagedUrl) {
        res.json({ colorManagedUrl });
      } else {
        res.json({ colorManagedUrl: null });
      }
      
    } catch (error) {
      console.error('Color-managed URL check error:', error);
      res.status(500).json({ message: "Failed to check color-managed preview" });
    }
  });

  // Re-analyze fonts in existing logos
  app.post("/api/logos/:id/reanalyze-fonts", async (req, res) => {
    try {
      const logoId = req.params.id;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }

      const uploadDir = path.join(process.cwd(), "uploads");
      const logoPath = path.join(uploadDir, logo.filename);
      
      if (!fs.existsSync(logoPath)) {
        return res.status(404).json({ message: "Logo file not found" });
      }

      // Re-analyze the SVG/PDF for fonts
      const svgAnalysis = analyzeSVG(logoPath);
      // Check if text is already outlined (glyph definitions without references)
      const hasAlreadyOutlinedGlyphs = svgAnalysis.fonts.some(font => font.elementType === 'outlined-glyphs');
      const hasLiveText = svgAnalysis.fonts.some(font => 
        font.elementType === 'glyph-references' || 
        font.elementType === 'text' || 
        font.elementType === 'tspan'
      );
      const fontsOutlined = hasAlreadyOutlinedGlyphs && !hasLiveText; // Only outlined if no live text
      
      const updatedData = {
        svgFonts: svgAnalysis.fonts,
        fontsOutlined,
      };

      const updatedLogo = await storage.updateLogo(logoId, updatedData);
      
      console.log(`Re-analyzed fonts for ${logo.filename}:`, {
        fontsDetected: svgAnalysis.fonts.length,
        alreadyOutlined: fontsOutlined,
        hasLiveText,
        fonts: svgAnalysis.fonts.map(f => `${f.fontFamily} (${f.elementType})`)
      });
      
      res.json(updatedLogo);
    } catch (error) {
      console.error('Font re-analysis error:', error);
      res.status(500).json({ message: "Failed to re-analyze fonts" });
    }
  });

  // Outline fonts in SVG/PDF logos
  app.post("/api/logos/:id/outline-fonts", async (req, res) => {
    try {
      const logoId = req.params.id;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }

      // Check if logo has fonts to outline
      const svgFonts = logo.svgFonts as any;
      if (!svgFonts || !Array.isArray(svgFonts) || svgFonts.length === 0) {
        return res.status(400).json({ message: "No fonts detected in this logo" });
      }

      // Check if fonts are already outlined
      if (logo.fontsOutlined) {
        return res.status(400).json({ message: "Fonts are already outlined in this logo" });
      }

      const uploadDir = path.join(process.cwd(), "uploads");
      const originalPath = path.join(uploadDir, logo.filename);
      
      if (!fs.existsSync(originalPath)) {
        return res.status(404).json({ message: "Logo file not found" });
      }

      // Outline fonts in the SVG/PDF
      const outlinedPath = await outlineFonts(originalPath);
      
      if (outlinedPath && outlinedPath !== originalPath) {
        // If a new file was created, update the logo record
        const outlinedFilename = path.basename(outlinedPath);
        const outlinedUrl = `/uploads/${outlinedFilename}`;
        
        // Recalculate bounding box after font outlining since glyph references are now converted
        let newWidth = logo.width;
        let newHeight = logo.height;
        
        if (logo.mimeType === 'image/svg+xml') {
          try {
            console.log('Recalculating bounding box after font outlining...');
            const svgContent = fs.readFileSync(outlinedPath, 'utf8');
            const bbox = calculateSVGContentBounds(svgContent);
            if (bbox) {
              newWidth = bbox.width;
              newHeight = bbox.height;
              console.log(`Recalculated dimensions after outlining: ${newWidth}×${newHeight} (was ${logo.width}×${logo.height})`);
            }
          } catch (error) {
            console.error('Failed to recalculate bounding box after outlining:', error);
          }
        }
        
        const updatedData = {
          filename: outlinedFilename,
          url: outlinedUrl,
          fontsOutlined: true,
          width: newWidth,
          height: newHeight,
        };

        const updatedLogo = await storage.updateLogo(logoId, updatedData);
        
        // Clean up original file if a new one was created
        if (outlinedPath !== originalPath) {
          try {
            fs.unlinkSync(originalPath);
          } catch (cleanupError) {
            console.warn('Failed to clean up original file:', cleanupError);
          }
        }

        console.log(`Successfully outlined fonts in ${logo.filename}: ${outlinedFilename}`);
        res.json(updatedLogo);
      } else {
        // No new file created, just mark as outlined and recalculate if needed
        let newWidth = logo.width;
        let newHeight = logo.height;
        
        if (logo.mimeType === 'image/svg+xml') {
          try {
            console.log('Recalculating bounding box after font outlining (in-place)...');
            const svgContent = fs.readFileSync(originalPath, 'utf8');
            const bbox = calculateSVGContentBounds(svgContent);
            if (bbox) {
              newWidth = bbox.width;
              newHeight = bbox.height;
              console.log(`Recalculated dimensions after outlining: ${newWidth}×${newHeight} (was ${logo.width}×${logo.height})`);
            }
          } catch (error) {
            console.error('Failed to recalculate bounding box after outlining:', error);
          }
        }
        
        const updatedData = {
          fontsOutlined: true,
          width: newWidth,
          height: newHeight,
        };

        const updatedLogo = await storage.updateLogo(logoId, updatedData);
        console.log(`Fonts marked as outlined in ${logo.filename}`);
        res.json(updatedLogo);
      }
    } catch (error) {
      console.error('Font outlining error:', error);
      res.status(500).json({ message: "Failed to outline fonts" });
    }
  });

  // Handle real-time ink color recoloring for canvas display (BEFORE static middleware)
  app.get("/uploads/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const inkColor = req.query.inkColor as string;
      const shouldRecolor = req.query.recolor === 'true';
      
      console.log(`[INK RECOLOR] Request: ${filename}, inkColor: ${inkColor}, recolor: ${shouldRecolor}`);
      
      const uploadDir = path.join(process.cwd(), "uploads");
      const originalPath = path.join(uploadDir, filename);
      
      // If no recoloring requested or file doesn't exist, pass to static middleware
      if (!shouldRecolor || !inkColor || !fs.existsSync(originalPath)) {
        console.log(`[INK RECOLOR] Passing to static: shouldRecolor=${shouldRecolor}, inkColor=${inkColor}, exists=${fs.existsSync(originalPath)}`);
        return res.sendFile(originalPath);
      }
      
      // Generate recolored version for canvas display
      const recoloredPath = path.join(uploadDir, `${filename}_ink_${inkColor.replace('#', '')}_canvas.svg`);
      
      // Check if recolored version already exists and is recent
      if (fs.existsSync(recoloredPath)) {
        const originalStat = fs.statSync(originalPath);
        const recoloredStat = fs.statSync(recoloredPath);
        
        // If recolored version is newer than original, use it
        if (recoloredStat.mtime > originalStat.mtime) {
          console.log(`[INK RECOLOR] Using cached version: ${recoloredPath}`);
          return res.sendFile(recoloredPath);
        }
      }
      
      // Generate new recolored version
      console.log(`[INK RECOLOR] Generating new recolored version: ${filename} -> ${inkColor}`);
      
      // Read original SVG content
      const svgContent = fs.readFileSync(originalPath, 'utf8');
      
      // Apply ink color recoloring using the same function as PDF generation
      const { recolorSVG } = await import('./svg-recolor');
      const recoloredSVG = recolorSVG(svgContent, inkColor);
      
      // Save recolored version for caching
      fs.writeFileSync(recoloredPath, recoloredSVG);
      
      // Serve recolored SVG
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(recoloredSVG);
      
    } catch (error) {
      console.error('Error serving ink-recolored image:', error);
      // Fallback to serving original file
      const uploadDir = path.join(process.cwd(), "uploads");
      const originalPath = path.join(uploadDir, req.params.filename);
      if (fs.existsSync(originalPath)) {
        res.sendFile(originalPath);
      } else {
        res.status(404).send('File not found');
      }
    }
  });

  // Serve uploaded files (static middleware comes AFTER dynamic recoloring)
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

  // Duplicate canvas element
  app.post("/api/canvas-elements/:id/duplicate", async (req, res) => {
    try {
      const duplicate = await storage.duplicateCanvasElement(req.params.id);
      if (!duplicate) {
        return res.status(404).json({ message: "Canvas element not found" });
      }
      res.json(duplicate);
    } catch (error) {
      res.status(500).json({ message: "Failed to duplicate canvas element" });
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

      if (!element.logoId) {
        return res.status(400).json({ message: "Canvas element does not have an associated logo" });
      }

      const logo = await storage.getLogo(element.logoId);
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }

      // Only process SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ message: "Color changes only supported for SVG files" });
      }

      // Map standardized colors to original formats from SVG analysis
      let originalFormatOverrides: Record<string, string> = {};
      
      const svgColors = logo.svgColors as any[];
      if (svgColors && Array.isArray(svgColors)) {
        Object.entries(colorOverrides).forEach(([standardizedColor, newColor]) => {
          // Find the matching color in the SVG analysis
          const colorInfo = svgColors.find((c: any) => c.originalColor === standardizedColor);
          if (colorInfo && colorInfo.originalFormat) {
            originalFormatOverrides[colorInfo.originalFormat as string] = newColor as string;
            console.log(`Using original format: ${colorInfo.originalFormat} -> ${newColor}`);
          } else {
            // Fallback to standardized color if original format not found
            originalFormatOverrides[standardizedColor as string] = newColor as string;
            console.log(`Using standardized format: ${standardizedColor} -> ${newColor}`);
          }
        });
      } else {
        // Fallback if no SVG color analysis available
        originalFormatOverrides = colorOverrides;
      }

      // Apply color changes to create a modified SVG
      const originalSvgPath = path.join(uploadDir, logo.filename);
      const modifiedSvgContent = applySVGColorChanges(originalSvgPath, originalFormatOverrides);
      
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

  // Create text element
  app.post("/api/projects/:projectId/text-elements", async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { text, fontSize, fontFamily, color } = req.body;

      // Validate input
      if (!text || !fontSize || !fontFamily || !color) {
        return res.status(400).json({ message: "Missing required text element data" });
      }

      // Create text element on canvas
      const canvasElementData = {
        projectId,
        logoId: null, // Text elements don't have associated logos
        elementType: 'text' as const,
        x: 50, // Default position
        y: 50, // Default position
        width: Math.max(text.length * fontSize * 0.6, 100), // Estimated width
        height: fontSize * 1.2, // Estimated height
        rotation: 0,
        zIndex: 1000, // High z-index for text elements
        isVisible: true,
        isLocked: false,
        colorOverrides: null,
        // Text-specific properties
        textContent: text,
        fontSize,
        fontFamily,
        textColor: color
      };

      const element = await storage.createCanvasElement(canvasElementData);
      res.status(201).json(element);
    } catch (error) {
      console.error('Error creating text element:', error);
      res.status(500).json({ message: "Failed to create text element" });
    }
  });

  // Create shape element
  app.post("/api/projects/:projectId/shape-elements", async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { type, fillColor, strokeColor, strokeWidth } = req.body;

      // Validate input
      if (!type || !fillColor || !strokeColor || strokeWidth === undefined) {
        return res.status(400).json({ message: "Missing required shape element data" });
      }

      // Set default dimensions in millimeters based on shape type
      let width = 50; // 50mm = reasonable rectangle width
      let height = 30; // 30mm = reasonable rectangle height
      
      if (type === 'line') {
        width = 80; // 80mm line
        height = strokeWidth * 0.5; // Scale stroke width to mm
      } else if (type === 'rectangle') {
        width = 50; // 50mm rectangle
        height = 30; // 30mm rectangle
      } else if (type === 'circle') {
        width = 40; // 40mm diameter circle
        height = 40; // 40mm diameter circle
      }

      // Create shape element on canvas
      const canvasElementData = {
        projectId,
        logoId: null, // Shape elements don't have associated logos
        elementType: 'shape' as const,
        x: 150, // Centered position (A3 is 297mm wide, so ~150mm is center)
        y: 210, // Centered position (A3 is 420mm tall, so ~210mm is center)
        width,
        height,
        rotation: 0,
        zIndex: 999, // High z-index for shape elements
        isVisible: true,
        isLocked: false,
        colorOverrides: null,
        // Shape-specific properties
        shapeType: type,
        fillColor,
        strokeColor,
        strokeWidth
      };

      const element = await storage.createCanvasElement(canvasElementData);
      res.status(201).json(element);
    } catch (error) {
      console.error('Error creating shape element:', error);
      res.status(500).json({ message: "Failed to create shape element" });
    }
  });

  // Generate PDF with vector preservation
  app.get("/api/projects/:projectId/generate-pdf", async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const colorSpace = req.query.colorSpace as string || 'auto'; // 'rgb', 'cmyk', or 'auto'
      
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

      // Determine PDF generation method based on colorSpace parameter
      const hasCMYKLogos = logos.some(logo => {
        const colorInfo = logo.svgColors as any;
        return colorInfo && colorInfo.mode === 'CMYK';
      });

      let pdfBuffer: Buffer;
      
      if (colorSpace === 'rgb') {
        console.log('Forced RGB PDF generation requested');
        pdfBuffer = await pdfGenerator.generateProductionPDF({
          projectId,
          templateSize,
          canvasElements,
          logos,
          garmentColor: project.garmentColor,
          appliqueBadgesForm: project.appliqueBadgesForm
        });
      } else if (colorSpace === 'cmyk' || (colorSpace === 'auto' && hasCMYKLogos)) {
        console.log('Enhanced CMYK PDF generation requested with ICC profile support');
        const { EnhancedCMYKGenerator } = await import("./enhanced-cmyk-generator");
        const enhancedCMYKGenerator = new EnhancedCMYKGenerator();
        pdfBuffer = await enhancedCMYKGenerator.generateCMYKPDF({
          projectId,
          templateSize,
          canvasElements,
          logos,
          garmentColor: project.garmentColor,
          appliqueBadgesForm: project.appliqueBadgesForm
        });
        console.log('Generated enhanced CMYK PDF with vector preservation and ICC profile');
      } else {
        console.log('Using standard PDF generation for RGB images');
        pdfBuffer = await pdfGenerator.generateProductionPDF({
          projectId,
          templateSize,
          canvasElements,
          logos,
          garmentColor: project.garmentColor,
          appliqueBadgesForm: project.appliqueBadgesForm
        });
      }

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



  // AI-powered vectorization endpoint
  app.post("/api/vectorize", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Check if API credentials are available
      const apiId = process.env.VECTORIZER_API_ID;
      const apiSecret = process.env.VECTORIZER_API_SECRET;
      
      console.log('Environment check - API ID exists:', !!apiId, 'API Secret exists:', !!apiSecret);
      
      if (!apiId || !apiSecret) {
        console.error('Missing vectorizer credentials - API ID:', !!apiId, 'API Secret:', !!apiSecret);
        return res.status(500).json({ 
          error: "AI vectorization service credentials not configured. Please contact support to enable this feature." 
        });
      }

      console.log('Processing vectorization request for:', req.file.originalname);

      // Create FormData for vectorization API
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      
      // Read the file from disk since multer uses disk storage
      const filePath = path.join(uploadDir, req.file.filename);
      const fileStream = fs.createReadStream(filePath);
      
      // Add the image file
      formData.append('image', fileStream, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

      // Check if this is a preview request (don't consume credits)
      const isPreview = req.body.preview === 'true' || req.query.preview === 'true';
      
      // Add vectorization options - only add mode for production (credits consumed)
      // Omitting mode parameter for previews gives clean results without consuming credits
      if (!isPreview) {
        formData.append('mode', 'production'); // Only use production mode when consuming credits
      }
      
      // File Format
      formData.append('output_format', 'svg');
      
      // SVG Options
      formData.append('svg_version', '1.1');
      // Disable Adobe compatibility mode as per user settings
      formData.append('svg_adobe_compatibility_mode', 'false');
      
      // Shape Stacking - Stack shapes on top of each other
      formData.append('shape_stacking_mode', 'stack_on_top');
      
      // Allowed Curve Types
      formData.append('curve_fitting_lines', 'true');
      formData.append('curve_fitting_cubic_bezier_curves', 'true');
      
      // Gap Filler
      formData.append('gap_filler_enabled', 'true');
      formData.append('gap_filler_non_scaling_stroke', 'true');
      formData.append('gap_filler_stroke_width', '2.0');
      
      // Stroke Style
      formData.append('stroke_style_non_scaling_stroke', 'true');
      formData.append('stroke_style_stroke_width', '1.0');
      
      // Group By
      formData.append('output_group_by', 'color');
      
      // Line Fit Tolerance
      formData.append('line_fit_tolerance', 'medium');
      
      // Draw Style - Fill shapes (not stroke)
      formData.append('draw_style', 'fill');
      
      // Processing DPI
      formData.append('processing_dpi', '300');

      // Make request to vectorization API with Basic Auth
      const fetch = (await import('node-fetch')).default;
      const auth = Buffer.from(`${apiId}:${apiSecret}`).toString('base64');
      
      const response = await fetch('https://vectorizer.ai/api/v1/vectorize', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vectorization API error:', response.status, errorText);
        return res.status(500).json({ 
          error: `Vectorization failed: ${response.status} ${response.statusText}` 
        });
      }

      // Get the SVG result
      let svgContent = await response.text();
      
      console.log('Vectorization successful, SVG length:', svgContent.length);
      
      // Skip normalization for now - it's causing issues with coordinate parsing
      // svgContent = normalizeVectorizedSVG(svgContent);
      
      // Clean up the temporary file
      if (req.file && req.file.filename) {
        try {
          fs.unlinkSync(path.join(uploadDir, req.file.filename));
        } catch (cleanupError) {
          console.warn('Failed to clean up temporary file:', cleanupError);
        }
      }
      
      res.json({ 
        svg: svgContent,
        message: "Vectorization completed successfully"
      });

    } catch (error) {
      console.error('Vectorization error:', error);
      
      // Clean up the temporary file on error
      if (req.file && req.file.filename) {
        try {
          fs.unlinkSync(path.join(uploadDir, req.file.filename));
        } catch (cleanupError) {
          console.warn('Failed to clean up temporary file:', cleanupError);
        }
      }
      
      res.status(500).json({ 
        error: "Vectorization failed due to server error" 
      });
    }
  });

  // Setup imposition routes
  setupImpositionRoutes(app, storage);

  const httpServer = createServer(app);
  return httpServer;
}
