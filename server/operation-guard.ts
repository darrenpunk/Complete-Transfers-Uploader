import type { Response } from 'express';
import { execSync } from 'child_process';
import * as fs from 'fs';

const MAX_CONCURRENT_HEAVY = 1;
const MAX_QUEUE_SIZE = 8;
const QUEUE_TIMEOUT_MS = 120_000;
const STALE_OP_TIMEOUT_MS = 180_000;

// Thresholds are tuned for the production deployment's 512MB container.
// In development the workspace is much larger and Vite + esbuild + tsx alone
// occupy ~380MB before any user activity, so we'd reject every upload at idle
// if we used the production caps. Use generous dev caps to mirror real prod
// behaviour without false rejections during local testing.
const IS_PROD = process.env.NODE_ENV === 'production';

const MEMORY_REJECT_MB = IS_PROD ? 440 : 1200;
const MEMORY_SERIAL_MB = IS_PROD ? 380 : 1000;

const CONTAINER_LIMIT_MB = IS_PROD ? 512 : 2048;
const CONTAINER_REJECT_MB = IS_PROD ? 460 : 1800;
const CONTAINER_WARN_MB = IS_PROD ? 400 : 1500;

// shouldSkipNonEssential() gates the PDF content analysis (pdfimages/pdf2svg) that
// classifies uploads as raster vs vector. It MUST follow the same IS_PROD pattern as
// the caps above: the dev workspace idles at ~380-500MB (Vite + esbuild + tsx), so
// hardcoded prod caps (350/300) made dev skip the analysis on EVERY upload — silently
// classifying raster PDFs as vector and diverging from production behaviour.
// Prod values are unchanged (byte-identical OOM protection).
const SKIP_NONESSENTIAL_CONTAINER_MB = IS_PROD ? 350 : 1500;
const SKIP_NONESSENTIAL_RSS_MB = IS_PROD ? 300 : 1000;

interface QueueEntry {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  label: string;
}

interface ActiveOp {
  id: number;
  label: string;
  startedAt: number;
  memAtStart: number;
}

let nextId = 1;
let activeOps: ActiveOp[] = [];
let queue: QueueEntry[] = [];
let totalProcessed = 0;
let totalQueued = 0;
let totalRejected = 0;

function getContainerMemoryMB(): number {
  try {
    const statPaths = [
      '/sys/fs/cgroup/memory/memory.stat',
      '/sys/fs/cgroup/memory.stat',
    ];
    const usagePaths = [
      '/sys/fs/cgroup/memory/memory.usage_in_bytes',
      '/sys/fs/cgroup/memory.current',
    ];

    let totalUsageBytes = 0;
    for (const p of usagePaths) {
      if (fs.existsSync(p)) {
        const val = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
        if (!isNaN(val) && val > 0) { totalUsageBytes = val; break; }
      }
    }

    if (totalUsageBytes > 0) {
      let reclaimableBytes = 0;
      for (const sp of statPaths) {
        if (fs.existsSync(sp)) {
          const statContent = fs.readFileSync(sp, 'utf8');

          const inactiveFileMatch = statContent.match(/^inactive_file\s+(\d+)/m);
          if (inactiveFileMatch) {
            reclaimableBytes += parseInt(inactiveFileMatch[1], 10);
          }
          const totalInactiveFileMatch = statContent.match(/total_inactive_file\s+(\d+)/);
          if (totalInactiveFileMatch) {
            reclaimableBytes = Math.max(reclaimableBytes, parseInt(totalInactiveFileMatch[1], 10));
          }

          if (reclaimableBytes === 0) {
            const fileMatch = statContent.match(/^file\s+(\d+)/m);
            if (fileMatch) {
              reclaimableBytes = parseInt(fileMatch[1], 10);
            }
          }

          const cacheMatch = statContent.match(/^cache\s+(\d+)/m);
          if (cacheMatch) {
            reclaimableBytes = Math.max(reclaimableBytes, parseInt(cacheMatch[1], 10));
          }

          const inactiveAnonMatch = statContent.match(/^inactive_anon\s+(\d+)/m);
          if (inactiveAnonMatch) {
            reclaimableBytes += parseInt(inactiveAnonMatch[1], 10);
          }

          break;
        }
      }
      const realUsage = Math.round((totalUsageBytes - reclaimableBytes) / 1024 / 1024);
      const rssMB = getMemoryUsage().rssMB;
      // If cgroup usage is much larger than our process RSS, the cgroup is measuring
      // more than just this process (e.g., dev workspace cgroup includes Vite, esbuild,
      // editor processes). Trust RSS in that case.
      if (realUsage > 1024 || realUsage > rssMB * 2 + 200) {
        return rssMB;
      }
      return Math.max(realUsage, rssMB);
    }
  } catch {}
  return getMemoryUsage().rssMB;
}

