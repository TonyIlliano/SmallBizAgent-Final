/**
 * Stripe service for integrating with Stripe API
 * 
 * This service handles all interactions with Stripe for:
 * - Creating payment intents
 * - Processing payments
 * - Managing invoices
 */

import Stripe from 'stripe';

// Initialize Stripe lazily — no hardcoded fallback keys
let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set — cannot perform Stripe operations');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    });
  }
  return stripe;
}

/**
 * Create a payment intent for processing a payment
 * 
 * @param amount Amount in dollars (will be converted to cents)
 * @param currency Currency code (default: usd)
 * @param metadata Additional metadata for the payment
 * @returns Promise with payment intent
 */
export async function createPaymentIntent(
  amount: number, 
  currency: string = 'usd',
  metadata: Record<string, string> = {}
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be a positive finite number');
  }
  if (amount < 0.50) {
    throw new Error('Payment amount must be at least $0.50 (Stripe minimum)');
  }
  if (amount > 999_999.99) {
    throw new Error('Payment amount exceeds maximum allowed ($999,999.99)');
  }

  try {
    // Convert dollar amount to cents
    const amountInCents = Math.round(amount * 100);
    
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountInCents,
      currency,
      metadata
    });
    
    return paymentIntent;
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
}

/**
 * Retrieve a payment intent by ID
 * 
 * @param paymentIntentId Payment intent ID
 * @returns Promise with payment intent
 */
export async function getPaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    throw error;
  }
}

/**
 * Create a customer in Stripe
 * 
 * @param email Customer email
 * @param name Customer name
 * @param phone Customer phone number
 * @param metadata Additional metadata
 * @returns Promise with customer
 */
export async function createCustomer(
  email: string,
  name: string,
  phone?: string,
  metadata: Record<string, string> = {}
) {
  try {
    const customer = await getStripe().customers.create({
      email,
      name,
      phone,
      metadata
    });
    
    return customer;
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
}

/**
 * Create an invoice for a customer
 * 
 * @param customerId Stripe customer ID
 * @param description Invoice description
 * @param amount Amount in dollars
 * @param metadata Additional metadata
 * @returns Promise with invoice
 */
export async function createInvoice(
  customerId: string,
  description: string,
  amount: number,
  metadata: Record<string, string> = {}
) {
  try {
    // First create an invoice item
    const invoiceItem = await getStripe().invoiceItems.create({
      customer: customerId,
      amount: Math.round(amount * 100),
      currency: 'usd',
      description
    });
    
    // Create the invoice with the item
    const invoice = await getStripe().invoices.create({
      customer: customerId,
      description,
      metadata,
      auto_advance: true // Auto-finalize the invoice
    });
    
    return invoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

/**
 * Process a webhook event from Stripe
 * 
 * @param signature Stripe signature header
 * @param payload Raw request body
 * @param webhookSecret Webhook secret for verification
 * @returns Processed event
 */
export function handleWebhookEvent(
  signature: string,
  payload: string | Buffer,
  webhookSecret?: string
) {
  if (!webhookSecret) {
    const envSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!envSecret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    webhookSecret = envSecret;
  }

  try {
    const event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );

    return event;
  } catch (error) {
    console.error('Error processing webhook:', error);
    throw error;
  }
}

export { getStripe };

export default {
  get stripe() { return getStripe(); },
  getStripe,
  createPaymentIntent,
  getPaymentIntent,
  createCustomer,
  createInvoice,
  handleWebhookEvent
};
