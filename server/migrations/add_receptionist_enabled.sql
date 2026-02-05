-- Add receptionist_enabled column to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS receptionist_enabled BOOLEAN DEFAULT true;
