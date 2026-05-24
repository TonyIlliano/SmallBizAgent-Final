import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';

const TOKEN_STORAGE_KEY = 'sba-push-token';

/**
 * Initialize push notifications for native mobile apps.
 * Registers the device token with the server for sending push notifications.
 * No-op on web platforms.
 */
export async function initPushNotifications(businessId: number) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.log('[Push] Permission denied');
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] Registered with token:', token.value.substring(0, 20) + '...');
      try {
        const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
        if (platform !== 'ios' && platform !== 'android') return;

        await apiRequest('POST', '/api/push/register', {
          token: token.value,
          platform,
          businessId,
        });

        // Persist the token locally so we can unregister it cleanly on logout.
        try {
          window.localStorage.setItem(TOKEN_STORAGE_KEY, token.value);
        } catch {
          // localStorage may be unavailable in some embedded contexts; ignore.
        }
      } catch (err) {
        console.error('[Push] Failed to register token with server:', err);
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Foreground notification:', notification.title);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      const data = notification.notification.data;
      if (data?.type === 'appointment' && data?.id) {
        window.location.href = `/appointments/${data.id}`;
      } else if (data?.type === 'job' && data?.id) {
        window.location.href = `/jobs/${data.id}`;
      } else if (data?.type === 'call') {
        window.location.href = '/receptionist';
      } else if (data?.type === 'invoice' && data?.id) {
        window.location.href = `/invoices/${data.id}`;
      } else if (data?.type === 'quote' && data?.id) {
        window.location.href = `/quotes/${data.id}`;
      } else if (data?.url && typeof data.url === 'string') {
        // Generic deep-link fallback. Only honor same-origin paths.
        try {
          const u = new URL(data.url, window.location.origin);
          if (u.origin === window.location.origin) window.location.href = u.pathname + u.search;
        } catch {
          // ignore malformed URLs
        }
      }
    });
  } catch (err) {
    console.error('[Push] Init failed:', err);
  }
}

/**
 * Unregister the currently saved device token on the server.
 * Called from the logout flow so a logged-out device stops receiving pushes
 * for the previous business.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  let token: string | null = null;
  try {
    token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
  if (!token) return;
  try {
    await apiRequest('POST', '/api/push/unregister', { token });
  } catch (err) {
    // Best-effort. If unregister fails (offline, server down, etc.) we still
    // clear the local pointer so the next login generates a fresh registration.
    console.error('[Push] Unregister failed:', err);
  } finally {
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
