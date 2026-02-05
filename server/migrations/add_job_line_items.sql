-- Add job_line_items table for tracking labor, parts, and materials on jobs
CREATE TABLE IF NOT EXISTS job_line_items (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- labor, parts, materials, service
  description TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL, -- quantity * unit_price
  taxable BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add index for faster lookups by job
CREATE INDEX IF NOT EXISTS idx_job_line_items_job_id ON job_line_items(job_id);
