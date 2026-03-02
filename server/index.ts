import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('[CRASH PROTECTION] Uncaught exception caught:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH PROTECTION] Unhandled promise rejection:', reason);
});

const app = express();

const requiredDirs = ['./uploads', './public'];
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[SERVER] Created directory: ${dir}`);
  }
}

app.get('/health', async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    const { pool } = await import('./db');
    const result = await pool.query('SELECT 1');
    checks.database = result.rows.length > 0 ? 'ok' : 'no response';
    if (checks.database !== 'ok') healthy = false;
  } catch (err: any) {
    checks.database = 'error: ' + (err.message || 'unknown');
    healthy = false;
  }

  const uploadsDir = './uploads';
  checks.filesystem = fs.existsSync(uploadsDir) ? 'ok' : 'missing uploads directory';
  if (checks.filesystem !== 'ok') healthy = false;

  checks.uptime = `${Math.floor(process.uptime())}s`;
  checks.memory = `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`;

  const status = healthy ? 200 : 503;
  res.status(status).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: false, limit: '200mb' }));

// Transparent Dropbox restore: if a file in /uploads is missing locally (e.g. after a
// redeploy wiped the container filesystem), try to pull it back from Dropbox before
// Express static serving tries to handle the request.
app.use('/uploads', async (req: Request, res: Response, next: NextFunction) => {
  const filename = req.path.replace(/^\//, '').split('?')[0];
  if (!filename) return next();
  const localPath = path.join('./uploads', filename);
  if (fs.existsSync(localPath)) return next();
  try {
    const { restoreFromDropbox } = await import('./dropbox-backup');
    await restoreFromDropbox(filename);
  } catch {
    // ignore — static middleware will 404 naturally
  }
  next();
});

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

app.use((req, res, next) => {
  // Allow this app to be embedded in iframes from any origin
  // (needed for Odoo website embedding)
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");

  if (req.path === '/' || (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.includes('.'))) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
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

async function main() {
  const startTime = Date.now();
  console.log(`[SERVER] Starting in ${isProduction ? 'production' : 'development'} mode...`);

  try {
    console.log('[SERVER] Starting route registration...');
    const routeTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Route registration timed out after 30s')), 30000)
    );
    await Promise.race([registerRoutes(app), routeTimeout]);
    console.log(`[SERVER] Routes registered in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[SERVER] Route registration failed:', error);
    if (!isProduction) throw error;
    console.error('[SERVER] Continuing in degraded mode - health check still available');
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[ERROR] ${status}: ${message}`, err.stack || err);
    res.status(status).json({ message });
  });

  if (!isProduction) {
    console.log('[SERVER] Setting up Vite for development...');
    await setupVite(app, server);
    console.log('[SERVER] Vite setup complete');
    server.listen(port, "0.0.0.0", () => {
      const elapsed = Date.now() - startTime;
      log(`serving on port ${port}`);
      console.log(`[SERVER] Server fully initialized in ${elapsed}ms`);
    });
  } else {
    console.log('[SERVER] Configuring production static serving...');
    try {
      serveStatic(app);
      console.log('[SERVER] Production static serving configured');
    } catch (error) {
      console.error('[SERVER] Static serving setup failed:', error);
      app.use("*", (_req, res) => {
        res.status(503).json({ error: 'Application is starting up' });
      });
    }

    server.listen(port, "0.0.0.0", () => {
      const elapsed = Date.now() - startTime;
      log(`serving on port ${port}`);
      console.log(`[SERVER] Server fully initialized in ${elapsed}ms`);
    });
  }
}

main().catch(error => {
  console.error('[SERVER] Fatal initialization error:', error);
  process.exit(1);
});
