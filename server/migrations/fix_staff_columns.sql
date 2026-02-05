-- Ensure specialty and bio columns exist on staff table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff' AND column_name = 'specialty') THEN
        ALTER TABLE staff ADD COLUMN specialty TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff' AND column_name = 'bio') THEN
        ALTER TABLE staff ADD COLUMN bio TEXT;
    END IF;
END $$;
