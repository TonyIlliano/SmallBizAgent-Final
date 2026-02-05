-- Add specialty and bio columns to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS bio TEXT;

-- Create staff_hours table for individual staff schedules
CREATE TABLE IF NOT EXISTS staff_hours (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  is_off BOOLEAN DEFAULT false
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_staff_hours_staff_id ON staff_hours(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_hours_day ON staff_hours(day);
