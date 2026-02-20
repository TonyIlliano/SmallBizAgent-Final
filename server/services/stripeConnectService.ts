import { businesses } from '@shared/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

// Initialize Stripe
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY not configured - Stripe Connect will not work');
}

const stripe = stripeKey ? new Stripe(stripeKey) : null;

// Platform fee percentage (2.5%)
const PLATFORM_FEE_PERCENT = 2.5;

export class StripeConnectService {
  /**
   * Create a Stripe Connect Express account for a business and return the onboarding URL
   */
  async createConnectAccount(businessId: number): Promise<{ url: string }> {
    if (!stripe) throw new Error('Stripe is not configured');

    const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!business || business.length === 0) {
      throw new Error('Business not found');
    }

    const businessRecord = business[0];

    // If already has an account, just create a new onboarding link
    if (businessRecord.stripeConnectAccountId) {
      const accountLink = await this.createOnboardingLink(businessRecord.stripeConnectAccountId, businessId);
      return { url: accountLink.url };
    }

    // Create Express account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'company',
      metadata: {
        businessId: businessId.toString(),
        platform: 'SmallBizAgent',
      },
    });

    // Save account ID to database
    await db.update(businesses)
      .set({
        stripeConnectAccountId: account.id,
        stripeConnectStatus: 'onboarding',
      })
      .where(eq(businesses.id, businessId));

    // Create onboarding link
    const accountLink = await this.createOnboardingLink(account.id, businessId);
    return { url: accountLink.url };
  }

  /**
   * Create an onboarding link for an existing Connect account
   */
  private async createOnboardingLink(accountId: string, businessId: number): Promise<Stripe.AccountLink> {
    if (!stripe) throw new Error('Stripe is not configured');

    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

    return stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/settings?tab=integrations&stripe_connect=refresh`,
      return_url: `${baseUrl}/settings?tab=integrations&stripe_connect=return`,
      type: 'account_onboarding',
    });
  }

  /**
   * Get the Connect account status for a business
   */
  async getConnectStatus(businessId: number): Promise<{
    status: string;
    accountId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  }> {
    if (!stripe) throw new Error('Stripe is not configured');

    const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!business || business.length === 0) {
      throw new Error('Business not found');
    }

    const businessRecord = business[0];

    if (!businessRecord.stripeConnectAccountId) {
      return {
        status: 'not_connected',
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      };
    }

    try {
      // Fetch live status from Stripe
      const account = await stripe.accounts.retrieve(businessRecord.stripeConnectAccountId);

      // Determine status
      let status = 'onboarding';
      if (account.charges_enabled && account.payouts_enabled) {
        status = 'active';
      } else if (account.details_submitted) {
        status = 'pending_verification';
      }

      // Sync status to database if changed
      if (businessRecord.stripeConnectStatus !== status) {
        await db.update(businesses)
          .set({ stripeConnectStatus: status })
          .where(eq(businesses.id, businessId));
      }

      return {
        status,
        accountId: businessRecord.stripeConnectAccountId,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
      };
    } catch (error) {
      console.error('Error fetching Stripe Connect account:', error);
      return {
        status: businessRecord.stripeConnectStatus || 'not_connected',
        accountId: businessRecord.stripeConnectAccountId,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      };
    }
  }

  /**
   * Create a Stripe Express dashboard login link for a connected business
   */
  async createDashboardLink(businessId: number): Promise<{ url: string }> {
    if (!stripe) throw new Error('Stripe is not configured');

    const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!business || business.length === 0) {
      throw new Error('Business not found');
    }

    const businessRecord = business[0];
    if (!businessRecord.stripeConnectAccountId) {
      throw new Error('Business does not have a connected Stripe account');
    }

    const loginLink = await stripe.accounts.createLoginLink(businessRecord.stripeConnectAccountId);
    return { url: loginLink.url };
  }

  /**
   * Create a payment intent for an invoice WITH destination charge to the business's Connect account.
   * CRITICAL: This REJECTS if the business has no active Connect account.
   * No money should ever flow to the platform from customer invoice payments.
   */
  async createPaymentIntentForInvoice(params: {
    amount: number; // in dollars
    businessId: number;
    invoiceId: number;
    invoiceNumber: string;
    customerName: string;
    isPortalPayment?: boolean;
  }): Promise<{ clientSecret: string; paymentIntentId: string }> {
    if (!stripe) throw new Error('Stripe is not configured');

    const business = await db.select().from(businesses).where(eq(businesses.id, params.businessId)).limit(1);
    if (!business || business.length === 0) {
      throw new Error('Business not found');
    }

    const businessRecord = business[0];

    // CRITICAL: Block payment if no active Connect account
    if (!businessRecord.stripeConnectAccountId || businessRecord.stripeConnectStatus !== 'active') {
      throw new Error(
        'PAYMENT_BLOCKED: This business has not connected their Stripe account. ' +
        'Online payments are not available until the business completes Stripe Connect setup.'
      );
    }

    const amountInCents = Math.round(params.amount * 100);
    const applicationFee = Math.round(amountInCents * (PLATFORM_FEE_PERCENT / 100));

    // Create payment intent with destination charge
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      application_fee_amount: applicationFee,
      transfer_data: {
        destination: businessRecord.stripeConnectAccountId,
      },
      metadata: {
        invoiceId: params.invoiceId.toString(),
        invoiceNumber: params.invoiceNumber,
        customerName: params.customerName,
        businessId: params.businessId.toString(),
        portalPayment: params.isPortalPayment ? 'true' : 'false',
        platformFeePercent: PLATFORM_FEE_PERCENT.toString(),
      },
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * Handle Stripe Connect account.updated webhook event
   * Syncs the account status from Stripe to our database
   */
  async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    if (!account.id) return;

    // Find the business with this Connect account ID
    const business = await db.select().from(businesses)
      .where(eq(businesses.stripeConnectAccountId, account.id))
      .limit(1);

    if (!business || business.length === 0) {
      console.warn(`Received account.updated for unknown Connect account: ${account.id}`);
      return;
    }

    // Determine new status
    let status = 'onboarding';
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'active';
    } else if (account.details_submitted) {
      status = 'pending_verification';
    }

    // Update database
    await db.update(businesses)
      .set({ stripeConnectStatus: status })
      .where(eq(businesses.id, business[0].id));

    console.log(`Updated Stripe Connect status for business ${business[0].id}: ${status}`);
  }
}

// Export singleton instance
export const stripeConnectService = new StripeConnectService();
