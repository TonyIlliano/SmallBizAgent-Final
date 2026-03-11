import { useEffect, useRef, useCallback, useState } from 'react';

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  siteKey?: string;
}

declare global {
  interface Window {
    turnstile: any;
  }
}

// Synchronously resolve the site key from prop or build-time env var
function getStaticSiteKey(propKey?: string): string {
  if (propKey) return propKey;
  try {
    return import.meta.env?.VITE_TURNSTILE_SITE_KEY || '';
  } catch {
    return '';
  }
}

export function Turnstile({ onVerify, onExpire, siteKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // Store callbacks in refs so widget doesn't re-render when parent re-renders
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  // Initialize synchronously from prop or build-time env var
  const [resolvedKey, setResolvedKey] = useState<string>(() => getStaticSiteKey(siteKey));

  // If no static key available, fetch at runtime from the server
  useEffect(() => {
    if (resolvedKey) return; // Already have a key
    let cancelled = false;
    fetch('/api/config/public')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.turnstileSiteKey) {
          setResolvedKey(data.turnstileSiteKey);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [resolvedKey]);

  // Render the Turnstile widget once we have a key
  // Dependencies: only resolvedKey — callbacks are in refs to prevent re-renders
  useEffect(() => {
    mountedRef.current = true;
    if (!resolvedKey || !containerRef.current) return;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || !mountedRef.current) return;

      // Clean up existing widget
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: resolvedKey,
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': (errorCode: string) => {
            console.warn(`[Turnstile] Widget error: ${errorCode}`);
            // Don't block the user — allow form submission without CAPTCHA
            // Backend will skip verification if no token is provided
            onExpireRef.current?.();
          },
          theme: 'dark',
          size: 'flexible',
          retry: 'auto',
          'retry-interval': 5000,
        });
      } catch (err) {
        console.warn('[Turnstile] Failed to render widget:', err);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Poll until Cloudflare script has loaded
      const interval = setInterval(() => {
        if (window.turnstile && mountedRef.current) {
          clearInterval(interval);
          renderWidget();
        }
      }, 200);
      return () => {
        clearInterval(interval);
        mountedRef.current = false;
        if (widgetIdRef.current) {
          try { window.turnstile.remove(widgetIdRef.current); } catch {}
          widgetIdRef.current = null;
        }
      };
    }

    return () => {
      mountedRef.current = false;
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [resolvedKey]); // Only re-render widget when key changes, NOT when callbacks change

  // No key available at all — don't render (allows dev without CAPTCHA)
  if (!resolvedKey) return null;

  return <div ref={containerRef} className="my-2" />;
}
