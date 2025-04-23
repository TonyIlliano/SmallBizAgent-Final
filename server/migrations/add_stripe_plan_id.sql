-- Add stripe_plan_id column to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_plan_id INTEGER;

-- Add subscription_period_end column to businesses table if it doesn't exist already
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMP;