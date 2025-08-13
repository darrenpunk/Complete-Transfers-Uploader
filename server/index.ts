import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
// Temporarily remove problematic vite import
const log = (message: string) => console.log(`${new Date().toLocaleTimeString()} [express] ${message}`);
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: false, limit: '200mb' }));

// Configure proper MIME types for uploads directory
app.use('/uploads', express.static('./uploads', {
  setHeaders: (res, path) => {
    // Set proper MIME type for SVG files even without extension
    if (path.endsWith('.svg') || res.req?.url?.includes('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else {
      // Try to detect SVG content by reading file
      try {
        const content = fs.readFileSync(path, 'utf8');
        if (content.includes('<svg') || content.includes('<?xml')) {
          res.setHeader('Content-Type', 'image/svg+xml');
        }
      } catch (e) {
        // If file read fails, continue with default
      }
    }
  }
}));

// Serve static files from public directory
app.use(express.static('public'));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register routes first
  registerRoutes(app);

  // Start main server on port 3001 for Vite proxy
  const mainServer = app.listen(3001, "0.0.0.0", () => {
    log(`Main API server running on http://0.0.0.0:3001`);
  });

  // Also start a duplicate server on port 5000 for workflow compatibility
  const workflowServer = app.listen(5000, "0.0.0.0", () => {
    log(`Workflow compatibility server running on http://0.0.0.0:5000`);
  });

  const isProduction = process.env.NODE_ENV === "production";

  // Serve a simple HTML frontend directly from Express as fallback
  app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artwork Uploader</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .project { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
    </style>
</head>
<body>
    <h1>Artwork Uploader</h1>
    
    <form id="projectForm">
        <div class="form-group">
            <label for="name">Project Name:</label>
            <input type="text" id="name" required>
        </div>
        
        <div class="form-group">
            <label for="templateSize">Template Size:</label>
            <select id="templateSize">
                <option value="A3">A3</option>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
            </select>
        </div>
        
        <div class="form-group">
            <label for="garmentColor">Garment Color:</label>
            <input type="color" id="garmentColor" value="#ffffff">
        </div>
        
        <button type="submit">Create Project</button>
    </form>
    
    <div id="projects"></div>
    
    <script>
        const form = document.getElementById('projectForm');
        const projectsDiv = document.getElementById('projects');
        
        // Load existing projects
        loadProjects();
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const project = {
                name: document.getElementById('name').value,
                templateSize: document.getElementById('templateSize').value,
                garmentColor: document.getElementById('garmentColor').value
            };
            
            try {
                const response = await fetch('/api/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(project)
                });
                
                if (response.ok) {
                    form.reset();
                    loadProjects();
                } else {
                    alert('Error creating project');
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        });
        
        async function loadProjects() {
            try {
                const response = await fetch('/api/projects');
                const projects = await response.json();
                
                projectsDiv.innerHTML = '<h2>Projects</h2>' + 
                    projects.map(p => 
                        \`<div class="project">
                            <h3>\${p.name}</h3>
                            <p>Size: \${p.templateSize} | Color: \${p.garmentColor}</p>
                            <small>Created: \${new Date(p.createdAt).toLocaleString()}</small>
                        </div>\`
                    ).join('');
            } catch (error) {
                projectsDiv.innerHTML = '<p>Error loading projects</p>';
            }
        }
    </script>
</body>
</html>
    `);
  });
  
  if (isProduction) {
    log("Production mode: API servers ready with built-in frontend");
  } else {
    log("Development mode: API servers ready with built-in frontend");
  }
})();