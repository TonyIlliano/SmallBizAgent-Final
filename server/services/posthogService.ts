/**
 * PostHog Service — Product Analytics + Feature Flags
 *
 * Server-side wrapper around posthog-node. Provides:
 *   - capture(): record an event tied to a user (distinctId)
 *   - identify(): merge/update user properties
 *   - groupIdentify(): tag a business (group) with properties
 *   - isFeatureEnabled(): server-side feature flag evaluation
 *
 * Graceful degradation: If POSTHOG_PROJECT_KEY is not set or PostHog is unreachable,
 * all functions return safely without throwing. Mirrors mem0Service.ts pattern.
 *
 * Usage:
 *   import { capture } from "./services/posthogService";
 *   capture(String(userId), "user_signed_up", { source: "express_onboarding" });
 */

import { PostHog } from "posthog-node";

let client: PostHog | null = null;
let initialized = false;

/**
 * Initialize PostHog client. Call once on server startup.
 * Logs a warning (not an error) if the API key is missing — PostHog is optional.
 */
export function initPostHog(): void {
  if (initialized) return;

  const projectKey = process.env.POSTHOG_PROJECT_KEY || process.env.VITE_POSTHOG_KEY;
  if (!projectKey) {
    console.warn("[PostHog] POSTHOG_PROJECT_KEY not set — analytics disabled");
    initialized = true;
    return;
  }

  try {
    client = new PostHog(projectKey, {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 20,           // Batch up to 20 events before flushing
      flushInterval: 10_000, // Or every 10 seconds, whichever comes first
    });
    initialized = true;
    console.log("[PostHog] Client initialized successfully");
  } catch (err) {
    console.error("[PostHog] Failed to initialize client:", err);
    initialized = true; // Mark as initialized so we don't retry
  }
}

/**
 * Check if PostHog is available. Returns false if not initialized or no API key.
 */
export function isPostHogAvailable(): boolean {
  return client !== null;
}

/**
 * Capture an event. Fire-and-forget — never throws.
 *
 * @param distinctId — Usually `String(userId)`. For anonymous events use a session id.
 * @param event       — Event name in snake_case (e.g., "user_signed_up").
 * @param properties  — Arbitrary metadata. Avoid PII unless intentional.
 * @param groups      — Group associations, e.g., { business: String(businessId) }.
 */
export function capture(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
  groups?: Record<string, string>,
): void {
  if (!client) return;

  try {
    client.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        source: "server",
      },
      ...(groups ? { groups } : {}),
    });
  } catch (err) {
    console.error("[PostHog] capture failed:", err);
  }
}

/**
 * Identify / update user properties. Idempotent — call repeatedly to update.
 * Fire-and-forget — never throws.
 */
export function identify(
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  if (!client) return;

  try {
    client.identify({
      distinctId,
      properties,
    });
  } catch (err) {
    console.error("[PostHog] identify failed:", err);
  }
}

/**
 * Identify / update a business (group). Lets you filter events by business
 * in PostHog UI (e.g., "all events from businesses on the Pro plan").
 *
 * Group type "business" must also be created in PostHog Settings → Groups
 * (one-time setup) before group filters become available in the UI.
 */
export function groupIdentify(
  businessId: number | string,
  properties: Record<string, unknown> = {},
): void {
  if (!client) return;

  try {
    client.groupIdentify({
      groupType: "business",
      groupKey: String(businessId),
      properties,
    });
  } catch (err) {
    console.error("[PostHog] groupIdentify failed:", err);
  }
}

/**
 * Check if a feature flag is enabled for a user. Used to gate features
 * without redeploying. Returns false on any error (fail closed).
 *
 * Note: this hits PostHog's API on each call. For high-frequency checks,
 * consider caching the result for ~60s.
 */
export async function isFeatureEnabled(
  flagKey: string,
  distinctId: string,
  groups?: Record<string, string>,
): Promise<boolean> {
  if (!client) return false;

  try {
    const result = await client.isFeatureEnabled(flagKey, distinctId, {
      groups,
    });
    return result === true;
  } catch (err) {
    console.error(`[PostHog] isFeatureEnabled(${flagKey}) failed:`, err);
    return false;
  }
}

/**
 * Get a feature flag variant (for multivariate flags). Returns null on error.
 */
export async function getFeatureFlag(
  flagKey: string,
  distinctId: string,
  groups?: Record<string, string>,
): Promise<string | boolean | null> {
  if (!client) return null;

  try {
    const result = await client.getFeatureFlag(flagKey, distinctId, {
      groups,
    });
    return result ?? null;
  } catch (err) {
    console.error(`[PostHog] getFeatureFlag(${flagKey}) failed:`, err);
    return null;
  }
}

/**
 * Flush pending events. Call before server shutdown to avoid losing events.
 */
export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
    console.log("[PostHog] Flushed and shut down");
  } catch (err) {
    console.error("[PostHog] shutdown failed:", err);
  }
}
