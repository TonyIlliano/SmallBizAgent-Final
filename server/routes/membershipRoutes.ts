/**
 * Membership Routes (Step 4 of HVAC roadmap)
 *
 * Mounted at /api by routes.ts. Contains both owner-facing plan management
 * routes and the Connect webhook endpoint.
 *
 * Industry-config is NOT enforced here at the server side — the UI gates
 * visibility, but if a non-HVAC business calls these endpoints they just
 * work (universal table model). Future hardening: if owners report
 * accidental discovery, add a config guard.
 *
 * The Connect webhook endpoint MUST be added to CSRF exempt paths in
 * server/index.ts. It's signature-verified instead of CSRF-verified.
 */

import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { insertMembershipPlanSchema } from "@shared/schema";
import { z } from "zod";
import Stripe from "stripe";
import {
  createSubscriptionForCustomer,
  cancelSubscriptionForMembership,
  handleMembershipConnectWebhook,
  HVAC_DEFAULT_PLAN_SEEDS,
} from "../services/membershipBillingService";

const router = Router();

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

// ──────────────────────────────────────────────────────────────────────
// Auth helpers
// ──────────────────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response): { businessId: number } | null {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const businessId = (req.user as any).businessId;
  if (!businessId) {
    res.status(400).json({ error: "No business associated with user" });
    return null;
  }
  return { businessId };
}

// Verify a customer belongs to the requesting business — same pattern as
// equipment routes. Returns null on failure with the response already sent.
async function verifyCustomerOwnership(
  req: Request,
  res: Response,
  customerIdRaw: string,
): Promise<{ businessId: number; customerId: number } | null> {
  const ctx = requireAuth(req, res);
  if (!ctx) return null;
  const customerId = parseInt(customerIdRaw, 10);
  if (isNaN(customerId)) {
    res.status(400).json({ error: "Invalid customer ID" });
    return null;
  }
  const customer = await storage.getCustomer(customerId);
  if (!customer || customer.businessId !== ctx.businessId) {
    res.status(404).json({ error: "Customer not found" });
    return null;
  }
  return { businessId: ctx.businessId, customerId };
}

// ──────────────────────────────────────────────────────────────────────
// Plan CRUD (/api/membership-plans)
// ──────────────────────────────────────────────────────────────────────

router.get("/membership-plans", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const activeOnly = req.query.activeOnly === "true";
    const plans = await storage.getMembershipPlans(ctx.businessId, { activeOnly });
    res.json(plans);
  } catch (error) {
    console.error("Error fetching membership plans:", error);
    res.status(500).json({ error: "Failed to fetch membership plans" });
  }
});

router.post("/membership-plans", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const { businessId: _ignored, ...rest } = req.body || {};
    const parsed = insertMembershipPlanSchema.safeParse({
      ...rest,
      businessId: ctx.businessId,
    });
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid plan data", details: parsed.error.flatten() });
    }
    const plan = await storage.createMembershipPlan(parsed.data);
    res.status(201).json(plan);
  } catch (error) {
    console.error("Error creating membership plan:", error);
    res.status(500).json({ error: "Failed to create membership plan" });
  }
});

router.patch("/membership-plans/:id", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid plan ID" });

    // Drop fields that the caller shouldn't be able to set directly
    const {
      businessId: _ignoredBiz,
      stripeProductId: _ignoredProduct,
      stripePriceId: _ignoredPrice,
      ...rest
    } = req.body || {};

    const updated = await storage.updateMembershipPlan(id, ctx.businessId, rest);
    if (!updated) return res.status(404).json({ error: "Plan not found" });
    res.json(updated);
  } catch (error) {
    console.error("Error updating membership plan:", error);
    res.status(500).json({ error: "Failed to update membership plan" });
  }
});

router.delete("/membership-plans/:id", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid plan ID" });
    const updated = await storage.deactivateMembershipPlan(id, ctx.businessId);
    if (!updated) return res.status(404).json({ error: "Plan not found" });
    res.status(204).end();
  } catch (error) {
    console.error("Error deactivating membership plan:", error);
    res.status(500).json({ error: "Failed to deactivate membership plan" });
  }
});

/**
 * Seed the three HVAC default plans for a business. Idempotent — checks
 * for any existing plans first and refuses to seed if any are present
 * (so owners don't accidentally double-seed and end up with 6 tiers).
 */
