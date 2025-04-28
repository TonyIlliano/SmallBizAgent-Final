import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if the app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone ||
                         document.referrer.includes('android-app://');
                         
    if (isStandalone) {
      // App is already installed, no need to show prompt
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Store the event for later use
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Check localStorage to see if we've shown the prompt already
      const promptShown = localStorage.getItem('pwaPromptShown');
      if (!promptShown) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Check if iOS device to show iOS-specific message
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS && !localStorage.getItem('pwaIOSPromptShown')) {
      setShowPrompt(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // For iOS, we just close the prompt and set the flag
      localStorage.setItem('pwaIOSPromptShown', 'true');
      setShowPrompt(false);
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    // Set the flag to not show again
    localStorage.setItem('pwaPromptShown', 'true');
    
    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    // For Android, we mark as shown for 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    localStorage.setItem('pwaPromptShown', sevenDaysFromNow.toISOString());
    
    // For iOS we mark forever
    localStorage.setItem('pwaIOSPromptShown', 'true');
    
    setShowPrompt(false);
  };

  // If we shouldn't show the prompt, return null
  if (!showPrompt) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  return (
    <div className="fixed bottom-4 left-0 right-0 mx-auto w-full max-w-md px-4 z-50">
      <div className="flex flex-col space-y-3 rounded-lg bg-white p-4 shadow-lg border border-purple-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="rounded-full bg-purple-100 p-2">
              <Download className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">
              Install SmallBizAgent
            </h3>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-600">
          {isIOS 
            ? "Add this app to your home screen: tap the share button and then 'Add to Home Screen'"
            : "Install our app for a better experience with offline support and faster loading times."
          }
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleDismiss}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Not now
          </button>
          <button
            onClick={handleInstallClick}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            {isIOS ? "Got it" : "Install"}
          </button>
        </div>
      </div>
    </div>
  );
}