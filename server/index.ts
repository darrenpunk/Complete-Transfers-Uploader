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

// Serve static assets from attached_assets
app.use('/assets', express.static('attached_assets'));

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

// Serve the deployed COMPLETE TRANSFERS product selection interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complete Transfers - No Mess, Just Press</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .workspace-loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 1.2rem;
            z-index: 1000;
        }
        
        .main-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
            min-height: 100vh;
        }
        
        .logo-header {
            text-align: center;
            margin-bottom: 3rem;
        }
        
        .logo-header img {
            max-width: 300px;
            height: auto;
            margin-bottom: 1rem;
        }
        
        .main-heading {
            font-size: 2.5rem;
            color: white;
            font-weight: 700;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .sub-heading {
            font-size: 1.2rem;
            color: rgba(255,255,255,0.9);
            margin-bottom: 3rem;
        }
        
        .products-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 2rem;
            margin: 3rem 0;
        }
        
        .product-card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            overflow: hidden;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            cursor: pointer;
        }
        
        .product-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.25);
        }
        
        .product-image {
            height: 200px;
            overflow: hidden;
            position: relative;
        }
        
        .product-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .product-content {
            padding: 1.5rem;
        }
        
        .product-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 0.5rem;
        }
        
        .product-description {
            color: #718096;
            font-size: 0.95rem;
            line-height: 1.5;
            margin-bottom: 1.5rem;
        }
        
        .select-button {
            width: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.3s ease;
            font-size: 1rem;
        }
        
        .select-button:hover {
            opacity: 0.9;
        }
        
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        
        .modal-content {
            background-color: white;
            margin: 5% auto;
            padding: 2rem;
            border-radius: 12px;
            width: 90%;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }
        
        .modal-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: #2d3748;
        }
        
        .close {
            color: #a0aec0;
            float: right;
            font-size: 1.5rem;
            font-weight: bold;
            cursor: pointer;
        }
        
        .close:hover {
            color: #2d3748;
        }
        
        @media (max-width: 768px) {
            .main-container {
                padding: 1rem;
            }
            
            .main-heading {
                font-size: 2rem;
            }
            
            .products-grid {
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="workspace-loading" id="workspaceLoading">
        Setting up your workspace...
    </div>
    
    <div class="main-container" style="display: none;" id="mainContent">
        <div class="logo-header">
            <img src="/assets/artboard-logo.png" alt="Complete Transfers Logo" onerror="this.style.display='none'">
            <h1 class="main-heading">Complete Transfers - No Mess, Just Press</h1>
        </div>
        
        <div class="sub-heading">
            <h2>Select Product Type</h2>
            <p>Choose the type of product you want to create artwork for</p>
        </div>
        
        <div class="products-grid">
            <div class="product-card" onclick="selectProduct('full-colour')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="Full Colour Transfers" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5GdWxsIENvbG91ciBUcmFuc2ZlcnM8L3RleHQ+Cjwvc3ZnPg=='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Full Colour Transfers</h3>
                    <p class="product-description">Full-Colour screen printed heat applied transfers</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('full-colour-metallic')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="Full Colour Metallic" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5NZXRhbGxpYyBGaW5pc2g8L3RleHQ+Cjwvc3ZnPg=='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Full Colour Metallic</h3>
                    <p class="product-description">Full-Colour screen printed with metallic finish</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('full-colour-hd')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="Full Colour HD" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5IaWdoIERlZmluaXRpb248L3RleHQ+Cjwvc3ZnPg=='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Full Colour HD</h3>
                    <p class="product-description">High-definition full-colour screen printed transfers</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('single-colour')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="Single Colour Transfers" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5TaW5nbGUgQ29sb3VyPC90ZXh0Pgo8L3N2Zz4='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Single Colour Transfers</h3>
                    <p class="product-description">Screen printed using our off-the-shelf colour range</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('dtf')">
                <div class="product-image">
                    <img src="/assets/dtf-mock.png" alt="DTF Transfers" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5EVEYgVHJhbnNmZXJzPC90ZXh0Pgo8L3N2Zz4='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">DTF - Digital Film Transfers</h3>
                    <p class="product-description">Small order digital heat transfers</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('uvdtf')">
                <div class="product-image">
                    <img src="/assets/uvdtf-mock.png" alt="UV DTF" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5VViBEVEY8L3RleHQ+Cjwvc3ZnPg=='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">UV DTF</h3>
                    <p class="product-description">Hard Surface Transfers</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('custom-badges')">
                <div class="product-image">
                    <img src="/assets/badge-mock.png" alt="Custom Badges" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5DdXN0b20gQmFkZ2VzPC90ZXh0Pgo8L3N2Zz4='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Custom Badges</h3>
                    <p class="product-description">Polyester textile woven badges</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('applique-badges')">
                <div class="product-image">
                    <img src="/assets/badge-mock.png" alt="Applique Badges" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5BcHBsaXF1ZSBCYWRnZXM8L3RleHQ+Cjwvc3ZnPg=='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Applique Badges</h3>
                    <p class="product-description">Fabric applique badges</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('reflective')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="Reflective Transfers" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5SZWZsZWN0aXZlPC90ZXh0Pgo8L3N2Zz4='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Reflective Transfers</h3>
                    <p class="product-description">Our silver reflective helps enhance the visibility of the wearer at night</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('zero-single')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="ZERO Single Colour" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5aZXJvIFNpbmdsZTwvdGV4dD4KPC9zdmc+'">
                </div>
                <div class="product-content">
                    <h3 class="product-title">ZERO Single Colour Transfers</h3>
                    <p class="product-description">Zero inks are super stretchy and do not bleed!</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('sublimation')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="Sublimation Transfers" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5TdWJsaW1hdGlvbjwvdGV4dD4KPC9zdmc+'">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Sublimation Transfers</h3>
                    <p class="product-description">Sublimation heat transfers are designed for full colour decoration of white, 100% polyester</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
            
            <div class="product-card" onclick="selectProduct('zero-silicone')">
                <div class="product-image">
                    <img src="/assets/tshirt-mock.png" alt="Zero Silicone Transfers" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjVmNWY1Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5TaWxpY29uZS1mcmVlPC90ZXh0Pgo8L3N2Zz4='">
                </div>
                <div class="product-content">
                    <h3 class="product-title">Zero Silicone Transfers</h3>
                    <p class="product-description">Silicone-free transfers</p>
                    <button class="select-button">Select</button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Product Selection Modal -->
    <div id="productModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title" id="modalTitle">Product Selected</h2>
                <span class="close" onclick="closeModal()">&times;</span>
            </div>
            <div id="modalBody">
                <p>You have selected <strong id="selectedProduct"></strong></p>
                <p>This will redirect you to the artwork uploader for this product type.</p>
                <br>
                <button class="select-button" onclick="proceedToUploader()">Continue to Artwork Uploader</button>
                <button class="select-button" style="background: #6c757d; margin-left: 1rem;" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        let selectedProductType = null;
        
        // Show workspace loading initially
        setTimeout(() => {
            document.getElementById('workspaceLoading').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
        }, 1500);
        
        function selectProduct(productType) {
            selectedProductType = productType;
            
            const productNames = {
                'full-colour': 'Full Colour Transfers',
                'full-colour-metallic': 'Full Colour Metallic',
                'full-colour-hd': 'Full Colour HD',
                'single-colour': 'Single Colour Transfers',
                'dtf': 'DTF - Digital Film Transfers',
                'uvdtf': 'UV DTF',
                'custom-badges': 'Custom Badges',
                'applique-badges': 'Applique Badges',
                'reflective': 'Reflective Transfers',
                'zero-single': 'ZERO Single Colour Transfers',
                'sublimation': 'Sublimation Transfers',
                'zero-silicone': 'Zero Silicone Transfers'
            };
            
            document.getElementById('selectedProduct').textContent = productNames[productType];
            document.getElementById('productModal').style.display = 'block';
        }
        
        function closeModal() {
            document.getElementById('productModal').style.display = 'none';
        }
        
        function proceedToUploader() {
            // Create a project for the selected product type
            window.location.href = '/uploader?product=' + selectedProductType;
        }
        
        // Close modal when clicking outside of it
        window.onclick = function(event) {
            const modal = document.getElementById('productModal');
            if (event.target === modal) {
                closeModal();
            }
        }
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

// Artwork uploader route for when user selects a product
app.get('/uploader', (req, res) => {
  const productType = req.query.product || 'unknown';
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artwork Uploader - ${productType}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 2rem;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        
        .uploader-card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            padding: 2rem;
            margin: 2rem 0;
        }
        
        .header {
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .header h1 {
            font-size: 2rem;
            color: #2d3748;
            margin-bottom: 0.5rem;
        }
        
        .product-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.9rem;
            display: inline-block;
        }
        
        .upload-section {
            margin: 2rem 0;
        }
        
        .upload-area {
            border: 2px dashed #d0d7de;
            border-radius: 12px;
            padding: 3rem;
            text-align: center;
            color: #656d76;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .upload-area:hover {
            border-color: #667eea;
            background: #f8f9ff;
        }
        
        .upload-area h3 {
            font-size: 1.2rem;
            margin-bottom: 0.5rem;
            color: #2d3748;
        }
        
        .form-section {
            margin: 2rem 0;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #2d3748;
        }
        
        .form-control {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s ease;
        }
        
        .form-control:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-primary:hover {
            opacity: 0.9;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
            margin-left: 1rem;
        }
        
        .status {
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
            font-weight: 500;
        }
        
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        #fileInput {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="uploader-card">
            <div class="header">
                <h1>Artwork Uploader</h1>
                <div class="product-badge">Product: ${productType.replace('-', ' ').toUpperCase()}</div>
            </div>
            
            <div class="form-section">
                <div class="form-group">
                    <label for="projectName">Project Name:</label>
                    <input type="text" id="projectName" class="form-control" placeholder="Enter your project name">
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
            </div>
            
            <div class="upload-section">
                <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                    <h3>Upload Your Artwork</h3>
                    <p>Click to select files or drag and drop</p>
                    <p><small>Supports: SVG, PNG, JPG, PDF files</small></p>
                    <input type="file" id="fileInput" multiple accept=".svg,.png,.jpg,.jpeg,.pdf">
                </div>
                
                <div id="fileList" style="margin-top: 1rem;"></div>
            </div>
            
            <div style="text-align: center;">
                <button class="btn btn-primary" onclick="createProject()">Create Project & Upload</button>
                <button class="btn btn-secondary" onclick="generatePDF()" id="generateBtn" style="display: none;">Generate PDF</button>
                <button class="btn btn-secondary" onclick="goBack()">Back to Product Selection</button>
            </div>
            
            <div id="status" style="display: none;"></div>
        </div>
    </div>
    
    <script>
        let currentProject = null;
        let uploadedFiles = [];
        
        document.getElementById('fileInput').addEventListener('change', function(e) {
            displaySelectedFiles(e.target.files);
        });
        
        function displaySelectedFiles(files) {
            const fileList = document.getElementById('fileList');
            fileList.innerHTML = '<h4>Selected Files:</h4>';
            
            Array.from(files).forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.style.padding = '0.5rem';
                fileItem.style.border = '1px solid #e2e8f0';
                fileItem.style.borderRadius = '4px';
                fileItem.style.margin = '0.25rem 0';
                fileItem.innerHTML = \`<strong>\${file.name}</strong> (\${Math.round(file.size/1024)}KB)\`;
                fileList.appendChild(fileItem);
            });
        }
        
        async function createProject() {
            const projectName = document.getElementById('projectName').value;
            const templateSize = document.getElementById('templateSize').value;
            const garmentColor = document.getElementById('garmentColor').value;
            const files = document.getElementById('fileInput').files;
            
            if (!projectName) {
                showStatus('Please enter a project name', 'error');
                return;
            }
            
            showStatus('Creating project...', 'success');
            
            try {
                // Create project
                const projectResponse = await fetch('/api/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: projectName,
                        templateSize: templateSize,
                        garmentColor: garmentColor,
                        productType: '${productType}'
                    })
                });
                
                if (!projectResponse.ok) {
                    throw new Error('Failed to create project');
                }
                
                currentProject = await projectResponse.json();
                showStatus(\`Project created: \${currentProject.name}\`, 'success');
                
                // Upload files if any selected
                if (files.length > 0) {
                    await uploadFiles(files);
                }
                
                document.getElementById('generateBtn').style.display = 'inline-block';
                
            } catch (error) {
                showStatus('Error: ' + error.message, 'error');
            }
        }
        
        async function uploadFiles(files) {
            if (!currentProject) return;
            
            const formData = new FormData();
            Array.from(files).forEach(file => formData.append('files', file));
            
            showStatus(\`Uploading \${files.length} files...\`, 'success');
            
            try {
                const response = await fetch(\`/api/projects/\${currentProject.id}/logos\`, {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    uploadedFiles = result.logos;
                    showStatus(\`Successfully uploaded \${result.logos.length} files\`, 'success');
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                showStatus('Upload error: ' + error.message, 'error');
            }
        }
        
        async function generatePDF() {
            if (!currentProject) return;
            
            showStatus('Generating PDF...', 'success');
            
            try {
                const response = await fetch(\`/api/projects/\${currentProject.id}/generate-pdf\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        garmentColor: currentProject.garmentColor,
                        productType: '${productType}'
                    })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    showStatus(\`PDF generated successfully (\${Math.round(blob.size/1024)}KB)\`, 'success');
                    
                    // Download the PDF
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`\${currentProject.name}-\${productType}.pdf\`;
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    throw new Error('PDF generation failed');
                }
            } catch (error) {
                showStatus('PDF Error: ' + error.message, 'error');
            }
        }
        
        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
            
            setTimeout(() => {
                status.style.display = 'none';
            }, 5000);
        }
        
        function goBack() {
            window.location.href = '/';
        }
    </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 FRESH DEPLOYED REPLICA also running on port ${PORT}`);
  console.log(`🎯 This is the exact deployed version implementation`);
});