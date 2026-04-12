/**
 * Job Briefing Service
 *
 * Generates AI-powered briefings before each job by pulling from:
 * - Customer profile and tags
 * - Customer insights (lifetime value, preferences, sentiment)
 * - Call intelligence (recent transcripts, intent, sentiment scores)
 * - Previous jobs for this customer
 * - Mem0 persistent conversational memory
 *
 * Used by field techs (HVAC, plumbing, electrical, etc.) to walk into
 * a job with full context on who the customer is, what's been done before,
 * and how to approach the visit.
 *
 * Cost: ~$0.005 per briefing (Claude Sonnet, ~1500 tokens in / ~800 out)
 */

import { storage } from '../storage';
import { claudeJson } from './claudeClient';
import { searchMemory } from './mem0Service';

export interface JobBriefing {
  summary: string;              // 2-3 sentence overview
  customerContext: string;      // Customer relationship summary
  jobHistory: string;           // Previous visit summary
  currentJob: string;           // What this visit is about
  sentiment: string;            // Customer mood/satisfaction
  suggestedApproach: string;    // How to handle this visit
  followUpOpportunities: string[]; // Upsell/cross-sell ideas
  generatedAt: string;          // ISO timestamp
}

/**
 * Generate an AI-powered briefing for a job.
 * Pulls context from multiple sources and uses Claude to synthesize.
 * Gracefully degrades if AI fails — returns a basic briefing from raw data.
 */
