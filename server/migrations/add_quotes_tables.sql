-- Create quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  job_id INTEGER,
  quote_number TEXT NOT NULL,
  amount REAL NOT NULL,
  tax REAL,
  total REAL NOT NULL,
  valid_until DATE,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  converted_to_invoice_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create quote_items table
CREATE TABLE IF NOT EXISTS quote_items (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL
);