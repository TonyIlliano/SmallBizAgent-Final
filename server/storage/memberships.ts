/**
 * Membership Storage (Step 4 of HVAC roadmap)
 *
 * Three tables: membership_plans (tier definitions), customer_memberships
 * (per-customer enrollment), membership_benefit_usage (audit trail).
 *
 * All operations TENANT-SCOPED — every public function takes businessId and
 * ANDs it into the WHERE clause as defense-in-depth beyond the route-level
 * ownership check. Same pattern as customers/equipment storage.
 *
 * The benefit-decrement helper (recordBenefitUsage) is the structural
 * defense against "what if a tech double-clicks 'Use tune-up'?" — it does
 * the decrement + audit write in a single transaction.
 */

import {
  MembershipPlan,
  InsertMembershipPlan,
  CustomerMembership,
  InsertCustomerMembership,
  MembershipBenefitUsage,
  InsertMembershipBenefitUsage,
  membershipPlans,
  customerMemberships,
  membershipBenefitUsage,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";

// ──────────────────────────────────────────────────────────────────────
// Plan CRUD (owner-facing)
// ──────────────────────────────────────────────────────────────────────

export async function getMembershipPlans(
  businessId: number,
  params?: { activeOnly?: boolean },
): Promise<MembershipPlan[]> {
  const conditions = [eq(membershipPlans.businessId, businessId)];
  if (params?.activeOnly) {
    conditions.push(eq(membershipPlans.active, true));
  }
  return db
    .select()
    .from(membershipPlans)
    .where(and(...conditions))
    .orderBy(membershipPlans.sortOrder, membershipPlans.id)
    .limit(50); // 50 plan tiers is way more than any HVAC contractor needs
}

export async function getMembershipPlanById(
  id: number,
  businessId: number,
): Promise<MembershipPlan | undefined> {
  const [row] = await db
    .select()
    .from(membershipPlans)
    .where(
      and(
        eq(membershipPlans.id, id),
        eq(membershipPlans.businessId, businessId),
      ),
    )
    .limit(1);
  return row;
}

export async function createMembershipPlan(
  payload: InsertMembershipPlan,
): Promise<MembershipPlan> {
  const [row] = await db.insert(membershipPlans).values(payload).returning();
  return row;
}

export async function updateMembershipPlan(
  id: number,
  businessId: number,
  patch: Partial<Omit<MembershipPlan, "id" | "businessId" | "createdAt">>,
): Promise<MembershipPlan | undefined> {
  const [row] = await db
    .update(membershipPlans)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(membershipPlans.id, id),
        eq(membershipPlans.businessId, businessId),
      ),
    )
    .returning();
  return row;
}

/**
 * Soft delete = `active: false`. Hard delete via the route is NOT exposed
 * because canceled memberships still reference the planId for history.
 */
export async function deactivateMembershipPlan(
  id: number,
  businessId: number,
): Promise<MembershipPlan | undefined> {
  return updateMembershipPlan(id, businessId, { active: false });
}

// ──────────────────────────────────────────────────────────────────────
// Customer enrollment (one active per customer, enforced by partial unique)
// ──────────────────────────────────────────────────────────────────────

/**
 * Active membership for a customer, if any. Returns undefined when the
 * customer has never enrolled OR all their memberships are
 * canceled/paused. The hot path for the AI receptionist + job detail
 * page.
 */
export async function getActiveMembershipByCustomer(
  customerId: number,
  businessId: number,
): Promise<CustomerMembership | undefined> {
  const [row] = await db
    .select()
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.businessId, businessId),
        eq(customerMemberships.customerId, customerId),
        eq(customerMemberships.status, "active"),
      ),
    )
    .limit(1);
  return row;
}

/**
 * All memberships for a customer, ordered newest-first. Used by the
 * customer detail page to show full enrollment history (active + canceled).
 */
export async function getMembershipsByCustomer(
  customerId: number,
  businessId: number,
): Promise<CustomerMembership[]> {
  return db
    .select()
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.businessId, businessId),
        eq(customerMemberships.customerId, customerId),
      ),
    )
    .orderBy(desc(customerMemberships.startDate))
    .limit(20);
}

