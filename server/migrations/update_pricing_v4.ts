import { pool } from '../db';

/**
 * Remove "QuickBooks integration" and "Social media content pipeline" lines
 * from existing subscription_plans.features rows.
 *
 * Why: QuickBooks integration is not yet approved for production use by Intuit.
 * Social media generation is currently admin-only (platform admin generates +
 * approves posts), not exposed to customers. Listing either as a feature is
 * false advertising — paying customers would expect functionality they can't access.
 *
 * Both will be added back to their respective tiers (QuickBooks → Growth,
 * Social Media → Pro) when they're genuinely customer-ready.
 *
 * No schema change. Just removes specific feature strings from existing rows.
 */
export async function migrate() {
  try {
    const { rows: migrations } = await pool.query(
      'SELECT name FROM migrations WHERE name = $1',
      ['update_pricing_v4']
    );

    if (migrations.length > 0) {
      console.log('Migration update_pricing_v4 already applied, skipping');
      return;
    }

    console.log('Applying pricing v4 migration (remove QuickBooks + Social Media feature strings)...');

    await pool.query('BEGIN');

    try {
      // Strip both legacy "(Coming Soon)" suffix and now the entire feature line.
      // PostgreSQL JSONB doesn't have built-in element-removal that's robust across formats,
      // so we cast to text, regex out the unwanted lines (with optional comma), and cast back.
      // The regex handles: leading/trailing comma cases and the legacy " (Coming Soon)" suffix.
      const stripQuickBooks = await pool.query(`
        UPDATE subscription_plans
        SET features = (
          REGEXP_REPLACE(
            REGEXP_REPLACE(features::text, ',\\s*"QuickBooks integration[^"]*"', '', 'g'),
            '"QuickBooks integration[^"]*",?\\s*', '', 'g'
          )
        )::jsonb
        WHERE features::text ILIKE '%QuickBooks integration%'
      `);
      console.log(`Removed "QuickBooks integration" from ${stripQuickBooks.rowCount} plan row(s)`);

      const stripSocial = await pool.query(`
        UPDATE subscription_plans
        SET features = (
          REGEXP_REPLACE(
            REGEXP_REPLACE(features::text, ',\\s*"Social media content pipeline[^"]*"', '', 'g'),
            '"Social media content pipeline[^"]*",?\\s*', '', 'g'
          )
        )::jsonb
        WHERE features::text ILIKE '%Social media content pipeline%'
      `);
      console.log(`Removed "Social media content pipeline" from ${stripSocial.rowCount} plan row(s)`);

      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        ['update_pricing_v4']
      );

      await pool.query('COMMIT');
      console.log('Successfully applied pricing v4 migration');
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Failed to apply pricing v4 migration:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in pricing v4 migration:', error);
    throw error;
  }
}
