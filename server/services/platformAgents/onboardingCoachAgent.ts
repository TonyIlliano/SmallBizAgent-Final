/**
 * Onboarding Coach Agent — Platform-level AI Agent for SmallBizAgent SaaS
 *
 * Monitors new signups' progress through setup and sends personalized nudge
 * emails when they stall on a specific onboarding step.
 *
 * Runs every 6 hours (called by the scheduler).
 *
 * Steps checked (in order):
 *   1. hasServices         — at least 1 service in the services table
 *   2. hasHours            — at least 1 row in business_hours table
 *   3. hasPhone            — twilioPhoneNumber is provisioned
 *   4. hasCallForwarding   — callForwardingEnabled === true
 *   5. hasCustomers        — at least 1 customer
 *   6. hasAppointment      — at least 1 appointment
 *
 * Deduplication: checks notification_log for type `drip:onboarding_coach:<step>`
 * to avoid sending the same nudge twice per business.
 */

import { db } from "../../db";
import { eq, sql, gte } from "drizzle-orm";
import {
  businesses,
  users,
  customers,
  appointments,
  services,
  businessHours,
} from "../../../shared/schema";
import { storage } from "../../storage";
import { sendEmail } from "../../emailService";
import { logAgentAction } from "../agentActivityService";

const APP_URL = process.env.APP_URL || "https://www.smallbizagent.ai";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface OnboardingStep {
  key: string;
  label: string;
  complete: boolean;
  nudgeSubject: string;
  nudgeBody: string; // HTML email body
}

// ─── Step Definitions ────────────────────────────────────────────────────────

