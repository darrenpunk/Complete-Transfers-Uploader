import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getOperationStats, getActiveOpsDetail } from "./operation-guard";
import { storage } from "./storage";
import { requestTracker, getRecentRequests, getInFlightRequests } from "./request-tracker";

const FORENSIC_EVENT_TYPES = new Set([
  'memory_critical',
  'memory_warning',
  'uncaught_exception',
  'unhandled_rejection',
  'suspected_crash',
]);

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

export function persistCrashLog(eventType: string, message: string, details?: any): Promise<void> {
  const { rssMb, heapMb } = getMemSnapshot();
  let activeOps = 0, queuedOps = 0;
  try { const s = getOperationStats(); activeOps = s.active; queuedOps = s.queued; } catch {}
  // For watchdog/exception events attach a forensic snapshot so the next-startup
  // suspected_crash detector (or admin grepping the table) can see exactly which
  // requests were in flight when the process tipped over.
  let mergedDetails = details || null;
  if (FORENSIC_EVENT_TYPES.has(eventType)) {
    try {
      const forensics = {
        recentRequests: getRecentRequests(20),
        inFlightRequests: getInFlightRequests(),
        activeOpsDetail: getActiveOpsDetail(),
      };
      mergedDetails = mergedDetails ? { ...mergedDetails, forensics } : { forensics };
    } catch (err: any) {
      console.error('[CRASH LOG] Failed to capture forensics:', err?.message);
    }
  }
  return storage.createCrashLog({
    eventType,
    message,
    memoryRssMb: rssMb,
    memoryHeapMb: heapMb,
    uptimeSeconds: getUptimeSeconds(),
    activeOps,
    queuedOps,
    details: mergedDetails,
  }).then(() => undefined).catch(err => {
    console.error('[CRASH LOG] Failed to persist:', err.message);
  });
}

const serverStartPersist = persistCrashLog('server_start', `Server process started (PID ${process.pid})`);

