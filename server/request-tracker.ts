import type { Request, Response, NextFunction } from 'express';

const RING_SIZE = 50;

export interface RequestRecord {
  ts: number;
  method: string;
  path: string;
  email: string | null;
  bytesIn: number;
  status?: number;
  durationMs?: number;
  rssMbAtStart: number;
  rssMbAtEnd?: number;
}

const ring: RequestRecord[] = [];
let ringHead = 0;
const inFlight = new Map<number, RequestRecord>();
let nextSeq = 1;

// Liveness counters for the wedge watchdog. We track only `/api/` paths (the
// "real endpoints") so that static-asset traffic — which can keep serving even
// when the API layer is wedged — does not mask an outage. The trivial
// keepalive endpoints (/api/version, /ping, /health, /api/analytics/heartbeat)
// are already filtered out by requestTracker before they reach here. A request
// counts as a "success" only when it returns status < 500: a 5xx (including
// OperationGuard's 503-on-wedge) is NOT a healthy round-trip.
let apiStartedTotal = 0;
let apiSuccessTotal = 0;
let lastApiSuccessAt: number | null = null;

function isApiPath(p: string): boolean {
  return p.startsWith('/api/');
}

function rssMb() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function extractEmail(req: Request): string | null {
  const hdr = req.headers['x-partner-email'];
  if (typeof hdr === 'string' && hdr) return hdr;
  if (Array.isArray(hdr) && hdr[0]) return hdr[0];
  const qEmail = (req.query?.email ?? req.query?.userEmail) as string | undefined;
  if (typeof qEmail === 'string' && qEmail) return qEmail;
  const body: any = (req as any).body;
  if (body && typeof body === 'object') {
    if (typeof body.userEmail === 'string' && body.userEmail) return body.userEmail;
    if (typeof body.email === 'string' && body.email) return body.email;
  }
  return null;
}

function pathOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function requestTracker(req: Request, res: Response, next: NextFunction) {
  // Skip very chatty endpoints to keep the ring focused on real work.
  const p = pathOnly(req.originalUrl || req.url || '');
  if (p === '/api/version' || p === '/health' || p === '/ping' || p === '/api/analytics/heartbeat') {
    return next();
  }

  const seq = nextSeq++;
  const cl = parseInt(String(req.headers['content-length'] || '0'), 10) || 0;
  const rec: RequestRecord = {
    ts: Date.now(),
    method: req.method,
    path: p,
    email: extractEmail(req),
    bytesIn: cl,
    rssMbAtStart: rssMb(),
  };
  inFlight.set(seq, rec);
  if (isApiPath(p)) apiStartedTotal++;

  const finalize = () => {
    if (!inFlight.has(seq)) return;
    inFlight.delete(seq);
    rec.status = res.statusCode;
    rec.durationMs = Date.now() - rec.ts;
    rec.rssMbAtEnd = rssMb();
    if (isApiPath(rec.path) && rec.status < 500) {
      apiSuccessTotal++;
      lastApiSuccessAt = Date.now();
    }
    // Body may be parsed by now (multer/json) — re-attempt email if still null.
    if (!rec.email) {
      const body: any = (req as any).body;
      if (body && typeof body === 'object') {
        if (typeof body.userEmail === 'string') rec.email = body.userEmail;
        else if (typeof body.email === 'string') rec.email = body.email;
      }
    }
    if (ring.length < RING_SIZE) ring.push(rec);
    else { ring[ringHead] = rec; ringHead = (ringHead + 1) % RING_SIZE; }
  };
  res.on('finish', finalize);
  res.on('close', finalize);
  next();
}

export function getRecentRequests(limit = RING_SIZE): RequestRecord[] {
  if (ring.length < RING_SIZE) return [...ring].slice(-limit);
  // Re-order ring so oldest is first
  const ordered = [...ring.slice(ringHead), ...ring.slice(0, ringHead)];
  return ordered.slice(-limit);
}

export function getInFlightRequests(): RequestRecord[] {
  const now = Date.now();
  return Array.from(inFlight.values()).map(r => ({
    ...r,
    durationMs: now - r.ts,
    rssMbAtEnd: rssMb(),
  }));
}

export interface ApiCounters {
  /** Monotonic count of `/api/` requests that have started since boot. */
  apiStartedTotal: number;
  /** Monotonic count of `/api/` requests that finished with status < 500. */
  apiSuccessTotal: number;
  /** Epoch ms of the last successful (`< 500`) `/api/` response, or null. */
  lastApiSuccessAt: number | null;
  /** Age (ms) of the oldest currently in-flight `/api/` request, or 0. */
  oldestApiInFlightMs: number;
  /** Number of `/api/` requests currently in flight. */
  apiInFlightCount: number;
}

/**
 * Snapshot of API liveness counters for the wedge watchdog. The watchdog
 * diffs `apiStartedTotal` / `apiSuccessTotal` between ticks to compute windowed
 * traffic-vs-success without being affected by the bounded ring buffer.
 */
export function getApiCounters(): ApiCounters {
  const now = Date.now();
  let oldestApiInFlightMs = 0;
  let apiInFlightCount = 0;
  for (const r of Array.from(inFlight.values())) {
    if (!isApiPath(r.path)) continue;
    apiInFlightCount++;
    const age = now - r.ts;
    if (age > oldestApiInFlightMs) oldestApiInFlightMs = age;
  }
  return {
    apiStartedTotal,
    apiSuccessTotal,
    lastApiSuccessAt,
    oldestApiInFlightMs,
    apiInFlightCount,
  };
}