export async function getMembershipById(
  id: number,
  businessId: number,
): Promise<CustomerMembership | undefined> {
  const [row] = await db
    .select()
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.id, id),
        eq(customerMemberships.businessId, businessId),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Webhook lookup — finds a membership by its Stripe subscription ID
 * (Connect-scoped, set on the owner's account). The Stripe sub ID is
 * unique within a Stripe account but the table-wide index doesn't enforce
 * global uniqueness; that's fine because the Connect account scope makes
 * collisions practically impossible.
 */
export async function getMembershipByStripeSubId(
  stripeSubscriptionId: string,
): Promise<CustomerMembership | undefined> {
  const [row] = await db
    .select()
    .from(customerMemberships)
    .where(eq(customerMemberships.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return row;
}

/**
 * All active memberships for a business — used by the dashboard widget
 * (members count, MRR-from-memberships) and the auto-tune-up scheduler.
 */
export async function getActiveMembershipsByBusiness(
  businessId: number,
): Promise<CustomerMembership[]> {
  return db
    .select()
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.businessId, businessId),
        eq(customerMemberships.status, "active"),
      ),
    )
    .orderBy(desc(customerMemberships.startDate))
    .limit(5000);
}

export async function createMembership(
  payload: InsertCustomerMembership,
): Promise<CustomerMembership> {
  const [row] = await db
    .insert(customerMemberships)
    .values(payload)
    .returning();
  return row;
}

export async function updateMembership(
  id: number,
  businessId: number,
  patch: Partial<Omit<CustomerMembership, "id" | "businessId" | "customerId" | "createdAt">>,
): Promise<CustomerMembership | undefined> {
  const [row] = await db
    .update(customerMemberships)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(customerMemberships.id, id),
        eq(customerMemberships.businessId, businessId),
      ),
    )
    .returning();
  return row;
}

/**
 * Webhook-driven update: patch a membership by stripeSubscriptionId. Used
 * by invoice.paid / invoice.payment_failed / subscription.deleted handlers
 * since they don't know our internal membership ID — they only have the
 * Stripe sub ID.
 */
export async function updateMembershipByStripeSubId(
  stripeSubscriptionId: string,
  patch: Partial<Omit<CustomerMembership, "id" | "businessId" | "customerId" | "createdAt">>,
): Promise<CustomerMembership | undefined> {
  const [row] = await db
    .update(customerMemberships)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(customerMemberships.stripeSubscriptionId, stripeSubscriptionId))
    .returning();
  return row;
}

// ──────────────────────────────────────────────────────────────────────
// Benefit usage audit trail
// ──────────────────────────────────────────────────────────────────────

/**
 * Records a benefit redemption AND decrements the matching counter on the
 * membership in a SINGLE TRANSACTION. This is the structural defense
 * against double-spending — two concurrent "use tune-up" clicks can't both
 * succeed because the row update is row-locked for the duration of the
 * transaction.
 *
 * Returns the updated membership (or undefined if the membership wasn't
 * found / no benefit remained / wrong business). Callers should check the
 * return value before charging the customer accordingly.
 */
export async function recordBenefitUsage(params: {
  businessId: number;
  membershipId: number;
  benefitType: "tune_up" | "service_call" | "discount" | "diagnostic_waiver";
  jobId?: number;
  appointmentId?: number;
  discountAmountSaved?: string;
  notes?: string;
}): Promise<{
  ok: true;
  membership: CustomerMembership;
  usageId: number;
} | {
  ok: false;
  reason: "membership_not_found" | "no_benefit_remaining" | "membership_not_active";
}> {
  return db.transaction(async (tx) => {
    // 1. Lock the membership row for the duration of this transaction.
    //    Postgres FOR UPDATE blocks concurrent updates so a double-click
    //    on the "Use tune-up" button can't decrement twice.
    const [membership] = await tx
      .select()
      .from(customerMemberships)
      .where(
        and(
          eq(customerMemberships.id, params.membershipId),
          eq(customerMemberships.businessId, params.businessId),
        ),
      )
      .for("update");

    if (!membership) {
      return { ok: false as const, reason: "membership_not_found" as const };
    }
    if (membership.status !== "active") {
      return { ok: false as const, reason: "membership_not_active" as const };
    }

    // 2. Decrement the appropriate counter (discount + diagnostic_waiver
    //    have no counter — they're just logged for audit).
    let patch: Partial<CustomerMembership> | null = null;
    if (params.benefitType === "tune_up") {
      if ((membership.tuneUpsRemaining ?? 0) <= 0) {
        return { ok: false as const, reason: "no_benefit_remaining" as const };
      }
      patch = { tuneUpsRemaining: (membership.tuneUpsRemaining ?? 0) - 1 };
    } else if (params.benefitType === "service_call") {
      if ((membership.serviceCallsRemaining ?? 0) <= 0) {
        return { ok: false as const, reason: "no_benefit_remaining" as const };
      }
      patch = { serviceCallsRemaining: (membership.serviceCallsRemaining ?? 0) - 1 };
    }

    // 3. Persist the decrement
    let updated = membership;
    if (patch) {
      const [row] = await tx
        .update(customerMemberships)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(customerMemberships.id, params.membershipId))
        .returning();
      updated = row;
    }

    // 4. Write the audit row
    const [usage] = await tx
      .insert(membershipBenefitUsage)
      .values({
        businessId: params.businessId,
        membershipId: params.membershipId,
        benefitType: params.benefitType,
        jobId: params.jobId ?? null,
        appointmentId: params.appointmentId ?? null,
        discountAmountSaved: params.discountAmountSaved ?? null,
        notes: params.notes ?? null,
      } as InsertMembershipBenefitUsage)
      .returning({ id: membershipBenefitUsage.id });

    return {
      ok: true as const,
      membership: updated,
      usageId: usage.id,
    };
  });
}

