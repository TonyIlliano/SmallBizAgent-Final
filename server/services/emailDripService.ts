/**
 * Email Drip Campaign Service for SmallBizAgent
 *
 * Manages automated email sequences triggered by lifecycle events:
 *   1. Onboarding Drip   — nudge new signups through setup (Day 1, 3, 7)
 *   2. Trial Expiration Drip — warn before trial ends + win-back after (Day-of, +3 days)
 *   3. Win-back Drip      — re-engage churned/canceled businesses (+7 days, +30 days)
 *
 * Idempotency is enforced via notification_log: each drip email uses a unique
 * `type` key like "drip:onboarding:day1" so the same email is never sent twice
 * for the same business.
 *
 * Called every 6 hours by the scheduler in schedulerService.ts.
 */

import { storage } from "../storage";
import { Business } from "@shared/schema";
import { sendEmail } from "../emailService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL || "https://www.smallbizagent.ai";

/** Milliseconds in one day */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Calculate whole days between two dates (positive = dateA is in the past relative to dateB) */
function daysBetween(dateA: Date, dateB: Date): number {
  return Math.floor((dateB.getTime() - dateA.getTime()) / ONE_DAY_MS);
}

/**
 * Check whether a drip email with the given idempotency key has already been
 * sent for a business. Uses the notification_log table's `type` column.
 *
 * Key format: `drip:<campaign>:<step>:<businessId>`
 */
async function hasAlreadySent(businessId: number, idempotencyKey: string): Promise<boolean> {
  const logs = await storage.getNotificationLogs(businessId, 500);
  return logs.some((l) => l.type === idempotencyKey && l.status === "sent");
}

/**
 * Record that a drip email was sent (or failed) in the notification_log table.
 */
async function recordDripSend(
  businessId: number,
  idempotencyKey: string,
  recipient: string,
  subject: string,
  status: "sent" | "failed",
  error?: string
): Promise<void> {
  await storage.createNotificationLog({
    businessId,
    type: idempotencyKey,
    channel: "email",
    recipient,
    subject,
    status,
    referenceType: "business",
    referenceId: businessId,
    error: error || null,
  });
}

/**
 * Attempt to send a drip email. Handles idempotency check, send, and logging.
 * Returns true if the email was sent, false if skipped or failed.
 */
async function sendDripEmail(
  business: Business,
  idempotencyKey: string,
  subject: string,
  text: string,
  html: string
): Promise<boolean> {
  if (!business.email) return false;

  // Idempotency: skip if already sent
  if (await hasAlreadySent(business.id, idempotencyKey)) {
    return false;
  }

  try {
    await sendEmail({ to: business.email, subject, text, html });
    await recordDripSend(business.id, idempotencyKey, business.email, subject, "sent");
    console.log(`[EmailDrip] Sent "${idempotencyKey}" to business ${business.id} (${business.email})`);
    return true;
  } catch (err: any) {
    console.error(`[EmailDrip] Failed "${idempotencyKey}" for business ${business.id}:`, err.message);
    await recordDripSend(business.id, idempotencyKey, business.email, subject, "failed", err.message);
    return false;
  }
}

// ─── Onboarding Drip Campaign ─────────────────────────────────────────────────
// Day 0: Welcome (handled at signup — not included here)
// Day 1: "Set up your AI receptionist"
// Day 3: "Your AI agents are ready"
// Day 7: "How's it going?"

