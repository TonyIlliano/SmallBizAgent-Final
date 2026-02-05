-- Drop and recreate staff_hours table with correct schema
DROP TABLE IF EXISTS staff_hours CASCADE;

CREATE TABLE staff_hours (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  is_off BOOLEAN DEFAULT false
);

-- Create indexes
CREATE INDEX idx_staff_hours_staff_id ON staff_hours(staff_id);
CREATE INDEX idx_staff_hours_day ON staff_hours(day);
