import { Capacitor } from '@capacitor/core';

/**
 * Initialize deep link handling for the native app.
 * Routes app URL opens (e.g., from SMS links) to the correct in-app page.
 */
export function initDeepLinks() {
  if (!Capacitor.isNativePlatform()) return;

  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', (event) => {
      try {
        const url = new URL(event.url);
        const path = url.pathname;

        // Route to the appropriate page
        if (path.startsWith('/book/')) {
          window.location.href = path;
        } else if (path.startsWith('/appointments/')) {
          window.location.href = path;
        } else if (path.startsWith('/invoices/')) {
          window.location.href = path;
        } else if (path.startsWith('/jobs/')) {
          window.location.href = path;
        } else if (path.startsWith('/portal/')) {
          window.location.href = path;
        }
      } catch (err) {
        console.error('[DeepLinks] Failed to handle URL:', err);
      }
    });

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
    });
  }).catch(err => {
    console.error('[DeepLinks] Init failed:', err);
  });
}
