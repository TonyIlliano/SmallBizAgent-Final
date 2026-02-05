-- Add booking configuration columns to businesses table for customer self-booking
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_slug TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_lead_time_hours INTEGER DEFAULT 24;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_buffer_minutes INTEGER DEFAULT 15;

-- Create unique index for booking slug lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_booking_slug ON businesses(booking_slug) WHERE booking_slug IS NOT NULL;
