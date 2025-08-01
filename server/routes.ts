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
  const { storage } = await import('./storage');
  const { setupImpositionRoutes } = await import('./imposition-routes');
  
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
      const logos = await storage.getLogosByProject(projectId);
      const canvasElements = await storage.getCanvasElementsByProject(projectId);
      const templateSizes = await storage.getTemplateSizes();
      
      console.log(`📊 Project data - Logos: ${logos.length}, Elements: ${canvasElements.length}`);
      
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      if (!templateSize) {
        console.error(`❌ Invalid template size: ${project.templateSize}`);
        return res.status(400).json({ error: 'Invalid template size' });
      }

      console.log(`📐 Template size: ${templateSize.name} (${templateSize.width}×${templateSize.height}mm)`);

      // Import the EnhancedCMYKGenerator
      console.log('📦 About to import EnhancedCMYKGenerator...');
      // Force fresh import by adding timestamp
      const moduleUrl = `./enhanced-cmyk-generator?t=${Date.now()}`;
      const { EnhancedCMYKGenerator } = await import('./enhanced-cmyk-generator');
      console.log('✅ EnhancedCMYKGenerator imported successfully');
      const generator = new EnhancedCMYKGenerator();
      console.log('📊 Generator instance created');

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
      const pdfBuffer = await generator.generateCMYKPDF(pdfData);
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

        // If it's a PDF, check for CMYK colors first
        if (file.mimetype === 'application/pdf') {
          try {
            const pdfPath = path.join(uploadDir, file.filename);
            const { CMYKDetector } = await import('./cmyk-detector');
            
            // Check if PDF contains CMYK colors
            const hasCMYK = await CMYKDetector.hasCMYKColors(pdfPath);
            
            if (hasCMYK) {
              console.log(`🎨 CMYK PDF detected: ${file.filename} - preserving original PDF to maintain CMYK accuracy`);
              // Keep original PDF but create a PNG preview for canvas display
              try {
                const pngFilename = `${file.filename}_preview.png`;
                const pngPath = path.join(uploadDir, pngFilename);
                
                // Use Ghostscript to create PNG preview while preserving colors
                const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r150 -sOutputFile="${pngPath}" "${pdfPath}"`;
                await execAsync(gsCommand);
                
                if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                  // Store preview filename in metadata
                  (file as any).previewFilename = pngFilename;
                  console.log(`Created PNG preview for CMYK PDF: ${pngFilename}`);
                }
              } catch (error) {
                console.error('Failed to create CMYK PDF preview:', error);
              }
            } else {
              // Convert RGB PDF to SVG for editing capabilities
              const svgFilename = `${file.filename}.svg`;
              const svgPath = path.join(uploadDir, svgFilename);
              
              // Use pdf2svg for conversion
              let svgCommand;
              try {
                await execAsync('which pdf2svg');
                svgCommand = `pdf2svg "${pdfPath}" "${svgPath}"`;
              } catch {
                svgCommand = `convert -density 300 -background none "${pdfPath}[0]" "${svgPath}"`;
              }
              
              await execAsync(svgCommand);
              
              if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
                finalFilename = svgFilename;
                finalMimeType = 'image/svg+xml';
                finalUrl = `/uploads/${finalFilename}`;
              }
            }
          } catch (error) {
            console.error('PDF processing failed:', error);
            // Continue with original PDF
          }
        }

        // Import color workflow manager and mixed content detector
        const { ColorWorkflowManager, FileType } = await import('./color-workflow-manager');
        const { MixedContentDetector } = await import('./mixed-content-detector');
        
        // Analyze file content for mixed raster/vector content
        let fileType = ColorWorkflowManager.getFileType(finalMimeType, finalFilename);
        
        // For PDFs and SVGs, check if they contain mixed content
        if (fileType === FileType.VECTOR_PDF || fileType === FileType.VECTOR_SVG) {
          const filePath = path.join(uploadDir, finalFilename);
          const contentAnalysis = await MixedContentDetector.analyzeFile(filePath, finalMimeType);
          
          console.log(`📊 Content analysis for ${finalFilename}:`, {
            hasRaster: contentAnalysis.hasRasterContent,
            hasVector: contentAnalysis.hasVectorContent,
            isMixed: contentAnalysis.isMixedContent,
            rasterCount: contentAnalysis.rasterImages.count,
            vectorTypes: contentAnalysis.vectorElements.types,
            recommendation: contentAnalysis.recommendation
          });
          
          // Override file type if mixed content detected
          if (contentAnalysis.isMixedContent) {
            fileType = FileType.MIXED_CONTENT;
          }
        }
        
        // Determine workflow based on content analysis
        const colorWorkflow = ColorWorkflowManager.getColorWorkflow(fileType);
        
        console.log(`📂 File type: ${fileType}, Workflow: ${JSON.stringify(colorWorkflow)}`);
        console.log(`🎨 ${ColorWorkflowManager.getWorkflowMessage(fileType, colorWorkflow)}`);
        
        // Analyze colors based on file type
        let analysisData = null;
        
        // Handle raster files separately
        if (fileType === FileType.RASTER_PNG || fileType === FileType.RASTER_JPEG) {
          try {
            console.log(`🖼️ Processing raster file for CMYK conversion: ${finalFilename}`);
            const { RasterCMYKConverter } = await import('./raster-cmyk-converter');
            
            // Analyze raster colors for display
            const rasterPath = path.join(uploadDir, finalFilename);
            const colors = await RasterCMYKConverter.analyzeRasterColors(rasterPath);
            
            if (colors.length > 0) {
              analysisData = {
                colors: colors,
                fonts: [],
                strokeWidths: [],
                hasText: false
              };
              console.log(`🎨 Analyzed ${colors.length} dominant colors in raster image`);
            }
            
            // Note: Actual CMYK conversion happens during PDF generation
            // This prevents breaking the upload workflow
            
          } catch (error) {
            console.error('Error analyzing raster colors:', error);
            // Continue without color analysis - don't break upload
          }
        } 
        // Handle vector and mixed files
        else if (ColorWorkflowManager.shouldAnalyzeColors(fileType) || fileType === FileType.MIXED_CONTENT) {
          try {
            console.log(`🔍 Starting color analysis for vector file: ${finalFilename}`);
            const { analyzeSVGWithStrokeWidths } = await import('./svg-color-utils');
            const svgPath = path.join(uploadDir, finalFilename);
            console.log(`📁 SVG path: ${svgPath}`);
            
            const analysis = analyzeSVGWithStrokeWidths(svgPath);
            console.log(`🎨 Analysis results:`, {
              colors: analysis.colors?.length || 0,
              fonts: analysis.fonts?.length || 0,
              strokeWidths: analysis.strokeWidths?.length || 0,
              hasText: analysis.hasText
            });
            
            // Process colors based on workflow
            if (analysis.colors && analysis.colors.length > 0 && colorWorkflow.convertToCMYK) {
              console.log(`🎨 Processing colors for ${finalFilename} based on workflow`);
              
              // Mark colors as converted only if workflow requires conversion
              const processedColors = analysis.colors.map(color => ({
                ...color,
                converted: colorWorkflow.convertToCMYK && !(color as any).isCMYK // Only mark as converted if actually converting RGB to CMYK
              }));
              
              // Update analysis with processed colors
              analysis.colors = processedColors;
              console.log(`✅ Processed ${processedColors.length} colors - CMYK preserved: ${colorWorkflow.preserveCMYK}`);
            }
            
            // Prepare analysis data for logo record
            analysisData = {
              colors: analysis.colors,
              fonts: analysis.fonts,
              strokeWidths: analysis.strokeWidths,
              minStrokeWidth: analysis.minStrokeWidth,
              maxStrokeWidth: analysis.maxStrokeWidth,
              hasText: analysis.hasText
            };
            
            console.log(`📊 Auto-analyzed ${finalFilename} - Colors: ${analysis.colors?.length || 0}, Stroke widths: ${analysis.strokeWidths?.length || 0}, Min: ${analysis.minStrokeWidth?.toFixed(2) || 'N/A'}pt`);
          } catch (analysisError) {
            console.error('❌ SVG analysis failed during upload:', analysisError);
            console.error('Stack trace:', analysisError.stack);
          }
        }

        // Create logo record with analysis data
        const logoData: any = {
          projectId,
          filename: finalFilename,
          originalName: file.originalname,
          mimeType: finalMimeType,
          size: file.size,
          url: finalUrl,
          svgColors: analysisData,
          svgFonts: analysisData?.fonts || null,
          isMixedContent: fileType === FileType.MIXED_CONTENT
        };
        
        // Add preview filename if it exists (for CMYK PDFs)
        if ((file as any).previewFilename) {
          logoData.previewFilename = (file as any).previewFilename;
        }
        
        const logo = await storage.createLogo(logoData);

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

  // Update canvas element colors endpoint
  app.post('/api/canvas-elements/:elementId/update-colors', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      const { colorOverrides } = req.body;
      
      console.log(`🎨 Updating colors for canvas element: ${elementId}`, colorOverrides);
      
      const updatedElement = await storage.updateCanvasElement(elementId, {
        colorOverrides
      });
      
      if (!updatedElement) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      console.log(`✅ Successfully updated colors for element: ${elementId}`);
      res.json(updatedElement);
    } catch (error) {
      console.error('Update canvas element colors error:', error);
      res.status(500).json({ error: 'Failed to update canvas element colors' });
    }
  });

  // Get modified SVG with color overrides for canvas display
  app.get('/api/canvas-elements/:elementId/modified-svg', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      
      // Get the canvas element
      const element = await storage.getCanvasElement(elementId);
      if (!element) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      // Get the logo
      const logo = await storage.getLogo(element.logoId);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Only works for SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ error: 'Only SVG files support color modification' });
      }
      
      const svgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }
      
      // Apply color overrides if they exist
      let svgContent = fs.readFileSync(svgPath, 'utf8');
      
      if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
        console.log(`🎨 Applying color overrides to SVG for canvas display:`, element.colorOverrides);
        
        // Get SVG color analysis for format mapping
        const svgAnalysis = logo.svgColors as any;
        let originalFormatOverrides: Record<string, string> = {};
        
        if (svgAnalysis && svgAnalysis.colors && Array.isArray(svgAnalysis.colors)) {
          Object.entries(element.colorOverrides as Record<string, string>).forEach(([standardizedColor, newColor]) => {
            // Find the matching color in the SVG analysis
            const colorInfo = svgAnalysis.colors.find((c: any) => c.originalColor === standardizedColor);
            if (colorInfo && colorInfo.originalFormat) {
              originalFormatOverrides[colorInfo.originalFormat] = newColor;
            } else {
              // Fallback to standardized color if original format not found
              originalFormatOverrides[standardizedColor] = newColor;
            }
          });
        } else {
          // Fallback if no SVG color analysis available
          originalFormatOverrides = element.colorOverrides as Record<string, string>;
        }
        
        // Apply color changes
        const { applySVGColorChanges } = await import('./svg-color-utils');
        svgContent = applySVGColorChanges(svgPath, originalFormatOverrides);
      }
      
      // Set proper content type and return the SVG
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(svgContent);
      
    } catch (error) {
      console.error('Generate modified SVG error:', error);
      res.status(500).json({ error: 'Failed to generate modified SVG' });
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

  // SVG Analysis endpoint for stroke width detection
  app.post('/api/logos/:logoId/analyze', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Only analyze SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ error: 'Can only analyze SVG files' });
      }
      
      const svgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }
      
      // Perform enhanced SVG analysis including stroke widths
      const { analyzeSVGWithStrokeWidths } = await import('./svg-color-utils');
      const analysis = analyzeSVGWithStrokeWidths(svgPath);
      
      // Update the logo with enhanced analysis data
      const updatedAnalysis = {
        colors: analysis.colors,
        fonts: analysis.fonts,
        strokeWidths: analysis.strokeWidths,
        minStrokeWidth: analysis.minStrokeWidth,
        maxStrokeWidth: analysis.maxStrokeWidth,
        hasText: analysis.hasText
      };
      
      await storage.updateLogo(logoId, {
        svgColors: updatedAnalysis,
        svgFonts: analysis.fonts
      });
      
      console.log(`📊 Enhanced SVG analysis completed for ${logo.filename}`);
      console.log(`   - Colors: ${analysis.colors.length}`);
      console.log(`   - Fonts: ${analysis.fonts.length}`);
      console.log(`   - Stroke widths: ${analysis.strokeWidths.length}`);
      if (analysis.minStrokeWidth !== undefined) {
        console.log(`   - Min line thickness: ${analysis.minStrokeWidth.toFixed(2)}pt`);
      }
      
      res.json(updatedAnalysis);
    } catch (error) {
      console.error('SVG analysis error:', error);
      res.status(500).json({ error: 'Failed to analyze SVG' });
    }
  });

  return app;
}