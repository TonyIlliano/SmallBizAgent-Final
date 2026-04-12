import { Capacitor } from '@capacitor/core';

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
        await fetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            token: token.value,
            platform: Capacitor.getPlatform(),
            businessId,
          }),
        });
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
      } else if (data?.type === 'call') {
        window.location.href = '/receptionist';
      } else if (data?.type === 'invoice' && data?.id) {
        window.location.href = `/invoices/${data.id}`;
      }
    });
  } catch (err) {
    console.error('[Push] Init failed:', err);
  }
}