function cleanStaleOps() {
  const now = Date.now();
  const before = activeOps.length;
  activeOps = activeOps.filter(op => {
    if (now - op.startedAt > STALE_OP_TIMEOUT_MS) {
      console.warn(`[OP-GUARD] Stale operation removed: "${op.label}" (ran ${Math.round((now - op.startedAt) / 1000)}s)`);
      return false;
    }
    return true;
  });
  if (activeOps.length < before) {
    drainQueue();
  }
}

function drainQueue() {
  const mem = getMemoryUsage();
  const containerMB = getContainerMemoryMB();
  if ((mem.rssMB > MEMORY_SERIAL_MB || containerMB > CONTAINER_WARN_MB) && activeOps.length > 0) {
    return;
  }
  while (activeOps.length < MAX_CONCURRENT_HEAVY && queue.length > 0) {
    const entry = queue.shift()!;
    clearTimeout(entry.timer);
    const startMem = getMemoryUsage().rssMB;
    activeOps.push({ id: nextId++, label: entry.label, startedAt: Date.now(), memAtStart: startMem });
    entry.resolve();
  }
}

function createRelease(opId: number, label: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const idx = activeOps.findIndex(op => op.id === opId);
    if (idx >= 0) {
      const elapsed = Math.round((Date.now() - activeOps[idx].startedAt) / 1000);
      const memNow = getMemoryUsage().rssMB;
      const memDelta = memNow - activeOps[idx].memAtStart;
      const containerMB = getContainerMemoryMB();
      console.log(`[OP-GUARD] Released "${label}" after ${elapsed}s (RSS: ${memNow}MB, Container: ${containerMB}MB, delta: ${memDelta > 0 ? '+' : ''}${memDelta}MB, active: ${activeOps.length - 1}, queued: ${queue.length})`);
      activeOps.splice(idx, 1);
    }
    totalProcessed++;
    if (typeof global.gc === 'function') {
      try { global.gc(); } catch {}
    }
    drainQueue();
  };
}

export async function acquireHeavyOp(label: string): Promise<() => void> {
  cleanStaleOps();

  const mem = getMemoryUsage();
  const containerMB = getContainerMemoryMB();

  if (mem.rssMB > MEMORY_REJECT_MB || containerMB > CONTAINER_REJECT_MB) {
    totalRejected++;
    console.error(`[OP-GUARD] REJECTED "${label}" — memory critical (RSS: ${mem.rssMB}MB, Container: ${containerMB}MB, Heap: ${mem.heapUsedMB}MB)`);
    if (typeof global.gc === 'function') {
      try { global.gc(); } catch {}
    }
    throw new Error('Server is under heavy load. Please wait a moment and try again.');
  }

  if ((mem.rssMB > MEMORY_SERIAL_MB || containerMB > CONTAINER_WARN_MB) && activeOps.length > 0) {
    if (queue.length >= MAX_QUEUE_SIZE) {
      totalRejected++;
      console.error(`[OP-GUARD] REJECTED "${label}" — memory high + queue full (RSS: ${mem.rssMB}MB, Container: ${containerMB}MB, active: ${activeOps.length}, queued: ${queue.length})`);
      throw new Error('Server is busy processing other requests. Please try again in a moment.');
    }
    totalQueued++;
    console.log(`[OP-GUARD] Queuing "${label}" — memory high, serializing (RSS: ${mem.rssMB}MB, Container: ${containerMB}MB, active: ${activeOps.length}, queued: ${queue.length + 1})`);
    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = queue.findIndex(e => e.timer === timer);
        if (idx >= 0) queue.splice(idx, 1);
        reject(new Error('Request timed out waiting in queue. Please try again.'));
      }, QUEUE_TIMEOUT_MS);
      queue.push({
        resolve: () => {
          const opId = activeOps[activeOps.length - 1]?.id ?? nextId;
          resolve(createRelease(opId, label));
        },
        reject,
        timer,
        label,
      });
    });
  }

  if (activeOps.length < MAX_CONCURRENT_HEAVY) {
    const opId = nextId++;
    activeOps.push({ id: opId, label, startedAt: Date.now(), memAtStart: mem.rssMB });
    console.log(`[OP-GUARD] Started "${label}" (active: ${activeOps.length}/${MAX_CONCURRENT_HEAVY}, RSS: ${mem.rssMB}MB, Container: ${containerMB}MB)`);
    return createRelease(opId, label);
  }

  if (queue.length >= MAX_QUEUE_SIZE) {
    totalRejected++;
    console.error(`[OP-GUARD] REJECTED "${label}" — queue full (active: ${activeOps.length}, queued: ${queue.length})`);
    throw new Error('Server is busy processing other requests. Please try again in a moment.');
  }

  totalQueued++;
  console.log(`[OP-GUARD] Queuing "${label}" (active: ${activeOps.length}, queued: ${queue.length + 1}, RSS: ${mem.rssMB}MB, Container: ${containerMB}MB)`);

  return new Promise<() => void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = queue.findIndex(e => e.timer === timer);
      if (idx >= 0) queue.splice(idx, 1);
      reject(new Error('Request timed out waiting in queue. Please try again.'));
    }, QUEUE_TIMEOUT_MS);

    queue.push({
      resolve: () => {
        const opId = activeOps[activeOps.length - 1]?.id ?? nextId;
        resolve(createRelease(opId, label));
      },
      reject,
      timer,
      label,
    });
  });
}

