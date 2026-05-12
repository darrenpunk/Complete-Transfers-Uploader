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

  const finalize = () => {
    if (!inFlight.has(seq)) return;
    inFlight.delete(seq);
    rec.status = res.statusCode;
    rec.durationMs = Date.now() - rec.ts;
    rec.rssMbAtEnd = rssMb();
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
