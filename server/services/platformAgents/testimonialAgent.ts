/**
 * Review & Testimonial Agent
 *
 * Runs every 7 days. Identifies successful businesses that could provide testimonials.
 *
 * Criteria for a good testimonial candidate:
 * - Active subscription for 30+ days
 * - Health score is good/excellent (or proxy: high call volume + appointments)
 * - Has not been asked before (check agent_activity_log)
 * - High engagement: >20 calls in last 30 days OR >30 appointments
 *
 * For each candidate:
 * - Draft a personalized testimonial request email (stored in details, NOT sent automatically)
 * - Include their specific stats: "You've booked X appointments and handled Y calls"
 *
 * agentType: 'platform:testimonial'
 * action: 'candidate_identified'
 * details: { businessName, email, stats: { calls, appointments, accountAge }, draftEmail }
 *
 * Admin reviews candidates in the AI Agents tab and can approve sending.
 */

import { db } from "../../db";
import { eq, sql, gte, and, desc, isNotNull } from "drizzle-orm";
import { businesses, users, callLogs, appointments, customers, subscriptionPlans } from "../../../shared/schema";
import { logAgentAction } from "../agentActivityService";
import { agentActivityLog } from "../../../shared/schema";

const AGENT_TYPE = 'platform:testimonial';
const MIN_ACCOUNT_AGE_DAYS = 30;
const MIN_CALLS_THRESHOLD = 20;
const MIN_APPOINTMENTS_THRESHOLD = 30;
const DEDUP_WINDOW_DAYS = 30;

interface TestimonialCandidate {
  businessId: number;
  businessName: string;
  email: string;
  stats: {
    calls: number;
    appointments: number;
    accountAgeDays: number;
  };
  draftEmail: string;
}

interface TestimonialResult {
  candidatesFound: number;
}

/**
 * Get active businesses with accounts older than 30 days.
 */
async function getEligibleBusinesses(): Promise<{
  id: number;
  name: string;
  email: string;
  createdAt: Date | null;
}[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MIN_ACCOUNT_AGE_DAYS);

  const results = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      email: businesses.email,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.isActive, true),
        eq(businesses.subscriptionStatus, 'active'),
        gte(businesses.createdAt, new Date('2000-01-01')), // has a created date
      )
    );

  // Filter to businesses with 30+ day account age
  return results.filter(b => {
    if (!b.createdAt) return false;
    const ageDays = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return ageDays >= MIN_ACCOUNT_AGE_DAYS;
  });
}

/**
 * Get call count for a business in the last 30 days.
 */
async function getCallCount(businessId: number): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(callLogs)
    .where(
      and(
        eq(callLogs.businessId, businessId),
        gte(callLogs.callTime, thirtyDaysAgo),
      )
    );

  return result[0]?.count ?? 0;
}

/**
 * Get appointment count for a business in the last 30 days.
 */
async function getAppointmentCount(businessId: number): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        gte(appointments.createdAt, thirtyDaysAgo),
      )
    );

  return result[0]?.count ?? 0;
}

/**
 * Check if a business has already been identified as a testimonial candidate recently.
 */
async function hasBeenContactedRecently(businessId: number): Promise<boolean> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DEDUP_WINDOW_DAYS);

  const results = await db
    .select({ id: agentActivityLog.id })
    .from(agentActivityLog)
    .where(
      and(
        eq(agentActivityLog.businessId, businessId),
        eq(agentActivityLog.agentType, AGENT_TYPE),
        eq(agentActivityLog.action, 'candidate_identified'),
        gte(agentActivityLog.createdAt, cutoffDate),
      )
    )
    .limit(1);

  return results.length > 0;
}

/**
 * Draft a personalized testimonial request email for a business.
 */
function draftTestimonialEmail(businessName: string, stats: { calls: number; appointments: number; accountAgeDays: number }): string {
  const monthsActive = Math.floor(stats.accountAgeDays / 30);
  const monthLabel = monthsActive === 1 ? 'month' : 'months';

  return [
    `Hi ${businessName} team,`,
    '',
    `We've loved having you as part of the SmallBizAgent family for the past ${monthsActive} ${monthLabel}!`,
    '',
    `Your numbers speak for themselves -- you've handled ${stats.calls} calls and booked ${stats.appointments} appointments in just the last 30 days. That's incredible!`,
    '',
    `We'd love to feature your success story. Would you be open to sharing a short testimonial about your experience with SmallBizAgent? It can be as simple as a few sentences about how the AI receptionist has helped your business.`,
    '',
    `Here are a few questions to get you started (feel free to answer any or all):`,
    `- What was your biggest challenge before using SmallBizAgent?`,
    `- How has the AI receptionist impacted your day-to-day operations?`,
    `- Would you recommend SmallBizAgent to other businesses in your industry?`,
    '',
    `Your feedback helps other small business owners discover how they can save time and never miss a customer call.`,
    '',
    `Thanks for being a valued customer!`,
    '',
    `Best,`,
    `The SmallBizAgent Team`,
  ].join('\n');
}

/**
 * Main entry point: run the Testimonial Agent.
 */
export async function runTestimonialAgent(): Promise<TestimonialResult> {
  console.log(`[${AGENT_TYPE}] Starting testimonial candidate identification...`);

  const eligibleBusinesses = await getEligibleBusinesses();
  console.log(`[${AGENT_TYPE}] Found ${eligibleBusinesses.length} businesses with 30+ day active accounts.`);

  let candidatesFound = 0;

  for (const business of eligibleBusinesses) {
    try {
      // Check dedup first (cheapest check)
      const alreadyContacted = await hasBeenContactedRecently(business.id);
      if (alreadyContacted) {
        continue;
      }

      // Get engagement metrics
      const [callCount, appointmentCount] = await Promise.all([
        getCallCount(business.id),
        getAppointmentCount(business.id),
      ]);

      // Check engagement thresholds
      const meetsCallThreshold = callCount > MIN_CALLS_THRESHOLD;
      const meetsAppointmentThreshold = appointmentCount > MIN_APPOINTMENTS_THRESHOLD;

      if (!meetsCallThreshold && !meetsAppointmentThreshold) {
        continue;
      }

      // Calculate account age
      const accountAgeDays = business.createdAt
        ? Math.floor((Date.now() - new Date(business.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : MIN_ACCOUNT_AGE_DAYS;

      const stats = {
        calls: callCount,
        appointments: appointmentCount,
        accountAgeDays,
      };

      // Draft the testimonial request email
      const draftEmail = draftTestimonialEmail(business.name, stats);

      // Log the candidate
      await logAgentAction({
        businessId: business.id,
        agentType: AGENT_TYPE,
        action: 'candidate_identified',
        details: {
          businessName: business.name,
          email: business.email,
          stats,
          draftEmail,
        },
      });

      candidatesFound++;
      console.log(`[${AGENT_TYPE}] Identified candidate: ${business.name} (${callCount} calls, ${appointmentCount} appointments)`);

      // Small delay between candidates
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`[${AGENT_TYPE}] Error processing business ${business.id} (${business.name}):`, err);
    }
  }

  console.log(`[${AGENT_TYPE}] Complete. Found ${candidatesFound} testimonial candidates.`);
  return { candidatesFound };
}

export default { runTestimonialAgent };
