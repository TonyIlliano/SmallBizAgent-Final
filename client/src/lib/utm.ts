/**
 * UTM Parameter Tracking
 *
 * Captures UTM parameters from the URL on landing and persists them in sessionStorage.
 * These are attached to the registration API call so you know which channel converted.
 *
 * Supported params: utm_source, utm_medium, utm_campaign, utm_term, utm_content
 * Also captures: ref (referral code), gclid (Google Ads), fbclid (Facebook Ads)
 */

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'gclid', 'fbclid'] as const;
const STORAGE_KEY = 'sba_utm';

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  ref?: string;
  gclid?: string;
  fbclid?: string;
  landing_page?: string;
  landed_at?: string;
}

/** Call once on app mount to capture UTM params from the current URL. */
export function captureUtmParams(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const existing = getUtmParams();

    // Only overwrite if we have new UTM params (don't clear on internal navigation)
    const hasUtm = UTM_KEYS.some(key => params.has(key));
    if (!hasUtm && existing.utm_source) return; // keep existing attribution

    const utm: UtmParams = {};
    for (const key of UTM_KEYS) {
      const val = params.get(key);
      if (val) utm[key] = val;
    }

    // Always capture landing page on first visit
    if (!existing.landing_page) {
      utm.landing_page = window.location.pathname;
      utm.landed_at = new Date().toISOString();
    } else {
      utm.landing_page = existing.landing_page;
      utm.landed_at = existing.landed_at;
    }

    if (Object.keys(utm).length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
    }
  } catch {
    // sessionStorage not available (incognito, SSR) — silently skip
  }
}

/** Get stored UTM params for attaching to registration. */
export function getUtmParams(): UtmParams {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/** Clear UTM params after successful registration (already attributed). */
export function clearUtmParams(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
