import express, { type Request, Response } from "express";
import multer from "multer";
import { storage } from "./storage";
import { DeployedPDFGenerator } from "./deployed-pdf-generator";

const router = express.Router();

// File upload setup
const upload = multer({ dest: 'uploads/' });

// Create project
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const projectData = {
      name: req.body.name || 'Untitled',
      templateSize: req.body.templateSize || 'A3',
      garmentColor: req.body.garmentColor || '#FFFFFF',
      elements: req.body.elements || []
    };
    const project = await storage.createProject(projectData);
    console.log(`✅ Project created: ${project.id}`);
    res.json(project);
  } catch (error: unknown) {
    console.error('Error creating project:', error);
    res.status(400).json({ error: 'Invalid project data' });
  }
});

// Get project
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error: unknown) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload logo (supports multiple files like deployed version)
router.post('/projects/:projectId/logos', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    const project = await storage.getProject(projectId);
    
    if (!project || !req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ error: 'Invalid project or no files' });
    }

    const uploadedLogos: any[] = [];
    const createdElements: any[] = [];

    for (let index = 0; index < (req.files as Express.Multer.File[]).length; index++) {
      const file = (req.files as Express.Multer.File[])[index];
      
      const logoData = {
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        mimetype: file.mimetype
      };

      const logo = await storage.createLogo(logoData);
      
      // Add canvas element for this logo (like deployed version positioning)
      const element = {
        id: `element-${Date.now() + index}`,
        logoId: logo.id,
        x: 100 + (index * 20), // Offset multiple logos
        y: 100 + (index * 20),
        width: 250, // Larger default size like deployed version
        height: 200
      };
      
      // Update project elements
      const currentElements = project.elements || [];
      currentElements.push(element);
      await storage.updateProjectElements(projectId, currentElements);
      
      uploadedLogos.push(logo);
      createdElements.push(element);
      
      console.log(`✅ Logo uploaded: ${logo.originalName} (${logo.mimetype})`);
    }

    res.json({ logos: uploadedLogos, elements: createdElements });
  } catch (error: unknown) {
    console.error('Error uploading logos:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Generate PDF - EXACT DEPLOYED VERSION
router.post('/projects/:projectId/generate-pdf', async (req: Request, res: Response) => {
  try {
    console.log(`🚀 Generating PDF for project: ${req.params.projectId}`);
    
    const project = await storage.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const logos: any[] = [];
    for (const element of (project.elements || [])) {
      const logo = await storage.getLogo(element.logoId);
      if (logo) {
        logos.push({
          ...logo,
          element: element
        });
      }
    }

    const generator = new DeployedPDFGenerator();
    // Prepare data for PDF generator
    const pdfData = {
      projectId: project.id,
      templateSize: { name: 'A3', width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191 },
      canvasElements: project.elements || [],
      logos: logos,
      garmentColor: project.garmentColor || '#FFFFFF'
    };

    const pdfBuffer = await generator.generateExactDeployedPDF(pdfData);

    console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}_artwork.pdf"`);
    res.send(pdfBuffer);
  } catch (error: unknown) {
    console.error('❌ PDF generation failed:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// Update project elements (canvas positioning)
router.put('/projects/:projectId/elements', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    const elements = req.body.elements;
    
    await storage.updateProjectElements(projectId, elements);
    console.log(`✅ Updated elements for project: ${projectId}`);
    
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating elements:', error);
    res.status(500).json({ error: 'Failed to update elements' });
  }
});

export function registerRoutes(app: express.Application) {
  app.use('/api', router);
}