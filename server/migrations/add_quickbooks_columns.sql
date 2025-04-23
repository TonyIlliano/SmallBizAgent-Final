-- Add QuickBooks integration columns to businesses table

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS quickbooks_realm_id TEXT,
ADD COLUMN IF NOT EXISTS quickbooks_access_token TEXT,
ADD COLUMN IF NOT EXISTS quickbooks_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS quickbooks_token_expiry TIMESTAMP;