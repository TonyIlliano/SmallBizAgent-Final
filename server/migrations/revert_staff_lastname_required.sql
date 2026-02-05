-- Revert last_name to required - helps AI distinguish between staff with same first name
-- First update any empty values
UPDATE staff SET last_name = 'Unknown' WHERE last_name IS NULL OR last_name = '';
-- Then make it required again
ALTER TABLE staff ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE staff ALTER COLUMN last_name DROP DEFAULT;
