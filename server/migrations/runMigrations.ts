import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db';
import { encryptField } from '../utils/encryption';

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
  await addColumnIfNotExists('businesses', 'description', 'TEXT');
  await addColumnIfNotExists('businesses', 'business_hours', 'TEXT');
  await addColumnIfNotExists('businesses', 'twilio_phone_number_status', 'TEXT');
  await addColumnIfNotExists('businesses', 'twilio_date_provisioned', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'call_forwarding_enabled', 'BOOLEAN DEFAULT false');
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
  // Stripe Connect (for receiving customer payments)
  await addColumnIfNotExists('businesses', 'stripe_connect_account_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'stripe_connect_status', "TEXT DEFAULT 'not_connected'");
  await addColumnIfNotExists('businesses', 'twilio_phone_number_sid', 'TEXT');
  await addColumnIfNotExists('businesses', 'provisioning_status', "TEXT DEFAULT 'pending'");
  await addColumnIfNotExists('businesses', 'provisioning_result', 'TEXT');
  await addColumnIfNotExists('businesses', 'provisioning_completed_at', 'TIMESTAMP');
  // Birthday campaign settings
  await addColumnIfNotExists('businesses', 'birthday_campaign_enabled', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('businesses', 'birthday_discount_percent', 'INTEGER DEFAULT 15');
  await addColumnIfNotExists('businesses', 'birthday_coupon_valid_days', 'INTEGER DEFAULT 7');
  await addColumnIfNotExists('businesses', 'birthday_campaign_channel', "TEXT DEFAULT 'both'");
  await addColumnIfNotExists('businesses', 'birthday_campaign_message', 'TEXT');

  // White-label branding colors for public booking pages
  await addColumnIfNotExists('businesses', 'brand_color', 'TEXT');
  await addColumnIfNotExists('businesses', 'accent_color', 'TEXT');

  // Review settings - configurable cooldown per business (restaurants need longer cooldown)
  await addColumnIfNotExists('review_settings', 'review_cooldown_days', 'INTEGER DEFAULT 90');

  // Owner phone for notifications (payment failures, alerts)
  await addColumnIfNotExists('businesses', 'owner_phone', 'TEXT');

  // Email opt-out for drip/marketing emails
  await addColumnIfNotExists('businesses', 'email_opt_out', 'BOOLEAN DEFAULT false');

  // Weather alerts toggle for notification settings
  await addColumnIfNotExists('notification_settings', 'weather_alerts_enabled', 'BOOLEAN DEFAULT true');

  // Inventory alert settings for restaurants
  await addColumnIfNotExists('businesses', 'inventory_alerts_enabled', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('businesses', 'inventory_alert_channel', "TEXT DEFAULT 'both'");
  await addColumnIfNotExists('businesses', 'inventory_default_threshold', 'INTEGER DEFAULT 10');

  // Fix services table
  await addColumnIfNotExists('services', 'active', 'BOOLEAN DEFAULT true');

  // Fix customers table - ensure all columns exist
  await addColumnIfNotExists('customers', 'address', 'TEXT');
  await addColumnIfNotExists('customers', 'city', 'TEXT');
  await addColumnIfNotExists('customers', 'state', 'TEXT');
  await addColumnIfNotExists('customers', 'zip', 'TEXT');
  await addColumnIfNotExists('customers', 'notes', 'TEXT');
  await addColumnIfNotExists('customers', 'birthday', 'TEXT'); // MM-DD format for birthday campaigns
  await addColumnIfNotExists('customers', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfNotExists('customers', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  // SMS consent fields (TCPA compliance)
  await addColumnIfNotExists('customers', 'sms_opt_in', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('customers', 'sms_opt_in_date', 'TIMESTAMP');
  await addColumnIfNotExists('customers', 'sms_opt_in_method', 'TEXT');
  await addColumnIfNotExists('customers', 'marketing_opt_in', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('customers', 'marketing_opt_in_date', 'TIMESTAMP');
  await addColumnIfNotExists('customers', 'tags', 'TEXT'); // JSON array of string tags

  // Fix appointments - ensure all columns exist
  await addColumnIfNotExists('appointments', 'business_id', 'INTEGER NOT NULL');
  await addColumnIfNotExists('appointments', 'customer_id', 'INTEGER NOT NULL');
  await addColumnIfNotExists('appointments', 'staff_id', 'INTEGER');
  await addColumnIfNotExists('appointments', 'service_id', 'INTEGER');
  await addColumnIfNotExists('appointments', 'start_date', 'TIMESTAMP');
  await addColumnIfNotExists('appointments', 'end_date', 'TIMESTAMP');

  // Fix legacy columns: start_time/end_time may exist with NOT NULL from old schema
  // These are no longer used (replaced by start_date/end_date timestamps) so make them nullable
  try {
    await pool.query('ALTER TABLE appointments ALTER COLUMN start_time DROP NOT NULL');
    await pool.query('ALTER TABLE appointments ALTER COLUMN end_time DROP NOT NULL');
  } catch (e: any) {
    // Column might not exist in newer databases - that's fine
    if (!e.message.includes('does not exist')) {
      console.log('Note: Could not alter start_time/end_time:', e.message);
    }
  }
  await addColumnIfNotExists('appointments', 'status', "TEXT DEFAULT 'scheduled'");
  await addColumnIfNotExists('appointments', 'notes', 'TEXT');
  await addColumnIfNotExists('appointments', 'manage_token', 'TEXT');
  await addColumnIfNotExists('appointments', 'google_calendar_event_id', 'TEXT');
  await addColumnIfNotExists('appointments', 'microsoft_calendar_event_id', 'TEXT');
  await addColumnIfNotExists('appointments', 'apple_calendar_event_id', 'TEXT');
  await addColumnIfNotExists('appointments', 'last_synced_at', 'TIMESTAMP');
  await addColumnIfNotExists('appointments', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfNotExists('appointments', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

  // Fix jobs table
  await addColumnIfNotExists('jobs', 'appointment_id', 'INTEGER');
  await addColumnIfNotExists('jobs', 'staff_id', 'INTEGER');
  await addColumnIfNotExists('jobs', 'estimated_completion', 'TIMESTAMP');

  // Fix call_logs table
  await addColumnIfNotExists('call_logs', 'call_duration', 'INTEGER');
  await addColumnIfNotExists('call_logs', 'intent_detected', 'TEXT');
  await addColumnIfNotExists('call_logs', 'is_emergency', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('call_logs', 'recording_url', 'TEXT');
  await addColumnIfNotExists('call_logs', 'call_time', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfNotExists('call_logs', 'caller_id', 'TEXT');
  await addColumnIfNotExists('call_logs', 'caller_name', 'TEXT');
  await addColumnIfNotExists('call_logs', 'status', 'TEXT');
  await addColumnIfNotExists('call_logs', 'transcript', 'TEXT');

  // Backfill any call_logs rows where call_time is NULL (rows inserted before the column existed)
  await pool.query(`UPDATE call_logs SET call_time = CURRENT_TIMESTAMP WHERE call_time IS NULL`);

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
      photo_url TEXT,
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
      voice_id TEXT DEFAULT 'paula',
      assistant_name TEXT DEFAULT 'Alex',
      custom_instructions TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add voice_id, assistant_name, and custom_instructions columns to existing receptionist_config tables
  await addColumnIfNotExists('receptionist_config', 'voice_id', "TEXT DEFAULT 'paula'");
  await addColumnIfNotExists('receptionist_config', 'assistant_name', "TEXT DEFAULT 'Alex'");
  await addColumnIfNotExists('receptionist_config', 'custom_instructions', "TEXT");
  await addColumnIfNotExists('receptionist_config', 'ai_insights_enabled', "BOOLEAN DEFAULT false");

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

  // Fix businesses table - add Clover POS integration columns
  await addColumnIfNotExists('businesses', 'clover_merchant_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'clover_access_token', 'TEXT');
  await addColumnIfNotExists('businesses', 'clover_refresh_token', 'TEXT');
  await addColumnIfNotExists('businesses', 'clover_token_expiry', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'clover_environment', 'TEXT');

  // Fix businesses table - add Square POS integration columns
  await addColumnIfNotExists('businesses', 'square_merchant_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'square_access_token', 'TEXT');
  await addColumnIfNotExists('businesses', 'square_refresh_token', 'TEXT');
  await addColumnIfNotExists('businesses', 'square_token_expiry', 'TIMESTAMP');
  await addColumnIfNotExists('businesses', 'square_location_id', 'TEXT');
  await addColumnIfNotExists('businesses', 'square_environment', 'TEXT');

  // Fix staff table - add user_id for staff portal
  await addColumnIfNotExists('staff', 'user_id', 'INTEGER');

  // Fix staff table - add photo_url for booking page
  await addColumnIfNotExists('staff', 'photo_url', 'TEXT');

  // Create staff_invites table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_invites (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Staff-Service assignments (which services each staff member can perform)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_services (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(staff_id, service_id)
    );
  `);

  // Fix businesses table - add restaurant order type settings
  await addColumnIfNotExists('businesses', 'restaurant_pickup_enabled', 'BOOLEAN DEFAULT true');
  await addColumnIfNotExists('businesses', 'restaurant_delivery_enabled', 'BOOLEAN DEFAULT false');

  // Restaurant reservation configuration columns
  await addColumnIfNotExists('businesses', 'reservation_enabled', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('businesses', 'reservation_max_party_size', 'INTEGER DEFAULT 10');
  await addColumnIfNotExists('businesses', 'reservation_slot_duration_minutes', 'INTEGER DEFAULT 90');
  await addColumnIfNotExists('businesses', 'reservation_max_capacity_per_slot', 'INTEGER DEFAULT 40');
  await addColumnIfNotExists('businesses', 'reservation_lead_time_hours', 'INTEGER DEFAULT 2');
  await addColumnIfNotExists('businesses', 'reservation_max_days_ahead', 'INTEGER DEFAULT 30');

  // Restaurant Reservations table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurant_reservations (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      party_size INTEGER NOT NULL,
      reservation_date TEXT NOT NULL,
      reservation_time TEXT NOT NULL,
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'confirmed',
      special_requests TEXT,
      manage_token TEXT,
      source TEXT DEFAULT 'online',
      vapi_call_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Fix businesses table - add multi-location tracking
  await addColumnIfNotExists('businesses', 'number_of_locations', 'INTEGER DEFAULT 1');

  // Fix users table - add email verification columns
  await addColumnIfNotExists('users', 'email_verified', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('users', 'email_verification_code', 'TEXT');
  await addColumnIfNotExists('users', 'email_verification_expiry', 'TIMESTAMP');
  // Auto-verify existing users who already have a business (so they don't get locked out)
  await pool.query(`UPDATE users SET email_verified = true WHERE business_id IS NOT NULL AND email_verified = false`);

  // Create clover_menu_cache table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clover_menu_cache (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      menu_data JSONB,
      last_synced_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create clover_order_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clover_order_log (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      clover_order_id TEXT,
      caller_phone TEXT,
      caller_name TEXT,
      items JSONB,
      total_amount INTEGER,
      status TEXT DEFAULT 'created',
      vapi_call_id TEXT,
      order_type TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create inventory_items table (POS stock tracking for restaurants)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      pos_item_id TEXT NOT NULL,
      pos_source TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      quantity REAL DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      unit_cost INTEGER,
      price INTEGER,
      track_stock BOOLEAN DEFAULT true,
      last_alert_sent_at TIMESTAMP,
      last_synced_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_id, pos_item_id, pos_source)
    );
  `);

  // Create square_menu_cache table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS square_menu_cache (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      menu_data JSONB,
      last_synced_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create square_order_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS square_order_log (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      square_order_id TEXT,
      caller_phone TEXT,
      caller_name TEXT,
      items JSONB,
      total_amount INTEGER,
      status TEXT DEFAULT 'created',
      vapi_call_id TEXT,
      order_type TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Fix subscription_plans table - add missing columns
  await addColumnIfNotExists('subscription_plans', 'description', 'TEXT');
  await addColumnIfNotExists('subscription_plans', 'stripe_product_id', 'TEXT');
  await addColumnIfNotExists('subscription_plans', 'stripe_price_id', 'TEXT');
  await addColumnIfNotExists('subscription_plans', 'sort_order', 'INTEGER DEFAULT 0');
  await addColumnIfNotExists('subscription_plans', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

  // Ensure subscription plans have required columns
  await addColumnIfNotExists('subscription_plans', 'plan_tier', 'TEXT');
  await addColumnIfNotExists('subscription_plans', 'max_call_minutes', 'INTEGER');
  await addColumnIfNotExists('subscription_plans', 'overage_rate_per_minute', 'REAL');
  await addColumnIfNotExists('subscription_plans', 'max_staff', 'INTEGER');

  // Seed subscription plans if empty
  const plansResult = await pool.query('SELECT COUNT(*) FROM subscription_plans');
  if (parseInt(plansResult.rows[0].count) === 0) {
    console.log('Seeding subscription plans...');
    await pool.query(`
      INSERT INTO subscription_plans (name, description, plan_tier, price, interval, features, max_call_minutes, overage_rate_per_minute, max_staff, active, sort_order) VALUES
      ('Starter', 'Perfect for solo operators', 'starter', 79, 'monthly', '["75 AI receptionist minutes/mo", "Unlimited customers", "Appointment scheduling", "Invoicing & payments", "Email reminders", "Public booking page", "Basic analytics"]', 75, 0.99, 1, true, 1),
      ('Professional', 'Most popular for growing businesses', 'professional', 149, 'monthly', '["200 AI receptionist minutes/mo", "Everything in Starter, plus:", "SMS notifications", "Calendar sync (Google, Apple, Microsoft)", "QuickBooks integration", "Staff scheduling (up to 5)", "Review request automation", "Advanced analytics"]', 200, 0.89, 5, true, 2),
      ('Business', 'For established businesses', 'business', 249, 'monthly', '["500 AI receptionist minutes/mo", "Everything in Professional, plus:", "Up to 15 staff members", "API access & webhooks", "Custom AI receptionist training", "Dedicated onboarding", "Priority support"]', 500, 0.79, 15, true, 3)
    `);
    console.log('Subscription plans seeded');
  }

  // Update existing plans to match current pricing (fixes stale seed data)
  try {
    await pool.query(`
      UPDATE subscription_plans SET
        name = 'Starter',
        description = 'Perfect for solo operators',
        plan_tier = 'starter',
        price = 79,
        features = '["75 AI receptionist minutes/mo", "Unlimited customers", "Appointment scheduling", "Invoicing & payments", "Email reminders", "Public booking page", "Basic analytics"]',
        max_call_minutes = 75,
        overage_rate_per_minute = 0.99,
        max_staff = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE sort_order = 1
    `);
    await pool.query(`
      UPDATE subscription_plans SET
        name = 'Professional',
        description = 'Most popular for growing businesses',
        plan_tier = 'professional',
        price = 149,
        features = '["200 AI receptionist minutes/mo", "Everything in Starter, plus:", "SMS notifications", "Calendar sync (Google, Apple, Microsoft)", "QuickBooks integration", "Staff scheduling (up to 5)", "Review request automation", "Advanced analytics"]',
        max_call_minutes = 200,
        overage_rate_per_minute = 0.89,
        max_staff = 5,
        updated_at = CURRENT_TIMESTAMP
      WHERE sort_order = 2
    `);
    await pool.query(`
      UPDATE subscription_plans SET
        name = 'Business',
        description = 'For established businesses',
        plan_tier = 'business',
        price = 249,
        features = '["500 AI receptionist minutes/mo", "Everything in Professional, plus:", "Up to 15 staff members", "API access & webhooks", "Custom AI receptionist training", "Dedicated onboarding", "Priority support"]',
        max_call_minutes = 500,
        overage_rate_per_minute = 0.79,
        max_staff = 15,
        updated_at = CURRENT_TIMESTAMP
      WHERE sort_order = 3
    `);
    console.log('Subscription plans updated to current pricing');
  } catch (e: any) {
    console.log('Note: Could not update subscription plans:', e.message);
  }

  // Create notification_settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      appointment_confirmation_email BOOLEAN DEFAULT true,
      appointment_confirmation_sms BOOLEAN DEFAULT true,
      appointment_reminder_email BOOLEAN DEFAULT true,
      appointment_reminder_sms BOOLEAN DEFAULT true,
      appointment_reminder_hours INTEGER DEFAULT 24,
      invoice_created_email BOOLEAN DEFAULT true,
      invoice_created_sms BOOLEAN DEFAULT false,
      invoice_reminder_email BOOLEAN DEFAULT true,
      invoice_reminder_sms BOOLEAN DEFAULT true,
      invoice_payment_confirmation_email BOOLEAN DEFAULT true,
      job_completed_email BOOLEAN DEFAULT true,
      job_completed_sms BOOLEAN DEFAULT true,
      weather_alerts_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create notification_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      message TEXT,
      status TEXT DEFAULT 'sent',
      reference_type TEXT,
      reference_id INTEGER,
      error TEXT,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create business_knowledge table (AI Knowledge Base for virtual receptionist)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_knowledge (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      source TEXT NOT NULL,
      is_approved BOOLEAN DEFAULT false,
      priority INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create unanswered_questions table (detected from call transcripts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unanswered_questions (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      call_log_id INTEGER,
      question TEXT NOT NULL,
      context TEXT,
      caller_phone TEXT,
      status TEXT DEFAULT 'pending',
      owner_answer TEXT,
      answered_at TIMESTAMP,
      knowledge_entry_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create website_scrape_cache table (cached website scraping results)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_scrape_cache (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      pages_scraped INTEGER DEFAULT 0,
      raw_content TEXT,
      structured_knowledge JSONB,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      last_scraped_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create ai_suggestions table (weekly auto-refine pipeline suggestions)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      week_start TIMESTAMP NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      current_value TEXT,
      suggested_value TEXT,
      occurrence_count INTEGER DEFAULT 1,
      risk_level TEXT DEFAULT 'low',
      status TEXT DEFAULT 'pending',
      accepted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create agent_settings table (per-business SMS automation agent config)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_settings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      agent_type TEXT NOT NULL,
      enabled BOOLEAN DEFAULT false,
      config JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT agent_settings_business_agent_unique UNIQUE (business_id, agent_type)
    );
  `);

  // Create sms_conversations table (multi-turn SMS thread tracking)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_conversations (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER,
      customer_phone TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      state TEXT NOT NULL DEFAULT 'awaiting_reply',
      context JSONB,
      last_message_sent_at TIMESTAMP,
      last_reply_received_at TIMESTAMP,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create agent_activity_log table (audit trail for agent actions)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_activity_log (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      agent_type TEXT NOT NULL,
      action TEXT NOT NULL,
      customer_id INTEGER,
      reference_type TEXT,
      reference_id INTEGER,
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create quote_follow_ups table (track SMS follow-up attempts on quotes)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_follow_ups (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      attempt_number INTEGER NOT NULL,
      channel TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      message_body TEXT
    );
  `);

  // Create review_responses table (AI-drafted review responses)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_responses (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      review_source TEXT NOT NULL,
      review_id TEXT NOT NULL,
      reviewer_name TEXT,
      review_rating INTEGER,
      review_text TEXT,
      ai_draft_response TEXT,
      final_response TEXT,
      status TEXT DEFAULT 'pending',
      posted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create overage_charges table (tracks automatic overage billing per billing period)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS overage_charges (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      period_start TIMESTAMP NOT NULL,
      period_end TIMESTAMP NOT NULL,
      minutes_used INTEGER NOT NULL,
      minutes_included INTEGER NOT NULL,
      overage_minutes INTEGER NOT NULL,
      overage_rate REAL NOT NULL,
      overage_amount REAL NOT NULL,
      stripe_invoice_id TEXT,
      stripe_invoice_url TEXT,
      status TEXT DEFAULT 'pending',
      failure_reason TEXT,
      plan_name TEXT,
      plan_tier TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT overage_charges_unique_period UNIQUE (business_id, period_start)
    );
  `);

  // Create webhooks table (for Zapier/external integrations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      events JSONB NOT NULL,
      secret TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      description TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add source column to webhooks if it doesn't exist
  await pool.query(`ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';`);

  // Create webhook_deliveries table (audit trail)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id SERIAL PRIMARY KEY,
      webhook_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      payload JSONB,
      status TEXT DEFAULT 'pending',
      response_code INTEGER,
      response_body TEXT,
      attempts INTEGER DEFAULT 0,
      last_attempt_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create marketing_campaigns table (AI marketing tab)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      segment TEXT,
      template TEXT NOT NULL,
      subject TEXT,
      status TEXT DEFAULT 'draft',
      recipient_count INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create api_keys table (for Zapier and external integrations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      last_used_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // === Multi-Line Phone Support & Multi-Location ===

  // Add new columns to businesses table for multi-location
  await addColumnIfNotExists('businesses', 'business_group_id', 'INTEGER');
  await addColumnIfNotExists('businesses', 'location_label', 'TEXT');
  await addColumnIfNotExists('businesses', 'is_active', 'BOOLEAN DEFAULT true');

  // Add phone tracking columns to call_logs
  await addColumnIfNotExists('call_logs', 'phone_number_id', 'INTEGER');
  await addColumnIfNotExists('call_logs', 'phone_number_used', 'TEXT');

  // Create business_groups table (organizations that own multiple locations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT DEFAULT 'inactive',
      billing_email TEXT,
      multi_location_discount_percent INTEGER DEFAULT 20,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create business_phone_numbers table (multiple Twilio numbers per business)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_phone_numbers (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      twilio_phone_number TEXT NOT NULL,
      twilio_phone_number_sid TEXT NOT NULL,
      vapi_phone_number_id TEXT,
      label TEXT,
      status TEXT DEFAULT 'active',
      is_primary BOOLEAN DEFAULT false,
      date_provisioned TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create user_business_access table (many-to-many for multi-location)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_business_access (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      role TEXT DEFAULT 'owner',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT user_business_unique UNIQUE (user_id, business_id)
    );
  `);

  // Backfill user_business_access from existing users.business_id
  await pool.query(`
    INSERT INTO user_business_access (user_id, business_id, role)
    SELECT id, business_id, COALESCE(role, 'user')
    FROM users
    WHERE business_id IS NOT NULL
    ON CONFLICT (user_id, business_id) DO NOTHING;
  `);

  // Backfill business_phone_numbers from existing businesses.twilio_phone_number
  await pool.query(`
    INSERT INTO business_phone_numbers (business_id, twilio_phone_number, twilio_phone_number_sid, vapi_phone_number_id, status, is_primary, date_provisioned)
    SELECT id, twilio_phone_number, twilio_phone_number_sid, vapi_phone_number_id,
           COALESCE(twilio_phone_number_status, 'active'), true, twilio_date_provisioned
    FROM businesses
    WHERE twilio_phone_number IS NOT NULL AND twilio_phone_number_sid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM business_phone_numbers bpn
      WHERE bpn.business_id = businesses.id AND bpn.twilio_phone_number_sid = businesses.twilio_phone_number_sid
    );
  `);

  // Onboarding completion tracking
  await addColumnIfNotExists('users', 'onboarding_complete', 'BOOLEAN DEFAULT false');

  // Mark existing users with a businessId as having completed onboarding
  try {
    await pool.query(`
      UPDATE users SET onboarding_complete = true
      WHERE business_id IS NOT NULL AND onboarding_complete = false
    `);
  } catch (e: any) {
    console.log('Note: Could not backfill onboarding_complete:', e.message);
  }

  // Setup checklist dismissed tracking (replaces localStorage)
  await addColumnIfNotExists('users', 'setup_checklist_dismissed', 'BOOLEAN DEFAULT false');

  // Feature discovery tips dismissed tracking
  await addColumnIfNotExists('users', 'dismissed_tips', 'TEXT');

  // Create SMS suppression list table (TCPA compliance - global opt-out enforcement)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_suppression_list (
      id SERIAL PRIMARY KEY,
      phone_number TEXT NOT NULL,
      business_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      source TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT sms_suppression_phone_business_idx UNIQUE (phone_number, business_id)
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
      description TEXT,
      business_hours TEXT,
      twilio_phone_number TEXT,
      twilio_phone_number_sid TEXT,
      twilio_phone_number_status TEXT,
      twilio_date_provisioned TIMESTAMP,
      vapi_assistant_id TEXT,
      vapi_phone_number_id TEXT,
      receptionist_enabled BOOLEAN DEFAULT true,
      provisioning_status TEXT DEFAULT 'pending',
      provisioning_result TEXT,
      provisioning_completed_at TIMESTAMP,
      quickbooks_realm_id TEXT,
      quickbooks_access_token TEXT,
      quickbooks_refresh_token TEXT,
      quickbooks_token_expiry TIMESTAMP,
      clover_merchant_id TEXT,
      clover_access_token TEXT,
      clover_refresh_token TEXT,
      clover_token_expiry TIMESTAMP,
      clover_environment TEXT,
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
      user_id INTEGER,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT,
      specialty TEXT,
      bio TEXT,
      photo_url TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create staff_invites table (for staff portal invitations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_invites (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      manage_token TEXT,
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
      voice_id TEXT DEFAULT 'paula',
      assistant_name TEXT DEFAULT 'Alex',
      custom_instructions TEXT,
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

  // Ensure columns exist (may be missing if table was created by an older migration)
  await pool.query(`
    ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_duration INTEGER;
  `);
  await pool.query(`
    ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
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

  // Create notification_settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      appointment_confirmation_email BOOLEAN DEFAULT true,
      appointment_confirmation_sms BOOLEAN DEFAULT true,
      appointment_reminder_email BOOLEAN DEFAULT true,
      appointment_reminder_sms BOOLEAN DEFAULT true,
      appointment_reminder_hours INTEGER DEFAULT 24,
      invoice_created_email BOOLEAN DEFAULT true,
      invoice_created_sms BOOLEAN DEFAULT false,
      invoice_reminder_email BOOLEAN DEFAULT true,
      invoice_reminder_sms BOOLEAN DEFAULT true,
      invoice_payment_confirmation_email BOOLEAN DEFAULT true,
      job_completed_email BOOLEAN DEFAULT true,
      job_completed_sms BOOLEAN DEFAULT true,
      weather_alerts_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create notification_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      customer_id INTEGER,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      message TEXT,
      status TEXT DEFAULT 'sent',
      reference_type TEXT,
      reference_id INTEGER,
      error TEXT,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create inventory_items table (POS stock tracking for restaurants)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      pos_item_id TEXT NOT NULL,
      pos_source TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      quantity REAL DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      unit_cost INTEGER,
      price INTEGER,
      track_stock BOOLEAN DEFAULT true,
      last_alert_sent_at TIMESTAMP,
      last_synced_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_id, pos_item_id, pos_source)
    );
  `);

  // Create clover_menu_cache table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clover_menu_cache (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      menu_data JSONB,
      last_synced_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create clover_order_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clover_order_log (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      clover_order_id TEXT,
      caller_phone TEXT,
      caller_name TEXT,
      items JSONB,
      total_amount INTEGER,
      status TEXT DEFAULT 'created',
      vapi_call_id TEXT,
      order_type TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create webhooks table (for Zapier/external integrations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      events JSONB NOT NULL,
      secret TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      description TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create webhook_deliveries table (audit trail)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id SERIAL PRIMARY KEY,
      webhook_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      payload JSONB,
      status TEXT DEFAULT 'pending',
      response_code INTEGER,
      response_body TEXT,
      attempts INTEGER DEFAULT 0,
      last_attempt_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create marketing_campaigns table (AI marketing tab)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      segment TEXT,
      template TEXT NOT NULL,
      subject TEXT,
      status TEXT DEFAULT 'draft',
      recipient_count INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create api_keys table (for Zapier and external integrations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      last_used_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create overage_charges table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS overage_charges (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      period_start TIMESTAMP NOT NULL,
      period_end TIMESTAMP NOT NULL,
      minutes_used INTEGER NOT NULL,
      minutes_included INTEGER NOT NULL,
      overage_minutes INTEGER NOT NULL,
      overage_rate REAL NOT NULL,
      overage_amount REAL NOT NULL,
      stripe_invoice_id TEXT,
      stripe_invoice_url TEXT,
      status TEXT DEFAULT 'pending',
      failure_reason TEXT,
      plan_name TEXT,
      plan_tier TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT overage_charges_unique_period UNIQUE (business_id, period_start)
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
 * Create database performance indexes.
 * Uses CREATE INDEX IF NOT EXISTS so it's safe to run multiple times.
 */
async function createPerformanceIndexes() {
  console.log('Creating performance indexes...');

  const indexes = [
    // ── Phase 1: business_id indexes (critical for tenant isolation) ──
    'CREATE INDEX IF NOT EXISTS idx_appointments_business_id ON appointments (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_business_id ON jobs (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_business_id ON invoices (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_call_logs_business_id ON call_logs (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_quotes_business_id ON quotes (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_notification_log_business_id ON notification_log (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_staff_business_id ON staff (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_services_business_id ON services (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_business_hours_business_id ON business_hours (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_business_id ON marketing_campaigns (business_id)',

    // ── Phase 2: Composite indexes for common query patterns ──
    'CREATE INDEX IF NOT EXISTS idx_appointments_biz_status_date ON appointments (business_id, status, start_date)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_biz_customer ON appointments (business_id, customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_biz_status ON jobs (business_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_biz_status_created ON invoices (business_id, status, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_customers_biz_created ON customers (business_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_customers_biz_birthday ON customers (business_id, birthday)',
    'CREATE INDEX IF NOT EXISTS idx_call_logs_biz_time ON call_logs (business_id, call_time)',
    'CREATE INDEX IF NOT EXISTS idx_quotes_biz_status ON quotes (business_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_staff_biz_active ON staff (business_id, active)',
    'CREATE INDEX IF NOT EXISTS idx_notification_log_biz_customer ON notification_log (business_id, customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_reservations_biz_date_status ON restaurant_reservations (business_id, reservation_date, status)',

    // ── Phase 3: Foreign key indexes ──
    'CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments (customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_staff_id ON appointments (staff_id)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON jobs (customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices (customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_job_line_items_job_id ON job_line_items (job_id)',
    'CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items (invoice_id)',
    'CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items (quote_id)',
    'CREATE INDEX IF NOT EXISTS idx_staff_hours_staff_id ON staff_hours (staff_id)',
    'CREATE INDEX IF NOT EXISTS idx_staff_services_staff_id ON staff_services (staff_id)',
    'CREATE INDEX IF NOT EXISTS idx_review_requests_business_id ON review_requests (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_items_business_id ON inventory_items (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_items_biz_source ON inventory_items (business_id, pos_source)',
    'CREATE INDEX IF NOT EXISTS idx_ai_suggestions_business_id ON ai_suggestions (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_suggestions_biz_status ON ai_suggestions (business_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_agent_settings_business_id ON agent_settings (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_sms_conversations_phone_biz_state ON sms_conversations (customer_phone, business_id, state)',
    'CREATE INDEX IF NOT EXISTS idx_sms_conversations_business_id ON sms_conversations (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_activity_log_biz_agent_created ON agent_activity_log (business_id, agent_type, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_quote_follow_ups_quote_id ON quote_follow_ups (quote_id)',
    'CREATE INDEX IF NOT EXISTS idx_review_responses_business_id ON review_responses (business_id)',

    // ── Phase 4: Date indexes for range queries ──
    'CREATE INDEX IF NOT EXISTS idx_appointments_start_date ON appointments (start_date)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_call_logs_call_time ON call_logs (call_time)',

    // ── Phase 5: Token/lookup indexes ──
    'CREATE INDEX IF NOT EXISTS idx_appointments_manage_token ON appointments (manage_token)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_access_token ON invoices (access_token)',
    'CREATE INDEX IF NOT EXISTS idx_quotes_access_token ON quotes (access_token)',
    'CREATE INDEX IF NOT EXISTS idx_reservations_manage_token ON restaurant_reservations (manage_token)',
    'CREATE INDEX IF NOT EXISTS idx_businesses_booking_slug ON businesses (booking_slug)',

    // ── Phase 6: Multi-line & multi-location indexes ──
    'CREATE INDEX IF NOT EXISTS idx_business_phone_numbers_business_id ON business_phone_numbers (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_business_phone_numbers_twilio_number ON business_phone_numbers (twilio_phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_business_phone_numbers_sid ON business_phone_numbers (twilio_phone_number_sid)',
    'CREATE INDEX IF NOT EXISTS idx_businesses_business_group_id ON businesses (business_group_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_business_access_user_id ON user_business_access (user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_business_access_business_id ON user_business_access (business_id)',
    'CREATE INDEX IF NOT EXISTS idx_business_groups_owner_user_id ON business_groups (owner_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_call_logs_phone_number_id ON call_logs (phone_number_id)',

    // ── Phase 7: SMS suppression list (TCPA compliance) ──
    'CREATE INDEX IF NOT EXISTS idx_sms_suppression_phone_business ON sms_suppression_list (phone_number, business_id)',
  ];

  let created = 0;
  for (const sql of indexes) {
    try {
      await pool.query(sql);
      created++;
    } catch (err: any) {
      // Skip if table doesn't exist yet (some tables may not be used by all deployments)
      if (!err.message.includes('does not exist')) {
        console.log(`Note: Could not create index: ${err.message}`);
      }
    }
  }

  console.log(`Performance indexes checked: ${created}/${indexes.length} applied`);
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

    // Run tiered subscription plans migration
    try {
      const { migrate: migrateTieredPlans } = await import('./add_tiered_subscription_plans.js');
      await migrateTieredPlans();
    } catch (error) {
      console.error('Error running tiered subscription plans migration:', error);
    }

    // Run updated subscription plan pricing migration
    try {
      const { migrate: migrateUpdatedPricing } = await import('./update_subscription_plan_pricing.js');
      await migrateUpdatedPricing();
    } catch (error) {
      console.error('Error running updated subscription plan pricing migration:', error);
    }

    // Security hardening: 2FA, audit logs, data retention
    await addSecurityTables();

    // Encrypt existing plaintext sensitive data (idempotent)
    await encryptExistingPlaintextData();

    // Create performance indexes
    await createPerformanceIndexes();

    console.log('All migrations applied successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}

/**
 * Security hardening: 2FA fields, audit logs table, data retention fields
 */
async function addSecurityTables() {
  console.log('Adding security hardening tables and columns...');

  const addColumnIfNotExists = async (table: string, column: string, type: string) => {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    } catch (e: any) {
      if (!e.message.includes('already exists')) {
        console.log(`Note: Could not add ${column} to ${table}: ${e.message}`);
      }
    }
  };

  // 2FA fields on users table
  await addColumnIfNotExists('users', 'two_factor_secret', 'TEXT');
  await addColumnIfNotExists('users', 'two_factor_enabled', 'BOOLEAN DEFAULT false');
  await addColumnIfNotExists('users', 'two_factor_backup_codes', 'TEXT');

  // Data retention fields on businesses table
  await addColumnIfNotExists('businesses', 'data_retention_days', 'INTEGER DEFAULT 365');
  await addColumnIfNotExists('businesses', 'call_recording_retention_days', 'INTEGER DEFAULT 90');

  // Audit logs table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        business_id INTEGER,
        action TEXT NOT NULL,
        resource TEXT,
        resource_id INTEGER,
        details JSONB,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Performance indexes for audit log queries
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id ON audit_logs(business_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`);
    console.log('Security tables and columns added successfully');
  } catch (error) {
    console.error('Error creating audit_logs table:', error);
  }
}

/**
 * Encrypt existing plaintext sensitive data in the database.
 * This migration is idempotent — it checks if values are already encrypted
 * (by looking for the 'enc:' prefix) and skips them if so.
 * Safe to re-run on every deployment.
 */
async function encryptExistingPlaintextData() {
  console.log('Checking for plaintext sensitive data to encrypt...');

  let totalEncrypted = 0;

  try {
    // 1. Encrypt business OAuth tokens and API keys
    const businessFields = [
      'quickbooks_access_token', 'quickbooks_refresh_token',
      'clover_access_token', 'clover_refresh_token',
      'square_access_token', 'square_refresh_token',
      'heartland_api_key'
    ];

    const { rows: allBusinesses } = await pool.query(
      'SELECT id, ' + businessFields.join(', ') + ' FROM businesses'
    );

    for (const biz of allBusinesses) {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const field of businessFields) {
        const value = biz[field];
        if (value && typeof value === 'string' && !value.startsWith('enc:')) {
          updates.push(`${field} = $${paramIdx}`);
          values.push(encryptField(value));
          paramIdx++;
        }
      }

      if (updates.length > 0) {
        values.push(biz.id);
        await pool.query(
          `UPDATE businesses SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
          values
        );
        totalEncrypted += updates.length;
      }
    }

    // 2. Encrypt calendar integration tokens
    const { rows: calIntegrations } = await pool.query(
      'SELECT id, access_token, refresh_token FROM calendar_integrations'
    );

    for (const cal of calIntegrations) {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (cal.access_token && typeof cal.access_token === 'string' && !cal.access_token.startsWith('enc:')) {
        updates.push(`access_token = $${paramIdx}`);
        values.push(encryptField(cal.access_token));
        paramIdx++;
      }
      if (cal.refresh_token && typeof cal.refresh_token === 'string' && !cal.refresh_token.startsWith('enc:')) {
        updates.push(`refresh_token = $${paramIdx}`);
        values.push(encryptField(cal.refresh_token));
        paramIdx++;
      }

      if (updates.length > 0) {
        values.push(cal.id);
        await pool.query(
          `UPDATE calendar_integrations SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
          values
        );
        totalEncrypted += updates.length;
      }
    }

    // 3. Encrypt webhook secrets
    try {
      const { rows: allWebhooks } = await pool.query('SELECT id, secret FROM webhooks');
      for (const wh of allWebhooks) {
        if (wh.secret && typeof wh.secret === 'string' && !wh.secret.startsWith('enc:')) {
          await pool.query(
            'UPDATE webhooks SET secret = $1 WHERE id = $2',
            [encryptField(wh.secret), wh.id]
          );
          totalEncrypted++;
        }
      }
    } catch (e: any) {
      // webhooks table may not exist yet
      if (!e.message.includes('does not exist')) {
        console.error('Error encrypting webhook secrets:', e.message);
      }
    }

    // 4. Encrypt 2FA secrets
    const { rows: usersWithTwoFa } = await pool.query(
      'SELECT id, two_factor_secret FROM users WHERE two_factor_secret IS NOT NULL'
    );

    for (const u of usersWithTwoFa) {
      if (u.two_factor_secret && typeof u.two_factor_secret === 'string' && !u.two_factor_secret.startsWith('enc:')) {
        await pool.query(
          'UPDATE users SET two_factor_secret = $1 WHERE id = $2',
          [encryptField(u.two_factor_secret), u.id]
        );
        totalEncrypted++;
      }
    }

    if (totalEncrypted > 0) {
      console.log(`Encrypted ${totalEncrypted} plaintext sensitive field(s) in the database`);
    } else {
      console.log('No plaintext sensitive data found — all fields are already encrypted or empty');
    }
  } catch (error) {
    console.error('Error during plaintext data encryption migration:', error);
    // Non-fatal — don't throw. The application can still function with plaintext data
    // since the decrypt function is backward-compatible.
  }
}

// ES modules don't have a direct equivalent to require.main === module
// This file will only be imported, not run directly, so we don't need that check

export default runMigrations;