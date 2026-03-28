import { pool } from '../db';

/**
 * Update subscription plans to new pricing structure v2:
 * Starter ($149/mo, $1,429/yr), Growth ($299/mo, $2,869/yr), Pro ($449/mo, $4,309/yr)
 * Renames: Professional → Growth, Business → Pro
 * All tiers now use $0.05/min overage (previously $0.99/$0.89/$0.79)
 * Minutes: 150/300/500 (previously 75/200/500)
 */
export async function migrate() {
  try {
    // Check if migration has been applied
    const { rows: migrations } = await pool.query(
      'SELECT name FROM migrations WHERE name = $1',
      ['update_pricing_v2']
    );

    if (migrations.length > 0) {
      console.log('Migration update_pricing_v2 already applied, skipping');
      return;
    }

    console.log('Applying pricing v2 migration...');

    // Begin transaction
    await pool.query('BEGIN');

    try {
      // Deactivate all existing plans
      await pool.query(`UPDATE subscription_plans SET active = false`);

      // Starter Monthly - $149/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Starter',
          'Perfect for solo operators',
          'starter',
          149,
          'monthly',
          $1,
          150,
          0.05,
          1,
          true,
          10
        )
      `, [JSON.stringify([
        '150 AI receptionist minutes/mo',
        'Unlimited customers',
        'Appointment scheduling',
        'Invoicing & payments',
        'Email reminders',
        'Public booking page',
        'Basic analytics'
      ])]);

      // Growth Monthly - $299/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Growth',
          'Most popular for growing businesses',
          'growth',
          299,
          'monthly',
          $1,
          300,
          0.05,
          5,
          true,
          20
        )
      `, [JSON.stringify([
        '300 AI receptionist minutes/mo',
        'Everything in Starter, plus:',
        'SMS automation suite',
        'Google Business Profile sync',
        'Calendar sync (Google, Apple, Microsoft)',
        'Staff scheduling (up to 5)',
        'Website chat widget',
        'Advanced analytics + call transcripts',
        'QuickBooks integration (Coming Soon)'
      ])]);

      // Pro Monthly - $449/mo
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Pro',
          'For established businesses',
          'pro',
          449,
          'monthly',
          $1,
          500,
          0.05,
          15,
          true,
          30
        )
      `, [JSON.stringify([
        '500 AI receptionist minutes/mo',
        'Everything in Growth, plus:',
        'Up to 3 locations',
        'Up to 15 staff members',
        'API access & webhooks',
        'Custom AI receptionist training',
        'Dedicated onboarding',
        'Priority support',
        'White-label ready',
        'Social media content pipeline (Coming Soon)'
      ])]);

      // Starter Annual - $1,429/yr ($119.08/mo)
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Starter',
          'Perfect for solo operators',
          'starter',
          1429,
          'yearly',
          $1,
          150,
          0.05,
          1,
          true,
          11
        )
      `, [JSON.stringify([
        '150 AI receptionist minutes/mo',
        'Unlimited customers',
        'Appointment scheduling',
        'Invoicing & payments',
        'Email reminders',
        'Public booking page',
        'Basic analytics'
      ])]);

      // Growth Annual - $2,869/yr ($239.08/mo)
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Growth',
          'Most popular for growing businesses',
          'growth',
          2869,
          'yearly',
          $1,
          300,
          0.05,
          5,
          true,
          21
        )
      `, [JSON.stringify([
        '300 AI receptionist minutes/mo',
        'Everything in Starter, plus:',
        'SMS automation suite',
        'Google Business Profile sync',
        'Calendar sync (Google, Apple, Microsoft)',
        'Staff scheduling (up to 5)',
        'Website chat widget',
        'Advanced analytics + call transcripts',
        'QuickBooks integration (Coming Soon)'
      ])]);

      // Pro Annual - $4,309/yr ($359.08/mo)
      await pool.query(`
        INSERT INTO subscription_plans (
          name, description, plan_tier, price, interval, features,
          max_call_minutes, overage_rate_per_minute, max_staff,
          active, sort_order
        ) VALUES (
          'Pro',
          'For established businesses',
          'pro',
          4309,
          'yearly',
          $1,
          500,
          0.05,
          15,
          true,
          31
        )
      `, [JSON.stringify([
        '500 AI receptionist minutes/mo',
        'Everything in Growth, plus:',
        'Up to 3 locations',
        'Up to 15 staff members',
        'API access & webhooks',
        'Custom AI receptionist training',
        'Dedicated onboarding',
        'Priority support',
        'White-label ready',
        'Social media content pipeline (Coming Soon)'
      ])]);

      // Record the migration
      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        ['update_pricing_v2']
      );

      // Commit transaction
      await pool.query('COMMIT');
      console.log('Successfully applied pricing v2 migration');
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      console.error('Failed to apply pricing v2 migration:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in pricing v2 migration:', error);
    throw error;
  }
}
