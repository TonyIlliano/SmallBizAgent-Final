import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db';
import { migrate as calendarMigration } from './add_calendar_integration';

// Get the directory name for ES modules (replacement for __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run all SQL migration files in the migrations directory
 */
async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
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
    
    // Run TypeScript migrations
    try {
      // Run calendar integration migration
      await calendarMigration();
    } catch (error) {
      console.error('Failed to apply TypeScript migrations:', error);
      throw error;
    }
    
    console.log('All migrations applied successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}

// ES modules don't have a direct equivalent to require.main === module
// This file will only be imported, not run directly, so we don't need that check

export default runMigrations;