router.post("/membership-plans/seed-defaults", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const existing = await storage.getMembershipPlans(ctx.businessId);
    if (existing.length > 0) {
      return res.status(409).json({
        error: "PLANS_ALREADY_EXIST",
        message:
          "This business already has membership plans configured. Edit or delete the existing plans before re-seeding.",
        existingCount: existing.length,
      });
    }
    const created = [];
    for (const seed of HVAC_DEFAULT_PLAN_SEEDS) {
      const plan = await storage.createMembershipPlan({
        businessId: ctx.businessId,
        ...seed,
      });
      created.push(plan);
    }
    res.status(201).json({ seeded: created.length, plans: created });
  } catch (error) {
    console.error("Error seeding default plans:", error);
    res.status(500).json({ error: "Failed to seed default plans" });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Customer enrollment (/api/customers/:id/membership)
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns the active membership for a customer (or null if none).
 * Also returns the plan details so the UI doesn't need a second roundtrip.
 */
router.get("/customers/:id/membership", async (req, res) => {
  try {
    const ownership = await verifyCustomerOwnership(req, res, req.params.id);
    if (!ownership) return;
    const membership = await storage.getActiveMembershipByCustomer(
      ownership.customerId,
      ownership.businessId,
    );
    if (!membership) return res.json({ membership: null, plan: null });
    const plan = await storage.getMembershipPlanById(
      membership.planId,
      ownership.businessId,
    );
    res.json({ membership, plan });
  } catch (error) {
    console.error("Error fetching customer membership:", error);
    res.status(500).json({ error: "Failed to fetch customer membership" });
  }
});

const enrollSchema = z.object({
  planId: z.number().int().positive(),
  // Optional — if the caller already has a PM ID from Stripe Elements,
  // pass it so we set it as the subscription's default. Otherwise the
  // subscription is created `incomplete` and the customer needs to attach
  // a PM via a follow-up flow.
  paymentMethodId: z.string().optional(),
});

router.post("/customers/:id/enroll", async (req, res) => {
  try {
    const ownership = await verifyCustomerOwnership(req, res, req.params.id);
    if (!ownership) return;

    const parsed = enrollSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid enrollment data",
        details: parsed.error.flatten(),
      });
    }

    const customer = await storage.getCustomer(ownership.customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Defense in depth — the partial unique index ALSO catches this, but
    // a clean 409 here is friendlier than the DB error trickling up.
    const existing = await storage.getActiveMembershipByCustomer(
      ownership.customerId,
      ownership.businessId,
    );
    if (existing) {
      return res.status(409).json({
        error: "ALREADY_ENROLLED",
        message: "Customer already has an active membership. Cancel it first to enroll in a different plan.",
        existingMembershipId: existing.id,
      });
    }

    // Create the subscription on the owner's Connect account
    let stripeResult;
    try {
      stripeResult = await createSubscriptionForCustomer({
        businessId: ownership.businessId,
        planId: parsed.data.planId,
        customerId: ownership.customerId,
        customerEmail: customer.email,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        existingStripeCustomerConnectId: customer.stripeCustomerConnectId,
        defaultPaymentMethodId: parsed.data.paymentMethodId,
      });
    } catch (e: any) {
      // Connect not set up / plan inactive / Stripe API failure
      return res.status(400).json({
        error: "STRIPE_ENROLLMENT_FAILED",
        message: e?.message || "Could not create subscription",
      });
    }

    // Persist the new Stripe Customer ID on the customer row if we just
    // created it
    if (
      stripeResult.stripeCustomerConnectId &&
      stripeResult.stripeCustomerConnectId !== customer.stripeCustomerConnectId
    ) {
      await storage.updateCustomer(ownership.customerId, {
        stripeCustomerConnectId: stripeResult.stripeCustomerConnectId,
      } as any);
    }

    // Look up the plan to seed benefit counters
    const plan = await storage.getMembershipPlanById(
      parsed.data.planId,
      ownership.businessId,
    );
    if (!plan) {
      return res.status(500).json({
        error: "PLAN_MISSING_AFTER_ENROLL",
        message:
          "Subscription was created but the plan was deleted mid-enrollment. Cancel and retry.",
      });
    }

    const membership = await storage.createMembership({
      businessId: ownership.businessId,
      customerId: ownership.customerId,
      planId: parsed.data.planId,
      status: "active",
      stripeSubscriptionId: stripeResult.stripeSubscriptionId,
      tuneUpsRemaining: plan.includedTuneUps,
      serviceCallsRemaining: plan.includedServiceCalls,
      nextBillingDate: stripeResult.nextBillingDate,
      lastRenewedAt: new Date(),
    });

    res.status(201).json({ membership, plan });
  } catch (error) {
    console.error("Error enrolling customer:", error);
    res.status(500).json({ error: "Failed to enroll customer" });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Membership lifecycle (/api/memberships/:id/{cancel,use-benefit})
// ──────────────────────────────────────────────────────────────────────

router.post("/memberships/:id/cancel", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid membership ID" });

    const membership = await storage.getMembershipById(id, ctx.businessId);
    if (!membership) return res.status(404).json({ error: "Membership not found" });
    if (membership.status === "canceled") {
      return res.status(409).json({ error: "Already canceled" });
    }

    // Default to period-end cancellation (FTC click-to-cancel friendly).
    // Admin can pass `immediately: true` for instant cancellation.
    const immediately = req.body?.immediately === true;

    try {
      await cancelSubscriptionForMembership(membership, { immediately });
    } catch (e: any) {
      // Stripe failure shouldn't strand our row — mark as canceled locally
      // and log. The next webhook event will reconcile state if it ever
      // catches up.
      console.error(
        `[membership cancel] Stripe call failed for membership ${id}; marking local row anyway:`,
        e?.message,
      );
    }

    const updated = await storage.updateMembership(id, ctx.businessId, {
      status: "canceled",
      canceledAt: new Date(),
    });
    res.json({ membership: updated });
  } catch (error) {
    console.error("Error canceling membership:", error);
    res.status(500).json({ error: "Failed to cancel membership" });
  }
});

