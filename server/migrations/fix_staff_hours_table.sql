-- Ensure staff_hours table exists with correct columns
CREATE TABLE IF NOT EXISTS staff_hours (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  is_off BOOLEAN DEFAULT false
);

-- Add is_off column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_hours' AND column_name = 'is_off') THEN
        ALTER TABLE staff_hours ADD COLUMN is_off BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_staff_hours_staff_id ON staff_hours(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_hours_day ON staff_hours(day);
