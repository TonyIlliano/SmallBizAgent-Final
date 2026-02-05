-- Add Vapi.ai columns to businesses table
-- For AI-powered voice receptionist integration

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_hours TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS vapi_phone_number_id TEXT;
