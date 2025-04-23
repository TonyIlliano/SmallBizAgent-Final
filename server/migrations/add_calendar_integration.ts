import { db } from '../db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrate() {
  try {
    console.log('Running calendar integration migration...');

    // First, check if migration already applied
    const migrationExists = await db.execute(sql`
      SELECT * FROM migrations WHERE name = 'add_calendar_integration'
    `);
    
    if (migrationExists.rows.length > 0) {
      console.log('Migration add_calendar_integration already applied, skipping');
      return;
    }

    // Create calendar_integrations table
    await db.execute(sql`
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

    // Add calendar-related fields to appointments table
    await db.execute(sql`
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
    `);
    
    await db.execute(sql`
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS microsoft_calendar_event_id TEXT;
    `);
    
    await db.execute(sql`
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS apple_calendar_event_id TEXT;
    `);
    
    await db.execute(sql`
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
    `);

    // Create calendar directories if they don't exist
    const calendarDirs = [
      path.join(__dirname, '../../public'),
      path.join(__dirname, '../../public/calendar'),
      path.join(__dirname, '../../public/calendar/subscriptions'),
      path.join(__dirname, '../../public/calendar/events'),
    ];

    for (const dir of calendarDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Record migration in migrations table
    await db.execute(sql`
      INSERT INTO migrations (name) VALUES ('add_calendar_integration')
    `);

    console.log('Calendar integration migration completed successfully');
  } catch (error) {
    console.error('Error running calendar integration migration:', error);
    throw error;
  }
}