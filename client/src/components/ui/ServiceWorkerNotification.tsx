import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function ServiceWorkerNotification() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    // Skip if service worker is not supported
    if (!('serviceWorker' in navigator)) {
      return;
    }

    // Setup the event listener to detect when a new service worker is waiting
    navigator.serviceWorker.ready.then(registration => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // If the new service worker is installed but waiting, show update notification
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowReload(true);
          }
        });
      });
    });

    // Check for updates when page is visible again
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.ready.then(registration => {
          registration.update();
        });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Function to update the service worker
  const updateServiceWorker = () => {
    if (!waitingWorker) return;

    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    setShowReload(false);
    window.location.reload();
  };

  if (!showReload) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 mx-auto w-full max-w-md px-4">
      <div className="flex items-center justify-between rounded-lg bg-yellow-50 p-4 shadow-lg border border-yellow-200">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <p className="text-sm font-medium text-yellow-700">
            New version available!
          </p>
        </div>
        <button
          onClick={updateServiceWorker}
          className="flex items-center space-x-1 rounded-md bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800 hover:bg-yellow-200 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Update now</span>
        </button>
      </div>
    </div>
  );
}