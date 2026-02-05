-- Make last_name optional for staff (many barbers/stylists go by first name only)
ALTER TABLE staff ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE staff ALTER COLUMN last_name SET DEFAULT '';
