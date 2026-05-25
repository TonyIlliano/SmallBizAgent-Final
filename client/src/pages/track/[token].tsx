/**
 * Customer-facing live tracking page.
 *
 * Public route at /track/:token. NO auth required. Mobile-first responsive.
 * Polls GET /api/gps/public/track/:token every 15s.
 *
 * Privacy contract (enforced server-side):
 *   - No breadcrumb history shown — only current tech location
 *   - No tech full name/email/phone — first name + last initial only
 *   - No customer address shown back to them — they already know it
 *   - No other tenant data leaked
 *
 * States: loading → live → expired/revoked → session ended.
 */

import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { loadGoogleMapsScript } from "@/lib/google-maps-loader";

interface TrackingPayload {
  businessName: string;
  businessPhone: string | null;
  tech: { firstName: string; lastInitial: string } | null;
  jobStatus: string | null;
  etaMinutes: number | null;
  latestPing: { lat: number; lng: number; recordedAt: string; isMoving?: boolean } | null;
  sessionStatus: 'active' | 'paused' | 'ended';
  linkExpiresAt: string;
}

interface ApiError {
  error: string;
  code?: 'EXPIRED' | 'REVOKED' | 'DISABLED';
}

const POLL_INTERVAL_MS = 15 * 1000;

export default function CustomerTrackPage() {
  const [, params] = useRoute('/track/:token');
  const token = params?.token ?? '';

  const [data, setData] = useState<TrackingPayload | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapsReady, setMapsReady] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerInstance = useRef<google.maps.Marker | null>(null);

  // ── Fetch + poll ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchData = async () => {
      try {
        const r = await fetch(`/api/gps/public/track/${encodeURIComponent(token)}`);
        if (cancelled) return;

        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: 'Unknown error' }));
          setError(body);
          setLoading(false);
          return;
        }
        const json: TrackingPayload = await r.json();
        setData(json);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[Track] fetch error:', err);
        setError({ error: 'Could not connect. Trying again...' });
        setLoading(false);
      }
    };

    void fetchData();
    const t = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [token]);

  // ── Load Google Maps ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maps = await loadGoogleMapsScript(['marker']);
      if (cancelled) return;
      setMapsReady(!!maps);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Init map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !data?.latestPing || !mapRef.current) return;

    const g = (window as any).google.maps as typeof google.maps;
    const pos = { lat: data.latestPing.lat, lng: data.latestPing.lng };

    if (!mapInstance.current) {
      mapInstance.current = new g.Map(mapRef.current, {
        center: pos,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        styles: [
          // Soft custom style — hides POI noise, emphasizes roads
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      });
    } else {
      mapInstance.current.panTo(pos);
    }

    if (!markerInstance.current) {
      markerInstance.current = new g.Marker({
        position: pos,
        map: mapInstance.current,
        title: data.tech ? `${data.tech.firstName} ${data.tech.lastInitial}.` : 'Technician',
        animation: data.latestPing.isMoving ? g.Animation.DROP : undefined,
      });
    } else {
      markerInstance.current.setPosition(pos);
    }
  }, [mapsReady, data]);

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p>Loading tracking…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <h1 className="text-lg font-semibold">
              {error.code === 'EXPIRED' && 'Tracking link expired'}
              {error.code === 'REVOKED' && 'Tracking link no longer available'}
              {error.code === 'DISABLED' && 'Tracking is no longer available'}
              {!error.code && 'Could not load tracking'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {error.code === 'EXPIRED' && 'This link is no longer active. Contact the business for an update.'}
              {error.code === 'REVOKED' && 'The business revoked this link. Contact them directly for an update.'}
              {(!error.code || error.code === 'DISABLED') && 'Please contact the business directly.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const sessionEnded = data.sessionStatus === 'ended';
  const sessionPaused = data.sessionStatus === 'paused';
  const techName = data.tech ? `${data.tech.firstName} ${data.tech.lastInitial}.` : 'Your technician';

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="text-center pt-4">
          <h1 className="text-2xl font-bold tracking-tight">
            {sessionEnded ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                Service complete
              </span>
            ) : data.jobStatus === 'in_progress' ? (
              `${techName} has arrived`
            ) : (
              `${techName} is on the way!`
            )}
          </h1>
          {!sessionEnded && data.etaMinutes != null && data.jobStatus !== 'in_progress' && (
            <p className="mt-1 text-lg text-blue-600 font-semibold">
              ETA: ~{data.etaMinutes} min
            </p>
          )}
          {sessionPaused && (
            <p className="mt-1 text-sm text-amber-600">
              ({techName} is briefly paused — may be on a quick stop)
            </p>
          )}
        </div>

        {/* Map */}
        <Card className="overflow-hidden">
          <div ref={mapRef} className="w-full h-80 bg-slate-100 relative">
            {!mapsReady && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  <span>Loading map…</span>
                </div>
              </div>
            )}
            {mapsReady && !data.latestPing && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-4 text-center">
                <p>Location not available yet. Refreshing…</p>
              </div>
            )}
          </div>
        </Card>

        {/* Business info */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{data.businessName}</p>
              {!sessionEnded && (
                <p className="text-xs text-muted-foreground">
                  Updated {data.latestPing ? formatRelative(data.latestPing.recordedAt) : 'just now'}
                </p>
              )}
            </div>
            {data.businessPhone && (
              <a href={`tel:${data.businessPhone}`}>
                <Button size="sm" variant="outline">
                  <Phone className="mr-1.5 h-4 w-4" />
                  Call
                </Button>
              </a>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-2">
          Tracking automatically expires {formatExpiry(data.linkExpiresAt)}
        </p>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function formatExpiry(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const minsUntil = Math.max(0, Math.floor((then - now) / 60000));
  if (minsUntil <= 0) return 'soon';
  if (minsUntil < 60) return `in ${minsUntil} min`;
  const hr = Math.floor(minsUntil / 60);
  return `in ${hr} hour${hr === 1 ? '' : 's'}`;
}
