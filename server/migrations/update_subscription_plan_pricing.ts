import { pool } from '../db';

/**
 * Update subscription plans to new pricing structure:
 * Starter ($79/mo, $759/yr), Professional ($149/mo, $1429/yr), Business ($249/mo, $2389/yr)
 * Removes Enterprise tier. Adds annual billing options.
 */
export async function migrate() {
  try {
    // Check if migration has been applied
    const { rows: migrations } = await pool.query(
      'SELECT name FROM migrations WHERE name = $1',
      ['update_subscription_plan_pricing']
    );

    if (migrations.length > 0) {
      console.log('Migration update_subscription_plan_pricing already applied, skipping');
      return;
    }

    console.log('Applying updated subscription plan pricing migration...');

    // Begin transaction
    await pool.query('BEGIN');

    try {
      // Deactivate all existing plans
      await pool.query(`UPDATE subscription_plans SET active = false`);

      // Starter Monthly - $79/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Starter',
          'Perfect for solo operators',
          'starter',
          79,
          'monthly',
          $1,
          75,
          0.99,
          1,
          true,
          10
        )
      `, [JSON.stringify([
        '75 AI receptionist minutes/mo',
        'Unlimited customers',
        'Appointment scheduling',
        'Invoicing & payments',
        'Email reminders',
        'Public booking page',
        'Basic analytics'
      ])]);

      // Professional Monthly - $149/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Professional',
          'Most popular for growing businesses',
          'professional',
          149,
          'monthly',
          $1,
          200,
          0.89,
          5,
          true,
          20
        )
      `, [JSON.stringify([
        '200 AI receptionist minutes/mo',
        'Everything in Starter, plus:',
        'SMS notifications',
        'Calendar sync (Google, Apple, Microsoft)',
        'QuickBooks integration',
        'Staff scheduling (up to 5)',
        'Review request automation',
        'Advanced analytics'
      ])]);

      // Business Monthly - $249/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Business',
          'For multi-location businesses',
          'business',
          249,
          'monthly',
          $1,
          500,
          0.79,
          15,
          true,
          30
        )
      `, [JSON.stringify([
        '500 AI receptionist minutes/mo',
        'Everything in Professional, plus:',
        'Multiple locations',
        'API access & webhooks',
        'Custom integrations',
        'Dedicated onboarding',
        'Priority support'
      ])]);

      // Starter Annual - $759/yr ($63.25/mo)
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Starter',
          'Perfect for solo operators',
          'starter',
          759,
          'yearly',
          $1,
          75,
          0.99,
          1,
          true,
          11
        )
      `, [JSON.stringify([
        '75 AI receptionist minutes/mo',
        'Unlimited customers',
        'Appointment scheduling',
        'Invoicing & payments',
        'Email reminders',
        'Public booking page',
        'Basic analytics'
      ])]);

      // Professional Annual - $1429/yr ($119.08/mo)
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Professional',
          'Most popular for growing businesses',
          'professional',
          1429,
          'yearly',
          $1,
          200,
          0.89,
          5,
          true,
          21
        )
      `, [JSON.stringify([
        '200 AI receptionist minutes/mo',
        'Everything in Starter, plus:',
        'SMS notifications',
        'Calendar sync (Google, Apple, Microsoft)',
        'QuickBooks integration',
        'Staff scheduling (up to 5)',
        'Review request automation',
        'Advanced analytics'
      ])]);

      // Business Annual - $2389/yr ($199.08/mo)
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Business',
          'For multi-location businesses',
          'business',
          2389,
          'yearly',
          $1,
          500,
          0.79,
          15,
          true,
          31
        )
      `, [JSON.stringify([
        '500 AI receptionist minutes/mo',
        'Everything in Professional, plus:',
        'Multiple locations',
        'API access & webhooks',
        'Custom integrations',
        'Dedicated onboarding',
        'Priority support'
      ])]);

      // Record the migration
      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        ['update_subscription_plan_pricing']
      );

      // Commit transaction
      await pool.query('COMMIT');
      console.log('Successfully applied updated subscription plan pricing migration');
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      console.error('Failed to apply updated subscription plan pricing migration:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in updated subscription plan pricing migration:', error);
    throw error;
  }
}
