/**
 * Membership Billing Service (Step 4 of HVAC roadmap)
 *
 * All Stripe operations for memberships run on the OWNER's Connect account,
 * NOT on the platform Stripe account. The owner collects 100% of membership
 * revenue minus a platform application fee (matches the existing pattern
 * in stripeConnectService.ts for one-time invoice payments).
 *
 * Critical structural facts:
 *
 * 1. Stripe Products + Prices are CREATED ON the Connect account. Every API
 *    call passes `{ stripeAccount: business.stripeConnectAccountId }` as the
 *    Stripe-Account header. Without that header the Product gets created on
 *    the platform account, the customer enrollment fails, and we end up
 *    with orphaned platform Products.
 *
 * 2. Stripe Customers for membership enrollment live on the OWNER's account
 *    too — we store the resulting ID in `customers.stripeCustomerConnectId`.
 *    This is intentionally different from `customers.stripeCustomerId`
 *    (which doesn't exist today but would be the platform customer ID).
 *
 * 3. Webhook events from connected accounts come with a top-level `account`
 *    field on the event payload. We look up the business by that account ID
 *    when processing membership-related webhook events.
 *
 * 4. The Stripe Product + Price are CREATED LAZILY — the first time a plan
 *    is used for enrollment, we create them. This avoids creating Stripe
 *    objects for draft plans the owner is still tweaking. Once created, the
 *    IDs are cached on the membership_plans row.
 *
 * 5. Plan EDITS (name, price) do NOT update the Stripe Price — Stripe
 *    Prices are immutable. Instead we create a NEW Price object and update
 *    the cached stripePriceId; existing subscriptions keep billing at the
 *    OLD Price until they renew, at which point the next billing cycle
 *    picks up the new one. (Or the owner can migrate them manually.)
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { businesses, membershipPlans } from "@shared/schema";
import type { MembershipPlan, CustomerMembership } from "@shared/schema";
import { storage } from "../storage";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

// Platform application fee on every recurring invoice. Matches the
// one-time payment fee in stripeConnectService.ts so the owner sees a
// consistent take rate across both flows.
const PLATFORM_FEE_PERCENT = 1.5;

// ──────────────────────────────────────────────────────────────────────
// Product + Price creation (lazy, on first enrollment)
// ──────────────────────────────────────────────────────────────────────

interface PlanIds {
  stripeProductId: string;
  stripePriceId: string;
}

/**
 * Returns the Stripe Product + Price IDs for a plan, creating them on the
 * owner's Connect account if they don't exist yet. Caches the IDs on the
 * membership_plans row so subsequent enrollments skip the API calls.
 *
 * Throws when:
 *   - Stripe isn't configured (no STRIPE_SECRET_KEY)
 *   - The business has no Connect account (or it's not 'active')
 */
export async function ensurePlanProductAndPrice(
  plan: MembershipPlan,
): Promise<PlanIds> {
  if (!stripe) throw new Error("Stripe is not configured");

  // Fast path — already created
  if (plan.stripeProductId && plan.stripePriceId) {
    return {
      stripeProductId: plan.stripeProductId,
      stripePriceId: plan.stripePriceId,
    };
  }

  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, plan.businessId))
    .limit(1);

  if (!biz) throw new Error("Business not found");
  if (!biz.stripeConnectAccountId || biz.stripeConnectStatus !== "active") {
    throw new Error(
      "MEMBERSHIP_BLOCKED: This business has not connected their Stripe account. " +
        "Membership enrollment is not available until the business completes Stripe Connect setup.",
    );
  }

  const stripeAccount = biz.stripeConnectAccountId;
  const amountInCents = Math.round(Number(plan.priceMonthly) * 100);

  let productId = plan.stripeProductId;
  if (!productId) {
    const product = await stripe.products.create(
      {
        name: plan.name,
        description: plan.description || undefined,
        metadata: {
          membershipPlanId: String(plan.id),
          businessId: String(plan.businessId),
        },
      },
      { stripeAccount },
    );
    productId = product.id;
  }

  const price = await stripe.prices.create(
    {
      unit_amount: amountInCents,
      currency: "usd",
      recurring: { interval: plan.billingInterval as "month" | "year" },
      product: productId,
      metadata: {
        membershipPlanId: String(plan.id),
        businessId: String(plan.businessId),
      },
    },
    { stripeAccount },
  );

  // Cache the IDs on our row
  await db
    .update(membershipPlans)
    .set({
      stripeProductId: productId,
      stripePriceId: price.id,
      updatedAt: new Date(),
    })
    .where(eq(membershipPlans.id, plan.id));

  return { stripeProductId: productId, stripePriceId: price.id };
}

