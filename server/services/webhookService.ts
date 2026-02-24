/**
 * Webhook Service
 *
 * Fires webhook events to registered URLs when business events occur.
 * Supports HMAC-SHA256 signing, retry with exponential backoff, and delivery logging.
 * Compatible with Zapier, Make.com, n8n, and any webhook consumer.
 */

import crypto from 'crypto';
import { pool } from '../db';

/** All supported webhook event types */
export const WEBHOOK_EVENTS = [
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'appointment.completed',
  'customer.created',
  'customer.updated',
  'invoice.created',
  'invoice.paid',
  'job.created',
  'job.completed',
  'call.completed',
  'quote.created',
  'quote.accepted',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[number];

/** Retry configuration */
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 25000]; // 1s, 5s, 25s

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Generate a random webhook secret
 */
export function generateWebhookSecret(): string {
  return 'whsec_' + crypto.randomBytes(24).toString('hex');
}

/**
 * Fire a webhook event for a business
 * This is fire-and-forget — it doesn't block the caller
 */
export async function fireEvent(businessId: number, event: string, payload: object): Promise<void> {
  try {
    // Find all active webhooks for this business that subscribe to this event
    const result = await pool.query(
      `SELECT id, url, secret, events FROM webhooks
       WHERE business_id = $1 AND active = true`,
      [businessId]
    );

    const webhooks = result.rows;
    if (webhooks.length === 0) return;

    for (const webhook of webhooks) {
      // Check if this webhook subscribes to this event type
      const subscribedEvents: string[] = Array.isArray(webhook.events) ? webhook.events : [];
      if (!subscribedEvents.includes(event)) continue;

      // Deliver in background (don't await — fire and forget)
      deliverWebhook(webhook.id, businessId, event, payload, webhook.url, webhook.secret)
        .catch(err => console.error(`[Webhook] Background delivery error for webhook ${webhook.id}:`, err));
    }
  } catch (error) {
    console.error(`[Webhook] Error firing event ${event} for business ${businessId}:`, error);
  }
}

/**
 * Deliver a webhook with retry logic
 */
async function deliverWebhook(
  webhookId: number,
  businessId: number,
  event: string,
  payload: object,
  url: string,
  secret: string
): Promise<void> {
  const fullPayload = {
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  };
  const payloadString = JSON.stringify(fullPayload);
  const signature = generateSignature(payloadString, secret);

  // Create delivery record
  const deliveryResult = await pool.query(
    `INSERT INTO webhook_deliveries (webhook_id, business_id, event, payload, status, attempts)
     VALUES ($1, $2, $3, $4, 'pending', 0)
     RETURNING id`,
    [webhookId, businessId, event, fullPayload]
  );
  const deliveryId = deliveryResult.rows[0].id;

  // Attempt delivery with retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Delivery': deliveryId.toString(),
          'User-Agent': 'SmallBizAgent-Webhooks/1.0',
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseBody = await response.text().catch(() => '');

      // Update delivery record
      await pool.query(
        `UPDATE webhook_deliveries
         SET status = $1, response_code = $2, response_body = $3, attempts = $4, last_attempt_at = NOW()
         WHERE id = $5`,
        [
          response.ok ? 'success' : (attempt === MAX_RETRIES - 1 ? 'failed' : 'pending'),
          response.status,
          responseBody.substring(0, 1000), // Truncate response body
          attempt + 1,
          deliveryId,
        ]
      );

      if (response.ok) {
        console.log(`[Webhook] Delivered ${event} to ${url} (attempt ${attempt + 1})`);
        return; // Success!
      }

      console.warn(`[Webhook] ${url} returned ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES})`);
    } catch (error: any) {
      const errorMessage = error.name === 'AbortError' ? 'Request timeout (10s)' : error.message;

      await pool.query(
        `UPDATE webhook_deliveries
         SET status = $1, response_body = $2, attempts = $3, last_attempt_at = NOW()
         WHERE id = $4`,
        [
          attempt === MAX_RETRIES - 1 ? 'failed' : 'pending',
          errorMessage.substring(0, 1000),
          attempt + 1,
          deliveryId,
        ]
      );

      console.warn(`[Webhook] Delivery error to ${url} (attempt ${attempt + 1}/${MAX_RETRIES}): ${errorMessage}`);
    }
  }
}

/**
 * Send a test webhook event
 */
export async function sendTestEvent(webhookId: number, businessId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await pool.query(
      `SELECT url, secret, events FROM webhooks WHERE id = $1 AND business_id = $2`,
      [webhookId, businessId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Webhook not found' };
    }

    const webhook = result.rows[0];
    const testPayload = {
      message: 'This is a test webhook delivery from SmallBizAgent',
      webhookId,
      businessId,
    };

    await deliverWebhook(webhookId, businessId, 'test', testPayload, webhook.url, webhook.secret);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get webhooks for a business
 */
export async function getWebhooks(businessId: number) {
  const result = await pool.query(
    `SELECT * FROM webhooks WHERE business_id = $1 ORDER BY created_at DESC`,
    [businessId]
  );
  return result.rows;
}

/**
 * Create a new webhook
 */
export async function createWebhook(businessId: number, url: string, events: string[], description?: string, source: string = 'manual') {
  const secret = generateWebhookSecret();
  const result = await pool.query(
    `INSERT INTO webhooks (business_id, url, events, secret, description, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [businessId, url, JSON.stringify(events), secret, description || null, source]
  );
  return result.rows[0];
}

/**
 * Update a webhook
 */
export async function updateWebhook(webhookId: number, businessId: number, data: { url?: string; events?: string[]; active?: boolean; description?: string }) {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.url !== undefined) {
    setClauses.push(`url = $${paramIndex++}`);
    values.push(data.url);
  }
  if (data.events !== undefined) {
    setClauses.push(`events = $${paramIndex++}`);
    values.push(JSON.stringify(data.events));
  }
  if (data.active !== undefined) {
    setClauses.push(`active = $${paramIndex++}`);
    values.push(data.active);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  setClauses.push(`updated_at = NOW()`);

  values.push(webhookId, businessId);
  const result = await pool.query(
    `UPDATE webhooks SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND business_id = $${paramIndex}
     RETURNING *`,
    values
  );
  return result.rows[0];
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(webhookId: number, businessId: number) {
  // Delete deliveries first
  await pool.query(
    `DELETE FROM webhook_deliveries WHERE webhook_id = $1 AND business_id = $2`,
    [webhookId, businessId]
  );
  const result = await pool.query(
    `DELETE FROM webhooks WHERE id = $1 AND business_id = $2 RETURNING id`,
    [webhookId, businessId]
  );
  return result.rows.length > 0;
}

/**
 * Get delivery log for a webhook
 */
export async function getDeliveries(webhookId: number, businessId: number, limit = 50) {
  const result = await pool.query(
    `SELECT * FROM webhook_deliveries
     WHERE webhook_id = $1 AND business_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [webhookId, businessId, limit]
  );
  return result.rows;
}

export default {
  fireEvent,
  sendTestEvent,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getDeliveries,
  generateWebhookSecret,
  WEBHOOK_EVENTS,
};
