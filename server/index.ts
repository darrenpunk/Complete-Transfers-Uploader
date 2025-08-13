import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { DeployedPDFGenerator } from './deployed-pdf-generator';

const app = express();
const PORT = 3001; // Different port to avoid conflicts

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// File upload setup
const upload = multer({ dest: 'uploads/' });

// Simple in-memory storage for this fresh replica
const projects = new Map();
const logos = new Map();

// Create project
app.post('/api/projects', (req, res) => {
  const id = Date.now().toString();
  const project = {
    id,
    name: req.body.name || 'Untitled',
    templateSize: req.body.templateSize || 'A3',
    garmentColor: req.body.garmentColor || '#FFFFFF',
    elements: []
  };
  projects.set(id, project);
  console.log(`✅ FRESH: Project created: ${id}`);
  res.json(project);
});

// Upload logo (supports multiple files like deployed version)
app.post('/api/projects/:projectId/logos', upload.array('files'), (req, res) => {
  const projectId = req.params.projectId;
  const project = projects.get(projectId);
  
  if (!project || !req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Invalid project or no files' });
  }

  const uploadedLogos: any[] = [];
  const createdElements: any[] = [];

  (req.files as Express.Multer.File[]).forEach((file, index) => {
    const logo = {
      id: (Date.now() + index).toString(),
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      mimetype: file.mimetype
    };

    logos.set(logo.id, logo);
    
    // Add canvas element for this logo (like deployed version positioning)
    const element = {
      id: `element-${Date.now() + index}`,
      logoId: logo.id,
      x: 100 + (index * 20), // Offset multiple logos
      y: 100 + (index * 20),
      width: 250, // Larger default size like deployed version
      height: 200
    };
    
    project.elements.push(element);
    uploadedLogos.push(logo);
    createdElements.push(element);
    
    console.log(`✅ FRESH: Logo uploaded: ${logo.originalName} (${logo.mimetype})`);
  });

  res.json({ logos: uploadedLogos, elements: createdElements });
});

// Generate PDF - EXACT DEPLOYED VERSION
app.post('/api/projects/:projectId/generate-pdf', async (req, res) => {
  try {
    console.log(`🚀 FRESH: Generating PDF for project: ${req.params.projectId}`);
    
    const project = projects.get(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const generator = new DeployedPDFGenerator();
    
    // Prepare data exactly like deployed version
    const pdfData = {
      projectId: project.id,
      templateSize: { name: 'A3', width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191 },
      canvasElements: project.elements,
      logos: project.elements.map(el => logos.get(el.logoId)).filter(Boolean),
      garmentColor: req.body.garmentColor || project.garmentColor
    };

    console.log(`📊 FRESH: Elements: ${pdfData.canvasElements.length}, Logos: ${pdfData.logos.length}`);
    
    const pdfBuffer = await generator.generateExactDeployedPDF(pdfData);
    
    console.log(`✅ FRESH: PDF generated - Size: ${pdfBuffer.length} bytes (${Math.round(pdfBuffer.length/1024)}KB)`);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="deployed-test.pdf"');
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('❌ FRESH: PDF generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 FRESH DEPLOYED REPLICA running on port ${PORT}`);
  console.log(`🎯 This is the exact deployed version implementation`);
});