import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, log } from "./vite";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: false, limit: '200mb' }));

app.get('/uploads/:filename', async (req, res, next) => {
  const { filename } = req.params;
  const { inkColor, recolor } = req.query;
  
  if (!filename.endsWith('.svg') || !recolor || !inkColor) {
    return next();
  }
  
  try {
    const filePath = path.join('./uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    
    const svgContent = fs.readFileSync(filePath, 'utf8');
    const { recolorSVG } = await import('./svg-recolor');
    const recoloredContent = recolorSVG(svgContent, inkColor as string);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(recoloredContent);
  } catch (error) {
    console.error('Error recoloring SVG:', error);
    next();
  }
});

app.use(express.static('./public'));

app.use('/uploads', express.static('./uploads', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.svg') || res.req?.url?.includes('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('<svg') || content.includes('<?xml')) {
          res.setHeader('Content-Type', 'image/svg+xml');
        }
      } catch (e) {
      }
    }
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
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

const server = createServer(app);
const port = parseInt(process.env.PORT || '5000', 10);

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    console.log('[SERVER] Static asset serving configured (no catch-all yet)');
  }
}

server.listen(port, "0.0.0.0", () => {
  log(`serving on port ${port}`);
  console.log('[SERVER] Health check available at /health');
  
  initializeApp().catch(error => {
    console.error('[SERVER] Initialization error:', error);
  });
});

async function initializeApp() {
  console.log('[SERVER] Starting route registration...');
  await registerRoutes(app);
  console.log('[SERVER] Routes registered successfully');

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[ERROR] ${status}: ${message}`, err.stack || err);
    res.status(status).json({ message });
  });

  if (isProduction) {
    const distPath = path.resolve(import.meta.dirname, "public");
    if (fs.existsSync(distPath)) {
      app.use("*", (_req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
      console.log('[SERVER] SPA catch-all configured');
    }
  } else {
    console.log('[SERVER] Setting up Vite for development...');
    await setupVite(app, server);
    console.log('[SERVER] Vite setup complete');
  }

  console.log('[SERVER] Server fully initialized');
}
