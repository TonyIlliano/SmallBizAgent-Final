-- Add access_token column to invoices for customer portal access
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS access_token TEXT;

-- Add index for faster lookups by access token
CREATE INDEX IF NOT EXISTS idx_invoices_access_token ON invoices(access_token);
