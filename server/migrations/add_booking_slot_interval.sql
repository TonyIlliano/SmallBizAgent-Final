-- Add booking slot interval configuration
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_slot_interval_minutes INTEGER DEFAULT 30;
