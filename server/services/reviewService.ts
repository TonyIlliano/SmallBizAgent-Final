import { db } from "../db";
import { reviewSettings, reviewRequests, customers, jobs, businesses } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import twilio from "twilio";

// Default cooldown if not configured per-business (fallback)
const DEFAULT_REVIEW_COOLDOWN_DAYS = 90;

// Twilio setup
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = twilioAccountSid && twilioAuthToken && twilioAccountSid.startsWith('AC');

let twilioClient: ReturnType<typeof twilio> | null = null;
if (isTwilioConfigured) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
}

interface ReviewRequestResult {
  success: boolean;
  requestId?: number;
  error?: string;
}

// Get review settings for a business
export async function getReviewSettings(businessId: number) {
  const [settings] = await db.select()
    .from(reviewSettings)
    .where(eq(reviewSettings.businessId, businessId));

  return settings;
}

// Create or update review settings
export async function upsertReviewSettings(businessId: number, data: any) {
  const existing = await getReviewSettings(businessId);

  if (existing) {
    const [updated] = await db.update(reviewSettings)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(reviewSettings.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(reviewSettings)
      .values({
        businessId,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return created;
  }
}

// Get the primary review URL for a business
export async function getReviewUrl(businessId: number): Promise<string | null> {
  const settings = await getReviewSettings(businessId);

  if (!settings) return null;

  switch (settings.preferredPlatform) {
    case 'google':
      return settings.googleReviewUrl;
    case 'yelp':
      return settings.yelpReviewUrl;
    case 'facebook':
      return settings.facebookReviewUrl;
    case 'custom':
      return settings.customReviewUrl;
    default:
      // Return first available URL
      return settings.googleReviewUrl ||
             settings.yelpReviewUrl ||
             settings.facebookReviewUrl ||
             settings.customReviewUrl;
  }
}

// Replace template variables
function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

// Send review request via SMS
export async function sendReviewRequestSms(
  businessId: number,
  customerId: number,
  jobId?: number
): Promise<ReviewRequestResult> {
  try {
    // Get review settings
    const settings = await getReviewSettings(businessId);
    if (!settings || !settings.reviewRequestEnabled) {
      return { success: false, error: 'Review requests not enabled for this business' };
    }

    // Get review URL
    const reviewUrl = await getReviewUrl(businessId);
    if (!reviewUrl) {
      return { success: false, error: 'No review URL configured' };
    }

    // Get customer info
    const [customer] = await db.select()
      .from(customers)
      .where(eq(customers.id, customerId));

    if (!customer || !customer.phone) {
      return { success: false, error: 'Customer not found or has no phone number' };
    }

    // TCPA compliance: only send SMS to customers who opted in
    if (!customer.smsOptIn) {
      return { success: false, error: 'Customer has not opted in to SMS (TCPA compliance)' };
    }

    // Get business info
    const [business] = await db.select()
      .from(businesses)
      .where(eq(businesses.id, businessId));

    if (!business || !business.twilioPhoneNumber) {
      return { success: false, error: 'Business not found or no Twilio number configured' };
    }

    // Check if we've already sent a review request for this job
    if (jobId) {
      const [existingRequest] = await db.select()
        .from(reviewRequests)
        .where(and(
          eq(reviewRequests.jobId, jobId),
          eq(reviewRequests.customerId, customerId)
        ));

      if (existingRequest) {
        return { success: false, error: 'Review request already sent for this job' };
      }
    }

    // Cooldown: don't spam the same customer with review requests
    // Uses per-business setting (great for restaurants where customers visit often)
    const cooldownDays = settings.reviewCooldownDays ?? DEFAULT_REVIEW_COOLDOWN_DAYS;
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);
    const [recentRequest] = await db.select()
      .from(reviewRequests)
      .where(and(
        eq(reviewRequests.customerId, customerId),
        eq(reviewRequests.businessId, businessId),
        gte(reviewRequests.sentAt, cooldownDate)
      ));

    if (recentRequest) {
      return { success: false, error: `Review request already sent to this customer within the last ${cooldownDays} days` };
    }

    // Build the message
    const template = settings.smsTemplate ||
      'Hi {customerName}! Thank you for choosing {businessName}. We\'d love to hear about your experience. Please leave us a review: {reviewLink}';

    const message = replaceTemplateVars(template, {
      customerName: customer.firstName,
      businessName: business.name,
      reviewLink: reviewUrl
    });

    // Send the SMS
    if (!twilioClient) {
      console.log('[Review Service] Twilio not configured, would send:', message);
      // Still record the request in dev mode
    } else {
      await twilioClient.messages.create({
        body: message,
        from: business.twilioPhoneNumber,
        to: customer.phone
      });
    }

    // Record the review request
    const [request] = await db.insert(reviewRequests)
      .values({
        businessId,
        customerId,
        jobId,
        sentVia: 'sms',
        platform: settings.preferredPlatform,
        reviewLink: reviewUrl,
        status: 'sent',
        sentAt: new Date(),
        createdAt: new Date()
      })
      .returning();

    console.log(`[Review Service] Sent review request via SMS to ${customer.phone}`);

    return { success: true, requestId: request.id };
  } catch (error: any) {
    console.error('[Review Service] Error sending review request:', error);
    return { success: false, error: error.message };
  }
}

// Send review request via Email (placeholder - would need email service like SendGrid)
export async function sendReviewRequestEmail(
  businessId: number,
  customerId: number,
  jobId?: number
): Promise<ReviewRequestResult> {
  try {
    // Get review settings
    const settings = await getReviewSettings(businessId);
    if (!settings || !settings.reviewRequestEnabled) {
      return { success: false, error: 'Review requests not enabled for this business' };
    }

    // Get review URL
    const reviewUrl = await getReviewUrl(businessId);
    if (!reviewUrl) {
      return { success: false, error: 'No review URL configured' };
    }

    // Get customer info
    const [customer] = await db.select()
      .from(customers)
      .where(eq(customers.id, customerId));

    if (!customer || !customer.email) {
      return { success: false, error: 'Customer not found or has no email' };
    }

    // Cooldown: don't spam the same customer with review requests
    // Uses per-business setting (great for restaurants where customers visit often)
    const cooldownDays = settings.reviewCooldownDays ?? DEFAULT_REVIEW_COOLDOWN_DAYS;
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);
    const [recentRequest] = await db.select()
      .from(reviewRequests)
      .where(and(
        eq(reviewRequests.customerId, customerId),
        eq(reviewRequests.businessId, businessId),
        gte(reviewRequests.sentAt, cooldownDate)
      ));

    if (recentRequest) {
      return { success: false, error: `Review request already sent to this customer within the last ${cooldownDays} days` };
    }

    // Get business info
    const [business] = await db.select()
      .from(businesses)
      .where(eq(businesses.id, businessId));

    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    // Build the email subject and body
    const subject = replaceTemplateVars(
      settings.emailSubject || 'How was your experience with {businessName}?',
      { businessName: business.name, customerName: customer.firstName }
    );

    const emailTemplate = settings.emailTemplate || `
      <p>Hi {customerName},</p>
      <p>Thank you for choosing {businessName}! We hope you had a great experience.</p>
      <p>We would really appreciate it if you could take a moment to leave us a review:</p>
      <p><a href="{reviewLink}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Leave a Review</a></p>
      <p>Your feedback helps us improve and helps others find great service.</p>
      <p>Thank you!<br>{businessName}</p>
    `;

    const body = replaceTemplateVars(emailTemplate, {
      customerName: customer.firstName,
      businessName: business.name,
      reviewLink: reviewUrl
    });

    // TODO: Integrate with email service (SendGrid, SES, etc.)
    console.log(`[Review Service] Would send email to ${customer.email}:`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);

    // Record the review request
    const [request] = await db.insert(reviewRequests)
      .values({
        businessId,
        customerId,
        jobId,
        sentVia: 'email',
        platform: settings.preferredPlatform,
        reviewLink: reviewUrl,
        status: 'sent',
        sentAt: new Date(),
        createdAt: new Date()
      })
      .returning();

    return { success: true, requestId: request.id };
  } catch (error: any) {
    console.error('[Review Service] Error sending review request email:', error);
    return { success: false, error: error.message };
  }
}

// Auto-send review request when job is completed
export async function sendReviewRequestForCompletedJob(
  jobId: number,
  businessId: number
): Promise<ReviewRequestResult> {
  try {
    // Get the job
    const [job] = await db.select()
      .from(jobs)
      .where(eq(jobs.id, jobId));

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Get review settings
    const settings = await getReviewSettings(businessId);
    if (!settings || !settings.reviewRequestEnabled || !settings.autoSendAfterJobCompletion) {
      return { success: false, error: 'Auto review requests not enabled' };
    }

    // Get customer info
    const [customer] = await db.select()
      .from(customers)
      .where(eq(customers.id, job.customerId));

    if (!customer) {
      return { success: false, error: 'Customer not found' };
    }

    // Prefer SMS if customer has phone AND opted in, otherwise try email
    if (customer.phone && customer.smsOptIn) {
      return await sendReviewRequestSms(businessId, job.customerId, jobId);
    } else if (customer.email) {
      return await sendReviewRequestEmail(businessId, job.customerId, jobId);
    } else if (customer.phone && !customer.smsOptIn) {
      return { success: false, error: 'Customer has not opted in to SMS and has no email' };
    } else {
      return { success: false, error: 'Customer has no contact information' };
    }
  } catch (error: any) {
    console.error('[Review Service] Error sending review request for job:', error);
    return { success: false, error: error.message };
  }
}

// Get review requests for a business
export async function getReviewRequests(businessId: number, limit: number = 50) {
  const requests = await db.select({
    request: reviewRequests,
    customerFirstName: customers.firstName,
    customerLastName: customers.lastName,
    customerEmail: customers.email,
    customerPhone: customers.phone,
    jobTitle: jobs.title
  })
  .from(reviewRequests)
  .leftJoin(customers, eq(reviewRequests.customerId, customers.id))
  .leftJoin(jobs, eq(reviewRequests.jobId, jobs.id))
  .where(eq(reviewRequests.businessId, businessId))
  .orderBy(desc(reviewRequests.sentAt))
  .limit(limit);

  return requests.map(r => ({
    ...r.request,
    customerName: `${r.customerFirstName} ${r.customerLastName}`,
    customerEmail: r.customerEmail,
    customerPhone: r.customerPhone,
    jobTitle: r.jobTitle
  }));
}

// Mark review request as clicked (for tracking)
export async function markReviewClicked(requestId: number) {
  const [updated] = await db.update(reviewRequests)
    .set({
      status: 'clicked',
      clickedAt: new Date()
    })
    .where(eq(reviewRequests.id, requestId))
    .returning();

  return updated;
}

// Get review statistics for a business
export async function getReviewStats(businessId: number) {
  const stats = await db.select({
    total: sql<number>`count(*)`,
    sent: sql<number>`count(*) filter (where status = 'sent')`,
    clicked: sql<number>`count(*) filter (where status = 'clicked')`,
    smsCount: sql<number>`count(*) filter (where sent_via = 'sms')`,
    emailCount: sql<number>`count(*) filter (where sent_via = 'email')`
  })
  .from(reviewRequests)
  .where(eq(reviewRequests.businessId, businessId));

  return stats[0] || { total: 0, sent: 0, clicked: 0, smsCount: 0, emailCount: 0 };
}

export default {
  getReviewSettings,
  upsertReviewSettings,
  getReviewUrl,
  sendReviewRequestSms,
  sendReviewRequestEmail,
  sendReviewRequestForCompletedJob,
  getReviewRequests,
  markReviewClicked,
  getReviewStats
};
