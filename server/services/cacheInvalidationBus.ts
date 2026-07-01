/**
 * Cross-Instance Cache Invalidation (Postgres LISTEN/NOTIFY)
 *
 * The BusinessDataCache is in-process. On a single instance, `invalidate()`
 * after a DB mutation is enough. On multi-instance deploys it is NOT: instance
 * A invalidates its own copy, but instance B keeps serving stale hours /
 * services / staff for up to the 5-minute TTL — and instance B might be the
 * one answering a live call. That was audit CRIT-7.
 *
 * This closes it with zero new infrastructure: `invalidate()` also fires a
 * Postgres NOTIFY, and every instance LISTENs on the same channel and clears
 * its LOCAL copy on receipt. Publishing goes through the shared pool (always
 * connected); LISTEN uses one dedicated long-lived connection (LISTEN needs a
 * persistent session, not a pooled one that gets released).
 *
 * Fail-soft: if the listener can't connect, the system degrades to the prior
 * per-instance 5-minute-TTL behavior — never worse than before.
 */

import pg from 'pg';
import { pool } from '../db';
import { dataCache } from './callTools/cache';

const CHANNEL = 'sba_cache_invalidate';

interface InvalidationPayload {
  b: number;        // businessId
  t?: string | null; // type (optional)
}

/**
 * Parse a NOTIFY payload and apply it to the local cache. Exported (and takes
 * the cache) so it's unit-testable without a live Postgres connection.
 * Tolerant of malformed payloads — a bad message must never crash the listener.
 */
export function applyInvalidationPayload(
  payload: string | undefined,
  cache: { invalidateLocal: (businessId: number, type?: string) => void },
): boolean {
  if (!payload) return false;
  try {
    const parsed = JSON.parse(payload) as InvalidationPayload;
    if (typeof parsed.b !== 'number') return false;
    cache.invalidateLocal(parsed.b, parsed.t ?? undefined);
    return true;
  } catch {
    return false;
  }
}

/** Publish an invalidation to all instances. Best-effort; local invalidation
 *  already happened synchronously in cache.invalidate(). */
function publish(businessId: number, type?: string): void {
  const payload = JSON.stringify({ b: businessId, t: type ?? null });
  pool
    .query('SELECT pg_notify($1, $2)', [CHANNEL, payload])
    .catch((err) => console.warn('[CacheBus] publish failed (local invalidation still applied):', err?.message || err));
}

let listenClient: pg.Client | null = null;
let stopped = false;

function buildClient(): pg.Client {
  const connectionString = process.env.DATABASE_URL!;
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  return new pg.Client({
    connectionString,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
}

async function connectListener(): Promise<void> {
  if (stopped) return;
  const client = buildClient();
  listenClient = client;

  client.on('notification', (msg) => {
    applyInvalidationPayload(msg.payload, dataCache);
  });
  client.on('error', (err) => {
    console.warn('[CacheBus] listener connection error, will reconnect:', err?.message || err);
    scheduleReconnect(client);
  });
  client.on('end', () => {
    if (!stopped) scheduleReconnect(client);
  });

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  console.log('[CacheBus] listening for cross-instance cache invalidations');
}

let reconnectPending = false;
function scheduleReconnect(deadClient: pg.Client): void {
  if (stopped || reconnectPending) return;
  if (deadClient !== listenClient) return; // stale handler from an old client
  reconnectPending = true;
  listenClient = null;
  try { deadClient.removeAllListeners(); } catch { /* noop */ }
  try { deadClient.end().catch(() => {}); } catch { /* noop */ }
  setTimeout(() => {
    reconnectPending = false;
    connectListener().catch((err) =>
      console.warn('[CacheBus] reconnect failed, will retry on next invalidation cycle:', err?.message || err),
    );
  }, 5000);
}

/**
 * Wire the cache to publish invalidations and start listening. Call once at
 * boot. Fail-soft — a setup failure degrades to per-instance TTL, never worse.
 */
export async function startCacheInvalidationBus(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[CacheBus] DATABASE_URL not set — cross-instance invalidation disabled');
    return;
  }
  // Always register the publisher (cheap; a single-instance deploy just
  // NOTIFYs itself, which is a harmless no-op re-invalidation).
  dataCache.setInvalidationPublisher(publish);
  try {
    await connectListener();
  } catch (err: any) {
    console.warn('[CacheBus] could not start listener (degrading to per-instance TTL):', err?.message || err);
    scheduleReconnect(listenClient ?? buildClient());
  }
}

/** Graceful shutdown. */
export async function stopCacheInvalidationBus(): Promise<void> {
  stopped = true;
  if (listenClient) {
    try { await listenClient.end(); } catch { /* noop */ }
    listenClient = null;
  }
}
