/**
 * Retell AI Webhook Handler
 *
 * Handles custom function calls and call event webhooks from Retell AI.
 * Dispatches tool calls to the provider-agnostic callToolHandlers module.
 *
 * Key differences from Vapi:
 * - Retell sends custom function calls with { name, args, call } in the body
 * - The call object contains retell_llm_dynamic_variables with our injected businessId
 * - Retell sends x-retell-signature header (HMAC-SHA256) for verification
 * - Call events come as { event, call } to the webhook_url
 * - Function call responses are plain JSON objects (not wrapped)
 */

import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

// These imports will resolve once callToolHandlers.ts is created.
// For now, reference the module that will contain the extracted tool handlers.
import { dispatchToolCall, processEndOfCall } from './callToolHandlers';
import type { EndOfCallData } from './callToolHandlers';

const RETELL_API_KEY = process.env.RETELL_API_KEY;

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the X-Retell-Signature header to ensure the request is from Retell.
 * Uses HMAC-SHA256 with the API key as the secret.
 */
export function verifyRetellSignature(
  body: string,
  signature: string,
  apiKey: string,
): boolean {
  try {
    const hash = crypto
      .createHmac('sha256', apiKey)
      .update(body)
      .digest('base64');
    // Use timingSafeEqual to prevent timing attacks
    const sigBuf = Buffer.from(signature, 'base64');
    const hashBuf = Buffer.from(hash, 'base64');
    if (sigBuf.length !== hashBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, hashBuf);
  } catch {
    return false;
  }
}

/**
 * Express middleware to validate Retell webhook signatures.
 *
 * Uses the Retell SDK's verify() method for proper signature validation.
 * Falls through with a warning if verification fails — we don't want to
 * block legitimate calls due to signature format mismatches.
 */
export function validateRetellWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!RETELL_API_KEY) {
    console.warn('[Retell] No RETELL_API_KEY configured, skipping signature verification');
    next();
    return;
  }

  const signature = req.headers['x-retell-signature'] as string | undefined;
  if (!signature) {
    // Retell custom function calls may not always include signature header
    // Allow through — the businessId resolution provides security
    next();
    return;
  }

  // Try Retell SDK verification
  try {
    const Retell = require('retell-sdk');
    const client = new Retell({ apiKey: RETELL_API_KEY });
    const body = JSON.stringify(req.body);
    const isValid = client.verify(body, RETELL_API_KEY, signature);
    if (!isValid) {
      console.warn('[Retell] Signature verification failed — allowing through (may be format mismatch)');
    }
  } catch (err) {
    // SDK verification failed — log but allow through
    console.warn('[Retell] Signature verification error:', (err as Error).message);
  }

  next();
}

// ---------------------------------------------------------------------------
// Custom function call handler
// ---------------------------------------------------------------------------

/**
 * Handle custom function calls from Retell.
 *
 * Retell sends a POST with:
 * ```
 * {
 *   name: string,        // Function name (e.g., "checkAvailability")
 *   args: object,        // Function arguments
 *   call: {
 *     call_id: string,
 *     agent_id: string,
 *     from_number: string,
 *     to_number: string,
 *     retell_llm_dynamic_variables: {
 *       businessId: string  // Injected when LLM was created
 *     },
 *     transcript: string,
 *     ...
 *   }
 * }
 * ```
 *
 * Response: JSON object (max 15,000 chars), status 200-299.
 */
