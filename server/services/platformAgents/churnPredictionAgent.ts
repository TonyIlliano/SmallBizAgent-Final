/**
 * Churn Prediction Agent
 *
 * Runs every 24 hours. Scores every active/trialing business on churn risk
 * based on engagement signals. High-risk businesses trigger an alert stored
 * in a platform_agent_alerts table (we'll use notification_log with a special type).
 *
 * Scoring factors (0-100 scale, higher = more at risk):
 * - Days since owner last login (users.lastLogin)
 * - Declining call volume (callLogs count this week vs last week)
 * - Declining appointment volume (appointments this week vs last week)
 * - Payment failures (subscriptionStatus === 'past_due' or 'payment_failed')
 * - Feature adoption: no Twilio number provisioned, no call forwarding, receptionist disabled
 * - Account age < 30 days (new accounts churn more)
 * - No customers added in last 14 days
 *
 * Output: For each business, calculate a churnRiskScore (0-100).
 * If score >= 70, it's "high risk". If 40-69, "medium risk". Below 40 is "low risk".
 *
 * Store results in the agent_activity_log table:
 *   agentType: 'platform:churn_prediction'
 *   action: 'risk_scored'
 *   businessId: the business being scored
 *   details: { score, riskLevel, factors: [...reasons], recommendations: [...] }
 *
 * For HIGH risk businesses, also log:
 *   action: 'alert_generated'
 *   details: { score, riskLevel, businessName, ownerEmail, factors, recommendations }
 */

import { db } from "../../db";
import { eq, sql, gte, and, desc } from "drizzle-orm";
import { businesses, users, callLogs, appointments, customers } from "@shared/schema";
import { logAgentAction } from "../agentActivityService";

interface ChurnFactor {
  factor: string;
  weight: number; // How much this contributes to the score
  detail: string;
}

interface ChurnPrediction {
  businessId: number;
  businessName: string;
  ownerEmail: string | null;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: ChurnFactor[];
  recommendations: string[];
}