const useBenefitSchema = z.object({
  benefitType: z.enum(["tune_up", "service_call", "discount", "diagnostic_waiver"]),
  jobId: z.number().int().positive().optional(),
  appointmentId: z.number().int().positive().optional(),
  discountAmountSaved: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Records a benefit redemption + decrements the matching counter
 * transactionally. Returns the updated membership so the UI can refresh
 * benefit-remaining counts without a second roundtrip.
 */
router.post("/memberships/:id/use-benefit", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const membershipId = parseInt(req.params.id, 10);
    if (isNaN(membershipId)) return res.status(400).json({ error: "Invalid membership ID" });

    const parsed = useBenefitSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid benefit usage data",
        details: parsed.error.flatten(),
      });
    }

    const result = await storage.recordBenefitUsage({
      businessId: ctx.businessId,
      membershipId,
      ...parsed.data,
    });

    if (!result.ok) {
      // Map storage-layer reasons to friendly responses
      const status = result.reason === "membership_not_found" ? 404 : 409;
      return res.status(status).json({
        error: result.reason,
        message:
          result.reason === "no_benefit_remaining"
            ? "This member has used all their benefits for this period. Wait until renewal."
            : result.reason === "membership_not_active"
              ? "This membership is not active (canceled / past-due / paused)."
              : "Membership not found",
      });
    }

    res.status(201).json({
      membership: result.membership,
      usageId: result.usageId,
    });
  } catch (error) {
    console.error("Error recording benefit usage:", error);
    res.status(500).json({ error: "Failed to record benefit usage" });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Dashboard stats (/api/memberships/stats)
// ──────────────────────────────────────────────────────────────────────

router.get("/memberships/stats", async (req, res) => {
  try {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    const stats = await storage.getMembershipStatsForBusiness(ctx.businessId);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching membership stats:", error);
    res.status(500).json({ error: "Failed to fetch membership stats" });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Stripe Connect webhook (signature-verified, CSRF-exempt)
// ──────────────────────────────────────────────────────────────────────
//
// Configure in Stripe Dashboard → Developers → Webhooks → Connect endpoint:
//   - URL: https://yourdomain.com/api/membership-connect-webhook
//   - Events: invoice.paid, invoice.payment_failed,
//             customer.subscription.deleted, customer.subscription.updated
//   - Mode: "Events on Connected accounts"
//
// Secret stored in env as MEMBERSHIP_CONNECT_WEBHOOK_SECRET (separate from
// the platform STRIPE_WEBHOOK_SECRET so admins can rotate them
// independently). Falls back to STRIPE_WEBHOOK_SECRET if not set.

router.post("/membership-connect-webhook", async (req: Request, res: Response) => {
  const endpointSecret =
    process.env.MEMBERSHIP_CONNECT_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    console.error("[MembershipConnectWebhook] No webhook secret configured - rejecting");
    return res.status(500).json({ error: "Webhook not configured" });
  }
  if (!stripe) {
    console.error("[MembershipConnectWebhook] Stripe not configured - rejecting");
    return res.status(500).json({ error: "Stripe not configured" });
  }
  const sig = req.headers["stripe-signature"] as string;
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("[MembershipConnectWebhook] Signature verification failed:", err);
    return res.status(400).json({ error: "Webhook signature verification failed" });
  }

  // ── Strict idempotency ──
  // If we've already processed this event ID, return 200 and skip. If the
  // dedup table is missing (pre-migration), log + continue. Any other DB
  // error → 500 so Stripe retries.
  const { pool } = await import("../db");
  try {
    await pool.query(
      `INSERT INTO processed_webhook_events (event_id, source, event_type) VALUES ($1, 'stripe_connect_membership', $2)`,
      [event.id, event.type],
    );
  } catch (dupErr: any) {
    if (dupErr?.code === "23505") {
      console.log(
        `[MembershipConnectWebhook] Skipping duplicate webhook event: ${event.id} (${event.type})`,
      );
      return res.json({ received: true, duplicate: true });
    }
    if (dupErr?.code === "42P01") {
      console.warn(
        "[MembershipConnectWebhook] processed_webhook_events table missing; skipping idempotency check",
      );
    } else {
      console.error(
        `[MembershipConnectWebhook] Idempotency check failed for ${event.id}, requesting retry:`,
        dupErr,
      );
      return res.status(500).json({ error: "Idempotency check failed" });
    }
  }

  try {
    const result = await handleMembershipConnectWebhook(event);
    if (!result.handled) {
      console.log(`[MembershipConnectWebhook] ${event.type}: not handled (${result.reason})`);
    }
    res.json({ received: true, handled: result.handled });
  } catch (err: any) {
    console.error(
      `[MembershipConnectWebhook] Handler error for ${event.id} (${event.type}):`,
      err,
    );
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

export default router;
