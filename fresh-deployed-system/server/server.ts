import express from 'express';
// import cors from 'cors'; // Not needed for simple system
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { SimpleWorkingGenerator } from './simple-pdf-generator';

/**
 * TRUE WORKING DEPLOYED VERSION
 * This recreates the original simple system that was actually working
 * BEFORE all the complex CMYK/vector features caused problems
 */

const app = express();
const PORT = process.env.PORT || 8000; // Fresh deployed system port

// Simple storage
const projects = new Map();
const logos = new Map();
const elements = new Map();

// app.use(cors()); // Not needed for simple system
app.use(express.json());
app.use(express.static('public'));
const upload = multer({ dest: 'uploads/' });

console.log('🔥 TRUE WORKING DEPLOYED VERSION - Original Simple Approach');
console.log('✅ This recreates the system BEFORE complex features broke it');

// Create project
app.post('/api/projects', (req, res) => {
  const id = Date.now().toString();
  const project = {
    id,
    name: req.body.name || 'Simple Project',
    templateSize: req.body.templateSize || 'A3',
    garmentColor: req.body.garmentColor || '#FFFFFF'
  };
  projects.set(id, project);
  console.log(`✅ SIMPLE: Project created: ${id}`);
  res.json(project);
});

// Upload logos
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
    
    elements.set(elementId, element);
    uploadedLogos.push(logo);
    createdElements.push(element);
    
    console.log(`✅ SIMPLE: Logo uploaded: ${logo.originalName} (${logo.size} bytes)`);
  });

  res.json({ logos: uploadedLogos, elements: createdElements });
});

// Get elements
app.get('/api/projects/:projectId/canvas-elements', (req, res) => {
  const projectId = req.params.projectId;
  const projectElements = Array.from(elements.values())
    .filter(element => element.projectId === projectId);
  
  res.json(projectElements);
});

// Generate PDF with SIMPLE approach
app.post('/api/projects/:projectId/generate-pdf', async (req, res) => {
  try {
    console.log(`🔥 TRUE WORKING: PDF Generation with SimpleWorkingGenerator`);
    
    const project = projects.get(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectElements = Array.from(elements.values())
      .filter(element => element.projectId === req.params.projectId);
    
    const projectLogos = projectElements.map(element => 
      logos.get(element.logoId)
    ).filter(Boolean);

    console.log(`📊 TRUE WORKING: Elements: ${projectElements.length}, Logos: ${projectLogos.length}`);

    // Use the SIMPLE generator that actually worked
    const generator = new SimpleWorkingGenerator();
    
    const pdfData = {
      projectId: project.id,
      templateSize: { 
        name: 'A3', 
        width: 297, 
        height: 420
      },
      canvasElements: projectElements,
      logos: projectLogos,
      garmentColor: req.body.garmentColor || project.garmentColor || '#FFFFFF'
    };

    const pdfBuffer = await generator.generatePDF(pdfData);
    
    console.log(`✅ TRUE WORKING PDF: ${pdfBuffer.length} bytes (${Math.round(pdfBuffer.length/1024)}KB)`);
    console.log('🎯 Generated with original simple approach that worked');
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="true-working-deployed.pdf"');
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('❌ TRUE WORKING: PDF generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>True Working Deployed Version</title></head>
      <body style="font-family: Arial; padding: 20px; background: #f0f8ff;">
        <h1>🔥 True Working Deployed Version</h1>
        <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h2>✅ Original Simple System (Pre-Complex Features)</h2>
          <p>This recreates the original working system from when PDFs were generating correctly.</p>
          <ul>
            <li><strong>Approach:</strong> Simple PDF embedding without complex processing</li>
            <li><strong>Features:</strong> Basic dual-page layout, simple logo embedding</li>
            <li><strong>Status:</strong> Original methodology that was confirmed working</li>
            <li><strong>Port:</strong> 7000 (completely independent)</li>
          </ul>
          
          <h3>🧪 Quick Test</h3>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 5px;">
            <p><strong>1.</strong> Create project: <code>POST /api/projects</code></p>
            <p><strong>2.</strong> Upload logos: <code>POST /api/projects/:id/logos</code></p>
            <p><strong>3.</strong> Generate PDF: <code>POST /api/projects/:id/generate-pdf</code></p>
          </div>
          
          <p><strong>This is the system before complex CMYK/vector processing broke it.</strong></p>
        </div>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ TRUE WORKING VERSION running on port ${PORT}`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
  console.log('🎯 Original simple system that was actually working');
  console.log('✅ No complex CMYK processing, no experimental features');
});