// Detect suspected crashes (OOM kills, SIGKILL, etc.) by checking if previous shutdown was clean.
// Awaits the server_start write first so getCrashLogs definitely sees this instance's row at index 0.
(async () => {
  try {
    await serverStartPersist;
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
          // Hunt for a memory_critical / uncaught_exception / unhandled_rejection
          // event from the dying process so we can lift its in-flight requests +
          // recent-request ringbuffer + active-op snapshot into the suspected_crash
          // record. Makes "what crashed it" answerable from a single DB row.
          let priorForensics: any = null;
          let priorEventType: string | null = null;
          for (const ev of recentLogs) {
            if (ev.eventType === 'server_start') continue;
            if (FORENSIC_EVENT_TYPES.has(ev.eventType) && ev.eventType !== 'suspected_crash') {
              const evTime = new Date(ev.createdAt).getTime();
              // Only consider events from the previous server instance window.
              if (evTime > lastStartTime && evTime < now) {
                const det: any = ev.details;
                if (det && det.forensics) {
                  priorForensics = det.forensics;
                  priorEventType = ev.eventType;
                  break;
                }
              }
            }
          }
          persistCrashLog('suspected_crash', 
            `Previous server instance (PID from ${new Date(lastStartTime).toLocaleTimeString()}, RSS: ${lastEvent.memoryRssMb || '?'}MB) terminated without clean shutdown after ~${Math.round(gapSeconds / 60)}min — likely OOM kill or SIGKILL`,
            { 
              previousPid: lastEvent.message?.match(/PID (\d+)/)?.[1],
              previousMemoryRssMb: lastEvent.memoryRssMb,
              previousMemoryHeapMb: lastEvent.memoryHeapMb,
              timeSinceLastStart: gapSeconds,
              previousActiveOps: lastEvent.activeOps,
              previousQueuedOps: lastEvent.queuedOps,
              priorEventType,
              priorForensics,
            }
          );
          if (priorForensics) {
            const inFlightSummary = (priorForensics.inFlightRequests || [])
              .map((r: any) => `${r.method} ${r.path} (email=${r.email || 'n/a'}, ${(r.bytesIn/1024/1024).toFixed(1)}MB in, ${r.durationMs}ms)`)
              .join(' | ');
            console.log(`[CRASH DETECTION] ⚠️ Suspected unclean shutdown — prior ${priorEventType} captured ${priorForensics.inFlightRequests?.length || 0} in-flight requests: ${inFlightSummary || '(none)'}`);
          } else {
            console.log(`[CRASH DETECTION] ⚠️ Suspected unclean shutdown detected — previous server started ${gapSeconds}s ago with no clean shutdown logged (no forensics captured)`);
          }
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
  // EADDRINUSE port-race: Replit's platform occasionally spawns a duplicate
  // Node process in the same container (observed ~every 6h in production —
  // see gotcha). The duplicate loses the race for port 5000. On Node 20+,
  // setupListenHandle throws this synchronously from inside a microtask
  // (processTicksAndRejections) instead of emitting an 'error' event, so
  // the existing retry loop's server.once('error', ...) listener never
  // fires — it lands here. Letting it fall through to the default
  // uncaught_exception branch leaves the process alive but with no
  // listening socket → Replit health checks fail → ~60s of customer-visible
  // white-screen before the platform finally kills the zombie. Exiting
  // immediately collapses that window to seconds, and the orphan from the
  // prior container is gone by the time the next start runs. Distinct
  // event type so this doesn't pollute real crash forensics.
  if ((err as any)?.code === 'EADDRINUSE') {
    console.warn('[SERVER] EADDRINUSE — duplicate process lost port race, exiting cleanly for restart');
    persistCrashLog('port_in_use_lost_race', err.message, { stack: err.stack })
      .finally(() => process.exit(0));
    return;
  }

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
          const isUploadsTemp = f.startsWith('chunk_') || f.startsWith('tmp_') || f.endsWith('.tmp') || f.startsWith('embed_fallback_');
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
            f.startsWith('tmp_') || f.endsWith('.tmp') ||
            f.startsWith('preship_') || f.startsWith('compress_') ||
            f.startsWith('dtf_gen_');
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
    // Post-GC value drives the restart decision: if GC reclaims memory below
    // the threshold the spike was transient (large Buffer in-flight) and a
    // restart would needlessly kill the request that allocated it. Production
    // case 2026-05-14: banamansales@gmail.com large_dtf — pre-GC RSS=494MB,
    // post-GC RSS=270MB, but old code used the pre-GC reading and committed
    // to exit 3s later, killing the process AFTER pre-ship compression had
    // already shrunk the PDF (63.3MB → 1.7MB) and the canvas screenshot had
    // been appended — order died on the way to res.send().
    let effectiveRssMB = rssMB;
    if (rssMB > MEMORY_WARN_MB) {
      if (typeof global.gc === 'function') {
        global.gc();
        cleanTempFiles();
      }
      effectiveRssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
      console.warn(`[MEMORY WARNING] RSS: ${rssMB}MB → ${effectiveRssMB}MB after GC, Heap: ${heapMB}MB`);
      persistCrashLog('memory_warning', `RSS: ${rssMB}MB → ${effectiveRssMB}MB after GC, Heap: ${heapMB}MB`);
    }
    if (effectiveRssMB > MEMORY_RESTART_MB && !restartScheduled) {
      restartScheduled = true;
      console.error(`[MEMORY CRITICAL] RSS: ${effectiveRssMB}MB (post-GC) — graceful restart in 3s to avoid OOM kill`);
      // CRITICAL: await the forensic write before scheduling exit. Otherwise the
      // 3s timer can fire before Neon commits the row (especially when DB is
      // under load, which is common when we're tipping over) and we lose the
      // very evidence this whole system exists to capture.
      const startedAt = Date.now();
      const writePromise = persistCrashLog('memory_critical', `RSS: ${effectiveRssMB}MB (post-GC) — scheduling graceful restart`);
      const writeDeadline = new Promise<void>((r) => setTimeout(r, 2500));
      Promise.race([writePromise, writeDeadline]).then(() => {
        // Honor the full 3s recovery window regardless of how fast the DB
        // write resolved. OLD code used `Math.max(500, 3000 - 2500)` which
        // always evaluated to 500ms, so a fast Neon write collapsed the
        // window from 3s → ~0.6s and the final-RSS recheck barely had time
        // to see recovery.
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, 3000 - elapsed);
        setTimeout(() => {
          // Final pre-exit check: if RSS has dropped back under the warn line
          // during the 3s window (e.g. a big response Buffer was flushed and
          // freed), abort the exit. Without this the watchdog still kills
          // requests whose own response delivery would have cleared memory.
          const finalRssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
          if (finalRssMB < MEMORY_WARN_MB) {
            console.warn(`[MEMORY CRITICAL] Aborted graceful restart — RSS recovered to ${finalRssMB}MB (< ${MEMORY_WARN_MB}MB warn line)`);
            persistCrashLog('memory_recovered', `RSS recovered to ${finalRssMB}MB during 3s exit window — restart cancelled`);
            restartScheduled = false;
            return;
          }
          console.error(`[MEMORY CRITICAL] Exiting for graceful restart (final RSS: ${finalRssMB}MB)`);
          process.exit(1);
        }, remaining);
      });
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

// Forensic request tracker — MUST be mounted BEFORE body parsers so it captures
// even requests that fail body parsing (e.g. 413 PayloadTooLarge). Email
// extraction re-runs at response finalize, by which time the body parser will
// have populated req.body for successful parses.
app.use(requestTracker);

// Pre-parse admission control for the base64 upload fallback
// (POST /api/projects/:id/logos/base64). The global express.json() parser below
// buffers the ENTIRE request body into memory before any route handler runs, so a
// route-level concurrency cap cannot stop many large JSON bodies from being parsed
// concurrently and exhausting the heap (→ OOM watchdog kill). body-parser already
// rejects an oversized single request via Content-Length, but it does NOT bound
// concurrency. This guard runs FIRST so it can reject (503) before the body is ever
// buffered. The route handler keeps its own decoded-byte validation as defense in depth.
const BASE64_FALLBACK_PATH = /^\/api\/projects\/[^/]+\/logos\/base64\/?$|^\/api\/vectorization-requests\/base64\/?$/;
const BASE64_PREPARSE_MAX_CONCURRENT = 2;
const BASE64_PREPARSE_MAX_BYTES = 200 * 1024 * 1024; // align with express.json limit below
let base64PreparseInFlight = 0;
app.use((req, res, next) => {
  if (req.method !== 'POST' || !BASE64_FALLBACK_PATH.test(req.path)) return next();
  const declaredLen = Number(req.headers['content-length'] || 0);
  if (declaredLen > BASE64_PREPARSE_MAX_BYTES) {
    return res.status(413).json({ error: 'Upload too large for the fallback path' });
  }
  if (base64PreparseInFlight >= BASE64_PREPARSE_MAX_CONCURRENT) {
    return res.status(503).json({ error: 'Server busy, please try again in a moment' });
  }
  base64PreparseInFlight++;
  let released = false;
  const release = () => { if (!released) { released = true; base64PreparseInFlight--; } };
  res.on('finish', release);
  res.on('close', release);
  next();
});

// JSON body limit sized for inline add-to-cart pdfBase64 payloads.
// Production heap is --max-old-space-size=4096 (.replit), so 200MB JSON parses
// safely. Keep the client threshold in client/src/pages/upload-tool.tsx strictly
// below this so the route handler's offload logic gets a chance to run on overflow.
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: false, limit: '200mb' }));

// Friendly 413 handler — converts body-parser PayloadTooLargeError into a JSON
// response with actionable guidance, so a stale cached client (still using the
// old 100MB threshold) gets a clear message instead of an opaque socket error.
app.use((err: any, req: any, res: any, next: any) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    console.warn(`⚠️ 413 PayloadTooLarge on ${req.method} ${req.path} (limit: ${err.limit}, received: ${err.length})`);
    return res.status(413).json({
      error: 'Request body too large',
      hint: 'Please refresh the page (Ctrl+Shift+R) to load the latest version, then retry. If the file is very large the app will offload it automatically.',
      limitBytes: err.limit,
      receivedBytes: err.length,
    });
  }
  return next(err);
});


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
