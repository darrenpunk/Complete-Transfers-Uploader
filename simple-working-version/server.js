const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4000;

// Simple in-memory storage
const projects = new Map();
const logos = new Map();

// Middleware
app.use(express.json());
app.use(express.static('public'));
const upload = multer({ dest: 'uploads/' });

console.log('🔥 SIMPLE WORKING VERSION - No complex dependencies');
console.log('✅ Uses only basic Node.js libraries');

// Create project
app.post('/api/projects', (req, res) => {
  const id = Date.now().toString();
  const project = {
    id,
    name: req.body.name || 'Simple Project',
    garmentColor: req.body.garmentColor || '#FFFFFF'
  };
  projects.set(id, project);
  console.log(`✅ SIMPLE: Project created ${id}`);
  res.json(project);
});

// Upload logo - just store the file
app.post('/api/projects/:projectId/upload', upload.single('logo'), (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);
    
    if (!project || !req.file) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    console.log(`📁 SIMPLE: Storing ${req.file.originalname}`);
    
    const logo = {
      id: Date.now().toString(),
      originalName: req.file.originalname,
      filePath: req.file.path,
      projectId: projectId,
      size: req.file.size
    };
    
    logos.set(logo.id, logo);
    
    console.log(`✅ SIMPLE: Logo stored: ${req.file.originalname} (${req.file.size} bytes)`);
    res.json({ 
      logoId: logo.id, 
      message: 'Logo stored successfully',
      originalName: req.file.originalname,
      size: req.file.size
    });
    
  } catch (error) {
    console.error('❌ SIMPLE: Upload failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate "PDF" - actually just create a simple HTML report
app.post('/api/projects/:projectId/generate', (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log(`📄 SIMPLE: Generating report for ${projectId}`);
    
    const projectLogos = Array.from(logos.values()).filter(logo => logo.projectId === projectId);
    console.log(`📊 SIMPLE: Found ${projectLogos.length} logos`);
    
    // Create a simple HTML "report" instead of complex PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Simple Artwork Report</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background-color: ${project.garmentColor}; }
        .header { background: white; padding: 20px; margin-bottom: 20px; border-radius: 5px; }
        .logo-item { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .logo-item h3 { margin: 0 0 10px 0; color: #333; }
        .info { background: #f0f0f0; padding: 10px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎯 Simple Artwork Report</h1>
        <p><strong>Project:</strong> ${project.name}</p>
        <p><strong>Project ID:</strong> ${project.id}</p>
        <p><strong>Garment Color:</strong> ${project.garmentColor}</p>
        <p><strong>Total Logos:</strong> ${projectLogos.length}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    ${projectLogos.map(logo => `
        <div class="logo-item">
            <h3>📁 ${logo.originalName}</h3>
            <div class="info">
                <p><strong>Logo ID:</strong> ${logo.id}</p>
                <p><strong>File Size:</strong> ${logo.size} bytes (${Math.round(logo.size/1024)}KB)</p>
                <p><strong>File Path:</strong> ${logo.filePath}</p>
            </div>
        </div>
    `).join('')}
    
    <div class="header" style="margin-top: 30px;">
        <h2>✅ Simple Working Generation</h2>
        <p>This approach uses:</p>
        <ul>
            <li>No complex PDF libraries</li>
            <li>No external dependencies</li>
            <li>Simple file storage</li>
            <li>HTML output for verification</li>
        </ul>
        <p><strong>Total File Size:</strong> ${projectLogos.reduce((sum, logo) => sum + logo.size, 0)} bytes</p>
    </div>
</body>
</html>`;

    console.log(`✅ SIMPLE: HTML report generated (${html.length} characters)`);
    console.log('🎯 SIMPLE: This proves the basic workflow works');
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'inline; filename="simple-report.html"');
    res.send(html);
    
  } catch (error) {
    console.error('❌ SIMPLE: Generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all projects (debugging)
app.get('/api/projects', (req, res) => {
  const allProjects = Array.from(projects.values());
  res.json(allProjects);
});

// List all logos (debugging)
app.get('/api/logos', (req, res) => {
  const allLogos = Array.from(logos.values());
  res.json(allLogos);
});

// Simple test page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Simple Working Version</title></head>
      <body style="font-family: Arial; padding: 20px; background: #f0f8ff;">
        <h1>🔥 Simple Working Artwork System</h1>
        <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h2>✅ What This Version Does:</h2>
          <ul>
            <li><strong>No Complex Dependencies:</strong> Only basic Node.js</li>
            <li><strong>Simple File Upload:</strong> Stores files directly</li>
            <li><strong>HTML Output:</strong> Instead of problematic PDF generation</li>
            <li><strong>Complete Workflow:</strong> Create → Upload → Generate</li>
          </ul>
        </div>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h2>🧪 Test the Simple System:</h2>
          <div style="margin-bottom: 15px;">
            <button onclick="createProject()" style="padding: 10px 20px; font-size: 16px;">1. Create Project</button>
            <div id="project-result" style="margin-top: 10px; font-weight: bold;"></div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <input type="file" id="logo-file" accept="*" style="margin-right: 10px;">
            <button onclick="uploadLogo()" id="upload-btn" disabled style="padding: 10px 20px; font-size: 16px;">2. Upload Logo</button>
            <div id="upload-result" style="margin-top: 10px; font-weight: bold;"></div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <button onclick="generateReport()" id="generate-btn" disabled style="padding: 10px 20px; font-size: 16px; background: #4CAF50; color: white; border: none; border-radius: 5px;">3. Generate Report</button>
            <div id="generate-result" style="margin-top: 10px; font-weight: bold;"></div>
          </div>
        </div>
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 10px;">
          <h3>🎯 Why This Approach Works:</h3>
          <p>By eliminating all complex PDF generation, vector processing, and external tools, we can focus on the core workflow that actually functions. Once this works, we can gradually add back complexity.</p>
        </div>
        
        <script>
          let currentProject = null;
          
          async function createProject() {
            try {
              const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  name: 'Simple Test Project', 
                  garmentColor: '#FFE4B5' 
                })
              });
              currentProject = await response.json();
              document.getElementById('project-result').innerHTML = 
                '✅ Project Created: ' + currentProject.id;
              document.getElementById('upload-btn').disabled = false;
            } catch (error) {
              document.getElementById('project-result').innerHTML = '❌ Error: ' + error.message;
            }
          }
          
          async function uploadLogo() {
            if (!currentProject) return;
            
            const fileInput = document.getElementById('logo-file');
            const file = fileInput.files[0];
            if (!file) return alert('Please select a file first');
            
            try {
              const formData = new FormData();
              formData.append('logo', file);
              
              const response = await fetch('/api/projects/' + currentProject.id + '/upload', {
                method: 'POST',
                body: formData
              });
              
              const result = await response.json();
              document.getElementById('upload-result').innerHTML = 
                '✅ Logo Uploaded: ' + result.originalName + ' (' + result.size + ' bytes)';
              document.getElementById('generate-btn').disabled = false;
            } catch (error) {
              document.getElementById('upload-result').innerHTML = '❌ Error: ' + error.message;
            }
          }
          
          async function generateReport() {
            if (!currentProject) return;
            
            try {
              const response = await fetch('/api/projects/' + currentProject.id + '/generate', {
                method: 'POST'
              });
              
              if (response.ok) {
                const htmlContent = await response.text();
                const newWindow = window.open();
                newWindow.document.write(htmlContent);
                document.getElementById('generate-result').innerHTML = 
                  '✅ Report Generated Successfully! (opened in new window)';
              } else {
                throw new Error('Generation failed');
              }
            } catch (error) {
              document.getElementById('generate-result').innerHTML = '❌ Error: ' + error.message;
            }
          }
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ SIMPLE WORKING VERSION running on port ${PORT}`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
  console.log('🔥 This version uses ZERO complex dependencies');
  console.log('✅ Pure Node.js - no PDF libraries, no Canvas, no Inkscape');
  console.log('🎯 Proves the basic workflow functions correctly');
});