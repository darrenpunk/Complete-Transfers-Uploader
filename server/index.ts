import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config();

// Debug: Log the loaded environment variables
console.log("Loaded VECTORIZER_API_ID:", process.env.VECTORIZER_API_ID ? "exists" : "not found");
console.log("Loaded VECTORIZER_API_SECRET:", process.env.VECTORIZER_API_SECRET ? "exists" : "not found");

const app = express();

// Health check endpoint for deployment - must respond before any async operations
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: false, limit: '200mb' }));

// Handle SVG recoloring middleware (must come before static serving)
app.get('/uploads/:filename', async (req, res, next) => {
  const { filename } = req.params;
  const { inkColor, recolor } = req.query;
  
  // Only handle SVG files with recolor parameter
  if (!filename.endsWith('.svg') || !recolor || !inkColor) {
    return next(); // Continue to static serving
  }
  
  try {
    const filePath = path.join('./uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    
    // Read SVG content
    const svgContent = fs.readFileSync(filePath, 'utf8');
    
    // Apply recoloring
    const { recolorSVG } = await import('./svg-recolor');
    const recoloredContent = recolorSVG(svgContent, inkColor as string);
    
    // Send recolored SVG
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(recoloredContent);
    
    console.log(`🎨 Served recolored SVG: ${filename} with ink color: ${inkColor}`);
  } catch (error) {
    console.error('Error recoloring SVG:', error);
    next(); // Fall back to static serving
  }
});

// Serve static files from public folder (landing pages, images, etc.)
app.use(express.static('./public'));

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

// Create HTTP server from Express app
const server = createServer(app);

// Start server immediately so health checks pass during initialization
const port = parseInt(process.env.PORT || '5000', 10);
server.listen(port, "0.0.0.0", () => {
  log(`serving on port ${port}`);
});

// Initialize routes and other async operations after server is listening
(async () => {
  try {
    console.log('[SERVER] Starting route registration...');
    await registerRoutes(app);
    console.log('[SERVER] Routes registered successfully');

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Log the error for debugging but don't crash the process
      console.error(`[ERROR] ${status}: ${message}`, err.stack || err);

      res.status(status).json({ message });
    });

    // Setup Vite in development or serve static files in production
    if (app.get("env") === "development") {
      console.log('[SERVER] Setting up Vite for development...');
      await setupVite(app, server);
      console.log('[SERVER] Vite setup complete');
    } else {
      console.log('[SERVER] Serving static files for production...');
      serveStatic(app);
      console.log('[SERVER] Static file serving configured');
    }

    console.log('[SERVER] Server fully initialized');
  } catch (error) {
    console.error('[SERVER] Initialization error:', error);
  }
})();
