-- Add type and timezone columns to businesses table for virtual receptionist
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';
