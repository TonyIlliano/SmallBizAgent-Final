/**
 * PostHog Browser Client — Product Analytics + Session Replay + Feature Flags
 *
 * Privacy-respecting configuration:
 *   - mask_all_inputs: true → form input values (passwords, names, emails, payment data) NEVER recorded
 *   - mask_all_text: false → page text IS recorded (needed for replays to be useful)
 *   - Add `.ph-no-capture` class to any sensitive element to exclude it from replays
 *   - Stripe Elements are auto-masked (they live in cross-origin iframes)
 *   - Session Replay disabled on customer-facing booking pages (/book/*) — those visitors
 *     are END customers of our customers, not our users
 *
 * Graceful degradation: if VITE_POSTHOG_KEY is missing, all helpers no-op.
 */

import posthog from "posthog-js";

let initialized = false;

/**
 * Initialize PostHog. Call once from main.tsx before React renders.
 */
export function initPostHog(): void {
  if (initialized) return;

  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    if (import.meta.env.PROD) {
      console.warn("[PostHog] VITE_POSTHOG_KEY not set — analytics disabled");
    }
    initialized = true;
    return;
  }

  // Skip on customer-facing booking pages — those visitors aren't our users.
  // The booking page renders even before posthog mounts, so this check happens
  // at module load time on every page navigation.
  const path = window.location.pathname;
  const isCustomerFacing =
    path.startsWith("/book/") ||
    path.startsWith("/portal/") ||
    path.startsWith("/invoices/pay/") ||
    path.startsWith("/staff/join/") ||
    path === "/sites" ||
    path.startsWith("/sites/");

  try {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",

      // Capture autocaptured events (clicks, form submits)
      autocapture: true,

      // Capture pageviews automatically (we'll add SPA pageview later if needed)
      capture_pageview: true,
      capture_pageleave: true,

      // Person profiles only for identified users (privacy-friendly default)
      // Anonymous visitors get aggregated event counts but no individual profiles
      person_profiles: "identified_only",

      // Session Replay configuration
      disable_session_recording: isCustomerFacing,
      session_recording: {
        // Mask all form input values (passwords, payment info, customer names, etc.)
        maskAllInputs: true,
        // Mask images and text by default? NO — we want to see what users see in the dashboard
        maskTextSelector: ".ph-no-capture, [data-sensitive]",
        // Don't record cross-origin iframes (Stripe Elements, etc.)
        recordCrossOriginIframes: false,
      },

      // Don't send events from localhost during dev unless explicitly enabled
      loaded: (ph) => {
        if (import.meta.env.DEV && !import.meta.env.VITE_POSTHOG_DEBUG) {
          ph.opt_out_capturing();
          // eslint-disable-next-line no-console
          console.log("[PostHog] DEV mode — capturing opted out. Set VITE_POSTHOG_DEBUG=1 to enable.");
        } else {
          // eslint-disable-next-line no-console
          console.log("[PostHog] initialized");
        }
      },
    });
    initialized = true;
  } catch (err) {
    console.error("[PostHog] init failed:", err);
    initialized = true;
  }
}

/**
 * Check if PostHog is available + enabled.
 */
export function isPostHogReady(): boolean {
  return initialized && typeof posthog.identify === "function" && !!import.meta.env.VITE_POSTHOG_KEY;
}

/**
 * Identify a user. Merges/updates user properties on the same distinctId.
 * Call after login or whenever user properties change (plan upgrade, etc.).
 */
export function identifyUser(
  userId: number | string,
  properties: Record<string, unknown> = {},
): void {
  if (!isPostHogReady()) return;
  try {
    posthog.identify(String(userId), properties);
  } catch (err) {
    console.error("[PostHog] identify failed:", err);
  }
}

/**
 * Associate the current user with a business (group). Lets you filter
 * "all events from businesses on the Pro plan" in PostHog UI.
 */
export function identifyBusiness(
  businessId: number | string,
  properties: Record<string, unknown> = {},
): void {
  if (!isPostHogReady()) return;
  try {
    posthog.group("business", String(businessId), properties);
  } catch (err) {
    console.error("[PostHog] group identify failed:", err);
  }
}

/**
 * Capture a custom event. Fire-and-forget.
 */
export function captureEvent(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!isPostHogReady()) return;
  try {
    posthog.capture(event, properties);
  } catch (err) {
    console.error("[PostHog] capture failed:", err);
  }
}

/**
 * Reset PostHog state — call on logout to start a fresh anonymous session.
 * This generates a new distinctId so the next login doesn't get merged
 * with the previous user.
 */
export function resetPostHog(): void {
  if (!isPostHogReady()) return;
  try {
    posthog.reset();
  } catch (err) {
    console.error("[PostHog] reset failed:", err);
  }
}

/**
 * Check feature flag (client-side). Returns false on any error.
 * Reads from cached flags loaded at init time — no network round trip.
 */
export function isFeatureEnabled(flagKey: string): boolean {
  if (!isPostHogReady()) return false;
  try {
    return posthog.isFeatureEnabled(flagKey) === true;
  } catch (err) {
    console.error(`[PostHog] isFeatureEnabled(${flagKey}) failed:`, err);
    return false;
  }
}

// Re-export the singleton for advanced use cases
export { posthog };