async function processOnboardingDrip(business: Business): Promise<number> {
  if (!business.createdAt || !business.email) return 0;

  const daysSinceSignup = daysBetween(new Date(business.createdAt), new Date());
  let sent = 0;

  // Day 1: Remind them to complete onboarding
  if (daysSinceSignup >= 1) {
    const key = `drip:onboarding:day1:${business.id}`;
    const subject = "Set up your AI receptionist — it takes 2 minutes";
    const text = [
      `Hi${business.name ? ` ${business.name} team` : ""},`,
      "",
      "Welcome to SmallBizAgent! You signed up yesterday, and we wanted to make sure you get the most out of your free trial.",
      "",
      "Have you set up your AI receptionist yet? It only takes a couple of minutes:",
      "",
      "1. Add your business hours",
      "2. Customize your greeting",
      "3. Forward your phone line — and you're live!",
      "",
      `Get started: ${APP_URL}/dashboard`,
      "",
      "If you need any help, just reply to this email.",
      "",
      "— The SmallBizAgent Team",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Set Up Your AI Receptionist</h2>
        <p>Hi${business.name ? ` <strong>${business.name}</strong> team` : ""},</p>
        <p>Welcome to SmallBizAgent! You signed up yesterday, and we wanted to make sure you get the most out of your free trial.</p>
        <p>Have you set up your AI receptionist yet? It only takes a couple of minutes:</p>
        <ol style="color: #374151; line-height: 1.8;">
          <li>Add your business hours</li>
          <li>Customize your greeting</li>
          <li>Forward your phone line &mdash; and you're live!</li>
        </ol>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${APP_URL}/dashboard" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">Go to Dashboard</a>
        </div>
        <p style="color: #666; font-size: 14px;">If you need any help, just reply to this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
      </div>
    `;

    if (await sendDripEmail(business, key, subject, text, html)) sent++;
  }

  // Day 3: Highlight SMS agents feature
  if (daysSinceSignup >= 3) {
    const key = `drip:onboarding:day3:${business.id}`;
    const subject = "Your AI agents are ready to work for you";
    const text = [
      `Hi${business.name ? ` ${business.name} team` : ""},`,
      "",
      "Did you know SmallBizAgent includes AI-powered SMS agents that handle common tasks automatically?",
      "",
      "Here's what they can do:",
      "- Follow up on estimates you've sent",
      "- Detect no-shows and reach out to reschedule",
      "- Re-engage customers who haven't booked in a while",
      "- Draft responses to your Google reviews",
      "",
      `Turn them on in AI Agents: ${APP_URL}/ai-agents`,
      "",
      "They run in the background so you can focus on your craft.",
      "",
      "— The SmallBizAgent Team",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Your AI Agents Are Ready</h2>
        <p>Hi${business.name ? ` <strong>${business.name}</strong> team` : ""},</p>
        <p>Did you know SmallBizAgent includes AI-powered SMS agents that handle common tasks automatically?</p>
        <div style="background: #f0f9ff; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <ul style="color: #374151; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li><strong>Estimate Follow-Up</strong> &mdash; nudge customers who haven't responded to quotes</li>
            <li><strong>No-Show Detection</strong> &mdash; reach out automatically to reschedule</li>
            <li><strong>Rebooking Agent</strong> &mdash; re-engage customers who haven't booked in a while</li>
            <li><strong>Review Response</strong> &mdash; draft replies to your Google reviews</li>
          </ul>
        </div>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${APP_URL}/ai-agents" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">Explore AI Agents</a>
        </div>
        <p style="color: #666; font-size: 14px;">They run in the background so you can focus on your craft.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
      </div>
    `;

    if (await sendDripEmail(business, key, subject, text, html)) sent++;
  }

  // Day 7: Check-in
  if (daysSinceSignup >= 7) {
    const key = `drip:onboarding:day7:${business.id}`;
    const subject = "How's it going with SmallBizAgent?";
    const text = [
      `Hi${business.name ? ` ${business.name} team` : ""},`,
      "",
      "You've been using SmallBizAgent for a week now — how's it going?",
      "",
      "We'd love to hear what's working, what's confusing, or what we can improve.",
      "",
      "A few things you might not have tried yet:",
      "- Online booking page customers can use to self-schedule",
      "- Recurring jobs & invoices for repeat customers",
      "- Custom knowledge base so your AI receptionist can answer specific questions",
      "",
      "Just hit reply if you need anything at all. We read every message.",
      "",
      "— The SmallBizAgent Team",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">How's It Going?</h2>
        <p>Hi${business.name ? ` <strong>${business.name}</strong> team` : ""},</p>
        <p>You've been using SmallBizAgent for a week now &mdash; how's it going?</p>
        <p>We'd love to hear what's working, what's confusing, or what we can improve.</p>
        <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-weight: bold; color: #333;">A few things you might not have tried yet:</p>
          <ul style="color: #374151; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Online booking page customers can use to self-schedule</li>
            <li>Recurring jobs &amp; invoices for repeat customers</li>
            <li>Custom knowledge base so your AI receptionist can answer specific questions</li>
          </ul>
        </div>
        <p>Just hit reply if you need anything at all. We read every message.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
      </div>
    `;

    if (await sendDripEmail(business, key, subject, text, html)) sent++;
  }

  return sent;
}

// ─── Trial Expiration Drip Campaign ───────────────────────────────────────────
// 3 days before:  Warning (handled by schedulerService.ts — sendTrialExpirationWarnings)
// 1 day before:   Urgent warning (handled by schedulerService.ts — sendTrialExpirationWarnings)
// Day of expiry:  "Your trial has ended"
// 3 days after:   Win-back — "We miss you, here's 20% off"

async function processTrialExpirationDrip(business: Business): Promise<number> {
  if (!business.trialEndsAt || !business.email) return 0;

  // Skip businesses with active paid subscriptions
  const status = (business as any).subscriptionStatus;
  if (status === "active" || status === "trialing") return 0;

  const trialEnd = new Date(business.trialEndsAt);
  const now = new Date();
  const daysSinceExpiry = daysBetween(trialEnd, now); // positive = trial is in the past

  let sent = 0;

  // Day of expiry (0-1 days after)
  if (daysSinceExpiry >= 0 && daysSinceExpiry < 2) {
    const key = `drip:trial:expired:${business.id}`;
    const subject = "Your SmallBizAgent trial has ended";
    const text = [
      `Hi${business.name ? ` ${business.name} team` : ""},`,
      "",
      "Your free trial of SmallBizAgent has ended.",
      "",
      "Here's what happens now:",
      "- Your AI receptionist has been deactivated",
      "- Your provisioned phone number will be released",
      "- Your business data (customers, invoices, appointments) is safe and waiting for you",
      "",
      "Subscribe now to pick up right where you left off:",
      `${APP_URL}/settings?tab=subscription`,
      "",
      "— The SmallBizAgent Team",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #dc2626; margin: 0;">Your Trial Has Ended</h2>
        </div>
        <p>Hi${business.name ? ` <strong>${business.name}</strong> team` : ""},</p>
        <p>Your free trial of SmallBizAgent has ended.</p>
        <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-weight: bold;">Here's what happens now:</p>
          <ul style="color: #374151; margin: 0; padding-left: 20px;">
            <li>Your AI receptionist has been deactivated</li>
            <li>Your provisioned phone number will be released</li>
            <li>Your business data (customers, invoices, appointments) is safe and waiting for you</li>
          </ul>
        </div>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${APP_URL}/settings?tab=subscription" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">Subscribe Now</a>
        </div>
        <p style="color: #666; font-size: 14px;">Pick up right where you left off.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
      </div>
    `;

    if (await sendDripEmail(business, key, subject, text, html)) sent++;
  }

  // 3 days after expiry: Win-back with 20% off
  if (daysSinceExpiry >= 3) {
    const key = `drip:trial:winback3:${business.id}`;
    const subject = "We miss you — here's 20% off SmallBizAgent";
    const text = [
      `Hi${business.name ? ` ${business.name} team` : ""},`,
      "",
      "It's been a few days since your SmallBizAgent trial ended, and we'd love to have you back.",
      "",
      "As a thank-you for trying us out, here's an exclusive offer:",
      "",
      "  20% OFF your first 3 months",
      `  Use code COMEBACK20 at checkout: ${APP_URL}/settings?tab=subscription`,
      "",
      "Your data is still here — customers, appointments, invoices — all safe and waiting. You can be back up and running in seconds.",
      "",
      "— The SmallBizAgent Team",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">We Miss You!</h2>
        <p>Hi${business.name ? ` <strong>${business.name}</strong> team` : ""},</p>
        <p>It's been a few days since your SmallBizAgent trial ended, and we'd love to have you back.</p>
        <div style="background: #eff6ff; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
          <p style="font-size: 24px; font-weight: bold; color: #1e40af; margin: 0 0 8px;">20% OFF</p>
          <p style="color: #1e40af; margin: 0;">Your first 3 months</p>
          <p style="margin: 12px 0 0; font-family: monospace; background: #dbeafe; display: inline-block; padding: 6px 16px; border-radius: 4px; font-size: 16px; font-weight: bold; color: #1e3a8a;">COMEBACK20</p>
        </div>
        <p>Your data is still here &mdash; customers, appointments, invoices &mdash; all safe and waiting. You can be back up and running in seconds.</p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${APP_URL}/settings?tab=subscription" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">Reactivate Now</a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
      </div>
    `;

    if (await sendDripEmail(business, key, subject, text, html)) sent++;
  }

  return sent;
}

// ─── Win-back Drip Campaign (Churned / Canceled) ──────────────────────────────
// 7 days after cancel:  "We'd love to have you back"
// 30 days after cancel: "Special offer: 30% off for 3 months"

async function processWinbackDrip(business: Business): Promise<number> {
  if (!business.email) return 0;

  // Only target businesses that had a subscription that ended (canceled/churned)
  const status = (business as any).subscriptionStatus;
  if (status !== "canceled" && status !== "past_due" && status !== "unpaid") return 0;

  // Use subscriptionEndDate as the cancellation anchor
  const endDate = (business as any).subscriptionEndDate;
  if (!endDate) return 0;

  const cancelDate = new Date(endDate);
  const daysSinceCancel = daysBetween(cancelDate, new Date());

  let sent = 0;

  // 7 days after cancel
  if (daysSinceCancel >= 7) {
    const key = `drip:winback:day7:${business.id}`;
    const subject = "We'd love to have you back on SmallBizAgent";
    const text = [
      `Hi${business.name ? ` ${business.name} team` : ""},`,
      "",
      "We noticed your SmallBizAgent subscription ended recently, and we're sorry to see you go.",
      "",
      "If there was anything we could have done better, we'd love to hear about it — just reply to this email.",
      "",
      "In the meantime, your account and all your data are still here if you ever want to come back. Reactivating takes just a few clicks:",
      `${APP_URL}/settings?tab=subscription`,
      "",
      "— The SmallBizAgent Team",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">We'd Love to Have You Back</h2>
        <p>Hi${business.name ? ` <strong>${business.name}</strong> team` : ""},</p>
        <p>We noticed your SmallBizAgent subscription ended recently, and we're sorry to see you go.</p>
        <p>If there was anything we could have done better, we'd love to hear about it &mdash; just reply to this email.</p>
        <p>In the meantime, your account and all your data are still here if you ever want to come back. Reactivating takes just a few clicks.</p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${APP_URL}/settings?tab=subscription" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">Reactivate My Account</a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
      </div>
    `;

    if (await sendDripEmail(business, key, subject, text, html)) sent++;
  }

  // 30 days after cancel: Special offer
  if (daysSinceCancel >= 30) {
    const key = `drip:winback:day30:${business.id}`;
    const subject = "Special offer: 30% off SmallBizAgent for 3 months";
    const text = [
      `Hi${business.name ? ` ${business.name} team` : ""},`,
      "",
      "It's been a month since you left SmallBizAgent, and we've been busy shipping improvements:",
      "",
      "- Smarter AI receptionist with better call handling",
      "- New SMS automation agents that work while you sleep",
      "- Improved online booking and customer management",
      "",
      "We'd love for you to give us another shot. Here's an exclusive offer:",
      "",
      "  30% OFF for 3 months",
      `  Use code WINBACK30 at checkout: ${APP_URL}/settings?tab=subscription`,
      "",
      "No pressure — your data is still safe and waiting for you.",
      "",
      "— The SmallBizAgent Team",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">We've Missed You</h2>
        <p>Hi${business.name ? ` <strong>${business.name}</strong> team` : ""},</p>
        <p>It's been a month since you left SmallBizAgent, and we've been busy shipping improvements:</p>
        <ul style="color: #374151; line-height: 1.8;">
          <li>Smarter AI receptionist with better call handling</li>
          <li>New SMS automation agents that work while you sleep</li>
          <li>Improved online booking and customer management</li>
        </ul>
        <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
          <p style="font-size: 24px; font-weight: bold; color: #166534; margin: 0 0 8px;">30% OFF</p>
          <p style="color: #166534; margin: 0;">For 3 months</p>
          <p style="margin: 12px 0 0; font-family: monospace; background: #dcfce7; display: inline-block; padding: 6px 16px; border-radius: 4px; font-size: 16px; font-weight: bold; color: #14532d;">WINBACK30</p>
        </div>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${APP_URL}/settings?tab=subscription" style="display: inline-block; background: #16a34a; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">Reactivate with 30% Off</a>
        </div>
        <p style="color: #666; font-size: 14px;">No pressure &mdash; your data is still safe and waiting for you.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
      </div>
    `;

    if (await sendDripEmail(business, key, subject, text, html)) sent++;
  }

  return sent;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Process all email drip campaigns for every business.
 * Called by the scheduler every 6 hours.
 */
export async function processEmailDrips(): Promise<void> {
  try {
    console.log(`[EmailDrip] Starting drip campaign processing at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();

    let totalOnboarding = 0;
    let totalTrialExpiration = 0;
    let totalWinback = 0;

    for (const business of allBusinesses) {
      try {
        totalOnboarding += await processOnboardingDrip(business);
        totalTrialExpiration += await processTrialExpirationDrip(business);
        totalWinback += await processWinbackDrip(business);
      } catch (err) {
        console.error(`[EmailDrip] Error processing business ${business.id}:`, err);
      }

      // Small delay between businesses to avoid email provider rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(
      `[EmailDrip] Done — onboarding: ${totalOnboarding}, trial: ${totalTrialExpiration}, winback: ${totalWinback}`
    );
  } catch (error) {
    console.error("[EmailDrip] Error:", error);
  }
}
