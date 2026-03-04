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

export function Turnstile({ onVerify, onExpire, siteKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const key = siteKey || import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!key || !containerRef.current) return;

    // Wait for turnstile to be loaded
    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current) return;

      // Clean up existing widget
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: key,
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
  }, [siteKey, onVerify, onExpire]);

  // Don't render anything if no site key (allows development without CAPTCHA)
  const key = siteKey || (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_TURNSTILE_SITE_KEY : '');
  if (!key) return null;

  return <div ref={containerRef} className="my-2" />;
}
