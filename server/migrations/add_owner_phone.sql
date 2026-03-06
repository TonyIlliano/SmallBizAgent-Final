-- Add owner_phone column to businesses table
-- Used for owner notifications (payment failures, account alerts) separate from the business phone
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_phone TEXT;
