-- Migration to add Twilio phone number columns to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS twilio_phone_number TEXT,
ADD COLUMN IF NOT EXISTS twilio_phone_number_sid TEXT,
ADD COLUMN IF NOT EXISTS twilio_phone_number_status TEXT,
ADD COLUMN IF NOT EXISTS twilio_date_provisioned TIMESTAMP;