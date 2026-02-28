/**
 * Marketing Service
 *
 * Provides marketing automation capabilities for SmallBizAgent businesses:
 * - Business insights & customer segmentation
 * - Win-back campaigns for inactive customers
 * - Review request campaigns
 * - Campaign management & history
 */

import { pool } from "../db";

// Day-of-week mapping (PostgreSQL EXTRACT(DOW) returns 0=Sunday through 6=Saturday)
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Generate actionable business insights from database analytics.
 */
export async function getMarketingInsights(businessId: number) {
  try {
    // Run all queries in parallel for performance
    const [
      topServicesResult,
      busiestDayResult,
      callIntentsResult,
      newCustomersResult,
      activeCustomersResult,
      atRiskCustomersResult,
      totalCustomersResult,
      revenueThisMonthResult,
      revenueLastMonthResult,
      unansweredQuestionsResult,
    ] = await Promise.all([
      // Top services by job count
      pool.query(
        `SELECT title AS name, COUNT(*)::int AS count
         FROM jobs
         WHERE business_id = $1
         GROUP BY title
         ORDER BY count DESC
         LIMIT 5`,
        [businessId]
      ),

      // Busiest day of the week by appointments
      pool.query(
        `SELECT EXTRACT(DOW FROM start_date)::int AS dow, COUNT(*)::int AS count
         FROM appointments
         WHERE business_id = $1
         GROUP BY dow
         ORDER BY count DESC
         LIMIT 1`,
        [businessId]
      ),

      // Top call intents
      pool.query(
        `SELECT intent_detected AS intent, COUNT(*)::int AS count
         FROM call_logs
         WHERE business_id = $1 AND intent_detected IS NOT NULL
         GROUP BY intent_detected
         ORDER BY count DESC
         LIMIT 5`,
        [businessId]
      ),

      // New customers (created within last 30 days)
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM customers
         WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        [businessId]
      ),

      // Active customers (have a job or invoice in last 90 days)
      pool.query(
        `SELECT COUNT(DISTINCT c.id)::int AS count
         FROM customers c
         WHERE c.business_id = $1
           AND (
             EXISTS (SELECT 1 FROM jobs j WHERE j.customer_id = c.id AND j.business_id = c.business_id AND j.created_at >= NOW() - INTERVAL '90 days')
             OR EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.business_id = c.business_id AND i.created_at >= NOW() - INTERVAL '90 days')
           )`,
        [businessId]
      ),

      // At-risk customers (last job/invoice was 90-180 days ago)
      pool.query(
        `SELECT COUNT(DISTINCT c.id)::int AS count
         FROM customers c
         WHERE c.business_id = $1
           AND (
             EXISTS (SELECT 1 FROM jobs j WHERE j.customer_id = c.id AND j.business_id = c.business_id AND j.created_at >= NOW() - INTERVAL '180 days' AND j.created_at < NOW() - INTERVAL '90 days')
             OR EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.business_id = c.business_id AND i.created_at >= NOW() - INTERVAL '180 days' AND i.created_at < NOW() - INTERVAL '90 days')
           )
           AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.customer_id = c.id AND j.business_id = c.business_id AND j.created_at >= NOW() - INTERVAL '90 days')
           AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.business_id = c.business_id AND i.created_at >= NOW() - INTERVAL '90 days')`,
        [businessId]
      ),

      // Total customers
      pool.query(
        `SELECT COUNT(*)::int AS count FROM customers WHERE business_id = $1`,
        [businessId]
      ),

      // Revenue this month (paid invoices)
      pool.query(
        `SELECT COALESCE(SUM(total), 0)::float AS revenue
         FROM invoices
         WHERE business_id = $1
           AND status = 'paid'
           AND created_at >= DATE_TRUNC('month', NOW())`,
        [businessId]
      ),

      // Revenue last month (paid invoices)
      pool.query(
        `SELECT COALESCE(SUM(total), 0)::float AS revenue
         FROM invoices
         WHERE business_id = $1
           AND status = 'paid'
           AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
           AND created_at < DATE_TRUNC('month', NOW())`,
        [businessId]
      ),

      // Unanswered questions count
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM unanswered_questions
         WHERE business_id = $1 AND status = 'pending'`,
        [businessId]
      ),
    ]);

    // Parse results
    const topServices = topServicesResult.rows.map((r: any) => ({
      name: r.name,
      count: r.count,
    }));

    const busiestDayRow = busiestDayResult.rows[0];
    const busiestDay = busiestDayRow
      ? { day: DAY_NAMES[busiestDayRow.dow] || "Unknown", count: busiestDayRow.count }
      : { day: "N/A", count: 0 };

    const callIntents = callIntentsResult.rows.map((r: any) => ({
      intent: r.intent,
      count: r.count,
    }));

    const totalCustomers = totalCustomersResult.rows[0]?.count || 0;
    const newCount = newCustomersResult.rows[0]?.count || 0;
    const activeCount = activeCustomersResult.rows[0]?.count || 0;
    const atRiskCount = atRiskCustomersResult.rows[0]?.count || 0;
    const lostCount = Math.max(0, totalCustomers - newCount - activeCount - atRiskCount);

    const customerSegments = {
      new: newCount,
      active: activeCount,
      atRisk: atRiskCount,
      lost: lostCount,
    };

    const revenueThisMonth = revenueThisMonthResult.rows[0]?.revenue || 0;
    const revenueLastMonth = revenueLastMonthResult.rows[0]?.revenue || 0;

    let revenueTrend = 0;
    if (revenueLastMonth > 0) {
      revenueTrend = ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100;
    } else if (revenueThisMonth > 0) {
      revenueTrend = 100;
    }

    const unansweredQuestionsCount = unansweredQuestionsResult.rows[0]?.count || 0;

    return {
      topServices,
      busiestDay,
      callIntents,
      segments: customerSegments,
      revenueThisMonth,
      revenueLastMonth,
      unansweredQuestions: unansweredQuestionsCount,
      totalCustomers,
    };
  } catch (error) {
    console.error("[MarketingService] Error getting marketing insights:", error);
    throw error;
  }
}

/**
 * Find customers who haven't had any job, invoice, or appointment in the last N days.
 */
export async function getInactiveCustomers(businessId: number, daysInactive: number) {
  try {
    const result = await pool.query(
      `SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        MAX(GREATEST(
          COALESCE(j.created_at, '1970-01-01'::timestamp),
          COALESCE(i.created_at, '1970-01-01'::timestamp),
          COALESCE(a.start_date, '1970-01-01'::timestamp)
        )) AS last_activity,
        COALESCE(SUM(i.total), 0)::float AS lifetime_revenue
      FROM customers c
      LEFT JOIN jobs j ON j.customer_id = c.id AND j.business_id = c.business_id
      LEFT JOIN invoices i ON i.customer_id = c.id AND i.business_id = c.business_id
      LEFT JOIN appointments a ON a.customer_id = c.id AND a.business_id = c.business_id
      WHERE c.business_id = $1
      GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone
      HAVING MAX(GREATEST(
        COALESCE(j.created_at, '1970-01-01'::timestamp),
        COALESCE(i.created_at, '1970-01-01'::timestamp),
        COALESCE(a.start_date, '1970-01-01'::timestamp)
      )) < NOW() - MAKE_INTERVAL(days => $2)
        OR MAX(GREATEST(
          COALESCE(j.created_at, '1970-01-01'::timestamp),
          COALESCE(i.created_at, '1970-01-01'::timestamp),
          COALESCE(a.start_date, '1970-01-01'::timestamp)
        )) = '1970-01-01'::timestamp
      ORDER BY lifetime_revenue DESC`,
      [businessId, daysInactive]
    );

    return result.rows.map((r: any) => {
      const lastActivity = r.last_activity && new Date(r.last_activity).getTime() > 0
        ? new Date(r.last_activity)
        : null;
      const daysSinceVisit = lastActivity
        ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        phone: r.phone,
        lastActivityDate: lastActivity ? lastActivity.toISOString() : null,
        lifetimeRevenue: r.lifetime_revenue,
        daysSinceVisit,
      };
    });
  } catch (error) {
    console.error("[MarketingService] Error getting inactive customers:", error);
    throw error;
  }
}

/**
 * Send a win-back campaign to selected inactive customers.
 */
export async function sendWinBackCampaign(
  businessId: number,
  customerIds: number[],
  template: string,
  channel: "sms" | "email" | "both",
  subject?: string
) {
  try {
    // Get business info
    const businessResult = await pool.query(
      `SELECT * FROM businesses WHERE id = $1`,
      [businessId]
    );
    const business = businessResult.rows[0];
    if (!business) {
      throw new Error("Business not found");
    }

    // Get customer records
    const customersResult = await pool.query(
      `SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
        MAX(GREATEST(
          COALESCE(j.created_at, '1970-01-01'::timestamp),
          COALESCE(i.created_at, '1970-01-01'::timestamp),
          COALESCE(a.start_date, '1970-01-01'::timestamp)
        )) AS last_activity
      FROM customers c
      LEFT JOIN jobs j ON j.customer_id = c.id AND j.business_id = c.business_id
      LEFT JOIN invoices i ON i.customer_id = c.id AND i.business_id = c.business_id
      LEFT JOIN appointments a ON a.customer_id = c.id AND a.business_id = c.business_id
      WHERE c.id = ANY($1) AND c.business_id = $2
      GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone`,
      [customerIds, businessId]
    );
    const customerRecords = customersResult.rows;

    let sentCount = 0;
    let failedCount = 0;

    for (const customer of customerRecords) {
      const lastActivity = customer.last_activity && new Date(customer.last_activity).getTime() > 0
        ? new Date(customer.last_activity)
        : null;
      const daysSinceVisit = lastActivity
        ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : "a while";

      // Replace template variables
      const message = template
        .replace(/\{firstName\}/g, customer.first_name || "")
        .replace(/\{businessName\}/g, business.name || "")
        .replace(/\{daysSinceVisit\}/g, String(daysSinceVisit));

      // Send SMS (TCPA: requires marketing opt-in)
      if (channel === "sms" || channel === "both") {
        if (customer.phone && customer.marketing_opt_in === true) {
          try {
            const smsMessage = message + '\n\nReply STOP to opt out. Msg & data rates may apply.';
            const { sendSms } = await import("./twilioService");
            await sendSms(customer.phone, smsMessage, business.twilio_phone_number || undefined);
            await pool.query(
              `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, message, status, reference_type)
               VALUES ($1, $2, 'marketing_campaign', 'sms', $3, $4, 'sent', 'campaign')`,
              [businessId, customer.id, customer.phone, smsMessage]
            );
            sentCount++;
          } catch (err) {
            console.error(`[MarketingService] Failed to send SMS to customer ${customer.id}:`, err);
            await pool.query(
              `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, message, status, reference_type, error)
               VALUES ($1, $2, 'marketing_campaign', 'sms', $3, $4, 'failed', 'campaign', $5)`,
              [businessId, customer.id, customer.phone, message, err instanceof Error ? err.message : "Unknown error"]
            );
            failedCount++;
          }
        }
      }

      // Send Email
      if (channel === "email" || channel === "both") {
        if (customer.email) {
          try {
            const { sendEmail } = await import("../emailService");
            await sendEmail({
              to: customer.email,
              subject: subject || `We miss you at ${business.name}!`,
              text: message,
              html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
            });
            await pool.query(
              `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, subject, message, status, reference_type)
               VALUES ($1, $2, 'marketing_campaign', 'email', $3, $4, $5, 'sent', 'campaign')`,
              [businessId, customer.id, customer.email, subject || `We miss you at ${business.name}!`, message]
            );
            sentCount++;
          } catch (err) {
            console.error(`[MarketingService] Failed to send email to customer ${customer.id}:`, err);
            await pool.query(
              `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, subject, message, status, reference_type, error)
               VALUES ($1, $2, 'marketing_campaign', 'email', $3, $4, $5, 'failed', 'campaign', $6)`,
              [businessId, customer.id, customer.email, subject || `We miss you at ${business.name}!`, message, err instanceof Error ? err.message : "Unknown error"]
            );
            failedCount++;
          }
        }
      }
    }

    // Create marketing_campaigns record
    const campaignResult = await pool.query(
      `INSERT INTO marketing_campaigns (business_id, name, type, channel, segment, template, subject, status, recipient_count, sent_count, sent_at, created_at, updated_at)
       VALUES ($1, 'Win-Back Campaign', 'win_back', $2, 'inactive', $3, $4, 'sent', $5, $6, NOW(), NOW(), NOW())
       RETURNING id`,
      [businessId, channel, template, subject || null, customerIds.length, sentCount]
    );

    return {
      campaignId: campaignResult.rows[0]?.id,
      sentCount,
      failedCount,
    };
  } catch (error) {
    console.error("[MarketingService] Error sending win-back campaign:", error);
    throw error;
  }
}

/**
 * Get review campaign statistics for a business.
 */
export async function getReviewCampaignStats(businessId: number) {
  try {
    const [
      totalResult,
      clickedResult,
      byChannelResult,
      byPlatformResult,
      eligibleResult,
    ] = await Promise.all([
      // Total sent
      pool.query(
        `SELECT COUNT(*)::int AS total FROM review_requests WHERE business_id = $1`,
        [businessId]
      ),

      // Clicked count
      pool.query(
        `SELECT COUNT(*)::int AS clicked FROM review_requests WHERE business_id = $1 AND status = 'clicked'`,
        [businessId]
      ),

      // By channel (sent_via)
      pool.query(
        `SELECT sent_via, COUNT(*)::int AS count
         FROM review_requests
         WHERE business_id = $1
         GROUP BY sent_via`,
        [businessId]
      ),

      // By platform
      pool.query(
        `SELECT platform, COUNT(*)::int AS count
         FROM review_requests
         WHERE business_id = $1
         GROUP BY platform`,
        [businessId]
      ),

      // Eligible customers: completed job in last 90 days without a review_request
      pool.query(
        `SELECT DISTINCT c.id, c.first_name, c.last_name, c.email, c.phone,
                MAX(j.created_at) AS last_job_date
         FROM customers c
         INNER JOIN jobs j ON j.customer_id = c.id AND j.business_id = c.business_id
         WHERE c.business_id = $1
           AND j.status = 'completed'
           AND j.created_at >= NOW() - INTERVAL '90 days'
           AND NOT EXISTS (
             SELECT 1 FROM review_requests rr
             WHERE rr.customer_id = c.id AND rr.business_id = c.business_id
           )
         GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone`,
        [businessId]
      ),
    ]);

    const totalSent = totalResult.rows[0]?.total || 0;
    const clickedCount = clickedResult.rows[0]?.clicked || 0;
    const clickRate = totalSent > 0 ? Math.round((clickedCount / totalSent) * 1000) / 10 : 0;

    const byChannel: Record<string, number> = {};
    for (const row of byChannelResult.rows) {
      byChannel[row.sent_via] = row.count;
    }

    const byPlatform: Record<string, number> = {};
    for (const row of byPlatformResult.rows) {
      if (row.platform) {
        byPlatform[row.platform] = row.count;
      }
    }

    const eligibleCustomers = eligibleResult.rows.map((r: any) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      lastJobDate: r.last_job_date,
    }));

    // Find top platform by count
    const topPlatform = Object.entries(byPlatform).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return {
      totalRequestsSent: totalSent,
      clickThroughRate: clickRate,
      smsSent: byChannel['sms'] || 0,
      emailSent: byChannel['email'] || 0,
      topPlatform,
      eligibleCustomers,
    };
  } catch (error) {
    console.error("[MarketingService] Error getting review campaign stats:", error);
    throw error;
  }
}

/**
 * Send bulk review requests to selected customers.
 */
export async function sendBulkReviewRequests(businessId: number, customerIds: number[]) {
  try {
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // Get business info and review settings
    const businessResult = await pool.query(
      `SELECT * FROM businesses WHERE id = $1`,
      [businessId]
    );
    const business = businessResult.rows[0];
    if (!business) {
      throw new Error("Business not found");
    }

    const settingsResult = await pool.query(
      `SELECT * FROM review_settings WHERE business_id = $1`,
      [businessId]
    );
    const settings = settingsResult.rows[0];

    // Get review URL based on preferred platform
    let reviewUrl: string | null = null;
    if (settings) {
      switch (settings.preferred_platform) {
        case "google":
          reviewUrl = settings.google_review_url;
          break;
        case "yelp":
          reviewUrl = settings.yelp_review_url;
          break;
        case "facebook":
          reviewUrl = settings.facebook_review_url;
          break;
        case "custom":
          reviewUrl = settings.custom_review_url;
          break;
        default:
          reviewUrl = settings.google_review_url || settings.yelp_review_url || settings.facebook_review_url || settings.custom_review_url;
      }
    }

    for (const customerId of customerIds) {
      try {
        // Check if customer already has a pending review request
        const existingResult = await pool.query(
          `SELECT id FROM review_requests WHERE customer_id = $1 AND business_id = $2 AND status = 'sent'`,
          [customerId, businessId]
        );

        if (existingResult.rows.length > 0) {
          skipped++;
          continue;
        }

        // Get customer info
        const customerResult = await pool.query(
          `SELECT * FROM customers WHERE id = $1 AND business_id = $2`,
          [customerId, businessId]
        );
        const customer = customerResult.rows[0];
        if (!customer) {
          skipped++;
          continue;
        }

        // Determine channel: SMS only if customer opted in (TCPA), otherwise email
        const sentVia = (customer.phone && customer.sms_opt_in === true) ? "sms" : customer.email ? "email" : null;
        if (!sentVia) {
          skipped++;
          continue;
        }

        // 30-day cooldown: skip if we already sent a review request recently
        const cooldownCheck = await pool.query(
          `SELECT id FROM review_requests WHERE customer_id = $1 AND business_id = $2 AND sent_at > NOW() - INTERVAL '30 days'`,
          [customerId, businessId]
        );
        if (cooldownCheck.rows.length > 0) {
          skipped++;
          continue;
        }

        // Send the review request message
        const smsTemplate = settings?.sms_template ||
          "Hi {customerName}! Thank you for choosing {businessName}. We'd love to hear about your experience. Please leave us a review: {reviewLink}";
        const message = smsTemplate
          .replace(/\{customerName\}/g, customer.first_name || "")
          .replace(/\{businessName\}/g, business.name || "")
          .replace(/\{reviewLink\}/g, reviewUrl || "");

        if (sentVia === "sms" && customer.phone && customer.sms_opt_in === true) {
          try {
            const smsMessage = message + '\n\nReply STOP to opt out. Msg & data rates may apply.';
            const { sendSms } = await import("./twilioService");
            await sendSms(customer.phone, smsMessage, business.twilio_phone_number || undefined);
            // Record AFTER successful send
            await pool.query(
              `INSERT INTO review_requests (business_id, customer_id, sent_via, platform, review_link, status, sent_at, created_at)
               VALUES ($1, $2, $3, $4, $5, 'sent', NOW(), NOW())`,
              [businessId, customerId, sentVia, settings?.preferred_platform || "google", reviewUrl]
            );
            sent++;
          } catch (err) {
            console.error(`[MarketingService] Failed to send review SMS to customer ${customerId}:`, err);
            failed++;
          }
        } else if (sentVia === "email" && customer.email) {
          try {
            const { sendEmail } = await import("../emailService");
            await sendEmail({
              to: customer.email,
              subject: `How was your experience with ${business.name}?`,
              text: message,
              html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
            });
            // Record AFTER successful send
            await pool.query(
              `INSERT INTO review_requests (business_id, customer_id, sent_via, platform, review_link, status, sent_at, created_at)
               VALUES ($1, $2, $3, $4, $5, 'sent', NOW(), NOW())`,
              [businessId, customerId, sentVia, settings?.preferred_platform || "google", reviewUrl]
            );
            sent++;
          } catch (err) {
            console.error(`[MarketingService] Failed to send review email to customer ${customerId}:`, err);
            failed++;
          }
        }
      } catch (err) {
        console.error(`[MarketingService] Error processing review request for customer ${customerId}:`, err);
        failed++;
      }
    }

    return { sent, skipped, failed };
  } catch (error) {
    console.error("[MarketingService] Error sending bulk review requests:", error);
    throw error;
  }
}

/**
 * Return pre-built marketing campaign templates.
 */
export function getCampaignTemplates() {
  return [
    {
      id: "win_back",
      name: "We Miss You!",
      type: "win_back",
      template:
        "Hi {firstName}! It's been a while since your last visit to {businessName}. We'd love to see you again! Reply to this message to book your next appointment.",
      channel: "sms",
      segment: "inactive_90",
    },
    {
      id: "seasonal",
      name: "Seasonal Special",
      type: "promotion",
      template:
        "Hi {firstName}! {businessName} is running a seasonal special. Book now and save! Reply for details or call us to schedule.",
      channel: "sms",
      segment: "all",
    },
    {
      id: "holiday",
      name: "Holiday Hours",
      type: "promotion",
      template:
        "Hi {firstName}! Just a heads up from {businessName} — our holiday hours are changing. Check our website for updated hours. Happy holidays!",
      channel: "both",
      segment: "all",
    },
    {
      id: "new_service",
      name: "New Service Announcement",
      type: "promotion",
      template:
        "Hi {firstName}! Exciting news from {businessName} — we're now offering a new service! Reply to learn more or book an appointment.",
      channel: "both",
      segment: "all",
    },
    {
      id: "thank_you",
      name: "Thank You",
      type: "custom",
      template:
        "Hi {firstName}! Thank you for being a loyal customer of {businessName}. We truly appreciate your business!",
      channel: "sms",
      segment: "all",
    },
  ];
}

/**
 * Send a general marketing campaign to selected customers.
 */
export async function sendCampaign(
  businessId: number,
  name: string,
  type: string,
  template: string,
  channel: string,
  customerIds: number[],
  subject?: string,
  segment?: string
) {
  try {
    // Create marketing_campaigns record
    const campaignResult = await pool.query(
      `INSERT INTO marketing_campaigns (business_id, name, type, channel, segment, template, subject, status, recipient_count, sent_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'sending', $8, 0, NOW(), NOW())
       RETURNING *`,
      [businessId, name, type, channel, segment || null, template, subject || null, customerIds.length]
    );
    const campaign = campaignResult.rows[0];

    // Get business info
    const businessResult = await pool.query(
      `SELECT * FROM businesses WHERE id = $1`,
      [businessId]
    );
    const business = businessResult.rows[0];
    if (!business) {
      throw new Error("Business not found");
    }

    // Get customer records
    const customersResult = await pool.query(
      `SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
        MAX(GREATEST(
          COALESCE(j.created_at, '1970-01-01'::timestamp),
          COALESCE(i.created_at, '1970-01-01'::timestamp),
          COALESCE(a.start_date, '1970-01-01'::timestamp)
        )) AS last_activity
      FROM customers c
      LEFT JOIN jobs j ON j.customer_id = c.id AND j.business_id = c.business_id
      LEFT JOIN invoices i ON i.customer_id = c.id AND i.business_id = c.business_id
      LEFT JOIN appointments a ON a.customer_id = c.id AND a.business_id = c.business_id
      WHERE c.id = ANY($1) AND c.business_id = $2
      GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone`,
      [customerIds, businessId]
    );
    const customerRecords = customersResult.rows;

    let sentCount = 0;

    for (const customer of customerRecords) {
      const lastActivity = customer.last_activity && new Date(customer.last_activity).getTime() > 0
        ? new Date(customer.last_activity)
        : null;
      const daysSinceVisit = lastActivity
        ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : "a while";

      // Replace template variables
      const message = template
        .replace(/\{firstName\}/g, customer.first_name || "")
        .replace(/\{businessName\}/g, business.name || "")
        .replace(/\{daysSinceVisit\}/g, String(daysSinceVisit));

      // Send SMS (TCPA: requires marketing opt-in)
      if ((channel === "sms" || channel === "both") && customer.phone && customer.marketing_opt_in === true) {
        try {
          const smsMessage = message + '\n\nReply STOP to opt out. Msg & data rates may apply.';
          const { sendSms } = await import("./twilioService");
          await sendSms(customer.phone, smsMessage, business.twilio_phone_number || undefined);
          await pool.query(
            `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, message, status, reference_type, reference_id)
             VALUES ($1, $2, 'marketing_campaign', 'sms', $3, $4, 'sent', 'campaign', $5)`,
            [businessId, customer.id, customer.phone, smsMessage, campaign.id]
          );
          sentCount++;
        } catch (err) {
          console.error(`[MarketingService] Failed to send campaign SMS to customer ${customer.id}:`, err);
          await pool.query(
            `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, message, status, reference_type, reference_id, error)
             VALUES ($1, $2, 'marketing_campaign', 'sms', $3, $4, 'failed', 'campaign', $5, $6)`,
            [businessId, customer.id, customer.phone, message, campaign.id, err instanceof Error ? err.message : "Unknown error"]
          );
        }
      }

      // Send Email
      if ((channel === "email" || channel === "both") && customer.email) {
        try {
          const { sendEmail } = await import("../emailService");
          await sendEmail({
            to: customer.email,
            subject: subject || `${name} - ${business.name}`,
            text: message,
            html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
          });
          await pool.query(
            `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, subject, message, status, reference_type, reference_id)
             VALUES ($1, $2, 'marketing_campaign', 'email', $3, $4, $5, 'sent', 'campaign', $6)`,
            [businessId, customer.id, customer.email, subject || `${name} - ${business.name}`, message, campaign.id]
          );
          sentCount++;
        } catch (err) {
          console.error(`[MarketingService] Failed to send campaign email to customer ${customer.id}:`, err);
          await pool.query(
            `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, subject, message, status, reference_type, reference_id, error)
             VALUES ($1, $2, 'marketing_campaign', 'email', $3, $4, $5, 'failed', 'campaign', $6, $7)`,
            [businessId, customer.id, customer.email, subject || `${name} - ${business.name}`, message, campaign.id, err instanceof Error ? err.message : "Unknown error"]
          );
        }
      }
    }

    // Update campaign with sentCount and mark as sent
    await pool.query(
      `UPDATE marketing_campaigns SET sent_count = $1, status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [sentCount, campaign.id]
    );

    // Fetch updated campaign record
    const updatedCampaignResult = await pool.query(
      `SELECT * FROM marketing_campaigns WHERE id = $1`,
      [campaign.id]
    );

    return updatedCampaignResult.rows[0];
  } catch (error) {
    console.error("[MarketingService] Error sending campaign:", error);
    throw error;
  }
}

