import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db';

// Get the directory name for ES modules (replacement for __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Add missing columns to existing tables (for Railway migration)
 */
async function fixExistingTables() {
  console.log('Checking for missing columns in existing tables...');

  // Helper to safely add column if it doesn't exist
  const addColumnIfNotExists = async (table: string, column: string, type: string) => {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    } catch (e: any) {
      // Ignore "already exists" errors
      if (!e.message.includes('already exists')) {
        console.log(`Note: Could not add ${column} to ${table}: ${e.message}`);
      }
    }
  };

  // Fix users table
  await addColumnIfNotExists('users', 'active', 'BOOLEAN DEFAULT true');
  await addColumnIfNotExists('users', 'last_login', 'TIMESTAMP');

  // Fix businesses table
  await addColumnIfNotExists('businesses', 'website', 'TEXT');
  await addColumnIfNotExists('businesses', 'logo_url', 'TEXT');
  await addColumnIfNotExists('businesses', 'type', "TEXT DEFAULT 'general'");
  await addColumnIfNotExists('businesses', 'booking_slug', 'TEXT');
  await addColumnIfNotExists('businesses', 'booking_enabled', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('businesses', 'booking_lead_time_hours', 'INTEGER DEFAULT 24');
  await addColumnIfNotExists('businesses', 'booking_buffer_minutes', 'INTEGER DEFAULT 15');
  await addColumnIfNotExists('businesses', 'booking_slot_interval_minutes', 'INTEGER DEFAULT 30');
  await addColumnIfNotExists('businesses', 'industry', 'TEXT');
  await addColumnIfNotExists('businesses', 'business_hours', 'TEXT');
  await addColumnIfNotExists('businesses', 'twilio_phone_number_status', 'TEXT');
  await addColumnIfNotExists('businesses', 'twilio_date_provisioned', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'quickbooks_realm_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'quickbooks_access_token', 'TEXT');
  await addColumnIfNotExists('businesses', 'quickbooks_refresh_token', 'TEXT');
  await addColumnIfNotExists('businesses', 'quickbooks_token_expiry', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'subscription_status', "TEXT DEFAULT 'inactive'");
  await addColumnIfNotExists('businesses', 'subscription_plan_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'stripe_plan_id', 'INTEGER');
  await addColumnIfNotExists('businesses', 'stripe_customer_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'stripe_subscription_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'subscription_start_date', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'subscription_period_end', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'subscription_end_date', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'trial_ends_at', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'twilio_phone_number_sid', 'TEXT');

  // Fix services table
  await addColumnIfNotExists('services', 'active', 'BOOLEAN DEFAULT true');

  // Fix appointments - rename columns if needed and add missing
  await addColumnIfNotExists('appointments', 'start_date', 'TIMESTAMP');
  await addColumnIfNotExists('appointments', 'end_date', 'TIMESTAMP');

  // Fix jobs table
  await addColumnIfNotExists('jobs', 'appointment_id', 'INTEGER');
  await addColumnIfNotExists('jobs', 'staff_id', 'INTEGER');
  await addColumnIfNotExists('jobs', 'estimated_completion', 'TIMESTAMP');

  // Fix invoices table
  await addColumnIfNotExists('invoices', 'tax', 'REAL');
  await addColumnIfNotExists('invoices', 'total', 'REAL');
  await addColumnIfNotExists('invoices', 'access_token', 'TEXT');

  // Create missing tables that don't exist
  console.log('Creating any missing tables...');

  // Create staff table (Railway has staff_members, we need staff)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT,
      specialty TEXT,
      bio TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create business_hours table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_hours (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      open TEXT,
      close TEXT,
      is_closed BOOLEAN DEFAULT false
    );
  `);

  // Create staff_hours table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_hours (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      is_off BOOLEAN DEFAULT false
    );
  `);

  // Create job_line_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_line_items (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL,
      taxable BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create invoice_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL
    );
  `);

  // Create receptionist_config table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS receptionist_config (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      greeting TEXT,
      after_hours_message TEXT,
      emergency_keywords JSONB,
      voicemail_enabled BOOLEAN DEFAULT true,
      call_recording_enabled BOOLEAN DEFAULT false,
      transcription_enabled BOOLEAN DEFAULT true,
      max_call_length_minutes INTEGER DEFAULT 15,
      transfer_phone_numbers JSONB,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create quotes table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      job_id INTEGER,
      quote_number TEXT NOT NULL,
      amount REAL NOT NULL,
      tax REAL,
      total REAL NOT NULL,
      valid_until TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      converted_to_invoice_id INTEGER,
      access_token TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create quote_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL
    );
  `);

  // Create review_settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_settings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      google_review_url TEXT,
      yelp_review_url TEXT,
      facebook_review_url TEXT,
      custom_review_url TEXT,
      review_request_enabled BOOLEAN DEFAULT true,
      auto_send_after_job_completion BOOLEAN DEFAULT true,
      delay_hours_after_completion INTEGER DEFAULT 2,
      sms_template TEXT,
      email_subject TEXT,
      email_template TEXT,
      preferred_platform TEXT DEFAULT 'google',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create review_requests table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_requests (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      job_id INTEGER,
      sent_via TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      platform TEXT,
      review_link TEXT,
      status TEXT DEFAULT 'sent',
      clicked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create recurring_schedules table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_schedules (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      service_id INTEGER,
      staff_id INTEGER,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      interval INTEGER DEFAULT 1,
      day_of_week INTEGER,
      day_of_month INTEGER,
      start_date DATE NOT NULL,
      end_date DATE,
      next_run_date DATE,
      job_title TEXT NOT NULL,
      job_description TEXT,
      estimated_duration INTEGER,
      auto_create_invoice BOOLEAN DEFAULT true,
      invoice_amount REAL,
      invoice_tax REAL,
      invoice_notes TEXT,
      status TEXT DEFAULT 'active',
      last_run_date DATE,
      total_jobs_created INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create recurring_schedule_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_schedule_items (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL
    );
  `);

  // Create recurring_job_history table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_job_history (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      invoice_id INTEGER,
      scheduled_for DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create password_reset_tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Finished checking/fixing existing tables');
}

/**
 * Create base tables if they don't exist
 * These match the Drizzle schema in shared/schema.ts
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
    console.log('Base tables already exist, checking for missing columns...');
    await fixExistingTables();
    return;
  }

  console.log('Creating base tables from schema...');

  // Create users table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      business_id INTEGER,
      active BOOLEAN DEFAULT true,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT email_idx UNIQUE (email),
      CONSTRAINT username_idx UNIQUE (username)
    );
  `);

  // Create businesses table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      phone TEXT,
      email TEXT NOT NULL,
      website TEXT,
      logo_url TEXT,
      type TEXT DEFAULT 'general',
      timezone TEXT DEFAULT 'America/New_York',
      booking_slug TEXT,
      booking_enabled BOOLEAN DEFAULT false,
      booking_lead_time_hours INTEGER DEFAULT 24,
      booking_buffer_minutes INTEGER DEFAULT 15,
      booking_slot_interval_minutes INTEGER DEFAULT 30,
      industry TEXT,
      business_hours TEXT,
      twilio_phone_number TEXT,
      twilio_phone_number_sid TEXT,
      twilio_phone_number_status TEXT,
      twilio_date_provisioned TIMESTAMP,
      vapi_assistant_id TEXT,
      vapi_phone_number_id TEXT,
      receptionist_enabled BOOLEAN DEFAULT true,
      quickbooks_realm_id TEXT,
      quickbooks_access_token TEXT,
      quickbooks_refresh_token TEXT,
      quickbooks_token_expiry TIMESTAMP,
      subscription_status TEXT DEFAULT 'inactive',
      subscription_plan_id TEXT,
      stripe_plan_id INTEGER,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_start_date TIMESTAMP,
      subscription_period_end TIMESTAMP,
      subscription_end_date TIMESTAMP,
      trial_ends_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create business_hours table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_hours (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      open TEXT,
      close TEXT,
      is_closed BOOLEAN DEFAULT false
    );
  `);

  // Create services table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL,
      duration INTEGER,
      active BOOLEAN DEFAULT true
    );
  `);

  // Create customers table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create staff table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT,
      specialty TEXT,
      bio TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create staff_hours table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_hours (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      is_off BOOLEAN DEFAULT false
    );
  `);

  // Create appointments table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      staff_id INTEGER,
      service_id INTEGER,
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP NOT NULL,
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

  // Create jobs table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      appointment_id INTEGER,
      staff_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      scheduled_date DATE,
      status TEXT DEFAULT 'pending',
      estimated_completion TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create job_line_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_line_items (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL,
      taxable BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create invoices table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      job_id INTEGER,
      invoice_number TEXT NOT NULL,
      amount REAL NOT NULL,
      tax REAL,
      total REAL NOT NULL,
      due_date DATE,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      stripe_payment_intent_id TEXT,
      access_token TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create invoice_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL
    );
  `);

  // Create receptionist_config table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS receptionist_config (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      greeting TEXT,
      after_hours_message TEXT,
      emergency_keywords JSONB,
      voicemail_enabled BOOLEAN DEFAULT true,
      call_recording_enabled BOOLEAN DEFAULT false,
      transcription_enabled BOOLEAN DEFAULT true,
      max_call_length_minutes INTEGER DEFAULT 15,
      transfer_phone_numbers JSONB,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create call_logs table (matches shared/schema.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      caller_id TEXT,
      caller_name TEXT,
      transcript TEXT,
      intent_detected TEXT,
      is_emergency BOOLEAN DEFAULT false,
      call_duration INTEGER,
      recording_url TEXT,
      status TEXT,
      call_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      CONSTRAINT business_provider_unique UNIQUE (business_id, provider)
    );
  `);

  // Create quotes table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      job_id INTEGER,
      quote_number TEXT NOT NULL,
      amount REAL NOT NULL,
      tax REAL,
      total REAL NOT NULL,
      valid_until TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      converted_to_invoice_id INTEGER,
      access_token TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create quote_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL
    );
  `);

  // Create review_settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_settings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      google_review_url TEXT,
      yelp_review_url TEXT,
      facebook_review_url TEXT,
      custom_review_url TEXT,
      review_request_enabled BOOLEAN DEFAULT true,
      auto_send_after_job_completion BOOLEAN DEFAULT true,
      delay_hours_after_completion INTEGER DEFAULT 2,
      sms_template TEXT DEFAULT 'Hi {customerName}! Thank you for choosing {businessName}. We''d love to hear about your experience. Please leave us a review: {reviewLink}',
      email_subject TEXT DEFAULT 'How was your experience with {businessName}?',
      email_template TEXT,
      preferred_platform TEXT DEFAULT 'google',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create review_requests table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_requests (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      job_id INTEGER,
      sent_via TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      platform TEXT,
      review_link TEXT,
      status TEXT DEFAULT 'sent',
      clicked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create recurring_schedules table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_schedules (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      service_id INTEGER,
      staff_id INTEGER,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      interval INTEGER DEFAULT 1,
      day_of_week INTEGER,
      day_of_month INTEGER,
      start_date DATE NOT NULL,
      end_date DATE,
      next_run_date DATE,
      job_title TEXT NOT NULL,
      job_description TEXT,
      estimated_duration INTEGER,
      auto_create_invoice BOOLEAN DEFAULT true,
      invoice_amount REAL,
      invoice_tax REAL,
      invoice_notes TEXT,
      status TEXT DEFAULT 'active',
      last_run_date DATE,
      total_jobs_created INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create recurring_schedule_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_schedule_items (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL
    );
  `);

  // Create recurring_job_history table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_job_history (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      invoice_id INTEGER,
      scheduled_for DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create password_reset_tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create subscription_plans table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      interval TEXT NOT NULL,
      features JSONB,
      stripe_product_id TEXT,
      stripe_price_id TEXT,
      active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
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