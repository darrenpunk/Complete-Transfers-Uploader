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
