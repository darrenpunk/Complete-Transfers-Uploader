import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import fs from "fs";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Get DATABASE_URL from either published environment or development environment
function getDatabaseUrl(): string {
  // Check if this is a published app (DATABASE_URL is in /tmp/replitdb)
  try {
    if (fs.existsSync('/tmp/replitdb')) {
      const databaseUrl = fs.readFileSync('/tmp/replitdb', 'utf8').trim();
      console.log('📱 Published app: Using DATABASE_URL from /tmp/replitdb');
      return databaseUrl;
    }
  } catch (error) {
    console.warn('⚠️ Could not read /tmp/replitdb, falling back to environment variable');
  }
  
  // Fall back to environment variable (development)
  if (process.env.DATABASE_URL) {
    console.log('🔧 Development: Using DATABASE_URL from environment');
    return process.env.DATABASE_URL;
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = getDatabaseUrl();
export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle({ client: pool, schema });
