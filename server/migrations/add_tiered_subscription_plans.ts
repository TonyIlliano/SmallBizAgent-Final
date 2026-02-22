import { pool } from '../db';

/**
 * Add tiered subscription plans with AI minute limits
 * Plans: Starter ($49), Professional ($99), Business ($199), Enterprise ($399)
 */
export async function migrate() {
  try {
    // Check if migration has been applied
    const { rows: migrations } = await pool.query(
      'SELECT name FROM migrations WHERE name = $1',
      ['add_tiered_subscription_plans']
    );

    if (migrations.length > 0) {
      console.log('Migration add_tiered_subscription_plans already applied, skipping');
      return;
    }

    console.log('Applying tiered subscription plans migration...');

    // Begin transaction
    await pool.query('BEGIN');

    try {
      // Add new columns to subscription_plans if they don't exist
      await pool.query(`
        ALTER TABLE subscription_plans
        ADD COLUMN IF NOT EXISTS plan_tier TEXT,
        ADD COLUMN IF NOT EXISTS max_call_minutes INTEGER,
        ADD COLUMN IF NOT EXISTS overage_rate_per_minute REAL,
        ADD COLUMN IF NOT EXISTS max_staff INTEGER
      `);

      // Deactivate old plans
      await pool.query(`UPDATE subscription_plans SET active = false`);

      // Insert new tiered plans
      // Starter - $49/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Starter',
          'Perfect for solo service providers getting started',
          'starter',
          49,
          'monthly',
          $1,
          100,
          0.15,
          1,
          true,
          10
        )
      `, [JSON.stringify([
        '100 AI receptionist minutes/mo',
        'Unlimited customers',
        'Appointment scheduling',
        'Invoice & quote creation',
        'Email notifications',
        'Customer portal',
        'Public booking page',
        'Basic analytics'
      ])]);

      // Professional - $99/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Professional',
          'For growing businesses that need more power',
          'professional',
          99,
          'monthly',
          $1,
          300,
          0.12,
          5,
          true,
          20
        )
      `, [JSON.stringify([
        '300 AI receptionist minutes/mo',
        'Everything in Starter, plus:',
        'SMS notifications',
        'Calendar sync (Google, Microsoft, Apple)',
        'QuickBooks integration',
        'Recurring jobs & invoices',
        'Review request automation',
        'Up to 5 staff members',
        'Advanced analytics'
      ])]);

      // Business - $199/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Business',
          'For busy businesses and restaurants',
          'business',
          199,
          'monthly',
          $1,
          1000,
          0.10,
          15,
          true,
          30
        )
      `, [JSON.stringify([
        '1,000 AI receptionist minutes/mo',
        'Everything in Professional, plus:',
        'Clover & Square POS integration',
        'Stripe Connect (accept payments)',
        'Custom AI receptionist training',
        'Up to 15 staff members',
        'Priority support',
        'Website scraping for AI knowledge'
      ])]);

      // Enterprise - $399/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Enterprise',
          'For high-volume businesses and multi-location operations',
          'enterprise',
          399,
          'monthly',
          $1,
          3000,
          0.08,
          NULL,
          true,
          40
        )
      `, [JSON.stringify([
        '3,000 AI receptionist minutes/mo',
        'Everything in Business, plus:',
        'Unlimited staff members',
        'Multi-location support',
        'Dedicated account manager',
        'Custom integrations',
        'White-glove onboarding',
        'SLA guarantee'
      ])]);

      // Record the migration
      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        ['add_tiered_subscription_plans']
      );

      // Commit transaction
      await pool.query('COMMIT');
      console.log('Successfully applied tiered subscription plans migration');
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      console.error('Failed to apply tiered subscription plans migration:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in tiered subscription plans migration:', error);
    throw error;
  }
}
