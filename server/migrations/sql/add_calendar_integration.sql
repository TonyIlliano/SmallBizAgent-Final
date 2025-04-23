-- Add calendar_integrations table
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

-- Add calendar-related fields to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS microsoft_calendar_event_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS apple_calendar_event_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- Add directory for calendar files
INSERT INTO migrations (name, executed_at) VALUES ('add_calendar_integration.sql', CURRENT_TIMESTAMP);