function getSteps(
  business: any,
  serviceCount: number,
  hoursCount: number,
  customerCount: number,
  appointmentCount: number,
): OnboardingStep[] {
  return [
    {
      key: "services",
      label: "Add your services",
      complete: serviceCount > 0,
      nudgeSubject: `${business.name}: Let's add your services to SmallBizAgent`,
      nudgeBody: `<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hey there!</h2>
        <p>You're almost set up. The next step is to <strong>add the services you offer</strong> so customers can book with you.</p>
        <p>This takes about 2 minutes — just list your services, prices, and durations.</p>
        <p><a href="${APP_URL}/settings" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">Add Your Services</a></p>
        <p style="color:#666;font-size:14px;">— The SmallBizAgent Team</p>
      </body></html>`,
    },
    {
      key: "hours",
      label: "Set business hours",
      complete: hoursCount > 0,
      nudgeSubject: `${business.name}: Set your business hours`,
      nudgeBody: `<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>Quick setup step</h2>
        <p>Your AI receptionist needs to know <strong>when you're open</strong> so it can schedule appointments at the right times.</p>
        <p><a href="${APP_URL}/settings/calendar" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">Set Business Hours</a></p>
        <p style="color:#666;font-size:14px;">— The SmallBizAgent Team</p>
      </body></html>`,
    },
    {
      key: "phone",
      label: "Get your AI phone number",
      complete: !!business.twilioPhoneNumber,
      nudgeSubject: `${business.name}: Get your AI phone number`,
      nudgeBody: `<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>Your AI receptionist needs a phone number!</h2>
        <p>This is the number your AI will answer. Customers call this number and get a real conversation — booking appointments, answering questions, and more.</p>
        <p><a href="${APP_URL}/receptionist" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">Set Up Your AI Phone</a></p>
        <p style="color:#666;font-size:14px;">— The SmallBizAgent Team</p>
      </body></html>`,
    },
    {
      key: "call_forwarding",
      label: "Enable call forwarding",
      complete: !!business.callForwardingEnabled,
      nudgeSubject: `${business.name}: Forward calls to your AI receptionist`,
      nudgeBody: `<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>Last step: Start receiving calls!</h2>
        <p>You have an AI phone number — now <strong>forward your existing business phone</strong> to it. This way, when customers call your regular number, the AI picks up.</p>
        <p>It takes 30 seconds. Just dial *72 followed by your AI number from your business phone.</p>
        <p><a href="${APP_URL}/receptionist" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">See Forwarding Instructions</a></p>
        <p style="color:#666;font-size:14px;">— The SmallBizAgent Team</p>
      </body></html>`,
    },
    {
      key: "customers",
      label: "Add your first customer",
      complete: customerCount > 0,
      nudgeSubject: `${business.name}: Import your existing customers`,
      nudgeBody: `<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>Add your customers</h2>
        <p>SmallBizAgent works best when it knows your customers. You can add them manually or import from a CSV file.</p>
        <p><a href="${APP_URL}/customers" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">Add Customers</a></p>
        <p style="color:#666;font-size:14px;">— The SmallBizAgent Team</p>
      </body></html>`,
    },
    {
      key: "appointment",
      label: "Book your first appointment",
      complete: appointmentCount > 0,
      nudgeSubject: `${business.name}: Ready for your first booking?`,
      nudgeBody: `<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>You're all set up!</h2>
        <p>Try creating a test appointment to see how the booking flow works. Or share your public booking link with a customer.</p>
        <p><a href="${APP_URL}/appointments" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">Create an Appointment</a></p>
        <p style="color:#666;font-size:14px;">— The SmallBizAgent Team</p>
      </body></html>`,
    },
  ];
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function runOnboardingCoach(): Promise<{ nudgesSent: number }> {
  console.log(`[OnboardingCoach] Running onboarding coach at ${new Date().toISOString()}`);

  const fourteenDaysAgo = new Date(Date.now() - 14 * ONE_DAY_MS);
  let nudgesSent = 0;

  // Get businesses created in last 14 days
  const newBusinesses = await db
    .select()
    .from(businesses)
    .where(gte(businesses.createdAt, fourteenDaysAgo));

  if (newBusinesses.length === 0) {
    console.log("[OnboardingCoach] No new businesses in the last 14 days — nothing to do");
    return { nudgesSent: 0 };
  }

  // Build owner email map: businessId -> { email }
  // Query all users that have a businessId so we can find the owner for each business
  const allUsers = await db
    .select({
      businessId: users.businessId,
      email: users.email,
      role: users.role,
    })
    .from(users);

  const ownerMap = new Map<number, { email: string }>();
  for (const u of allUsers) {
    if (!u.businessId) continue;
    // Prefer owner/admin roles; if we haven't seen this business yet, use whatever user we find
    const existing = ownerMap.get(u.businessId);
    if (!existing || u.role === "admin" || u.role === "user") {
      ownerMap.set(u.businessId, { email: u.email });
    }
  }

  for (const biz of newBusinesses) {
    // Skip if not active or trialing
    const status = biz.subscriptionStatus || "inactive";
    if (status !== "active" && status !== "trialing") continue;

    // Only nudge if business is at least 1 day old (give them time to set up)
    if (biz.createdAt) {
      const ageMs = Date.now() - new Date(biz.createdAt).getTime();
      if (ageMs < ONE_DAY_MS) continue;
    }

    try {
      // Count services for this business
      const [svcResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(services)
        .where(eq(services.businessId, biz.id));

      // Count business hours rows for this business
      const [hoursResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(businessHours)
        .where(eq(businessHours.businessId, biz.id));

      // Count customers for this business
      const [custResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customers)
        .where(eq(customers.businessId, biz.id));

      // Count appointments for this business
      const [apptResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(eq(appointments.businessId, biz.id));

      const serviceCount = svcResult?.count || 0;
      const hoursCount = hoursResult?.count || 0;
      const customerCount = custResult?.count || 0;
      const appointmentCount = apptResult?.count || 0;

      const steps = getSteps(biz, serviceCount, hoursCount, customerCount, appointmentCount);

      // Find first incomplete step
      const nextStep = steps.find((s) => !s.complete);
      if (!nextStep) continue; // All steps complete — nothing to nudge

      // Check deduplication via notification_log
      const idempotencyKey = `drip:onboarding_coach:${nextStep.key}`;
      const logs = await storage.getNotificationLogs(biz.id, 200);
      const alreadySent = logs.some(
        (l) => l.type === idempotencyKey && l.status === "sent",
      );
      if (alreadySent) continue;

      // Determine recipient: prefer owner from user table, fall back to business email
      const owner = ownerMap.get(biz.id);
      const recipientEmail = owner?.email || biz.email;
      if (!recipientEmail) continue;

      // Send the nudge email
      await sendEmail({
        to: recipientEmail,
        subject: nextStep.nudgeSubject,
        text: `Next step for ${biz.name}: ${nextStep.label}. Visit ${APP_URL}/settings to continue setup.`,
        html: nextStep.nudgeBody,
      });

      // Record in notification log for deduplication
      await storage.createNotificationLog({
        businessId: biz.id,
        type: idempotencyKey,
        channel: "email",
        recipient: recipientEmail,
        subject: nextStep.nudgeSubject,
        status: "sent",
        referenceType: "business",
        referenceId: biz.id,
      });

      // Log agent action for analytics / audit trail
      await logAgentAction({
        businessId: biz.id,
        agentType: "platform:onboarding_coach",
        action: "nudge_sent",
        details: {
          step: nextStep.key,
          label: nextStep.label,
          recipientEmail,
          completedSteps: steps.filter((s) => s.complete).map((s) => s.key),
          remainingSteps: steps.filter((s) => !s.complete).map((s) => s.key),
        },
      });

      nudgesSent++;
      console.log(
        `[OnboardingCoach] Sent nudge for step "${nextStep.key}" to business ${biz.id} (${recipientEmail})`,
      );

      // Small delay between emails to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`[OnboardingCoach] Error for business ${biz.id}:`, err);
    }
  }

  console.log(`[OnboardingCoach] Done — ${nudgesSent} nudges sent`);
  return { nudgesSent };
}
