import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getOperationStats } from "./operation-guard";
import { storage } from "./storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const serverStartTime = Date.now();

function getMemSnapshot() {
  const mem = process.memoryUsage();
  return {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapMb: Math.round(mem.heapUsed / 1024 / 1024),
  };
}

function getUptimeSeconds() {
  return Math.round((Date.now() - serverStartTime) / 1000);
}

function persistCrashLog(eventType: string, message: string, details?: any) {
  const { rssMb, heapMb } = getMemSnapshot();
  let activeOps = 0, queuedOps = 0;
  try { const s = getOperationStats(); activeOps = s.active; queuedOps = s.queued; } catch {}
  storage.createCrashLog({
    eventType,
    message,
    memoryRssMb: rssMb,
    memoryHeapMb: heapMb,
    uptimeSeconds: getUptimeSeconds(),
    activeOps,
    queuedOps,
    details: details || null,
  }).catch(err => console.error('[CRASH LOG] Failed to persist:', err.message));
}

persistCrashLog('server_start', `Server process started (PID ${process.pid})`);

// Detect suspected crashes (OOM kills, SIGKILL, etc.) by checking if previous shutdown was clean
(async () => {
  try {
    const recentLogs = await storage.getCrashLogs(10);
    // Skip the server_start we just logged (recentLogs[0])
    const previousEvents = recentLogs.slice(1);
    if (previousEvents.length >= 1) {
      const lastEvent = previousEvents[0];
      const cleanShutdownTypes = ['sigterm', 'sigint'];
      // If the previous event was a server_start (no shutdown signal between starts),
      // it means the previous instance was killed without clean shutdown
      if (lastEvent.eventType === 'server_start') {
        // Calculate time gap between starts
        const lastStartTime = new Date(lastEvent.createdAt).getTime();
        const now = Date.now();
        const gapSeconds = Math.round((now - lastStartTime) / 1000);
        
        // Only flag as suspected crash if previous server ran for some time
        // (gap > 30s means it wasn't just a quick dev restart)
        if (gapSeconds > 30) {
          persistCrashLog('suspected_crash', 
            `Previous server instance (PID from ${new Date(lastStartTime).toLocaleTimeString()}, RSS: ${lastEvent.memoryRssMb || '?'}MB) terminated without clean shutdown after ~${Math.round(gapSeconds / 60)}min — likely OOM kill or SIGKILL`,
            { 
              previousPid: lastEvent.message?.match(/PID (\d+)/)?.[1],
              previousMemoryRssMb: lastEvent.memoryRssMb,
              previousMemoryHeapMb: lastEvent.memoryHeapMb,
              timeSinceLastStart: gapSeconds,
              previousActiveOps: lastEvent.activeOps,
              previousQueuedOps: lastEvent.queuedOps,
            }
          );
          console.log(`[CRASH DETECTION] ⚠️ Suspected unclean shutdown detected — previous server started ${gapSeconds}s ago with no clean shutdown logged`);
        }
      } else if (!cleanShutdownTypes.includes(lastEvent.eventType) && 
                 lastEvent.eventType !== 'uncaught_exception' && 
                 lastEvent.eventType !== 'unhandled_rejection' &&
                 lastEvent.eventType !== 'suspected_crash' &&
                 lastEvent.eventType !== 'memory_warning' &&
                 lastEvent.eventType !== 'memory_critical') {
        console.log(`[CRASH DETECTION] Previous shutdown event: ${lastEvent.eventType} — "${lastEvent.message}"`);
      }
    }
  } catch (err: any) {
    console.error('[CRASH DETECTION] Failed to check previous shutdown:', err.message);
  }
})();

