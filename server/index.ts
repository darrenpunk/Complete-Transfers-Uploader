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

  const uploadedLogos = [];
  const createdElements = [];

  req.files.forEach((file, index) => {
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

// Serve the deployed artwork uploader interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artwork Uploader</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .header { background: white; border-bottom: 1px solid #e0e0e0; padding: 1rem 2rem; }
        .header h1 { font-size: 1.5rem; font-weight: 600; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        .card-header { padding: 1.5rem; border-bottom: 1px solid #e0e0e0; }
        .card-header h2 { font-size: 1.25rem; font-weight: 600; color: #333; }
        .card-body { padding: 1.5rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #555; }
        .form-control { width: 100%; padding: 0.75rem; border: 1px solid #d0d7de; border-radius: 4px; font-size: 1rem; }
        .form-control:focus { outline: none; border-color: #0969da; box-shadow: 0 0 0 3px rgba(9,105,218,0.1); }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; font-weight: 500; }
        .btn-primary { background: #0969da; color: white; }
        .btn-primary:hover { background: #0550ae; }
        .btn-outline { background: white; border: 1px solid #d0d7de; color: #333; }
        .btn-outline:hover { background: #f6f8fa; }
        .project-item { padding: 1rem; border: 1px solid #e0e0e0; border-radius: 4px; margin-bottom: 1rem; }
        .status { padding: 0.5rem 1rem; background: #f0f6ff; border-radius: 4px; margin-top: 1rem; color: #0550ae; }
        .upload-area { border: 2px dashed #d0d7de; border-radius: 8px; padding: 3rem; text-align: center; color: #656d76; }
        .upload-area:hover { border-color: #0969da; background: #f6f8fa; }
        #fileInput { display: none; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Artwork Uploader</h1>
    </div>
    
    <div class="container">
        <div class="card">
            <div class="card-header">
                <h2>Create New Project</h2>
            </div>
            <div class="card-body">
                <form id="projectForm">
                    <div class="form-group">
                        <label for="projectName">Project Name:</label>
                        <input type="text" id="projectName" class="form-control" placeholder="Enter project name" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="templateSize">Template Size:</label>
                        <select id="templateSize" class="form-control">
                            <option value="A3">A3 (297 × 420 mm)</option>
                            <option value="A4">A4 (210 × 297 mm)</option>
                            <option value="Letter">Letter (8.5 × 11 in)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="garmentColor">Garment Color:</label>
                        <input type="color" id="garmentColor" class="form-control" value="#ffffff">
                    </div>
                    
                    <button type="submit" class="btn btn-primary">Create Project</button>
                </form>
            </div>
        </div>
        
        <div class="card" id="projectCard" style="display: none;">
            <div class="card-header">
                <h2>Upload Artwork</h2>
            </div>
            <div class="card-body">
                <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                    <h3>Click to upload files</h3>
                    <p>Support for SVG, PNG, JPG, PDF files</p>
                    <input type="file" id="fileInput" multiple accept=".svg,.png,.jpg,.jpeg,.pdf">
                </div>
                
                <div style="margin-top: 1rem;">
                    <button onclick="generatePDF()" class="btn btn-primary">Generate PDF</button>
                </div>
            </div>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h2>Projects</h2>
            </div>
            <div class="card-body" id="projectsList">
                <p>No projects yet</p>
            </div>
        </div>
        
        <div id="status" class="status" style="display: none;"></div>
    </div>

    <script>
        let currentProject = null;
        
        document.getElementById('projectForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await createProject();
        });
        
        document.getElementById('fileInput').addEventListener('change', async (e) => {
            if (e.target.files.length > 0 && currentProject) {
                await uploadFiles(e.target.files);
            }
        });
        
        async function createProject() {
            const name = document.getElementById('projectName').value;
            const templateSize = document.getElementById('templateSize').value;
            const garmentColor = document.getElementById('garmentColor').value;
            
            showStatus('Creating project...');
            
            try {
                const response = await fetch('/api/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, templateSize, garmentColor })
                });
                
                if (response.ok) {
                    currentProject = await response.json();
                    showStatus(\`Project created: \${currentProject.name} (ID: \${currentProject.id})\`);
                    document.getElementById('projectCard').style.display = 'block';
                    document.getElementById('projectForm').reset();
                    loadProjects();
                } else {
                    showStatus('Error creating project', true);
                }
            } catch (error) {
                showStatus('Error: ' + error.message, true);
            }
        }
        
        async function uploadFiles(files) {
            const formData = new FormData();
            Array.from(files).forEach(file => formData.append('files', file));
            
            showStatus(\`Uploading \${files.length} files...\`);
            
            try {
                const response = await fetch(\`/api/projects/\${currentProject.id}/logos\`, {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    showStatus(\`Uploaded \${result.logos.length} files successfully\`);
                } else {
                    showStatus('Error uploading files', true);
                }
            } catch (error) {
                showStatus('Error: ' + error.message, true);
            }
        }
        
        async function generatePDF() {
            if (!currentProject) return;
            
            showStatus('Generating PDF...');
            
            try {
                const response = await fetch(\`/api/projects/\${currentProject.id}/generate-pdf\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ garmentColor: currentProject.garmentColor })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    showStatus(\`PDF generated: \${Math.round(blob.size/1024)}KB\`);
                    
                    // Download the PDF
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`\${currentProject.name}.pdf\`;
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    showStatus('Error generating PDF', true);
                }
            } catch (error) {
                showStatus('Error: ' + error.message, true);
            }
        }
        
        async function loadProjects() {
            try {
                const response = await fetch('/api/projects');
                if (response.ok) {
                    const projects = await response.json();
                    const projectsList = document.getElementById('projectsList');
                    
                    if (projects.length === 0) {
                        projectsList.innerHTML = '<p>No projects yet</p>';
                    } else {
                        projectsList.innerHTML = projects.map(p => \`
                            <div class="project-item">
                                <h4>\${p.name}</h4>
                                <p><strong>Size:</strong> \${p.templateSize} | <strong>Color:</strong> \${p.garmentColor}</p>
                                <p><strong>Elements:</strong> \${p.elements.length}</p>
                                <small>ID: \${p.id}</small>
                            </div>
                        \`).join('');
                    }
                }
            } catch (error) {
                console.error('Error loading projects:', error);
            }
        }
        
        function showStatus(message, isError = false) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.style.display = 'block';
            status.style.background = isError ? '#ffeaea' : '#f0f6ff';
            status.style.color = isError ? '#d73a49' : '#0550ae';
            
            setTimeout(() => {
                status.style.display = 'none';
            }, 5000);
        }
        
        // Load projects on page load
        loadProjects();
    </script>
</body>
</html>
  `);
});

// Also listen on port 5000 for workflow compatibility  
app.listen(5000, '0.0.0.0', () => {
  console.log(`🚀 DEPLOYED ARTWORK UPLOADER running on port 5000`);
  console.log(`🎯 Exact replica with professional UI`);
});

app.listen(PORT, () => {
  console.log(`🚀 FRESH DEPLOYED REPLICA also running on port ${PORT}`);
  console.log(`🎯 This is the exact deployed version implementation`);
});