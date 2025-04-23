import { db } from '../db';
import { subscriptionPlans } from '@shared/schema';

/**
 * Migration script to add subscription plans to the database.
 * This adds the monthly ($120) and annual ($1,200) subscription plans.
 */
async function addSubscriptionPlans() {
  console.log('Adding subscription plans...');
  
  // Check if plans already exist
  const existingPlans = await db.select().from(subscriptionPlans);
  if (existingPlans.length > 0) {
    console.log('Subscription plans already exist, skipping');
    return;
  }
  
  // Add monthly plan
  const monthlyFeatures = [
    'Unlimited customers',
    'Unlimited jobs and invoices',
    'Virtual receptionist',
    'Calendar integration',
    'QuickBooks integration',
    'Appointment scheduling',
    'Email notifications',
    'Phone call logs',
    'Basic analytics'
  ];
  
  // Add yearly plan
  const yearlyFeatures = [
    'All features from monthly plan',
    'Priority support',
    'Advanced analytics',
    'Custom report generation',
    'Bulk customer import',
    'Customer portal access',
    'White-label emails',
    'API access'
  ];
  
  // Insert plans
  await db.insert(subscriptionPlans).values([
    {
      name: 'Monthly',
      description: 'Monthly subscription plan for small businesses',
      price: 120,
      interval: 'monthly',
      features: monthlyFeatures,
      active: true,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Annual',
      description: 'Annual subscription plan with 17% savings',
      price: 1200,
      interval: 'yearly',
      features: yearlyFeatures,
      active: true,
      sortOrder: 2,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);
  
  console.log('Subscription plans added successfully');
}

// Run the migration
export async function migrate() {
  try {
    await addSubscriptionPlans();
  } catch (error) {
    console.error('Error adding subscription plans:', error);
    throw error;
  }
}

// Allow running directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Subscription plans migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Subscription plans migration failed:', error);
      process.exit(1);
    });
}