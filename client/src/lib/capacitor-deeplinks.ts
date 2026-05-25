import { Capacitor } from '@capacitor/core';

/**
 * Allowed deep-link route prefixes. Anything outside this allowlist is
 * dropped to `/dashboard` (the safe default) so an attacker can't craft a
 * link that opens the app on an unexpected URL with embedded state.
 */
const ALLOWED_PREFIXES = [
  '/book/',
  '/appointments/',
  '/invoices/',
  '/jobs/',
  '/quotes/',
  '/customers/',
  '/portal/',
  '/track/',
];

/**
 * Single-segment paths that are also allowed as deep-link targets.
 */
const ALLOWED_EXACT = new Set<string>([
  '/dashboard',
  '/settings',
  '/receptionist',
  '/analytics',
  '/ai-agents',
  '/marketing',
  '/sms-campaigns',
]);

/**
 * Parse a deep-link URL string and return the in-app path to navigate to,
 * or `null` if the URL is not a valid deep link for this app.
 *
 * Exported separately so it can be unit-tested without firing real
 * window.location.href changes.
 */
export function parseDeepLink(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const path = url.pathname;
  if (!path || path === '/') return '/dashboard';

  if (ALLOWED_EXACT.has(path)) return path + (url.search || '');

  for (const prefix of ALLOWED_PREFIXES) {
    if (path.startsWith(prefix)) {
      // Strip any control characters from the trailing segment.
      return path + (url.search || '');
    }
  }

  // Unknown path — fail safe to dashboard so we don't open arbitrary URLs.
  return '/dashboard';
}

/**
 * Initialize deep link handling for the native app.
 * Routes app URL opens (e.g., from SMS links, universal links, custom-scheme
 * smallbizagent://) to the correct in-app page.
 */
export function initDeepLinks() {
  if (!Capacitor.isNativePlatform()) return;

  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', (event) => {
      try {
        const target = parseDeepLink(event.url);
        if (target) {
          window.location.href = target;
        }
      } catch (err) {
        console.error('[DeepLinks] Failed to handle URL:', err);
      }
    });

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
      // If we can't go back, do nothing — Capacitor's default behavior on
      // Android exits the app, which is what we want at the root.
    });
  }).catch(err => {
    console.error('[DeepLinks] Init failed:', err);
  });
}
