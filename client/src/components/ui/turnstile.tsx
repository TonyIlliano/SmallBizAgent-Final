import { useEffect, useRef, useState } from 'react';

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

  // Render the Turnstile widget once we have a key and the container is mounted
  useEffect(() => {
    if (!resolvedKey || !containerRef.current) return;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current) return;

      // Clean up existing widget
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: resolvedKey,
        callback: onVerify,
        'expired-callback': onExpire,
        theme: 'dark',
        size: 'flexible',
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Poll until Cloudflare script has loaded
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, [resolvedKey, onVerify, onExpire]);

  // No key available at all — don't render (allows dev without CAPTCHA)
  if (!resolvedKey) return null;

  return <div ref={containerRef} className="my-2" />;
}