/**
 * Get campaign history for a business.
 */
export async function getCampaignHistory(businessId: number) {
  try {
    const result = await pool.query(
      `SELECT * FROM marketing_campaigns WHERE business_id = $1 ORDER BY created_at DESC`,
      [businessId]
    );
    return result.rows;
  } catch (error) {
    console.error("[MarketingService] Error getting campaign history:", error);
    throw error;
  }
}

/**
 * Birthday Campaign: Find customers with birthdays today or within the next N days
 * and send them a personalized birthday discount message.
 *
 * This is designed to be called by a daily cron job.
 * Only sends to customers who have marketing_opt_in = true.
 */
export async function sendBirthdayCampaigns(businessId: number, options?: {
  daysAhead?: number; // How many days before birthday to send (default: 0 = day of)
  discountPercent?: number; // Discount amount (default: 15%)
  validDays?: number; // How many days the coupon is valid (default: 7)
  customMessage?: string; // Custom message template
  channel?: "sms" | "email" | "both"; // Delivery channel (default: both)
}) {
  try {
    const daysAhead = options?.daysAhead ?? 0;
    const discountPercent = options?.discountPercent ?? 15;
    const validDays = options?.validDays ?? 7;
    const channel = options?.channel ?? "both";

    // Get business info
    const businessResult = await pool.query(
      `SELECT name, twilio_phone_number FROM businesses WHERE id = $1`,
      [businessId]
    );
    const business = businessResult.rows[0];
    if (!business) return { sentCount: 0, error: "Business not found" };

    // Find customers with birthdays matching today + daysAhead
    // birthday is stored as MM-DD format
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetMMDD = `${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

    const customersResult = await pool.query(
      `SELECT id, first_name, last_name, email, phone, birthday, marketing_opt_in
       FROM customers
       WHERE business_id = $1
         AND birthday = $2
         AND marketing_opt_in = true`,
      [businessId, targetMMDD]
    );

    if (customersResult.rows.length === 0) {
      return { sentCount: 0, targetDate: targetMMDD, customersFound: 0 };
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + validDays);
    const expiryStr = expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    let sentCount = 0;

    for (const customer of customersResult.rows) {
      const defaultMessage = options?.customMessage
        ? options.customMessage
            .replace(/\{firstName\}/g, customer.first_name || "")
            .replace(/\{businessName\}/g, business.name || "")
            .replace(/\{discount\}/g, `${discountPercent}%`)
            .replace(/\{expiryDate\}/g, expiryStr)
        : `Happy Birthday, ${customer.first_name}! 🎂 ${business.name} wants to celebrate with you — enjoy ${discountPercent}% off your next visit! Valid through ${expiryStr}. Show this text to redeem.`;

      // Check we haven't already sent a birthday message this year
      const alreadySentResult = await pool.query(
        `SELECT COUNT(*) FROM notification_log
         WHERE business_id = $1 AND customer_id = $2 AND type = 'birthday_campaign'
           AND created_at >= date_trunc('year', CURRENT_DATE)`,
        [businessId, customer.id]
      );
      if (parseInt(alreadySentResult.rows[0].count) > 0) continue;

      // Send SMS
      if ((channel === "sms" || channel === "both") && customer.phone) {
        try {
          const smsMessage = defaultMessage + '\n\nReply STOP to opt out. Msg & data rates may apply.';
          const { sendSms } = await import("./twilioService");
          await sendSms(customer.phone, smsMessage, business.twilio_phone_number || undefined);
          await pool.query(
            `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, message, status)
             VALUES ($1, $2, 'birthday_campaign', 'sms', $3, $4, 'sent')`,
            [businessId, customer.id, customer.phone, smsMessage]
          );
          sentCount++;
        } catch (err) {
          console.error(`[MarketingService] Failed birthday SMS to customer ${customer.id}:`, err);
        }
      }

      // Send Email
      if ((channel === "email" || channel === "both") && customer.email) {
        try {
          const { sendEmail } = await import("../emailService");
          await sendEmail({
            to: customer.email,
            subject: `Happy Birthday, ${customer.first_name}! 🎂 A special gift from ${business.name}`,
            text: defaultMessage,
            html: `<div style="text-align:center; padding:20px; font-family:sans-serif;">
              <h1>🎂 Happy Birthday, ${customer.first_name}!</h1>
              <p style="font-size:18px;">${business.name} wants to celebrate with you!</p>
              <div style="background:#f0f9ff; border-radius:12px; padding:20px; margin:20px 0; display:inline-block;">
                <p style="font-size:24px; font-weight:bold; color:#2563eb; margin:0;">${discountPercent}% OFF</p>
                <p style="color:#666; margin:5px 0 0;">your next visit</p>
              </div>
              <p style="color:#888;">Valid through ${expiryStr}. Just mention this email when you visit!</p>
            </div>`,
          });
          await pool.query(
            `INSERT INTO notification_log (business_id, customer_id, type, channel, recipient, subject, message, status)
             VALUES ($1, $2, 'birthday_campaign', 'email', $3, $4, $5, 'sent')`,
            [businessId, customer.id, customer.email, `Happy Birthday! 🎂 ${discountPercent}% off from ${business.name}`, defaultMessage]
          );
          sentCount++;
        } catch (err) {
          console.error(`[MarketingService] Failed birthday email to customer ${customer.id}:`, err);
        }
      }
    }

    return {
      sentCount,
      targetDate: targetMMDD,
      customersFound: customersResult.rows.length,
    };
  } catch (error) {
    console.error("[MarketingService] Error sending birthday campaigns:", error);
    throw error;
  }
}

/**
 * Get birthday campaign settings for a business.
 * Returns upcoming birthdays in the next 7 days.
 */
export async function getUpcomingBirthdays(businessId: number, daysAhead: number = 7) {
  try {
    // Generate all MM-DD values for the next N days
    const targetDates: string[] = [];
    for (let i = 0; i <= daysAhead; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      targetDates.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }

    const result = await pool.query(
      `SELECT id, first_name, last_name, email, phone, birthday, marketing_opt_in
       FROM customers
       WHERE business_id = $1
         AND birthday = ANY($2)
       ORDER BY birthday`,
      [businessId, targetDates]
    );

    return result.rows.map((c: any) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      birthday: c.birthday,
      marketingOptIn: c.marketing_opt_in,
      isToday: c.birthday === targetDates[0],
    }));
  } catch (error) {
    console.error("[MarketingService] Error getting upcoming birthdays:", error);
    throw error;
  }
}

export default {
  getMarketingInsights,
  getInactiveCustomers,
  sendWinBackCampaign,
  getReviewCampaignStats,
  sendBulkReviewRequests,
  getCampaignTemplates,
  sendCampaign,
  getCampaignHistory,
  sendBirthdayCampaigns,
  getUpcomingBirthdays,
};
