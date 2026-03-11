/**
 * Customer Insights Service
 *
 * Aggregates all interaction data for a customer into a single insights row.
 * Calculates: lifetime value, visit frequency, preferences, sentiment trends,
 * risk level, and auto-tags.
 *
 * Two modes:
 * 1. Event-driven: called after call intelligence is extracted (incremental update)
 * 2. Nightly batch: full recalculation for all customers (paginated with circuit breaker)
 */

import { storage } from '../storage';

// Maximum time (2 hours) for nightly batch before circuit breaker kicks in
const NIGHTLY_MAX_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Recalculate insights for a single customer.
 * Called after call intelligence is extracted, or during nightly batch.
 */
export async function recalculateCustomerInsights(
  customerId: number,
  businessId: number
): Promise<void> {
  try {
    const customer = await storage.getCustomer(customerId);
    if (!customer) return;

    // Gather all data points in parallel — filter at DB level, not in-memory
    const [appointments, jobs, invoices, callIntelligence, agentLogs] = await Promise.all([
      storage.getAppointmentsByCustomerId(customerId),
      storage.getJobs(businessId, { customerId }),
      storage.getInvoices(businessId, { customerId }).catch(() => []),
      storage.getCallIntelligenceByCustomer(customerId, businessId, 50),
      storage.getAgentActivityLogs(businessId, { limit: 500 }),
    ]);

    // Filter agent logs for this customer (no DB-level filter available)
    const customerAgentLogs = agentLogs.filter((l: any) => l.customerId === customerId);

    // === Financial metrics ===
    const paidInvoices = invoices.filter((inv: any) => inv.status === 'paid');
    const lifetimeValue = paidInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0);
    const totalInvoices = paidInvoices.length;
    const averageInvoiceAmount = totalInvoices > 0 ? lifetimeValue / totalInvoices : 0;

    // === Visit metrics ===
    const completedAppointments = appointments.filter((a: any) => a.status === 'completed');
    const completedJobs = jobs.filter((j: any) => j.status === 'completed');
    const totalVisits = completedAppointments.length + completedJobs.length;

    // Calculate visit dates sorted chronologically
    const visitDates = [
      ...completedAppointments.map((a: any) => new Date(a.startDate)),
      ...completedJobs.filter((j: any) => j.updatedAt).map((j: any) => new Date(j.updatedAt)),
    ].sort((a, b) => a.getTime() - b.getTime());

    const lastVisitDate = visitDates.length > 0 ? visitDates[visitDates.length - 1] : null;
    const daysSinceLastVisit = lastVisitDate
      ? Math.floor((Date.now() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Average frequency between visits
    let averageVisitFrequencyDays: number | null = null;
    if (visitDates.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < visitDates.length; i++) {
        gaps.push((visitDates[i].getTime() - visitDates[i - 1].getTime()) / (1000 * 60 * 60 * 24));
      }
      averageVisitFrequencyDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    }

    // === Preferences (from call intelligence key facts) ===
    const allFacts = callIntelligence
      .map((r: any) => r.keyFacts)
      .filter(Boolean);

    const preferredServices = getMostFrequent(
      allFacts.flatMap((f: any) => f.servicesMentioned || [])
    );
    const preferredStaff = getMostFrequent(
      allFacts.map((f: any) => f.staffPreference).filter(Boolean)
    )[0] || null;

    // Day of week from completed appointments
    const dayOfWeekCounts: Record<string, number> = {};
    completedAppointments.forEach((a: any) => {
      const day = new Date(a.startDate).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      dayOfWeekCounts[day] = (dayOfWeekCounts[day] || 0) + 1;
    });
    const preferredDayOfWeek = Object.entries(dayOfWeekCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Time of day from completed appointments
    const timeCounts = { morning: 0, afternoon: 0, evening: 0 };
    completedAppointments.forEach((a: any) => {
      const hour = new Date(a.startDate).getHours();
      if (hour < 12) timeCounts.morning++;
      else if (hour < 17) timeCounts.afternoon++;
      else timeCounts.evening++;
    });
    const preferredTimeOfDay = Object.entries(timeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // === Communication patterns ===
    const smsSent = customerAgentLogs.filter((l: any) => l.action === 'sms_sent').length;
    let smsReplied = 0;
    try {
      const conversations = await storage.getSmsConversationsByBusiness(businessId);
      const customerConvos = conversations.filter((c: any) => c.customerId === customerId);
      smsReplied = customerConvos.filter((c: any) => c.lastReplyReceivedAt).length;
    } catch { /* best effort */ }
    const smsResponseRate = smsSent > 0 ? smsReplied / smsSent : 0;

    // Communication preference: need minimum 3 SMS interactions to judge
    const communicationPreference = smsSent >= 3 && smsResponseRate > 0.5 ? 'sms' : 'phone';

    // === Sentiment ===
    // callIntelligence is sorted descending (newest first), so sentiments[0] = most recent
    const sentiments = callIntelligence
      .map((r: any) => r.sentiment)
      .filter((s: any): s is number => s != null);
    const averageSentiment = sentiments.length > 0
      ? sentiments.reduce((a: number, b: number) => a + b, 0) / sentiments.length
      : null;
    const lastCallSentiment = sentiments.length > 0 ? sentiments[0] : null;

    // Trend: compare newer calls (first half of array) vs older calls (second half)
    // sentiments[0..mid-1] = newer, sentiments[mid..end] = older
    let sentimentTrend: string = 'stable';
    if (sentiments.length >= 4) {
      const mid = Math.floor(sentiments.length / 2);
      const newerAvg = sentiments.slice(0, mid).reduce((a: number, b: number) => a + b, 0) / mid;
      const olderAvg = sentiments.slice(mid).reduce((a: number, b: number) => a + b, 0) / (sentiments.length - mid);
      if (newerAvg - olderAvg > 0.5) sentimentTrend = 'improving';
      else if (olderAvg - newerAvg > 0.5) sentimentTrend = 'declining';
    }

    // === Reliability ===
    const noShowCount = appointments.filter((a: any) => a.status === 'no_show').length;
    const cancellationCount = appointments.filter((a: any) => a.status === 'cancelled').length;
    const completedCount = completedAppointments.length;
    const totalScheduled = noShowCount + cancellationCount + completedCount;
    const reliabilityScore = totalScheduled > 0
      ? completedCount / totalScheduled
      : 1.0; // No data = assume reliable

    // === Risk assessment ===
    const riskFactors: string[] = [];
    let riskScore = 0;

    if (daysSinceLastVisit && daysSinceLastVisit > 90) {
      riskFactors.push('inactive_90_days');
      riskScore += 2;
    }
    if (sentimentTrend === 'declining') {
      riskFactors.push('declining_sentiment');
      riskScore += 2;
    }
    if (lastCallSentiment && lastCallSentiment <= 2) {
      riskFactors.push('recent_negative_call');
      riskScore += 1;
    }
    if (noShowCount >= 2) {
      riskFactors.push('multiple_no_shows');
      riskScore += 1;
    }
    if (cancellationCount >= 3) {
      riskFactors.push('frequent_cancellations');
      riskScore += 1;
    }

    const riskLevel = riskScore >= 4 ? 'high' : riskScore >= 2 ? 'medium' : 'low';
    const churnProbability = Math.min(riskScore / 6, 1.0);

    // === Auto tags ===
    const autoTags: string[] = [];
    if (lifetimeValue > 1000) autoTags.push('High-Value');
    if (totalVisits >= 10) autoTags.push('Frequent');
    if (totalVisits <= 1) autoTags.push('New');
    if (riskLevel === 'high') autoTags.push('At-Risk');
    if (noShowCount > 0) autoTags.push('No-Show-History');
    if (averageSentiment && averageSentiment >= 4.5) autoTags.push('Happy');
    if (reliabilityScore >= 0.95 && totalScheduled >= 3) autoTags.push('Reliable');

    // === Accumulated facts ===
    const objections = Array.from(new Set(allFacts.flatMap((f: any) => f.objections || [])));
    const accumulatedFacts = { objections, specialRequests: [] as string[], notes: [] as string[] };

    // === Upsert ===
    await storage.upsertCustomerInsights(customerId, businessId, {
      lifetimeValue,
      totalInvoices,
      averageInvoiceAmount,
      totalVisits,
      averageVisitFrequencyDays,
      lastVisitDate,
      daysSinceLastVisit,
      preferredServices,
      preferredStaff,
      preferredDayOfWeek,
      preferredTimeOfDay,
      communicationPreference,
      smsResponseRate,
      totalSmsSent: smsSent,
      totalSmsReplied: smsReplied,
      totalCalls: callIntelligence.length,
      averageSentiment,
      sentimentTrend,
      lastCallSentiment,
      noShowCount,
      cancellationCount,
      completedCount,
      reliabilityScore,
      riskLevel,
      riskFactors,
      churnProbability,
      autoTags,
      accumulatedFacts,
      lastCalculatedAt: new Date(),
    });

    console.log(`[CustomerInsights] Updated insights for customer ${customerId}: LTV=$${lifetimeValue.toFixed(2)}, risk=${riskLevel}, visits=${totalVisits}`);
  } catch (err) {
    console.error(`[CustomerInsights] Error recalculating for customer ${customerId}:`, err);
  }
}

/**
 * Nightly batch: recalculate insights for all customers of all businesses.
 * Called by scheduler. Paginated with circuit breaker to prevent runaway execution.
 */
export async function runNightlyInsightsRecalculation(): Promise<void> {
  const startTime = Date.now();

  try {
    console.log(`[CustomerInsights] Starting nightly recalculation at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    let totalProcessed = 0;
    let totalSkipped = 0;

    for (const business of allBusinesses) {
      // Circuit breaker: stop if running too long
      if (Date.now() - startTime > NIGHTLY_MAX_DURATION_MS) {
        console.warn(`[CustomerInsights] Circuit breaker hit after ${totalProcessed} customers. Stopping nightly run.`);
        break;
      }

      try {
        const customers = await storage.getCustomers(business.id);
        for (const customer of customers) {
          // Circuit breaker check inside inner loop too
          if (Date.now() - startTime > NIGHTLY_MAX_DURATION_MS) break;

          try {
            await recalculateCustomerInsights(customer.id, business.id);
            totalProcessed++;
          } catch (err) {
            totalSkipped++;
            console.error(`[CustomerInsights] Failed for customer ${customer.id}:`, err);
          }

          // Throttle: delay every 25 customers to avoid DB pressure
          if (totalProcessed % 25 === 0) {
            await new Promise(r => setTimeout(r, 300));
          }
        }
      } catch (err) {
        console.error(`[CustomerInsights] Error processing business ${business.id}:`, err);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[CustomerInsights] Nightly recalculation done — ${totalProcessed} processed, ${totalSkipped} skipped, ${duration}s elapsed`);
  } catch (err) {
    console.error('[CustomerInsights] Nightly recalculation error:', err);
  }
}

/**
 * Get most frequent items from an array.
 * Preserves original case of the first occurrence.
 */
function getMostFrequent(items: string[], limit = 5): string[] {
  const counts: Record<string, { count: number; original: string }> = {};
  items.forEach(item => {
    const normalized = item.toLowerCase().trim();
    if (normalized) {
      if (counts[normalized]) {
        counts[normalized].count++;
      } else {
        counts[normalized] = { count: 1, original: item.trim() };
      }
    }
  });
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(entry => entry.original);
}
