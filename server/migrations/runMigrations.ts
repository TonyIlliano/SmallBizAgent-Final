import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db';

// Get the directory name for ES modules (replacement for __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create base tables if they don't exist
 */
async function createBaseTables() {
  console.log('Checking and creating base tables...');

  // Check if users table exists (our indicator that schema has been created)
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'users'
    );
  `);

  if (result.rows[0].exists) {
    console.log('Base tables already exist');
    return;
  }

  console.log('Creating base tables from schema...');

  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      role TEXT DEFAULT 'user',
      business_id INTEGER,
      reset_token TEXT,
      reset_token_expires TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create businesses table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      description TEXT,
      business_type TEXT,
      timezone TEXT DEFAULT 'America/New_York',
      hours JSONB,
      twilio_phone_number TEXT,
      twilio_phone_sid TEXT,
      google_calendar_id TEXT,
      google_calendar_refresh_token TEXT,
      microsoft_calendar_id TEXT,
      microsoft_calendar_refresh_token TEXT,
      apple_calendar_id TEXT,
      receptionist_enabled BOOLEAN DEFAULT false,
      receptionist_greeting TEXT,
      receptionist_voice TEXT DEFAULT 'alloy',
      receptionist_instructions TEXT,
      vapi_assistant_id TEXT,
      vapi_phone_number_id TEXT,
      booking_slot_interval INTEGER DEFAULT 30,
      owner_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create customers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create services table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      duration INTEGER DEFAULT 60,
      price DECIMAL(10,2),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create appointments table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER,
      service_id INTEGER,
      staff_id INTEGER,
      title TEXT,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      google_calendar_event_id TEXT,
      microsoft_calendar_event_id TEXT,
      apple_calendar_event_id TEXT,
      last_synced_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create jobs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      scheduled_date TIMESTAMP,
      completed_date TIMESTAMP,
      total DECIMAL(10,2),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create invoices table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER,
      job_id INTEGER,
      invoice_number TEXT,
      amount DECIMAL(10,2),
      status TEXT DEFAULT 'draft',
      due_date TIMESTAMP,
      paid_date TIMESTAMP,
      stripe_invoice_id TEXT,
      stripe_payment_intent_id TEXT,
      access_token TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create staff_members table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_members (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      user_id INTEGER,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      role TEXT DEFAULT 'staff',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create call_logs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      caller_phone TEXT,
      caller_name TEXT,
      call_sid TEXT,
      direction TEXT,
      status TEXT,
      duration INTEGER,
      recording_url TEXT,
      transcript TEXT,
      summary TEXT,
      sentiment TEXT,
      action_taken TEXT,
      vapi_call_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create subscriptions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL UNIQUE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      current_period_start TIMESTAMP,
      current_period_end TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create subscription_plans table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      stripe_price_id TEXT,
      price DECIMAL(10,2),
      interval TEXT DEFAULT 'month',
      features JSONB,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create calendar_integrations table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_integrations (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMP,
      data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_id, provider)
    );
  `);

  console.log('Base tables created successfully');
}

/**
 * Run all SQL migration files in the migrations directory
 */
async function runMigrations() {
  try {
    console.log('Running database migrations...');

    // First, create base tables if they don't exist
    await createBaseTables();

    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Get all SQL files in the migrations directory
    const migrationsDir = path.join(__dirname);
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure they run in order
    
    if (migrationFiles.length === 0) {
      console.log('No SQL migration files found');
    } else {
      console.log(`Found ${migrationFiles.length} SQL migration files`);
      
      // Get already applied migrations
      const { rows: appliedMigrations } = await pool.query(
        'SELECT name FROM migrations'
      );
      const appliedMigrationNames = appliedMigrations.map(m => m.name);
      
      // Run each migration that hasn't been applied yet
      for (const file of migrationFiles) {
        if (appliedMigrationNames.includes(file)) {
          console.log(`Migration ${file} already applied, skipping`);
          continue;
        }
        
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        console.log(`Applying migration: ${file}`);
        
        // Begin transaction
        await pool.query('BEGIN');
        
        try {
          // Run the migration
          await pool.query(sql);
          
          // Record the migration
          await pool.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [file]
          );
          
          // Commit transaction
          await pool.query('COMMIT');
          console.log(`Successfully applied migration: ${file}`);
        } catch (error) {
          // Rollback on error
          await pool.query('ROLLBACK');
          console.error(`Failed to apply migration ${file}:`, error);
          throw error;
        }
      }
    }
    
    // TypeScript migrations are now handled by createBaseTables()
    // The calendar_integrations and subscription_plans tables are created there
    console.log('Skipping legacy TypeScript migrations (handled by createBaseTables)');
    
    console.log('All migrations applied successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}

// ES modules don't have a direct equivalent to require.main === module
// This file will only be imported, not run directly, so we don't need that check

export default runMigrations;