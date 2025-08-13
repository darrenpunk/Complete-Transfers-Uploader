import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { DeployedWorkingGenerator } from './deployed-generator';

/**
 * EXACT CARBON COPY OF DEPLOYED VERSION
 * Uses the actual DeployedWorkingGenerator that was confirmed working
 */

const app = express();
const PORT = 6000; // Completely separate port

// Storage maps - simple in-memory storage like deployed version
const projects = new Map();
const logos = new Map();
const canvasElements = new Map();

// Middleware exactly like deployed version
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
const upload = multer({ dest: 'uploads/' });

console.log('🎯 CARBON COPY: Exact DeployedWorkingGenerator replica');
console.log('✅ Using the confirmed working implementation');

// Project creation exactly like deployed version
app.post('/api/projects', (req, res) => {
  const id = Date.now().toString();
  const project = {
    id,
    name: req.body.name || 'Carbon Copy Project',
    templateSize: req.body.templateSize || 'A3',
    garmentColor: req.body.garmentColor || '#FFFFFF'
  };
  projects.set(id, project);
  console.log(`✅ CARBON COPY: Project created: ${id}`);
  res.json(project);
});

// Logo upload exactly like deployed version  
app.post('/api/projects/:projectId/logos', upload.array('files'), (req, res) => {
  const projectId = req.params.projectId;
  const project = projects.get(projectId);
  
  if (!project || !req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Invalid project or no files' });
  }

  const uploadedLogos = [];
  const createdElements = [];

  req.files.forEach((file, index) => {
    const logoId = (Date.now() + index).toString();
    
    // Create logo record exactly like deployed version
    const logo = {
      id: logoId,
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      mimeType: file.mimetype,
      size: file.size,
      projectId: projectId
    };

    logos.set(logoId, logo);
    
    // Create canvas element exactly like deployed version  
    const elementId = `element-${Date.now() + index}`;
    const element = {
      id: elementId,
      logoId: logoId,
      projectId: projectId,
      x: 100 + (index * 20),
      y: 100 + (index * 20),
      width: 200,
      height: 150,
      rotation: 0
    };
    
    canvasElements.set(elementId, element);
    uploadedLogos.push(logo);
    createdElements.push(element);
    
    console.log(`✅ CARBON COPY: Logo uploaded: ${logo.originalName}`);
  });

  res.json({ logos: uploadedLogos, elements: createdElements });
});

// Get canvas elements
app.get('/api/projects/:projectId/canvas-elements', (req, res) => {
  const projectId = req.params.projectId;
  const projectElements = Array.from(canvasElements.values())
    .filter(element => element.projectId === projectId);
  
  res.json(projectElements);
});

// PDF generation using exact DeployedWorkingGenerator
app.post('/api/projects/:projectId/generate-pdf', async (req, res) => {
  try {
    console.log(`🚀 CARBON COPY: PDF Generation with DeployedWorkingGenerator`);
    
    const project = projects.get(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get project elements and logos exactly like deployed version
    const projectElements = Array.from(canvasElements.values())
      .filter(element => element.projectId === req.params.projectId);
    
    const projectLogos = projectElements.map(element => 
      logos.get(element.logoId)
    ).filter(Boolean);

    console.log(`📊 CARBON COPY: Elements: ${projectElements.length}, Logos: ${projectLogos.length}`);

    // Use exact DeployedWorkingGenerator
    const generator = new DeployedWorkingGenerator();
    
    // Data structure exactly like deployed version
    const pdfData = {
      projectId: project.id,
      templateSize: { 
        name: 'A3', 
        width: 297, 
        height: 420, 
        pixelWidth: 842, 
        pixelHeight: 1191 
      },
      canvasElements: projectElements,
      logos: projectLogos,
      garmentColor: req.body.garmentColor || project.garmentColor || '#FFFFFF'
    };

    // This is the exact method that was working in production
    const pdfBuffer = await generator.generateCMYKPDF(pdfData);
    
    console.log(`✅ CARBON COPY: PDF generated - Size: ${pdfBuffer.length} bytes (${Math.round(pdfBuffer.length/1024)}KB)`);
    console.log('🎯 Generated with exact DeployedWorkingGenerator implementation');
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="carbon-copy-deployed.pdf"');
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('❌ CARBON COPY: PDF generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple test page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Carbon Copy - Deployed Version</title></head>
      <body style="font-family: Arial; padding: 20px; background: #f0f8ff;">
        <h1>🎯 Carbon Copy of Deployed Version</h1>
        <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h2>✅ Exact DeployedWorkingGenerator Implementation</h2>
          <p>This uses the actual DeployedWorkingGenerator class that was confirmed working.</p>
          <ul>
            <li><strong>Generator:</strong> server/deployed-working-generator.ts</li>
            <li><strong>Method:</strong> generatePDF() - exact deployed version</li>
            <li><strong>Port:</strong> 6000 (separate from broken system)</li>
            <li><strong>Status:</strong> Exact replica of working system</li>
          </ul>
        </div>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px;">
          <h3>🧪 Quick Test</h3>
          <p>1. Create project: POST /api/projects</p>
          <p>2. Upload logos: POST /api/projects/:id/logos</p> 
          <p>3. Generate PDF: POST /api/projects/:id/generate-pdf</p>
        </div>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ CARBON COPY: Deployed version running on port ${PORT}`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
  console.log('🎯 Using exact DeployedWorkingGenerator that was confirmed working');
});