export async function generateJobBriefing(
  jobId: number,
  businessId: number
): Promise<JobBriefing> {
  const now = new Date().toISOString();

  // 1. Fetch the job
  const job = await storage.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // 2. Fetch customer
  const customer = job.customerId
    ? await storage.getCustomer(job.customerId)
    : null;

  const customerName = customer
    ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown'
    : 'Unknown Customer';

  // 3. Fetch all context in parallel (best effort — each can fail independently)
  const [
    customerInsights,
    callIntelligenceRecords,
    previousJobs,
    lineItems,
    staff,
    mem0Memories,
    linkedAppointment,
  ] = await Promise.all([
    // Customer insights (LTV, preferences, sentiment, risk)
    customer
      ? storage.getCustomerInsights(customer.id, businessId).catch(() => undefined)
      : Promise.resolve(undefined),

    // Recent call intelligence for this customer (last 5 calls)
    customer
      ? storage.getCallIntelligenceByCustomer(customer.id, businessId, 5).catch(() => [])
      : Promise.resolve([]),

    // Previous jobs for this customer
    customer
      ? storage.getJobs(businessId, { customerId: customer.id }).catch(() => [])
      : Promise.resolve([]),

    // Line items for the current job
    storage.getJobLineItems(jobId).catch(() => []),

    // Assigned staff
    job.staffId
      ? storage.getStaffMember(job.staffId).catch(() => null)
      : Promise.resolve(null),

    // Mem0 memories (with 3s timeout)
    customer
      ? searchMemory(businessId, customer.id, `job briefing for ${customerName}`, 5, 3000).catch(() => '')
      : Promise.resolve(''),

    // Linked appointment data
    job.appointmentId
      ? storage.getAppointment(job.appointmentId).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Filter out the current job from previous jobs
  const pastJobs = previousJobs
    .filter((j: any) => j.id !== jobId)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10); // Last 10 jobs

  // Build the context prompt — keep it concise to stay under 2000 tokens
  const contextParts: string[] = [];

  // Customer info
  if (customer) {
    const parts = [`Customer: ${customerName}`];
    if (customer.phone) parts.push(`Phone: ${customer.phone}`);
    if (customer.email) parts.push(`Email: ${customer.email}`);
    if ((customer as any).address) parts.push(`Address: ${(customer as any).address}`);
    if ((customer as any).tags) parts.push(`Tags: ${(customer as any).tags}`);
    if ((customer as any).notes) parts.push(`Notes: ${(customer as any).notes}`);
    contextParts.push(parts.join('\n'));
  }

  // Customer insights
  if (customerInsights) {
    const ci = customerInsights as any;
    const insightParts = ['--- Customer Insights ---'];
    if (ci.lifetimeValue != null) insightParts.push(`Lifetime Value: $${Number(ci.lifetimeValue).toFixed(2)}`);
    if (ci.totalVisits != null) insightParts.push(`Total Visits: ${ci.totalVisits}`);
    if (ci.averageVisitFrequencyDays != null) insightParts.push(`Avg Visit Frequency: every ${Math.round(ci.averageVisitFrequencyDays)} days`);
    if (ci.preferredServices && ci.preferredServices.length > 0) insightParts.push(`Preferred Services: ${ci.preferredServices.join(', ')}`);
    if (ci.preferredStaff) insightParts.push(`Preferred Staff: ${ci.preferredStaff}`);
    if (ci.sentimentTrend) insightParts.push(`Sentiment Trend: ${ci.sentimentTrend}`);
    if (ci.riskLevel) insightParts.push(`Risk Level: ${ci.riskLevel}`);
    if (ci.riskFactors && ci.riskFactors.length > 0) insightParts.push(`Risk Factors: ${ci.riskFactors.join(', ')}`);
    if (ci.reliabilityScore != null) insightParts.push(`Reliability Score: ${(ci.reliabilityScore * 100).toFixed(0)}%`);
    if (ci.noShowCount > 0) insightParts.push(`No-Shows: ${ci.noShowCount}`);
    if (ci.autoTags && ci.autoTags.length > 0) insightParts.push(`Auto Tags: ${ci.autoTags.join(', ')}`);
    contextParts.push(insightParts.join('\n'));
  }

  // Current job
  const currentJobParts = ['--- Current Job ---'];
  currentJobParts.push(`Title: ${job.title}`);
  if (job.description) currentJobParts.push(`Description: ${job.description}`);
  if (job.scheduledDate) currentJobParts.push(`Scheduled: ${job.scheduledDate}`);
  currentJobParts.push(`Status: ${job.status}`);
  if (job.notes) currentJobParts.push(`Notes: ${job.notes}`);
  if (staff) currentJobParts.push(`Assigned Tech: ${staff.firstName} ${staff.lastName}`);
  if (lineItems.length > 0) {
    currentJobParts.push(`Line Items: ${lineItems.map((li: any) => `${li.description} ($${(li.unitPrice / 100).toFixed(2)})`).join(', ')}`);
  }
  if (linkedAppointment) {
    currentJobParts.push(`Appointment: ${new Date(linkedAppointment.startDate).toLocaleString()} - ${new Date(linkedAppointment.endDate).toLocaleString()}`);
  }
  contextParts.push(currentJobParts.join('\n'));

  // Previous jobs (compact)
  if (pastJobs.length > 0) {
    const jobSummaries = pastJobs.slice(0, 5).map((j: any) => {
      const date = j.scheduledDate || j.createdAt?.toString().split('T')[0] || 'unknown date';
      return `- ${j.title} (${j.status}, ${date})${j.notes ? ` — ${j.notes.substring(0, 80)}` : ''}`;
    });
    contextParts.push(`--- Previous Jobs (${pastJobs.length} total) ---\n${jobSummaries.join('\n')}`);
  }

  // Call intelligence (recent call summaries + sentiment)
  if (callIntelligenceRecords.length > 0) {
    const callSummaries = callIntelligenceRecords.slice(0, 3).map((ci: any) => {
      const date = ci.createdAt?.toString().split('T')[0] || 'unknown';
      const summary = ci.summary?.substring(0, 200) || 'No summary';
      return `- [${date}] Sentiment: ${ci.sentiment}/5, Intent: ${ci.intent}. ${summary}`;
    });
    contextParts.push(`--- Recent Calls (${callIntelligenceRecords.length} total) ---\n${callSummaries.join('\n')}`);

    // Surface any pending follow-ups
    const pendingFollowUps = callIntelligenceRecords.filter(
      (ci: any) => ci.followUpNeeded && ci.followUpType !== 'none'
    );
    if (pendingFollowUps.length > 0) {
      const followUpLines = pendingFollowUps.slice(0, 2).map(
        (ci: any) => `- ${ci.followUpType}: ${ci.followUpNotes?.substring(0, 100) || 'No details'}`
      );
      contextParts.push(`--- Pending Follow-Ups ---\n${followUpLines.join('\n')}`);
    }
  }

  // Mem0 memories
  if (mem0Memories) {
    contextParts.push(`--- Conversational Memory ---\n${mem0Memories.substring(0, 400)}`);
  }

  const fullContext = contextParts.join('\n\n');

  // Try AI generation, fall back to basic briefing on failure
  try {
    const briefing = await claudeJson<JobBriefing>({
      system: `You are generating a job briefing for a field technician or service professional who is about to visit a customer. Synthesize all the context below into a structured briefing.

Return valid JSON with exactly these fields:
- summary (string): 2-3 sentence overview of who this customer is and what this job is about
- customerContext (string): 1-2 sentences about the customer relationship — how long they've been a customer, their value, preferences, any notable history
- jobHistory (string): 1-2 sentences summarizing their previous visits and any patterns or recurring issues
- currentJob (string): 1-2 sentences about what this specific visit is for and any relevant details
- sentiment (string): 1 sentence about the customer's overall mood/satisfaction trend based on call data and insights
- suggestedApproach (string): 2-3 sentences of practical advice for the tech — how to greet them, what to be aware of, any sensitivities
- followUpOpportunities (string[]): 1-3 brief upsell or cross-sell ideas based on their history and the current job. Be specific and relevant, not generic.

Keep each field concise. This is read on a mobile phone screen before a job.
Do NOT wrap the JSON in markdown code blocks. Return raw JSON only.`,
      prompt: fullContext,
      maxTokens: 1024,
    });

    return {
      ...briefing,
      generatedAt: now,
    };
  } catch (err) {
    console.error('[JobBriefing] AI generation failed, returning basic briefing:', (err as Error).message);
    return buildFallbackBriefing(job, customer, customerInsights, pastJobs, callIntelligenceRecords, now);
  }
}

/**
 * Build a basic briefing from raw data when AI generation fails.
 * Ensures the feature always returns something useful.
 */
function buildFallbackBriefing(
  job: any,
  customer: any,
  insights: any,
  pastJobs: any[],
  callIntelligence: any[],
  generatedAt: string,
): JobBriefing {
  const customerName = customer
    ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown'
    : 'Unknown Customer';

  const ltv = insights?.lifetimeValue ? `$${Number(insights.lifetimeValue).toFixed(2)}` : 'unknown';
  const visits = insights?.totalVisits ?? pastJobs.length;

  const avgSentiment = callIntelligence.length > 0
    ? (callIntelligence.reduce((s: number, ci: any) => s + (ci.sentiment || 3), 0) / callIntelligence.length).toFixed(1)
    : null;

  return {
    summary: `Job "${job.title}" for ${customerName}. ${visits > 0 ? `Returning customer with ${visits} previous visit(s).` : 'New customer — first visit.'}`,
    customerContext: `${customerName}, lifetime value: ${ltv}. ${visits} total visit(s) on record.${insights?.preferredStaff ? ` Prefers working with ${insights.preferredStaff}.` : ''}`,
    jobHistory: pastJobs.length > 0
      ? `Last visit: ${pastJobs[0].title} (${pastJobs[0].status}). ${pastJobs.length} job(s) in history.`
      : 'No previous job history on file.',
    currentJob: `${job.title}${job.description ? ` — ${job.description}` : ''}.${job.scheduledDate ? ` Scheduled for ${job.scheduledDate}.` : ''}`,
    sentiment: avgSentiment
      ? `Average call sentiment: ${avgSentiment}/5.${insights?.sentimentTrend === 'declining' ? ' Trend is declining — extra care recommended.' : ''}`
      : 'No call sentiment data available.',
    suggestedApproach: insights?.riskLevel === 'high'
      ? 'This is a high-risk customer. Be extra attentive, confirm expectations upfront, and follow up after the visit.'
      : 'Standard approach. Greet warmly, confirm the scope of work, and ask if there are any other concerns.',
    followUpOpportunities: insights?.preferredServices && insights.preferredServices.length > 0
      ? [`Mention availability for: ${insights.preferredServices.join(', ')}`]
      : ['Ask if they have any other maintenance needs'],
    generatedAt,
  };
}
