import { db } from '../db';
import { subscriptionPlans } from '@shared/schema';
import { stripe } from '../services/subscriptionService';

/**
 * Seed the database with subscription plans
 */
export async function seedSubscriptionPlans() {
  console.log('Creating subscription plans...');
  
  try {
    // Check if plans already exist
    const existingPlans = await db.select().from(subscriptionPlans);
    if (existingPlans.length > 0) {
      console.log('Subscription plans already exist, skipping seed');
      return;
    }

    // Create Monthly Plan
    const monthlyProduct = await stripe.products.create({
      name: 'SmallBizAgent Standard (Monthly)',
      description: 'Monthly subscription for SmallBizAgent with all features included',
      active: true,
    });

    const monthlyPrice = await stripe.prices.create({
      product: monthlyProduct.id,
      unit_amount: 12000, // $120.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });

    // Create Annual Plan
    const annualProduct = await stripe.products.create({
      name: 'SmallBizAgent Standard (Annual)',
      description: 'Annual subscription for SmallBizAgent with all features included - save 17%',
      active: true,
    });

    const annualPrice = await stripe.prices.create({
      product: annualProduct.id,
      unit_amount: 120000, // $1,200.00
      currency: 'usd',
      recurring: {
        interval: 'year',
      },
    });

    // Insert plans into database
    await db.insert(subscriptionPlans).values([
      {
        name: 'Monthly Plan',
        description: 'Full access to all SmallBizAgent features billed monthly',
        price: 120,
        interval: 'monthly',
        features: JSON.stringify([
          'Virtual Receptionist',
          'Appointment Scheduling',
          'Job Management',
          'Customer Management',
          'Invoice Management',
          'Calendar Integration',
          'QuickBooks Integration',
          'Phone Number Included',
          'Email Support'
        ]),
        stripeProductId: monthlyProduct.id,
        stripePriceId: monthlyPrice.id,
        active: true,
        sortOrder: 1,
      },
      {
        name: 'Annual Plan',
        description: 'Full access to all SmallBizAgent features billed annually (save 17%)',
        price: 1200,
        interval: 'yearly',
        features: JSON.stringify([
          'Virtual Receptionist',
          'Appointment Scheduling',
          'Job Management',
          'Customer Management',
          'Invoice Management',
          'Calendar Integration',
          'QuickBooks Integration',
          'Phone Number Included',
          'Priority Support',
          'Annual Business Review'
        ]),
        stripeProductId: annualProduct.id,
        stripePriceId: annualPrice.id,
        active: true,
        sortOrder: 2,
      }
    ]);

    console.log('Successfully created subscription plans');
  } catch (error) {
    console.error('Error creating subscription plans:', error);
    throw error;
  }
}