// ──────────────────────────────────────────────────────────────────────
// Customer subscription lifecycle
// ──────────────────────────────────────────────────────────────────────

/**
 * Enrolls a customer in a plan. Creates a Stripe Customer on the owner's
 * Connect account (if not already present), creates a Subscription with
 * the platform application fee, and returns the Stripe Subscription ID so
 * the caller can persist it on the customer_memberships row.
 *
 * IMPORTANT: This does NOT collect a payment method. The caller is
 * responsible for that step (e.g., the customer detail page shows a Stripe
 * Elements form during enrollment, the SetupIntent attaches the PM to the
 * Connect-account Stripe Customer, then this function is called to create
 * the subscription).
 *
 * Returns:
 *   { stripeSubscriptionId, stripeCustomerConnectId }
 *
 * Throws on Stripe failure or missing Connect account — the route should
 * catch and surface a friendly error.
 */
export async function createSubscriptionForCustomer(params: {
  businessId: number;
  planId: number;
  customerId: number;
  customerEmail: string | null;
  customerName: string;
  // If the customer already has a Stripe Connect customer record, pass it.
  // Otherwise we create a fresh one.
  existingStripeCustomerConnectId?: string | null;
  // If the customer already has a payment method attached, pass the PM ID
  // so we set it as the default on the new subscription.
  defaultPaymentMethodId?: string | null;
}): Promise<{
  stripeSubscriptionId: string;
  stripeCustomerConnectId: string;
  nextBillingDate: Date;
}> {
  if (!stripe) throw new Error("Stripe is not configured");

  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, params.businessId))
    .limit(1);
  if (!biz?.stripeConnectAccountId || biz.stripeConnectStatus !== "active") {
    throw new Error(
      "MEMBERSHIP_BLOCKED: Business Connect account is not active",
    );
  }
  const stripeAccount = biz.stripeConnectAccountId;

  const plan = await storage.getMembershipPlanById(params.planId, params.businessId);
  if (!plan) throw new Error("Plan not found");
  if (!plan.active) throw new Error("Plan is inactive");

  // Ensure Product + Price exist on the Connect account
  const { stripePriceId } = await ensurePlanProductAndPrice(plan);

  // Ensure Stripe Customer exists on the Connect account
  let stripeCustomerConnectId = params.existingStripeCustomerConnectId || undefined;
  if (!stripeCustomerConnectId) {
    const customer = await stripe.customers.create(
      {
        email: params.customerEmail || undefined,
        name: params.customerName,
        metadata: {
          ourCustomerId: String(params.customerId),
          businessId: String(params.businessId),
        },
      },
      { stripeAccount },
    );
    stripeCustomerConnectId = customer.id;
  }

  // Create the subscription with platform application fee
  const subscription = await stripe.subscriptions.create(
    {
      customer: stripeCustomerConnectId,
      items: [{ price: stripePriceId }],
      application_fee_percent: PLATFORM_FEE_PERCENT,
      default_payment_method: params.defaultPaymentMethodId || undefined,
      metadata: {
        membershipPlanId: String(params.planId),
        ourCustomerId: String(params.customerId),
        businessId: String(params.businessId),
      },
      // Without a payment_behavior override, Stripe will attempt to charge
      // the default PM immediately. If there's no PM, the subscription gets
      // created with status='incomplete' and we'll get a webhook later when
      // a PM is attached. The route is responsible for the PM flow.
      payment_behavior: params.defaultPaymentMethodId ? "default_incomplete" : "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    },
    { stripeAccount },
  );

  // Stripe's `current_period_end` is a Unix timestamp in seconds. Cast via
  // `as any` because the Stripe SDK types don't always expose the period
  // fields cleanly across versions.
  const nextBilling = new Date(
    Number((subscription as any).current_period_end || 0) * 1000,
  );

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerConnectId,
    nextBillingDate: nextBilling.getTime() > 0 ? nextBilling : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Cancels the Stripe Subscription on the owner's Connect account. We use
 * "cancel at period end" semantics — the customer keeps their benefits
 * until the next billing date, then the membership lapses. Matches the
 * FTC click-to-cancel pattern used for the platform subscription.
 *
 * If `immediately` is true, cancels right now (admin override).
 */
export async function cancelSubscriptionForMembership(
  membership: CustomerMembership,
  options?: { immediately?: boolean },
): Promise<void> {
  if (!stripe) throw new Error("Stripe is not configured");
  if (!membership.stripeSubscriptionId) {
    // No Stripe sub to cancel — this happens for hand-rolled memberships
    // or test fixtures. Nothing to do.
    return;
  }

  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, membership.businessId))
    .limit(1);
  if (!biz?.stripeConnectAccountId) {
    console.warn(
      `[membershipBilling] Cancel: business ${membership.businessId} has no Connect account; skipping Stripe call`,
    );
    return;
  }

  if (options?.immediately) {
    await stripe.subscriptions.cancel(membership.stripeSubscriptionId, {
      stripeAccount: biz.stripeConnectAccountId,
    });
  } else {
    await stripe.subscriptions.update(
      membership.stripeSubscriptionId,
      { cancel_at_period_end: true },
      { stripeAccount: biz.stripeConnectAccountId },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Webhook handlers (called by the Connect webhook route)
// ──────────────────────────────────────────────────────────────────────

/**
 * Generic dispatcher — called by the Connect webhook route after signature
 * verification. Only handles events that affect membership_memberships;
 * everything else is logged and ignored.
 *
 * Idempotency: each handler is safe to call multiple times with the same
 * event. invoice.paid resets benefit counters to the plan defaults
 * (idempotent), invoice.payment_failed sets status='past_due' (idempotent),
 * subscription.deleted sets status='canceled' (idempotent).
 */
export async function handleMembershipConnectWebhook(
  event: Stripe.Event,
): Promise<{ handled: boolean; reason?: string }> {
  switch (event.type) {
    case "invoice.paid":
      return handleInvoicePaid(event);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event);
    default:
      return { handled: false, reason: `Unhandled event type: ${event.type}` };
  }
}

async function handleInvoicePaid(
  event: Stripe.Event,
): Promise<{ handled: boolean; reason?: string }> {
  const invoice = event.data.object as Stripe.Invoice;
  // `subscription` on an invoice is the Stripe Sub ID for recurring invoices
  const subId = (invoice as any).subscription as string | null;
  if (!subId) return { handled: false, reason: "No subscription on invoice" };

  const membership = await storage.getMembershipByStripeSubId(subId);
  if (!membership) {
    return {
      handled: false,
      reason: `No membership found for Stripe sub ${subId}`,
    };
  }

  // Reset benefit counters to plan defaults; mark as active + renewed
  const plan = await storage.getMembershipPlanById(
    membership.planId,
    membership.businessId,
  );
  if (!plan) {
    return { handled: false, reason: "Membership plan not found" };
  }

  // Advance next billing date (Stripe's period_end on the next sub fetch
  // would be authoritative, but the invoice already tells us the period)
  const periodEnd = (invoice as any).lines?.data?.[0]?.period?.end as number | undefined;
  const nextBilling = periodEnd
    ? new Date(periodEnd * 1000)
    : (() => {
        const d = new Date();
        if (plan.billingInterval === "year") d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
        return d;
      })();

  await storage.updateMembershipByStripeSubId(subId, {
    status: "active",
    tuneUpsRemaining: plan.includedTuneUps,
    serviceCallsRemaining: plan.includedServiceCalls,
    lastRenewedAt: new Date(),
    nextBillingDate: nextBilling,
  });

  console.log(
    `[membershipBilling] invoice.paid for sub ${subId} (membership ${membership.id}): reset to ${plan.includedTuneUps} tune-ups + ${plan.includedServiceCalls} service calls`,
  );

  return { handled: true };
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
): Promise<{ handled: boolean; reason?: string }> {
  const invoice = event.data.object as Stripe.Invoice;
  const subId = (invoice as any).subscription as string | null;
  if (!subId) return { handled: false, reason: "No subscription on invoice" };

  const membership = await storage.getMembershipByStripeSubId(subId);
  if (!membership) {
    return {
      handled: false,
      reason: `No membership found for Stripe sub ${subId}`,
    };
  }

  await storage.updateMembershipByStripeSubId(subId, {
    status: "past_due",
  });

  console.log(
    `[membershipBilling] invoice.payment_failed for sub ${subId} (membership ${membership.id}): marked past_due`,
  );

  return { handled: true };
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
): Promise<{ handled: boolean; reason?: string }> {
  const sub = event.data.object as Stripe.Subscription;
  const membership = await storage.getMembershipByStripeSubId(sub.id);
  if (!membership) {
    return {
      handled: false,
      reason: `No membership found for Stripe sub ${sub.id}`,
    };
  }

  await storage.updateMembershipByStripeSubId(sub.id, {
    status: "canceled",
    canceledAt: new Date(),
  });

  console.log(
    `[membershipBilling] subscription.deleted for sub ${sub.id} (membership ${membership.id}): marked canceled`,
  );

  return { handled: true };
}

/**
 * Handles status flips that happen MID-period (e.g., admin manually pauses
 * a subscription in Stripe Dashboard). We mirror Stripe's status field.
 */
async function handleSubscriptionUpdated(
  event: Stripe.Event,
): Promise<{ handled: boolean; reason?: string }> {
  const sub = event.data.object as Stripe.Subscription;
  const membership = await storage.getMembershipByStripeSubId(sub.id);
  if (!membership) {
    return {
      handled: false,
      reason: `No membership found for Stripe sub ${sub.id}`,
    };
  }

  // Map Stripe statuses to ours
  let newStatus: "active" | "past_due" | "canceled" | "paused" | null = null;
  switch (sub.status) {
    case "active":
    case "trialing":
      newStatus = "active";
      break;
    case "past_due":
    case "unpaid":
      newStatus = "past_due";
      break;
    case "canceled":
      newStatus = "canceled";
      break;
    case "paused":
      newStatus = "paused";
      break;
    default:
      // incomplete, incomplete_expired — don't change our state
      return { handled: false, reason: `Stripe status ${sub.status} doesn't map to membership status` };
  }

  if (membership.status !== newStatus) {
    await storage.updateMembershipByStripeSubId(sub.id, {
      status: newStatus,
      ...(newStatus === "canceled" ? { canceledAt: new Date() } : {}),
    });
    console.log(
      `[membershipBilling] subscription.updated for sub ${sub.id}: ${membership.status} → ${newStatus}`,
    );
  }

  return { handled: true };
}

// ──────────────────────────────────────────────────────────────────────
// Default plan tier seeds (HVAC)
// ──────────────────────────────────────────────────────────────────────

/**
 * Three sensible HVAC defaults. Seeded only when the owner explicitly
 * requests it from the Memberships settings tab (never auto-injected).
 *
 * These are designed to map onto the industry-standard "Basic / Premium /
 * Elite" ladder that HVAC contractors recognize and customers compare
 * against. Pricing assumes a typical residential market — owners can edit
 * after seeding.
 */
export const HVAC_DEFAULT_PLAN_SEEDS = [
  {
    name: "Basic Comfort",
    description:
      "Annual tune-up included. 10% off all repairs and parts. Phone & email support.",
    priceMonthly: "14.99",
    includedTuneUps: 1,
    includedServiceCalls: 0,
    memberDiscountPercent: "10.00",
    waivesDiagnosticFee: false,
    priorityDispatch: false,
    sortOrder: 1,
  },
  {
    name: "Premium Comfort",
    description:
      "Two tune-ups per year (heating + cooling). 15% off all repairs and parts. Priority dispatch — you get scheduled first.",
    priceMonthly: "24.99",
    includedTuneUps: 2,
    includedServiceCalls: 0,
    memberDiscountPercent: "15.00",
    waivesDiagnosticFee: false,
    priorityDispatch: true,
    sortOrder: 2,
  },
  {
    name: "Elite Comfort",
    description:
      "Two tune-ups per year. 20% off all repairs and parts. Two free service calls (diagnostic + trip fees waived). Priority dispatch — first call, first served.",
    priceMonthly: "39.99",
    includedTuneUps: 2,
    includedServiceCalls: 2,
    memberDiscountPercent: "20.00",
    waivesDiagnosticFee: true,
    priorityDispatch: true,
    sortOrder: 3,
  },
] as const;
