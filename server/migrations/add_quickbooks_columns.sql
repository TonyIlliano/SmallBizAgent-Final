-- Add QuickBooks integration columns to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS quickbooks_realm_id TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS quickbooks_access_token TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS quickbooks_refresh_token TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS quickbooks_token_expiry TIMESTAMP;