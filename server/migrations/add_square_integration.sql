-- Add Square POS integration columns to businesses table

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS square_merchant_id TEXT,
ADD COLUMN IF NOT EXISTS square_access_token TEXT,
ADD COLUMN IF NOT EXISTS square_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS square_token_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS square_location_id TEXT,
ADD COLUMN IF NOT EXISTS square_environment TEXT;

-- Square Menu Cache (synced from Square POS — one row per business)
CREATE TABLE IF NOT EXISTS square_menu_cache (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  menu_data JSONB,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Square Order Log (records of orders placed via AI → Square API)
CREATE TABLE IF NOT EXISTS square_order_log (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  square_order_id TEXT,
  caller_phone TEXT,
  caller_name TEXT,
  items JSONB,
  total_amount INTEGER,
  status TEXT DEFAULT 'created',
  vapi_call_id TEXT,
  order_type TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
