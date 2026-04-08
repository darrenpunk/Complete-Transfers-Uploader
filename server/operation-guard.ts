import type { Response } from 'express';

const MAX_CONCURRENT_HEAVY = 2;
const MAX_QUEUE_SIZE = 10;
const QUEUE_TIMEOUT_MS = 60_000;
const STALE_OP_TIMEOUT_MS = 180_000;

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
}

let nextId = 1;
let activeOps: ActiveOp[] = [];
let queue: QueueEntry[] = [];
let totalProcessed = 0;
let totalQueued = 0;
let totalRejected = 0;

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
  while (activeOps.length < MAX_CONCURRENT_HEAVY && queue.length > 0) {
    const entry = queue.shift()!;
    clearTimeout(entry.timer);
    activeOps.push({ id: nextId++, label: entry.label, startedAt: Date.now() });
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
      console.log(`[OP-GUARD] Released "${label}" after ${elapsed}s (active: ${activeOps.length - 1}, queued: ${queue.length})`);
      activeOps.splice(idx, 1);
    }
    totalProcessed++;
    drainQueue();
  };
}

export async function acquireHeavyOp(label: string): Promise<() => void> {
  cleanStaleOps();

  if (activeOps.length < MAX_CONCURRENT_HEAVY) {
    const opId = nextId++;
    activeOps.push({ id: opId, label, startedAt: Date.now() });
    console.log(`[OP-GUARD] Started "${label}" (active: ${activeOps.length}/${MAX_CONCURRENT_HEAVY})`);
    return createRelease(opId, label);
  }

  if (queue.length >= MAX_QUEUE_SIZE) {
    totalRejected++;
    console.error(`[OP-GUARD] REJECTED "${label}" — queue full (active: ${activeOps.length}, queued: ${queue.length})`);
    throw new Error('Server is busy processing other requests. Please try again in a moment.');
  }

  totalQueued++;
  console.log(`[OP-GUARD] Queuing "${label}" (active: ${activeOps.length}, queued: ${queue.length + 1})`);

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

export function isMemoryCritical(thresholdMB = 450): boolean {
  const mem = process.memoryUsage();
  return Math.round(mem.rss / 1024 / 1024) > thresholdMB;
}

export function getOperationStats() {
  return {
    active: activeOps.length,
    queued: queue.length,
    maxConcurrent: MAX_CONCURRENT_HEAVY,
    totalProcessed,
    totalQueued,
    totalRejected,
    memory: getMemoryUsage(),
    activeOps: activeOps.map(op => ({
      label: op.label,
      runningSeconds: Math.round((Date.now() - op.startedAt) / 1000),
    })),
  };
}

setInterval(cleanStaleOps, 30_000);

setInterval(() => {
  if (typeof global.gc === 'function' && isMemoryCritical(400)) {
    console.log('[OP-GUARD] Memory pressure detected, triggering GC');
    global.gc();
  }
}, 60_000);