export function guardRoute(label: string) {
  return async (req: any, res: Response, next: () => void) => {
    try {
      const release = await acquireHeavyOp(`${label}:${req.params?.projectId || req.params?.logoId || 'unknown'}`);
      res.on('close', release);
      res.on('finish', release);
      next();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(503).json({ error: err.message });
      }
    }
  };
}

export function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    rssMB: Math.round(mem.rss / 1024 / 1024),
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
  };
}

export function isMemoryCritical(thresholdMB = 400): boolean {
  const containerMB = getContainerMemoryMB();
  const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  return rssMB > thresholdMB || containerMB > CONTAINER_WARN_MB;
}

export function shouldSkipNonEssential(): boolean {
  const containerMB = getContainerMemoryMB();
  const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const skip = containerMB > SKIP_NONESSENTIAL_CONTAINER_MB || rssMB > SKIP_NONESSENTIAL_RSS_MB;
  if (skip) {
    console.log(`[OP-GUARD] Skipping non-essential ops (RSS: ${rssMB}MB, Container: ${containerMB}MB)`);
  }
  return skip;
}

export { getContainerMemoryMB };

export function getOperationStats() {
  const containerMB = getContainerMemoryMB();
  return {
    active: activeOps.length,
    queued: queue.length,
    maxConcurrent: MAX_CONCURRENT_HEAVY,
    totalProcessed,
    totalQueued,
    totalRejected,
    memory: getMemoryUsage(),
    containerMemoryMB: containerMB,
    activeOps: activeOps.map(op => ({
      label: op.label,
      runningSeconds: Math.round((Date.now() - op.startedAt) / 1000),
    })),
  };
}

export function getActiveOpsDetail() {
  const now = Date.now();
  return activeOps.map(op => ({
    id: op.id,
    label: op.label,
    runningSeconds: Math.round((now - op.startedAt) / 1000),
    memAtStartMb: op.memAtStart,
  }));
}

setInterval(cleanStaleOps, 30_000);

setInterval(() => {
  const mem = getMemoryUsage();
  const containerMB = getContainerMemoryMB();
  if (containerMB > 350 || mem.rssMB > 350) {
    console.log(`[OP-GUARD] Memory watchdog: RSS ${mem.rssMB}MB, Container ${containerMB}MB, Heap ${mem.heapUsedMB}/${mem.heapTotalMB}MB, External ${mem.externalMB}MB, Active ops: ${activeOps.length}, Queued: ${queue.length}`);
  }
  if (typeof global.gc === 'function' && (containerMB > 380 || mem.rssMB > 380)) {
    console.log('[OP-GUARD] Memory pressure detected, triggering GC');
    global.gc();
  }
}, 15_000);
