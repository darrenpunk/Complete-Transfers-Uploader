import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import fs from "fs";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    console.log('🔧 Using DATABASE_URL from environment');
    return process.env.DATABASE_URL;
  }

  try {
    if (fs.existsSync('/tmp/replitdb')) {
      const databaseUrl = fs.readFileSync('/tmp/replitdb', 'utf8').trim();
      console.log('📱 Published app: Using DATABASE_URL from /tmp/replitdb');
      return databaseUrl;
    }
  } catch (error) {
    console.warn('⚠️ Could not read /tmp/replitdb, falling back to environment variable');
  }

  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = getDatabaseUrl();
export const pool = new Pool({ 
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
});

pool.on('error', (err) => {
  console.error('Database pool error (non-critical):', err.message || err);
});

export const db = drizzle({ client: pool, schema });

// Transient connection errors that occur when the database provider (Neon)
// recycles the compute / drops a connection ("terminating connection due to
// administrator command", socket resets, etc). A brand-new query will succeed
// because the pool hands out a fresh connection — so retrying briefly absorbs
// the hiccup instead of surfacing a 500 to the customer (blank page).
const TRANSIENT_DB_ERROR_PATTERNS = [
  'terminating connection',
  'connection terminated',
  'connection reset',
  'econnreset',
  'socket hang up',
  'server closed the connection',
  'connection closed',
  'fetch failed',
  'timeout',
];

export function isTransientDbError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return TRANSIENT_DB_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Run a READ-ONLY database operation with a short retry on transient connection
 * errors. Do NOT wrap writes/inserts with this — a retry could double-execute.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 150,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientDbError(err)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `🔁 [DB RETRY] transient DB error (attempt ${attempt + 1}/${retries}), retrying in ${delay}ms:`,
          (err as any)?.message || err,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
