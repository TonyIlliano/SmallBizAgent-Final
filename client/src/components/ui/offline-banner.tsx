import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Displays a fixed banner when the device is offline.
 * Works on both web (navigator.onLine) and native (Capacitor Network plugin).
 */
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Try Capacitor Network plugin first
    import('@capacitor/network').then(({ Network }) => {
      Network.getStatus().then(s => setIsOnline(s.connected));
      Network.addListener('networkStatusChange', (status) => {
        setIsOnline(status.connected);
      });
    }).catch(() => {
      // Capacitor not available — use browser APIs
      setIsOnline(navigator.onLine);
      const goOnline = () => setIsOnline(true);
      const goOffline = () => setIsOnline(false);
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      return () => {
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      };
    });
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white text-center py-2 text-sm flex items-center justify-center gap-2">
      <WifiOff className="h-4 w-4" />
      You're offline. Some features may not work.
    </div>
  );
}