export async function runChurnPrediction(): Promise<{ predictions: ChurnPrediction[]; highRiskCount: number }> {
  console.log(`[ChurnPrediction] Running churn prediction at ${new Date().toISOString()}`);

  // Get all active/trialing businesses with their owners
  const allBusinesses = await db.select().from(businesses);
  const allUsers = await db.select({
    id: users.id,
    businessId: users.businessId,
    email: users.email,
    lastLogin: users.lastLogin,
    role: users.role,
  }).from(users);

  const ownerMap = new Map<number, { email: string; lastLogin: Date | null }>();
  for (const u of allUsers) {
    if (u.businessId && u.role !== 'staff') {
      ownerMap.set(u.businessId, { email: u.email, lastLogin: u.lastLogin });
    }
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Batch query call counts per business for this week and last week
  const [thisWeekCalls, lastWeekCalls] = await Promise.all([
    db.select({ businessId: callLogs.businessId, count: sql<number>`count(*)::int` })
      .from(callLogs).where(gte(callLogs.callTime, oneWeekAgo)).groupBy(callLogs.businessId),
    db.select({ businessId: callLogs.businessId, count: sql<number>`count(*)::int` })
      .from(callLogs).where(and(gte(callLogs.callTime, twoWeeksAgo), sql`${callLogs.callTime} < ${oneWeekAgo}`)).groupBy(callLogs.businessId),
  ]);

  const thisWeekCallMap = new Map(thisWeekCalls.map(c => [c.businessId, c.count]));
  const lastWeekCallMap = new Map(lastWeekCalls.map(c => [c.businessId, c.count]));

  // Batch query appointment counts
  const [thisWeekAppts, lastWeekAppts] = await Promise.all([
    db.select({ businessId: appointments.businessId, count: sql<number>`count(*)::int` })
      .from(appointments).where(gte(appointments.createdAt, oneWeekAgo)).groupBy(appointments.businessId),
    db.select({ businessId: appointments.businessId, count: sql<number>`count(*)::int` })
      .from(appointments).where(and(gte(appointments.createdAt, twoWeeksAgo), sql`${appointments.createdAt} < ${oneWeekAgo}`)).groupBy(appointments.businessId),
  ]);

  const thisWeekApptMap = new Map(thisWeekAppts.map(a => [a.businessId, a.count]));
  const lastWeekApptMap = new Map(lastWeekAppts.map(a => [a.businessId, a.count]));

  // Recent customers added per business
  const recentCustomers = await db.select({
    businessId: customers.businessId,
    count: sql<number>`count(*)::int`,
  }).from(customers).where(gte(customers.createdAt, twoWeeksAgo)).groupBy(customers.businessId);
  const recentCustomerMap = new Map(recentCustomers.map(c => [c.businessId, c.count]));

  const predictions: ChurnPrediction[] = [];
  let highRiskCount = 0;

  for (const biz of allBusinesses) {
    const status = biz.subscriptionStatus || 'inactive';
    // Only score active, trialing, or past_due businesses (past_due = still paying but at risk)
    if (status !== 'active' && status !== 'trialing' && status !== 'past_due' && status !== 'payment_failed') continue;

    const owner = ownerMap.get(biz.id);
    const factors: ChurnFactor[] = [];
    let totalScore = 0;

    // Factor 1: Days since last login (max 25 points)
    if (owner?.lastLogin) {
      const daysSinceLogin = Math.floor((now.getTime() - new Date(owner.lastLogin).getTime()) / (24 * 60 * 60 * 1000));
      if (daysSinceLogin > 14) {
        const weight = Math.min(25, Math.floor(daysSinceLogin / 2));
        factors.push({ factor: 'Inactive owner', weight, detail: `Last login ${daysSinceLogin} days ago` });
        totalScore += weight;
      }
    } else {
      factors.push({ factor: 'Never logged in after signup', weight: 20, detail: 'Owner has never logged in' });
      totalScore += 20;
    }

    // Factor 2: Declining call volume (max 20 points)
    const callsThisWeek = thisWeekCallMap.get(biz.id) || 0;
    const callsLastWeek = lastWeekCallMap.get(biz.id) || 0;
    if (callsLastWeek > 0 && callsThisWeek < callsLastWeek * 0.5) {
      const weight = 20;
      factors.push({ factor: 'Call volume dropped', weight, detail: `${callsLastWeek} → ${callsThisWeek} calls (week over week)` });
      totalScore += weight;
    } else if (callsThisWeek === 0 && callsLastWeek === 0) {
      factors.push({ factor: 'No call activity', weight: 10, detail: 'Zero calls in last 2 weeks' });
      totalScore += 10;
    }

    // Factor 3: Declining appointment volume (max 15 points)
    const apptsThisWeek = thisWeekApptMap.get(biz.id) || 0;
    const apptsLastWeek = lastWeekApptMap.get(biz.id) || 0;
    if (apptsLastWeek > 0 && apptsThisWeek < apptsLastWeek * 0.5) {
      factors.push({ factor: 'Appointment volume dropped', weight: 15, detail: `${apptsLastWeek} → ${apptsThisWeek} appointments (week over week)` });
      totalScore += 15;
    }

    // Factor 4: Payment issues (max 20 points)
    if (status === 'past_due') {
      factors.push({ factor: 'Payment past due', weight: 20, detail: 'Subscription payment has failed' });
      totalScore += 20;
    } else if ((biz as any).subscriptionStatus === 'payment_failed') {
      factors.push({ factor: 'Payment failed', weight: 15, detail: 'Recent payment failure' });
      totalScore += 15;
    }

    // Factor 5: Feature adoption (max 15 points)
    if (!biz.twilioPhoneNumber) {
      factors.push({ factor: 'No phone number', weight: 8, detail: 'No Twilio phone number provisioned' });
      totalScore += 8;
    }
    if (!biz.callForwardingEnabled) {
      factors.push({ factor: 'No call forwarding', weight: 4, detail: 'Call forwarding not enabled' });
      totalScore += 4;
    }
    if (biz.receptionistEnabled === false) {
      factors.push({ factor: 'Receptionist disabled', weight: 5, detail: 'AI receptionist is turned off' });
      totalScore += 5;
    }

    // Factor 6: New account (max 10 points)
    if (biz.createdAt) {
      const accountAge = Math.floor((now.getTime() - new Date(biz.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      if (accountAge < 30) {
        factors.push({ factor: 'New account', weight: 10, detail: `Account is only ${accountAge} days old` });
        totalScore += 10;
      }
    }

    // Factor 7: No new customers (max 10 points)
    const recentCustCount = recentCustomerMap.get(biz.id) || 0;
    if (recentCustCount === 0) {
      factors.push({ factor: 'No new customers', weight: 8, detail: 'No customers added in last 14 days' });
      totalScore += 8;
    }

    // Cap at 100
    const score = Math.min(100, totalScore);
    const riskLevel = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

    // Generate recommendations
    const recommendations: string[] = [];
    if (factors.some(f => f.factor.includes('login'))) {
      recommendations.push('Send a personalized check-in email to the business owner');
    }
    if (factors.some(f => f.factor.includes('call') || f.factor.includes('phone'))) {
      recommendations.push('Offer a guided setup session for their AI receptionist');
    }
    if (factors.some(f => f.factor.includes('Payment'))) {
      recommendations.push('Reach out about payment issues and offer flexible billing options');
    }
    if (factors.some(f => f.factor.includes('New account'))) {
      recommendations.push('Ensure onboarding emails are being received and engage proactively');
    }
    if (factors.some(f => f.factor.includes('customer'))) {
      recommendations.push('Share tips on importing existing customers or promoting their booking link');
    }
    if (recommendations.length === 0) {
      recommendations.push('Monitor — no immediate action needed');
    }

    const prediction: ChurnPrediction = {
      businessId: biz.id,
      businessName: biz.name,
      ownerEmail: owner?.email || biz.email,
      score,
      riskLevel,
      factors,
      recommendations,
    };
    predictions.push(prediction);

    // Log the score
    await logAgentAction({
      businessId: biz.id,
      agentType: 'platform:churn_prediction',
      action: 'risk_scored',
      details: { score, riskLevel, factors: factors.map(f => f.detail), recommendations },
    });

    // Generate alert for high risk
    if (riskLevel === 'high') {
      highRiskCount++;
      await logAgentAction({
        businessId: biz.id,
        agentType: 'platform:churn_prediction',
        action: 'alert_generated',
        details: {
          score,
          riskLevel,
          businessName: biz.name,
          ownerEmail: owner?.email || biz.email,
          factors: factors.map(f => `${f.factor}: ${f.detail}`),
          recommendations,
        },
      });
      // Notify admin in real time
      try {
        const { sendAdminAlert } = await import('../adminAlertService');
        await sendAdminAlert({ type: 'churn_risk_high', severity: 'medium', title: `High Churn Risk: ${biz.name}`, details: { businessId: biz.id, businessName: biz.name, riskScore: score, ownerEmail: owner?.email || biz.email || 'N/A', topFactors: factors.slice(0, 3).map(f => f.detail).join('; ') } });
      } catch (_) {}
    }
  }

  // Sort by score descending
  predictions.sort((a, b) => b.score - a.score);

  // Feed results into the agent coordinator for cross-agent actions
  try {
    const { processChurnResults } = await import('./agentCoordinator');
    await processChurnResults(predictions);
  } catch (err) {
    console.warn(`[ChurnPrediction] Coordinator processing failed (non-blocking):`, (err as Error).message);
  }

  console.log(`[ChurnPrediction] Done — ${predictions.length} businesses scored, ${highRiskCount} high risk`);
  return { predictions, highRiskCount };
}