process.on('uncaughtException', (err) => {
  const isNeonConnectionError = err.message?.includes('terminating connection due to administrator command') ||
    err.message?.includes('Connection terminated') ||
    err.message?.includes('connection was forcibly closed') ||
    (err.message?.includes('terminated') && err.stack?.includes('@neondatabase'));
  
  if (isNeonConnectionError) {
    console.warn('[DB] Neon connection terminated (non-fatal, will reconnect):', err.message);
    persistCrashLog('db_connection_reset', `Neon DB connection terminated: ${err.message}`);
    return;
  }
  
  console.error('[CRASH PROTECTION] Uncaught exception caught:', err.message);
  console.error(err.stack);
  persistCrashLog('uncaught_exception', err.message, { stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH PROTECTION] Unhandled promise rejection:', reason);
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  persistCrashLog('unhandled_rejection', msg, { stack });
});

process.on('SIGTERM', () => {
  console.warn('[SIGNAL] SIGTERM received — container shutting down');
  persistCrashLog('sigterm', 'SIGTERM received — container being stopped/restarted');
});

process.on('SIGINT', () => {
  console.warn('[SIGNAL] SIGINT received');
  persistCrashLog('sigint', 'SIGINT received');
});

if (process.env.NODE_ENV === 'production') {
  const MEMORY_CHECK_INTERVAL = 30_000;
  const MEMORY_GC_INTERVAL = 120_000;
  const MEMORY_WARN_MB = 350;
  const MEMORY_RESTART_MB = 400;
  let restartScheduled = false;

  function cleanTempFiles() {
    try {
      const now = Date.now();
      let cleaned = 0;

      const uploadsDir = './uploads';
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        for (const f of files) {
          const isUploadsTemp = f.startsWith('chunk_') || f.startsWith('tmp_') || f.endsWith('.tmp');
          if (isUploadsTemp) {
            try {
              const fPath = `${uploadsDir}/${f}`;
              const stat = fs.statSync(fPath);
              if (now - stat.mtimeMs > 600_000) {
                fs.unlinkSync(fPath);
                cleaned++;
              }
            } catch {}
          }
        }
      }

      const sysTmp = '/tmp';
      if (fs.existsSync(sysTmp)) {
        const files = fs.readdirSync(sysTmp);
        for (const f of files) {
          const isSysTemp = f.startsWith('gs_') || f.startsWith('magick-') ||
            f.startsWith('tmp_') || f.endsWith('.tmp');
          if (isSysTemp) {
            try {
              const fPath = `${sysTmp}/${f}`;
              const stat = fs.statSync(fPath);
              if (now - stat.mtimeMs > 600_000) {
                fs.unlinkSync(fPath);
                cleaned++;
              }
            } catch {}
          }
        }
      }

      if (cleaned > 0) console.log(`[MEMORY] Cleaned ${cleaned} stale temp files`);
    } catch {}
  }

  setInterval(() => {
    if (typeof global.gc === 'function') {
      try { global.gc(); } catch {}
    }
    cleanTempFiles();
  }, MEMORY_GC_INTERVAL);

  setInterval(() => {
    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    if (rssMB > MEMORY_WARN_MB) {
      if (typeof global.gc === 'function') {
        global.gc();
        cleanTempFiles();
      }
      const after = Math.round(process.memoryUsage().rss / 1024 / 1024);
      console.warn(`[MEMORY WARNING] RSS: ${rssMB}MB → ${after}MB after GC, Heap: ${heapMB}MB`);
      persistCrashLog('memory_warning', `RSS: ${rssMB}MB, Heap: ${heapMB}MB`);
    }
    if (rssMB > MEMORY_RESTART_MB && !restartScheduled) {
      restartScheduled = true;
      console.error(`[MEMORY CRITICAL] RSS: ${rssMB}MB — graceful restart in 3s to avoid OOM kill`);
      persistCrashLog('memory_critical', `RSS: ${rssMB}MB — scheduling graceful restart`);
      setTimeout(() => {
        console.error('[MEMORY CRITICAL] Exiting for graceful restart');
        process.exit(1);
      }, 3000);
    }
  }, MEMORY_CHECK_INTERVAL);
}

const app = express();

