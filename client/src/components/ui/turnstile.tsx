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

/**
 * Resolve the Turnstile site key.
 *
 * Priority:
 *  1. Explicit `siteKey` prop
 *  2. Build-time env var (`VITE_TURNSTILE_SITE_KEY`)
 *  3. Runtime fetch from `/api/config/public`
 */
async function resolveSiteKey(propKey?: string): Promise<string> {
  if (propKey) return propKey;

  const buildKey = typeof import.meta !== 'undefined'
    ? import.meta.env?.VITE_TURNSTILE_SITE_KEY
    : '';
  if (buildKey) return buildKey;

  try {
    const res = await fetch('/api/config/public');
    if (res.ok) {
      const data = await res.json();
      return data.turnstileSiteKey || '';
    }
  } catch {}
  return '';
}

export function Turnstile({ onVerify, onExpire, siteKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  // Resolve the site key once on mount
  useEffect(() => {
    let cancelled = false;
    resolveSiteKey(siteKey).then((key) => {
      if (!cancelled) setResolvedKey(key);
    });
    return () => { cancelled = true; };
  }, [siteKey]);

  // Render the widget once we have a key
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
      // Poll until loaded
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

  // Don't render anything until we know the key; return null if no key available
  if (!resolvedKey) return null;

  return <div ref={containerRef} className="my-2" />;
}
