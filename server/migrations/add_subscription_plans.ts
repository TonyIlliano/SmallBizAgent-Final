import { pool } from '../db';

/**
 * Seed subscription plans in the database
 */
export async function migrate() {
  try {
    // Check if migration has been applied
    const { rows: migrations } = await pool.query(
      'SELECT name FROM migrations WHERE name = $1',
      ['add_subscription_plans']
    );
    
    if (migrations.length > 0) {
      console.log('Migration add_subscription_plans already applied, skipping');
      return;
    }
    
    console.log('Applying subscription plans migration...');
    
    // Begin transaction
    await pool.query('BEGIN');
    
    try {
      // Check if any subscription plans already exist
      const { rows: existingPlans } = await pool.query(
        'SELECT COUNT(*) FROM subscription_plans'
      );
      
      if (Number(existingPlans[0].count) === 0) {
        // Insert monthly plan
        await pool.query(`
          INSERT INTO subscription_plans (
            name, 
            description, 
            price, 
            interval, 
            features, 
            active, 
            sort_order
          ) VALUES (
            'Monthly Plan', 
            'Professional plan with all features, billed monthly', 
            120, 
            'monthly', 
            $1, 
            true, 
            10
          )
        `, [JSON.stringify([
          'Virtual receptionist with AI capabilities',
          'Unlimited customers and jobs',
          'Invoice creation and management',
          'Calendar integration',
          'Appointment scheduling',
          'QuickBooks integration',
          'Email and SMS notifications',
          'Customer portal access',
          'Standard analytics and reporting'
        ])]);
        
        // Insert annual plan
        await pool.query(`
          INSERT INTO subscription_plans (
            name, 
            description, 
            price, 
            interval, 
            features, 
            active, 
            sort_order
          ) VALUES (
            'Annual Plan', 
            'Professional plan with all features, billed annually (save 16.7%)', 
            1200, 
            'annual', 
            $1, 
            true, 
            20
          )
        `, [JSON.stringify([
          'Virtual receptionist with AI capabilities',
          'Unlimited customers and jobs',
          'Invoice creation and management',
          'Calendar integration',
          'Appointment scheduling',
          'QuickBooks integration',
          'Email and SMS notifications',
          'Customer portal access',
          'Advanced analytics and reporting',
          'Priority support',
          'Custom virtual receptionist training'
        ])]);
        
        console.log('Added subscription plans');
      } else {
        console.log('Subscription plans already exist, skipping insertion');
      }
      
      // Record the migration
      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        ['add_subscription_plans']
      );
      
      // Commit transaction
      await pool.query('COMMIT');
      console.log('Successfully applied subscription plans migration');
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      console.error('Failed to apply subscription plans migration:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in subscription plans migration:', error);
    throw error;
  }
}

// ES modules don't have a direct equivalent to require.main === module
// This file will only be imported, not run directly