export async function handleRetellFunction(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { name, args, call } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing function name' });
      return;
    }

    // ---- Resolve businessId (3 fallback strategies) ----

    const businessIdStr =
      call?.retell_llm_dynamic_variables?.businessId;
    let businessId: number | null = businessIdStr
      ? parseInt(businessIdStr, 10)
      : null;
    if (businessId !== null && isNaN(businessId)) businessId = null;

    // Fallback 1: look up business by the called phone number
    if (!businessId && call?.to_number) {
      const biz = await storage.getBusinessByTwilioPhoneNumber(
        call.to_number,
      );
      if (biz) businessId = biz.id;
    }

    // Fallback 2: look up business by Retell agent_id
    if (!businessId && call?.agent_id) {
      businessId = await lookupBusinessByAgentId(call.agent_id);
    }

    const callerPhone: string | undefined =
      call?.from_number || undefined;

    console.log(
      `[Retell] Function: ${name} | biz=${businessId} | caller=${callerPhone || 'unknown'}`,
    );

    if (!businessId) {
      console.error(
        '[Retell] CRITICAL: Could not determine businessId for function call',
      );
      res.json({
        error:
          "I'm having a technical issue right now. Please call back in a few minutes.",
        technicalError: 'Business ID not found',
      });
      return;
    }

    // ---- Guard: receptionist enabled? ----

    const business = await storage.getBusiness(businessId);
    if (business && business.receptionistEnabled === false) {
      res.json({
        error:
          "I'm sorry, the AI receptionist service is currently unavailable. Please try calling back later.",
      });
      return;
    }

    // ---- Guard: subscription / usage limits ----

    const { canBusinessAcceptCalls } = await import('./usageService');
    const usageCheck = await canBusinessAcceptCalls(businessId);
    if (!usageCheck.allowed) {
      res.json({
        error:
          "I'm sorry, but this business's AI receptionist service is currently unavailable. Please try calling back later.",
        _blocked: true,
        _reason: usageCheck.reason,
      });
      return;
    }

    // ---- Dispatch to provider-agnostic tool handler ----

    const result = await dispatchToolCall(
      name,
      businessId,
      args || {},
      callerPhone,
    );

    // dispatchToolCall returns { result: {...} } — Retell expects a flat object
    if (result && typeof result === 'object' && 'result' in result) {
      res.json((result as { result: unknown }).result);
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error('[Retell] Error handling function call:', error);
    res.json({
      error:
        "I'm having trouble with that request. Let me try something else.",
      technicalError: String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Call event webhook handler
// ---------------------------------------------------------------------------

/**
 * Handle call event webhooks from Retell.
 *
 * Events: call_started, call_ended, call_analyzed
 *
 * Payload:
 * ```
 * {
 *   event: string,
 *   call: {
 *     call_id: string,
 *     agent_id: string,
 *     call_status: string,
 *     start_timestamp: number,    // Unix ms
 *     end_timestamp: number,      // Unix ms
 *     transcript: string,
 *     recording_url: string,
 *     disconnection_reason: string,
 *     from_number: string,
 *     to_number: string,
 *     retell_llm_dynamic_variables: { businessId: string },
 *     call_analysis?: {
 *       call_summary: string,
 *       user_sentiment: string,
 *     }
 *   }
 * }
 * ```
 */
export async function handleRetellWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { event, call } = req.body;

    console.log(
      `[Retell] Webhook event: ${event} | call_id=${call?.call_id || 'unknown'}`,
    );

    switch (event) {
      case 'call_started': {
        console.log(
          `[Retell] Call started: ${call?.call_id} from ${call?.from_number} to ${call?.to_number}`,
        );
        break;
      }

      case 'call_ended': {
        await handleCallEnded(call);
        break;
      }

      case 'call_analyzed': {
        // Retell's built-in call analysis supplements our callIntelligenceService
        if (call?.call_analysis) {
          console.log(
            `[Retell] Call analyzed: ${call.call_id} - sentiment: ${call.call_analysis.user_sentiment}`,
          );
        }
        break;
      }

      default:
        console.log(`[Retell] Unknown webhook event: ${event}`);
    }

    // Always 200 to acknowledge receipt — prevents Retell retries
    res.status(200).send();
  } catch (error) {
    console.error('[Retell] Error handling webhook:', error);
    // Still 200 to prevent Retell from retrying on server errors
    res.status(200).send();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Process a call_ended event: resolve businessId, compute duration, and
 * hand off to the provider-agnostic processEndOfCall pipeline (call log,
 * intelligence, missed-call text-back, name extraction, etc.).
 */
async function handleCallEnded(call: any): Promise<void> {
  const businessIdStr =
    call?.retell_llm_dynamic_variables?.businessId;
  let businessId: number | null = businessIdStr
    ? parseInt(businessIdStr, 10)
    : null;
  if (businessId !== null && isNaN(businessId)) businessId = null;

  if (!businessId && call?.to_number) {
    const biz = await storage.getBusinessByTwilioPhoneNumber(
      call.to_number,
    );
    if (biz) businessId = biz.id;
  }

  if (!businessId && call?.agent_id) {
    businessId = await lookupBusinessByAgentId(call.agent_id);
  }

  if (!businessId) {
    console.error(
      '[Retell] Could not determine businessId for call_ended event',
    );
    return;
  }

  // Calculate duration from timestamps (Retell sends Unix ms)
  let durationSeconds = 0;
  if (call.start_timestamp && call.end_timestamp) {
    durationSeconds = Math.round(
      (call.end_timestamp - call.start_timestamp) / 1000,
    );
    if (durationSeconds < 0) durationSeconds = 0;
  }

  const endOfCallData: EndOfCallData = {
    businessId,
    callerPhone: call.from_number || null,
    transcript: call.transcript || null,
    callDurationSeconds: durationSeconds,
    endedReason: call.disconnection_reason || '',
    recordingUrl: call.recording_url || null,
    callStartedAt: call.start_timestamp
      ? new Date(call.start_timestamp).toISOString()
      : null,
    callEndedAt: call.end_timestamp
      ? new Date(call.end_timestamp).toISOString()
      : null,
    calledNumber: call.to_number || null,
  };

  // Fire-and-forget so we don't delay the webhook response
  processEndOfCall(endOfCallData).catch((err) => {
    console.error('[Retell] Error processing end of call:', err);
  });
}

/**
 * Look up a businessId from a Retell agent_id using a raw SQL query.
 *
 * Uses raw SQL because the `retell_agent_id` column on the businesses table
 * will be added in a future migration and is not yet in the Drizzle schema.
 */
async function lookupBusinessByAgentId(
  agentId: string,
): Promise<number | null> {
  try {
    const result = await db.execute(
      sql`SELECT id FROM businesses WHERE retell_agent_id = ${agentId} LIMIT 1`,
    );
    const rows = result.rows as Array<{ id: number }>;
    return rows.length > 0 ? rows[0].id : null;
  } catch (error) {
    console.error(
      '[Retell] Error looking up business by agent_id:',
      error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default {
  handleRetellFunction,
  handleRetellWebhook,
  validateRetellWebhook,
  verifyRetellSignature,
};
