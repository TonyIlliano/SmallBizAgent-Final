import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Get (or create) the SQLite database instance.
 * Uses expo-sqlite's synchronous openDatabaseSync API.
 */
function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('smallbizagent.db');
  }
  return db;
}

/**
 * Initialize the offline database. Creates all cache tables if they don't exist.
 * Call this once at app startup (before any reads/writes).
 */
export function initDatabase(): void {
  const database = getDb();

  database.execSync(`
    CREATE TABLE IF NOT EXISTS cached_appointments (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS cached_jobs (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS cached_customers (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS mutation_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      body TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Cache writers (upsert — INSERT OR REPLACE)
// ---------------------------------------------------------------------------

/**
 * Cache a list of appointments into SQLite.
 * Each appointment is stored as a JSON blob keyed by its server id.
 */
export function cacheAppointments(appointments: Array<{ id: number; [key: string]: any }>): void {
  const database = getDb();
  const now = Date.now();

  const stmt = database.prepareSync(
    'INSERT OR REPLACE INTO cached_appointments (id, data, cached_at) VALUES (?, ?, ?)'
  );

  try {
    for (const appt of appointments) {
      stmt.executeSync(appt.id, JSON.stringify(appt), now);
    }
  } finally {
    stmt.finalizeSync();
  }
}

/**
 * Cache a list of jobs into SQLite.
 */
export function cacheJobs(jobs: Array<{ id: number; [key: string]: any }>): void {
  const database = getDb();
  const now = Date.now();

  const stmt = database.prepareSync(
    'INSERT OR REPLACE INTO cached_jobs (id, data, cached_at) VALUES (?, ?, ?)'
  );

  try {
    for (const job of jobs) {
      stmt.executeSync(job.id, JSON.stringify(job), now);
    }
  } finally {
    stmt.finalizeSync();
  }
}

/**
 * Cache a list of customers into SQLite.
 */
export function cacheCustomers(customers: Array<{ id: number; [key: string]: any }>): void {
  const database = getDb();
  const now = Date.now();

  const stmt = database.prepareSync(
    'INSERT OR REPLACE INTO cached_customers (id, data, cached_at) VALUES (?, ?, ?)'
  );

  try {
    for (const customer of customers) {
      stmt.executeSync(customer.id, JSON.stringify(customer), now);
    }
  } finally {
    stmt.finalizeSync();
  }
}

// ---------------------------------------------------------------------------
// Cache readers
// ---------------------------------------------------------------------------

interface CachedRow {
  id: number;
  data: string;
  cached_at: number;
}

/**
 * Read cached appointments. Optionally filter by date (YYYY-MM-DD).
 * Since we store full JSON, date filtering parses the startDate field.
 */
export function getCachedAppointments(date?: string): any[] {
  const database = getDb();
  const rows = database.getAllSync<CachedRow>(
    'SELECT id, data, cached_at FROM cached_appointments ORDER BY id DESC'
  );

  let results = rows.map((row) => JSON.parse(row.data));

  if (date) {
    results = results.filter((appt: any) => {
      // Match against startDate (YYYY-MM-DD prefix)
      return appt.startDate && appt.startDate.slice(0, 10) === date;
    });
  }

  return results;
}

/**
 * Read cached jobs.
 */
export function getCachedJobs(): any[] {
  const database = getDb();
  const rows = database.getAllSync<CachedRow>(
    'SELECT id, data, cached_at FROM cached_jobs ORDER BY id DESC'
  );
  return rows.map((row) => JSON.parse(row.data));
}

/**
 * Read cached customers.
 */
export function getCachedCustomers(): any[] {
  const database = getDb();
  const rows = database.getAllSync<CachedRow>(
    'SELECT id, data, cached_at FROM cached_customers ORDER BY id DESC'
  );
  return rows.map((row) => JSON.parse(row.data));
}

// ---------------------------------------------------------------------------
// Mutation queue
// ---------------------------------------------------------------------------

interface MutationRow {
  id: number;
  method: string;
  path: string;
  body: string | null;
  created_at: number;
}

export interface PendingMutation {
  id: number;
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  createdAt: number;
}

/**
 * Queue a mutation for later replay when the device comes back online.
 */
export function queueMutation(
  method: string,
  path: string,
  body?: Record<string, unknown> | null,
): void {
  const database = getDb();
  database.runSync(
    'INSERT INTO mutation_queue (method, path, body, created_at) VALUES (?, ?, ?, ?)',
    method,
    path,
    body ? JSON.stringify(body) : null,
    Date.now(),
  );
}

/**
 * Get all pending mutations in FIFO order (oldest first).
 */
export function getPendingMutations(): PendingMutation[] {
  const database = getDb();
  const rows = database.getAllSync<MutationRow>(
    'SELECT id, method, path, body, created_at FROM mutation_queue ORDER BY id ASC'
  );
  return rows.map((row) => ({
    id: row.id,
    method: row.method,
    path: row.path,
    body: row.body ? JSON.parse(row.body) : null,
    createdAt: row.created_at,
  }));
}

/**
 * Remove a mutation from the queue after it has been successfully replayed.
 */
export function removeMutation(id: number): void {
  const database = getDb();
  database.runSync('DELETE FROM mutation_queue WHERE id = ?', id);
}

/**
 * Get the count of pending mutations (fast, no parsing).
 */
export function getPendingMutationCount(): number {
  const database = getDb();
  const row = database.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM mutation_queue'
  );
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/**
 * Clear all cached data and queued mutations. Call on logout.
 */
export function clearAllCache(): void {
  const database = getDb();
  database.execSync('DELETE FROM cached_appointments');
  database.execSync('DELETE FROM cached_jobs');
  database.execSync('DELETE FROM cached_customers');
  database.execSync('DELETE FROM mutation_queue');
}