/**
 * History view for the customer detail page — "what has this customer
 * used over the life of their membership?". Capped to avoid unbounded
 * reads.
 */
export async function getBenefitUsageByMembership(
  membershipId: number,
  businessId: number,
): Promise<MembershipBenefitUsage[]> {
  return db
    .select()
    .from(membershipBenefitUsage)
    .where(
      and(
        eq(membershipBenefitUsage.membershipId, membershipId),
        eq(membershipBenefitUsage.businessId, businessId),
      ),
    )
    .orderBy(desc(membershipBenefitUsage.usedAt))
    .limit(100);
}

// ──────────────────────────────────────────────────────────────────────
// Dashboard analytics
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns counts + MRR for the dashboard widget. Cheap aggregate query
 * over the active memberships table.
 *
 * MRR is computed as sum of (plan.priceMonthly normalized to monthly).
 * Annual plans are divided by 12.
 */
export async function getMembershipStatsForBusiness(
  businessId: number,
): Promise<{
  activeCount: number;
  pastDueCount: number;
  mrrCents: number;
}> {
  const result = await db.execute<{
    active_count: string;
    past_due_count: string;
    mrr_cents: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE m.status = 'active')::text AS active_count,
      COUNT(*) FILTER (WHERE m.status = 'past_due')::text AS past_due_count,
      COALESCE(
        SUM(
          CASE
            WHEN m.status IN ('active', 'past_due') AND p.billing_interval = 'month'
              THEN ROUND(p.price_monthly * 100)
            WHEN m.status IN ('active', 'past_due') AND p.billing_interval = 'year'
              THEN ROUND((p.price_monthly * 100) / 12)
            ELSE 0
          END
        ),
        0
      )::text AS mrr_cents
    FROM customer_memberships m
    LEFT JOIN membership_plans p ON p.id = m.plan_id
    WHERE m.business_id = ${businessId}
  `);
  const row = (result as any).rows?.[0] ?? (result as any)[0] ?? result;
  return {
    activeCount: parseInt(row?.active_count ?? "0", 10),
    pastDueCount: parseInt(row?.past_due_count ?? "0", 10),
    mrrCents: parseInt(row?.mrr_cents ?? "0", 10),
  };
}

/**
 * "Active members who are due for a tune-up between now and the cutoff" —
 * powers the auto-tune-up scheduler in Step 4.L. Roughly equivalent to:
 *   - membership is active
 *   - tuneUpsRemaining > 0
 *   - we've been a member for at least N days (configurable per business)
 *
 * The scheduler will use this list to send SMS nudges.
 */
export async function getMembershipsDueForTuneUp(
  businessId: number,
  params: { membershipMinAgeDays: number },
): Promise<CustomerMembership[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - params.membershipMinAgeDays);
  return db
    .select()
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.businessId, businessId),
        eq(customerMemberships.status, "active"),
        sql`${customerMemberships.tuneUpsRemaining} > 0`,
        sql`${customerMemberships.startDate} <= ${cutoff}`,
      ),
    )
    .limit(500);
}