const requiredDirs = ['./uploads', './public'];
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[SERVER] Created directory: ${dir}`);
  }
}

app.get('/ping', (_req, res) => {
  res.status(200).send('pong');
});

app.get('/health', async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    const { pool } = await import('./db');
    const dbCheck = pool.query('SELECT 1');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    const result: any = await Promise.race([dbCheck, timeout]);
    checks.database = result.rows?.length > 0 ? 'ok' : 'no response';
    if (checks.database !== 'ok') healthy = false;
  } catch (err: any) {
    checks.database = 'error: ' + (err.message || 'unknown');
    healthy = false;
  }

  const uploadsDir = './uploads';
  checks.filesystem = fs.existsSync(uploadsDir) ? 'ok' : 'missing uploads directory';
  if (checks.filesystem !== 'ok') healthy = false;

  if (process.env.NODE_ENV === 'production') {
    const buildDir = path.resolve(import.meta.dirname, 'public', 'assets');
    const hasCSS = fs.existsSync(buildDir) && fs.readdirSync(buildDir).some(f => f.endsWith('.css'));
    const hasJS = fs.existsSync(buildDir) && fs.readdirSync(buildDir).some(f => f.endsWith('.js'));
    checks.static_assets = hasCSS && hasJS ? 'ok' : 'missing build assets';
    if (checks.static_assets !== 'ok') healthy = false;
  }

  checks.uptime = `${Math.floor(process.uptime())}s`;
  checks.memory = `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`;

  const ops = getOperationStats();
  const status = healthy ? 200 : 503;
  res.status(status).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
    operations: ops,
  });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));


app.get('/uploads/:filename', async (req, res, next) => {
  const { filename } = req.params;
  const { inkColor, recolor } = req.query;
  
  if (!recolor || !inkColor) {
    return next();
  }
  
  // Validate inkColor to prevent command injection (must be hex color or named CSS color)
  const inkColorStr = String(inkColor);
  if (!/^#?[0-9a-fA-F]{3,8}$/.test(inkColorStr) && !/^[a-zA-Z]{1,30}$/.test(inkColorStr)) {
    return res.status(400).json({ error: 'Invalid ink color format' });
  }
  
  const filePath = path.join('./uploads', filename);
  
  if (!fs.existsSync(filePath)) {
    return next();
  }
  
  try {
    const lowerFilename = filename.toLowerCase();
    
    if (lowerFilename.endsWith('.svg')) {
      const svgContent = fs.readFileSync(filePath, 'utf8');
      const { recolorSVG } = await import('./svg-recolor');
      const recoloredContent = recolorSVG(svgContent, inkColor as string);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(recoloredContent);
    } else if (lowerFilename.endsWith('.png') || lowerFilename.endsWith('.jpg') || lowerFilename.endsWith('.jpeg')) {
      const { exec } = (await import('child_process'));
      const { promisify } = (await import('util'));
      const execAsync = promisify(exec);
      const tmpOutput = path.join('/tmp', `recolored_${Date.now()}_${filename.replace(/\.[^.]+$/, '.png')}`);
      const isJpeg = lowerFilename.endsWith('.jpg') || lowerFilename.endsWith('.jpeg');
      
      if (isJpeg) {
        await execAsync(`convert "${filePath}" -grayscale Rec709Luminance -fill "${inkColor}" -colorize 100 "${tmpOutput}"`, { timeout: 30000, maxBuffer: 1024 * 1024 });
      } else {
        // Check if the PNG has meaningful transparency
        let hasAlpha = false;
        try {
          const { stdout: alphaStdout } = await execAsync(`identify -format "%A" "${filePath}" 2>/dev/null || echo "False"`, { timeout: 10000, maxBuffer: 64 * 1024 });
          const alphaCheck = alphaStdout.trim();
          hasAlpha = alphaCheck === 'True' || alphaCheck === 'Blend';
          
          if (hasAlpha) {
            // Check if the alpha channel is actually used (not all opaque)
            const { stdout: meanStdout } = await execAsync(`convert "${filePath}" -alpha extract -format "%[fx:mean]" info: 2>/dev/null || echo "1"`, { timeout: 10000, maxBuffer: 64 * 1024 });
            const alphaVal = parseFloat(meanStdout.trim());
            if (!isNaN(alphaVal) && alphaVal > 0.99) {
              hasAlpha = false; // Alpha exists but is all opaque - treat as no alpha
            }
          }
        } catch (e) {
          // If check fails, assume no alpha
        }
        
        if (hasAlpha) {
          // PNG with transparency: extract alpha, fill with ink color, reapply alpha
          await execAsync(`convert "${filePath}" -alpha extract -background "${inkColor}" -alpha shape "${tmpOutput}"`, { timeout: 30000, maxBuffer: 1024 * 1024 });
        } else {
          // Opaque PNG: luminance-based — create grayscale mask, apply as alpha on solid ink color
          const tmpGray = tmpOutput.replace('.png', '_gray.png');
          await execAsync(`convert "${filePath}" -grayscale Rec709Luminance "${tmpGray}"`, { timeout: 30000, maxBuffer: 1024 * 1024 });
          const { stdout: dimsStdout } = await execAsync(`identify -format "%wx%h" "${filePath}" 2>/dev/null`, { timeout: 10000, maxBuffer: 64 * 1024 });
          const dims = dimsStdout.trim();
          await execAsync(`convert -size ${dims} xc:"${inkColor}" "${tmpGray}" -alpha off -compose CopyOpacity -composite "${tmpOutput}"`, { timeout: 30000, maxBuffer: 1024 * 1024 });
          try { fs.unlinkSync(tmpGray); } catch(e) {}
        }
      }
      
      if (fs.existsSync(tmpOutput)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache');
        const data = fs.readFileSync(tmpOutput);
        res.send(data);
        try { fs.unlinkSync(tmpOutput); } catch(e) {}
      } else {
        next();
      }
    } else {
      next();
    }
  } catch (error) {
    console.error('Error recoloring file:', error);
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
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(256);
        const bytesRead = fs.readSync(fd, buf, 0, 256, 0);
        fs.closeSync(fd);
        const header = buf.subarray(0, bytesRead).toString('utf8');
        if (header.includes('<svg') || header.includes('<?xml')) {
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

  if (isProduction) {
    // In production, start listening FIRST so the health check responds immediately
    // during route registration (which may take several seconds).
    // Retry on EADDRINUSE: after a SIGKILL the prior process may still be holding
    // port 5000 in TIME_WAIT, and a hard exit would cause a crash-loop on the VM.
    await new Promise<void>(async (resolve, reject) => {
      const maxAttempts = 12;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await new Promise<void>((ok, fail) => {
            const onError = (err: any) => {
              server.removeListener('listening', onListening);
              fail(err);
            };
            const onListening = () => {
              server.removeListener('error', onError);
              console.log(`[SERVER] Listening on port ${port} — health check now available`);
              log(`serving on port ${port}`);
              ok();
            };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port, "0.0.0.0");
          });
          return resolve();
        } catch (err: any) {
          if (err && err.code === 'EADDRINUSE' && attempt < maxAttempts) {
            console.warn(`[SERVER] Port ${port} busy (attempt ${attempt}/${maxAttempts}) — retrying in 5s…`);
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          return reject(err);
        }
      }
    });
  }

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
    const elapsed = Date.now() - startTime;
    console.log(`[SERVER] Server fully initialized in ${elapsed}ms`);

    const KEEP_ALIVE_INTERVAL = 4 * 60 * 1000;
    setInterval(() => {
      const url = `http://0.0.0.0:${port}/ping`;
      fetch(url).catch(() => {});
    }, KEEP_ALIVE_INTERVAL);
    console.log(`[SERVER] Keep-alive self-ping every ${KEEP_ALIVE_INTERVAL / 1000}s`);

    const TEMP_CLEANUP_INTERVAL = 5 * 60 * 1000;
    setInterval(() => {
      try {
        const tmpDir = '/tmp';
        const now = Date.now();
        const maxAge = 10 * 60 * 1000;
        const prefixes = ['canvas_el_', 'gs_', 'magick-', 'inkscape_', 'rsvg_', 'pdf_gen_', 'recolored_', 'dtf_in_', 'dtf_out_', 'mixed_check_', 'cmyk_', 'rgb_', 'bounds_'];
        const entries = fs.readdirSync(tmpDir);
        let cleaned = 0;
        for (const entry of entries) {
          if (prefixes.some(p => entry.startsWith(p)) || (entry.endsWith('.png') && entry.length > 30) || (entry.endsWith('.pdf') && entry.length > 30)) {
            try {
              const filePath = path.join(tmpDir, entry);
              const stat = fs.statSync(filePath);
              if (now - stat.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
              }
            } catch {}
          }
        }
        if (cleaned > 0) {
          console.log(`[CLEANUP] Removed ${cleaned} stale temp files`);
        }
      } catch {}
    }, TEMP_CLEANUP_INTERVAL);
    console.log(`[SERVER] Temp file cleanup every ${TEMP_CLEANUP_INTERVAL / 1000}s`);
  }

  // PDF health monitor — runs in production (no-op in dev unless
  // PDF_HEALTH_CHECK_ENABLED=1). Periodically generates a small synthetic PDF
  // through the customer pipeline and emails alerts to PDF_HEALTH_ALERT_TO
  // (default darren@serigraf.com) when generation fails.
  try {
    const { startPdfHealthMonitor } = await import('./health-monitor');
    startPdfHealthMonitor();
  } catch (e) {
    console.error('[SERVER] Failed to start PDF health monitor:', e);
  }
}

main().catch(error => {
  console.error('[SERVER] Fatal initialization error:', error);
  process.exit(1);
});
