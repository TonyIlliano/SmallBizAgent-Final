-- Add access token column to quotes table for customer portal access
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS access_token TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quotes_access_token ON quotes(access_token);
