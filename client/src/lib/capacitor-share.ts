import { Capacitor } from '@capacitor/core';

/**
 * Share content using the native share sheet on mobile, or Web Share API / clipboard on web.
 */
export async function shareContent(options: { title: string; text?: string; url: string }) {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share(options);
    } catch (err) {
      console.error('[Share] Native share failed:', err);
      await fallbackCopy(options.url);
    }
  } else if (navigator.share) {
    try {
      await navigator.share(options);
    } catch (err) {
      // User cancelled — not an error
      if ((err as Error).name !== 'AbortError') {
        await fallbackCopy(options.url);
      }
    }
  } else {
    await fallbackCopy(options.url);
  }
}

async function fallbackCopy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Clipboard API not available
  }
}
