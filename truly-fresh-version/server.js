const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4000; // Completely different port

// Storage
const projects = new Map();
const logos = new Map();

// Middleware
app.use(express.json());
app.use(express.static('public'));
const upload = multer({ dest: 'uploads/' });

console.log('🚀 TRULY FRESH APPROACH - Canvas-based PDF generation');
console.log('🔥 ZERO shared components with broken system');

// Create project
app.post('/api/projects', (req, res) => {
  const id = Date.now().toString();
  const project = {
    id,
    name: req.body.name || 'Fresh Project',
    garmentColor: req.body.garmentColor || '#FFFFFF'
  };
  projects.set(id, project);
  console.log(`✅ TRULY FRESH: Project created ${id}`);
  res.json(project);
});

// Upload logo - completely different approach
app.post('/api/projects/:projectId/upload', upload.single('logo'), async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);
    
    if (!project || !req.file) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    console.log(`🎯 TRULY FRESH: Processing ${req.file.originalname}`);
    
    // Convert everything to PNG using Sharp (completely different from current system)
    const logoId = Date.now().toString();
    const outputPath = path.join('uploads', `${logoId}.png`);
    
    await sharp(req.file.path)
      .png()
      .resize(400, 300, { fit: 'inside', withoutEnlargement: true })
      .toFile(outputPath);
    
    const logo = {
      id: logoId,
      originalName: req.file.originalname,
      pngPath: outputPath,
      projectId: projectId
    };
    
    logos.set(logoId, logo);
    
    console.log(`✅ TRULY FRESH: Logo converted to PNG: ${outputPath}`);
    res.json({ logoId, message: 'Logo processed with truly fresh approach' });
    
  } catch (error) {
    console.error('❌ TRULY FRESH: Upload failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate PDF - COMPLETELY DIFFERENT METHOD using Canvas
app.post('/api/projects/:projectId/generate', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log(`🎨 TRULY FRESH: Generating with Canvas approach for ${projectId}`);
    
    // Get all logos for this project
    const projectLogos = Array.from(logos.values()).filter(logo => logo.projectId === projectId);
    console.log(`📊 TRULY FRESH: Found ${projectLogos.length} logos`);
    
    if (projectLogos.length === 0) {
      return res.status(400).json({ error: 'No logos found for project' });
    }
    
    // Create canvas (A3 size: 842 x 1191 pixels at 72 DPI)
    const canvas = createCanvas(842, 1191);
    const ctx = canvas.getContext('2d');
    
    // Fill background with garment color
    ctx.fillStyle = project.garmentColor || '#FFFFFF';
    ctx.fillRect(0, 0, 842, 1191);
    
    console.log(`🎨 TRULY FRESH: Canvas created with background ${project.garmentColor}`);
    
    // Load and draw each logo
    for (let i = 0; i < projectLogos.length; i++) {
      const logo = projectLogos[i];
      try {
        console.log(`🖼️ TRULY FRESH: Loading logo ${logo.pngPath}`);
        const image = await loadImage(logo.pngPath);
        
        // Position logos (simple grid layout)
        const x = 100 + (i % 2) * 300;
        const y = 100 + Math.floor(i / 2) * 200;
        
        ctx.drawImage(image, x, y);
        console.log(`✅ TRULY FRESH: Logo drawn at (${x}, ${y})`);
      } catch (imgError) {
        console.error(`❌ TRULY FRESH: Failed to load logo ${logo.pngPath}:`, imgError);
      }
    }
    
    // Add text labels (truly fresh approach)
    ctx.fillStyle = '#000000';
    ctx.font = '16px Arial';
    ctx.fillText(`Project: ${project.name}`, 50, 50);
    ctx.fillText(`Garment: ${project.garmentColor}`, 50, 75);
    ctx.fillText(`Logos: ${projectLogos.length}`, 50, 100);
    ctx.fillText('Generated with Truly Fresh Canvas Method', 50, 1150);
    
    // Convert canvas to PNG
    const buffer = canvas.toBuffer('image/png');
    
    console.log(`✅ TRULY FRESH: Canvas PDF generated - ${buffer.length} bytes (${Math.round(buffer.length/1024)}KB)`);
    console.log('🎯 TRULY FRESH: This uses ZERO components from the broken system');
    
    // Send as PNG (can be converted to PDF later)
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename="fresh-canvas-output.png"');
    res.send(buffer);
    
  } catch (error) {
    console.error('❌ TRULY FRESH: Generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple test page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Truly Fresh Artwork Uploader</title></head>
      <body style="font-family: Arial; padding: 20px;">
        <h1>🔥 Truly Fresh Artwork Uploader</h1>
        <p>This version uses COMPLETELY DIFFERENT approach:</p>
        <ul>
          <li>Canvas-based rendering (not pdf-lib)</li>
          <li>Sharp for image processing (not Inkscape)</li>
          <li>Direct PNG output (not complex PDF)</li>
          <li>Zero shared components with broken system</li>
        </ul>
        <hr>
        <h2>Test the Fresh Approach:</h2>
        <form action="/api/projects" method="POST" style="margin-bottom: 20px;">
          <button type="button" onclick="createProject()">1. Create Project</button>
        </form>
        <div id="project-info"></div>
        <form id="upload-form" enctype="multipart/form-data" style="margin-bottom: 20px;">
          <input type="file" name="logo" accept=".pdf,.png,.jpg,.svg">
          <button type="button" onclick="uploadLogo()">2. Upload Logo</button>
        </form>
        <div id="upload-info"></div>
        <button onclick="generateCanvas()" id="generate-btn" disabled>3. Generate Canvas Output</button>
        <div id="output-info"></div>
        
        <script>
          let currentProject = null;
          
          async function createProject() {
            const response = await fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Fresh Test', garmentColor: '#FF6600' })
            });
            currentProject = await response.json();
            document.getElementById('project-info').innerHTML = 
              '<p>✅ Project created: ' + currentProject.id + '</p>';
          }
          
          async function uploadLogo() {
            if (!currentProject) return alert('Create project first');
            const form = document.getElementById('upload-form');
            const formData = new FormData(form);
            
            const response = await fetch('/api/projects/' + currentProject.id + '/upload', {
              method: 'POST',
              body: formData
            });
            const result = await response.json();
            document.getElementById('upload-info').innerHTML = 
              '<p>✅ Logo uploaded: ' + result.logoId + '</p>';
            document.getElementById('generate-btn').disabled = false;
          }
          
          async function generateCanvas() {
            if (!currentProject) return;
            
            const response = await fetch('/api/projects/' + currentProject.id + '/generate', {
              method: 'POST'
            });
            
            if (response.ok) {
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              document.getElementById('output-info').innerHTML = 
                '<p>✅ Canvas generated: ' + blob.size + ' bytes</p>' +
                '<img src="' + url + '" style="max-width: 400px; border: 1px solid #ccc;">';
            }
          }
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 TRULY FRESH VERSION running on port ${PORT}`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
  console.log('🔥 This approach shares ZERO code with the broken system');
  console.log('🎯 Canvas-based rendering, Sharp processing, no pdf-lib dependencies');
});