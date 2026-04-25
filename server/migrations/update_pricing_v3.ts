import { pool } from '../db';

/**
 * Update overage rates to tiered pricing v3:
 *   Starter: $0.20/min (was $0.05)
 *   Growth:  $0.15/min (was $0.05)
 *   Pro:     $0.10/min (was $0.05)
 *
 * Rationale: $0.05/min was below COGS (Retell + Twilio + LLM ≈ $0.10-0.20/min real cost).
 * Tiered overages create a self-driving upgrade funnel — Starter customers who go over
 * see a higher per-minute rate and are motivated to upgrade to Growth where it's cheaper.
 *
 * Plan base prices, included minutes, and Stripe product/price IDs are unchanged.
 * Only the overage_rate_per_minute column is updated on existing active plan rows.
 */
export async function migrate() {
  try {
    // Check if migration has been applied
    const { rows: migrations } = await pool.query(
      'SELECT name FROM migrations WHERE name = $1',
      ['update_pricing_v3']
    );

    if (migrations.length > 0) {
      console.log('Migration update_pricing_v3 already applied, skipping');
      return;
    }

    console.log('Applying pricing v3 migration (tiered overages)...');

    await pool.query('BEGIN');

    try {
      // Update overage rates on all active rows for each tier (covers monthly + yearly)
      const starterUpdate = await pool.query(`
        UPDATE subscription_plans
        SET overage_rate_per_minute = 0.20
        WHERE plan_tier = 'starter' AND active = true
      `);
      console.log(`Updated ${starterUpdate.rowCount} Starter plan row(s) to $0.20/min overage`);

      const growthUpdate = await pool.query(`
        UPDATE subscription_plans
        SET overage_rate_per_minute = 0.15
        WHERE plan_tier = 'growth' AND active = true
      `);
      console.log(`Updated ${growthUpdate.rowCount} Growth plan row(s) to $0.15/min overage`);

      const proUpdate = await pool.query(`
        UPDATE subscription_plans
        SET overage_rate_per_minute = 0.10
        WHERE plan_tier = 'pro' AND active = true
      `);
      console.log(`Updated ${proUpdate.rowCount} Pro plan row(s) to $0.10/min overage`);

      // Record the migration
      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        ['update_pricing_v3']
      );

      await pool.query('COMMIT');
      console.log('Successfully applied pricing v3 migration');
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Failed to apply pricing v3 migration:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in pricing v3 migration:', error);
    throw error;
  }
}
