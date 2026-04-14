import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect if we're connecting to a local PostgreSQL
const isLocalDB = process.env.DATABASE_URL.includes('localhost') ||
                  process.env.DATABASE_URL.includes('127.0.0.1');

// Pool configuration
const poolConfig: any = {
  connectionString: process.env.DATABASE_URL,
  max: 25,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Kill any query that runs longer than 30 seconds — prevents cascade hangs
  // where one slow query holds a connection and starves the pool
  statement_timeout: 30000,
};

// Enable SSL for all non-local databases (production, staging, preview on Railway, etc.)
if (!isLocalDB) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });

// Test database connection on startup
export async function testConnection(): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  } finally {
    client?.release();
  }
}

// ────────────────────────────────────────────────────────
// Connection pool monitoring
// ────────────────────────────────────────────────────────

let poolMonitorTick = 0;

const poolMonitorInterval = setInterval(() => {
  poolMonitorTick++;
  const { totalCount, idleCount, waitingCount } = pool;
  const activeCount = totalCount - idleCount;

  // Critical: queries are waiting for connections
  if (waitingCount > 5) {
    console.warn(`[Pool] CRITICAL: ${waitingCount} queries waiting for connections! active: ${activeCount}, idle: ${idleCount}, total: ${totalCount}/25`);
  }
  // Warning: pool is 80%+ utilized
  else if (totalCount > 20) {
    console.warn(`[Pool] WARNING: pool at ${totalCount}/25 connections (${Math.round((totalCount / 25) * 100)}% utilized). active: ${activeCount}, idle: ${idleCount}, waiting: ${waitingCount}`);
  }

  // DEBUG stats every 5 minutes (every 5th tick at 60s intervals)
  if (poolMonitorTick % 5 === 0) {
    console.log(`[Pool] active: ${activeCount}, idle: ${idleCount}, waiting: ${waitingCount}, total: ${totalCount}/25`);
  }
}, 60_000);

/**
 * Stop the pool monitoring interval.
 * Call this during graceful shutdown (SIGTERM/SIGINT).
 */
export function stopPoolMonitor(): void {
  clearInterval(poolMonitorInterval);
}

// Prevent the monitor from keeping the process alive
if (poolMonitorInterval.unref) {
  poolMonitorInterval.unref();
}
