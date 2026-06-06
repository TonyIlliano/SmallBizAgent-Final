/**
 * Membership Tune-Up Auto-Scheduler (Step 4 of HVAC roadmap)
 *
 * Runs every 24 hours per business timezone. For each active membership
 * that has unused tune-ups and is past its "due" window:
 *   1. Send a one-time SMS nudge via Message Intelligence Service
 *   2. Log the send in agent_activity_log + notification_log so it doesn't
 *      double-fire on subsequent runs
 *
 * The reply lands in the standard SMS inbound flow and gets routed by the
 * existing smsConversationRouter to either book the appointment or hand
 * off to a human.
 *
 * Conservative defaults:
 *   - membership_min_age_days: 150 (don't nudge until they've been a
 *     member for at least ~5 months, so we don't badger fresh enrollees)
 *   - dedup window: 90 days (one nudge per quarter MAX per member)
 *
 * Industry-config gated at the per-business level — only businesses where
 * supportsMembershipPlans is true get processed.
 */

import { storage } from "../storage";
import { getIndustryConfig } from "@shared/industry-config";
import { generateMessage } from "./messageIntelligenceService";
import { db } from "../db";
import { notificationLog } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";

const MIN_AGE_DAYS = 150;
const DEDUP_WINDOW_DAYS = 90;

export async function runMembershipTuneUpCheck(): Promise<void> {
  console.log("[MembershipTuneUp] Starting auto-scheduler run");

  let businesses;
  try {
    businesses = await storage.getAllBusinesses();
  } catch (err) {
    console.error("[MembershipTuneUp] Failed to fetch businesses:", err);
    return;
  }

  let totalSent = 0;
  let totalSkipped = 0;

  for (const business of businesses) {
    // Industry gate — only HVAC + adjacent verticals get processed
    const config = getIndustryConfig(business.industry);
    if (!config.supportsMembershipPlans) continue;

    let members;
    try {
      members = await storage.getMembershipsDueForTuneUp(business.id, {
        membershipMinAgeDays: MIN_AGE_DAYS,
      });
    } catch (err) {
      console.error(
        `[MembershipTuneUp] Failed to fetch due members for business ${business.id}:`,
        err,
      );
      continue;
    }

    if (members.length === 0) continue;
    console.log(
      `[MembershipTuneUp] business ${business.id}: ${members.length} member(s) due for tune-up`,
    );

    for (const membership of members) {
      try {
        // Dedup: check notification_log for any MEMBERSHIP_TUNEUP_DUE
        // sent to this membership in the past 90 days. We use the
        // membership ID as the dedup key because customers can have at
        // most one active membership at a time (partial unique index).
        const dedupCutoff = new Date();
        dedupCutoff.setDate(dedupCutoff.getDate() - DEDUP_WINDOW_DAYS);
        const recentSends = await db
          .select({ id: notificationLog.id })
          .from(notificationLog)
          .where(
            and(
              eq(notificationLog.businessId, business.id),
              eq(notificationLog.type, "membership_tune_up_due"),
              eq(notificationLog.referenceType, "membership"),
              eq(notificationLog.referenceId, membership.id),
              gte(notificationLog.sentAt, dedupCutoff),
            ),
          )
          .limit(1);

        if (recentSends.length > 0) {
          totalSkipped++;
          continue;
        }

        // Look up customer + plan for context. MIS handles opt-in /
        // suppression / Free-plan gates internally.
        const customer = await storage.getCustomer(membership.customerId);
        if (!customer || !customer.phone) {
          totalSkipped++;
          continue;
        }

        const plan = await storage.getMembershipPlanById(
          membership.planId,
          business.id,
        );

        // Generate + send via MIS (AI-composed with the
        // MEMBERSHIP_TUNEUP_DUE instruction)
        const result = await generateMessage({
          messageType: "MEMBERSHIP_TUNEUP_DUE",
          businessId: business.id,
          customerId: customer.id,
          recipientPhone: customer.phone,
          useTemplate: false, // full AI generation — feels less robotic
          context: {
            customerName: customer.firstName || "there",
            businessName: business.name,
            planName: plan?.name || "your maintenance plan",
            tuneUpsRemaining: membership.tuneUpsRemaining,
          },
          fallbackTemplate:
            "Hi {{customerName}}, this is {{businessName}}. Your {{planName}} includes a tune-up that's due! Reply with a day and time that works and we'll get you on the schedule.",
          fallbackVars: {
            customerName: customer.firstName || "there",
            businessName: business.name,
            planName: plan?.name || "your maintenance plan",
          },
          isMarketing: false,
        });

        if (result.success) {
          totalSent++;
          // Log to notification_log for dedup on next run
          try {
            await db.insert(notificationLog).values({
              businessId: business.id,
              customerId: customer.id,
              type: "membership_tune_up_due",
              channel: "sms",
              recipient: customer.phone,
              status: "sent",
              referenceType: "membership",
              referenceId: membership.id,
              message: result.body || null,
            } as any);
          } catch (logErr) {
            console.error(
              `[MembershipTuneUp] Failed to log notification for membership ${membership.id}:`,
              logErr,
            );
          }
        } else {
          totalSkipped++;
        }
      } catch (innerErr) {
        console.error(
          `[MembershipTuneUp] Error processing membership ${membership.id}:`,
          innerErr,
        );
      }
    }
  }

  console.log(
    `[MembershipTuneUp] Run complete: sent=${totalSent}, skipped=${totalSkipped}`,
  );
}
