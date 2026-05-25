/**
 * Dispatcher dashboard — live map of active techs.
 *
 * Role-gated (owner + manager only). Plan-gated server-side (requireGpsPlan).
 * Industry-gated (field-service only, enforced via the eligibility probe).
 *
 * Polls GET /api/gps/sessions/active every 10s. Renders:
 *   - Left rail: list of active sessions with "X seconds ago" + ping count
 *   - Center: Google Map with one marker per tech
 *   - Right rail: selected tech detail (latest ping, job link, breadcrumb toggle)
 *
 * On mobile (<lg screens): single column. Map on top, list below.
 *
 * Breadcrumb playback (scrubber for replaying a session) is deferred to a
 * future PR — this PR ships live-map only.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MapPin, Pause, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { loadGoogleMapsScript } from "@/lib/google-maps-loader";
import { ErrorBoundary } from "@/components/ui/error-boundary";

interface ActiveSession {
  sessionId: number;
  staffId: number;
  staffName: string;
  jobId: number | null;
  status: 'active' | 'paused';
  startedAt: string;
  lastPingAt: string | null;
  pingCount: number;
  latestPing: {
    lat: number;
    lng: number;
    recordedAt: string;
    accuracyMeters: number | null;
    speedMps: number | null;
    headingDegrees: number | null;
    batteryLevel: number | null;
  } | null;
}

/**
 * Eligibility codes returned by requireGpsPlan / requireGpsPlanForSettings.
 * Render an upgrade card per code instead of the full dispatcher UI when
 * any of these fires — saves Google Maps quota AND gives the customer
 * actionable copy.
 */
type GateCode =
  | 'GPS_PLAN_REQUIRED'              // 402 — wrong plan tier
  | 'GPS_NOT_AVAILABLE_FOR_INDUSTRY' // 403 — barbers/salons/restaurants
  | 'GPS_BETA_NOT_APPROVED'          // 403 — admin hasn't opted in
  | 'GPS_NOT_ENABLED'                // 403 — owner hasn't flipped master toggle
  | 'GPS_FEATURE_DISABLED'           // 501 — env kill switch
  | 'UNKNOWN';

interface GateInfo {
  code: GateCode;
  message: string;
  upgradeUrl?: string;
  settingsUrl?: string;
}

const POLL_INTERVAL_MS = 10_000;

export default function DispatchPage() {
  return (
    <ErrorBoundary>
      <DispatchPageInner />
    </ErrorBoundary>
  );
}

function DispatchPageInner() {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [gate, setGate] = useState<GateInfo | null>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map());

  // ── Active sessions polling ─────────────────────────────────────────
  // Doubles as our eligibility probe: if the plan/industry/beta gate fires,
  // the query throws and we surface a structured upgrade card. The map +
  // rails stay UNRENDERED in that case so we don't waste Google Maps quota.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['gps-active-sessions'],
    queryFn: async () => {
      let r: Response;
      try {
        r = await apiRequest('GET', '/api/gps/sessions/active');
      } catch (e: any) {
        // apiRequest throws on non-2xx. Format is typically
        // "402: { ... json ... }" or just a message. Extract the JSON body
        // from the first `{` to the last `}` so we can read body.code.
        const msg = String(e?.message ?? '');
        const firstBrace = msg.indexOf('{');
        const lastBrace = msg.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          try {
            const body = JSON.parse(msg.slice(firstBrace, lastBrace + 1));
            if (body?.code) {
              setGate({
                code: body.code as GateCode,
                message: body.message || body.error || 'Live Dispatch is not available.',
                upgradeUrl: body.upgradeUrl,
                settingsUrl: body.settingsUrl,
              });
            } else {
              setGate({ code: 'UNKNOWN', message: body.error || msg });
            }
          } catch {
            setGate({ code: 'UNKNOWN', message: msg });
          }
        } else {
          setGate({ code: 'UNKNOWN', message: msg });
        }
        throw e;
      }

      if (!r.ok) {
        // Defensive — apiRequest should have thrown already, but handle it.
        const body = await r.json().catch(() => ({}));
        setGate({
          code: (body?.code as GateCode) || 'UNKNOWN',
          message: body?.message || body?.error || `HTTP ${r.status}`,
          upgradeUrl: body?.upgradeUrl,
          settingsUrl: body?.settingsUrl,
        });
        throw new Error(body.message || body.error || `HTTP ${r.status}`);
      }

      setGate(null); // Clear any prior gate on successful response
      return (await r.json()) as { sessions: ActiveSession[] };
    },
    refetchInterval: gate ? false : POLL_INTERVAL_MS, // Stop polling once gated
    staleTime: 5000,
    retry: false,
  });

  const sessions = data?.sessions ?? [];
  const isGated = !!gate;

  // ── Load Google Maps ────────────────────────────────────────────────
  // Skip the script load if we know we're gated — saves Google Maps quota
  // and avoids a blank gray rectangle on the upgrade screen. Once the gate
  // clears (e.g., admin approves the business), the page will rerender and
  // this effect will kick in to load the script.
  useEffect(() => {
    if (isGated) return;
    let cancelled = false;
    (async () => {
      try {
        const maps = await loadGoogleMapsScript(['marker']);
        if (cancelled) return;
        if (!maps) {
          setMapsError('Map service is not configured. Contact your administrator.');
          return;
        }
        setMapsReady(true);
      } catch (err: any) {
        setMapsError(err?.message || 'Could not load map.');
      }
    })();
    return () => { cancelled = true; };
  }, [isGated]);

  // ── Initialize map ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google.maps as typeof google.maps;
    // Center on continental US until we have a ping
    mapInstance.current = new g.Map(mapRef.current, {
      center: { lat: 39.5, lng: -98.5 },
      zoom: 4,
      disableDefaultUI: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    });
  }, [mapsReady]);

  // ── Sync markers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !mapsReady) return;
    const g = (window as any).google.maps as typeof google.maps;

    const seenStaffIds = new Set<number>();
    const bounds = new g.LatLngBounds();
    let hasAny = false;

    sessions.forEach(s => {
      if (!s.latestPing) return;
      seenStaffIds.add(s.staffId);
      const pos = { lat: s.latestPing.lat, lng: s.latestPing.lng };
      bounds.extend(pos);
      hasAny = true;

      let marker = markersRef.current.get(s.staffId);
      if (!marker) {
        marker = new g.Marker({
          position: pos,
          map: mapInstance.current!,
          title: s.staffName,
          label: {
            text: s.staffName.charAt(0),
            color: 'white',
            fontWeight: 'bold',
          },
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: s.status === 'paused' ? '#d97706' : '#2563eb',
            fillOpacity: 0.95,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        });
        marker.addListener('click', () => setSelectedStaffId(s.staffId));
        markersRef.current.set(s.staffId, marker);
      } else {
        marker.setPosition(pos);
        marker.setIcon({
          path: g.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: s.status === 'paused' ? '#d97706' : '#2563eb',
          fillOpacity: 0.95,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        });
      }
    });

    // Remove markers for sessions that ended
    markersRef.current.forEach((marker, staffId) => {
      if (!seenStaffIds.has(staffId)) {
        marker.setMap(null);
        markersRef.current.delete(staffId);
      }
    });

    // Auto-fit bounds on first render with sessions, but not on subsequent updates
    if (hasAny && mapInstance.current.getZoom()! <= 4) {
      mapInstance.current.fitBounds(bounds, 100);
      // Cap zoom to avoid silly close-up when only one tech
      const listener = g.event.addListenerOnce(mapInstance.current, 'idle', () => {
        if (mapInstance.current!.getZoom()! > 15) mapInstance.current!.setZoom(15);
      });
      void listener;
    }
  }, [sessions, mapsReady]);

  // ── Pan to selected tech ─────────────────────────────────────────────
  useEffect(() => {
    if (selectedStaffId == null || !mapInstance.current) return;
    const session = sessions.find(s => s.staffId === selectedStaffId);
    if (!session?.latestPing) return;
    mapInstance.current.panTo({ lat: session.latestPing.lat, lng: session.latestPing.lng });
    if (mapInstance.current.getZoom()! < 13) mapInstance.current.setZoom(14);
  }, [selectedStaffId, sessions]);

  const selectedSession = selectedStaffId != null
    ? sessions.find(s => s.staffId === selectedStaffId) ?? null
    : null;

  // ── Render ──────────────────────────────────────────────────────────
  // GATED PATH — show only the header + upgrade card. Don't render the
  // map (saves Google Maps quota) or the rails (no data anyway).
  if (isGated) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            Real-time tech tracking + customer "where's my tech" page
          </p>
        </div>
        <GateCard gate={gate!} onRetry={() => { setGate(null); refetch(); }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : `${sessions.length} tech${sessions.length === 1 ? '' : 's'} active`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {isError && !isGated && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-none" />
            <p className="text-sm text-amber-900">
              {(error as Error)?.message || 'Could not load active sessions.'}
            </p>
          </CardContent>
        </Card>
      )}

      {mapsError && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-none" />
            <p className="text-sm text-amber-900">{mapsError}</p>
          </CardContent>
        </Card>
      )}

      {/* Three-column desktop / single-column mobile */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-3 min-h-0">
        {/* Left rail — active tech list */}
        <Card className="overflow-hidden flex flex-col min-h-0 order-2 lg:order-1">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Active Techs</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-1 px-2 pb-2">
              {sessions.length === 0 && !isLoading ? (
                <p className="text-sm text-muted-foreground p-3 text-center">
                  No techs currently tracking.
                </p>
              ) : (
                sessions.map(s => (
                  <button
                    key={s.sessionId}
                    onClick={() => setSelectedStaffId(s.staffId)}
                    className={`w-full text-left p-2 rounded-md hover:bg-muted transition-colors ${
                      selectedStaffId === s.staffId ? 'bg-muted' : ''
                    }`}
                    data-testid={`tech-list-${s.staffId}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{s.staffName}</p>
                      {s.status === 'paused' ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                          <Pause className="h-3 w-3" />
                        </Badge>
                      ) : (
                        <span className="relative flex h-2 w-2 flex-none">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.lastPingAt ? `Updated ${formatRelative(s.lastPingAt)}` : 'No pings yet'}
                      {' · '}
                      {s.pingCount} update{s.pingCount === 1 ? '' : 's'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Center — map */}
        <Card className="overflow-hidden flex-1 min-h-[400px] order-1 lg:order-2">
          <div className="relative w-full h-full bg-slate-100" ref={mapRef}>
            {!mapsReady && !mapsError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {mapsError && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="text-center">
                  <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{mapsError}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Right rail — selected tech detail */}
        <Card className="overflow-hidden flex flex-col min-h-0 order-3">
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              {selectedSession ? selectedSession.staffName : 'Select a tech'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto py-2">
            {!selectedSession ? (
              <p className="text-sm text-muted-foreground">
                Click a tech on the map or in the list to see details.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <DetailRow label="Status" value={
                  <Badge variant={selectedSession.status === 'paused' ? 'secondary' : 'default'}>
                    {selectedSession.status === 'paused' ? 'Paused' : 'Active'}
                  </Badge>
                } />
                <DetailRow label="Last update" value={selectedSession.lastPingAt ? formatRelative(selectedSession.lastPingAt) : '—'} />
                <DetailRow label="Pings sent" value={String(selectedSession.pingCount)} />
                {selectedSession.latestPing?.accuracyMeters != null && (
                  <DetailRow label="Accuracy" value={`±${Math.round(selectedSession.latestPing.accuracyMeters)}m`} />
                )}
                {selectedSession.latestPing?.speedMps != null && selectedSession.latestPing.speedMps > 0 && (
                  <DetailRow label="Speed" value={`${Math.round(selectedSession.latestPing.speedMps * 2.237)} mph`} />
                )}
                {selectedSession.latestPing?.batteryLevel != null && (
                  <DetailRow label="Battery" value={`${Math.round(selectedSession.latestPing.batteryLevel * 100)}%`} />
                )}
                {selectedSession.jobId && (
                  <Link href={`/jobs/${selectedSession.jobId}`}>
                    <Button variant="outline" size="sm" className="w-full mt-2">
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Open Job #{selectedSession.jobId}
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Upgrade card shown when the eligibility probe returns a gate code.
 * Each code gets tailored copy so the customer knows what to do.
 */
function GateCard({ gate, onRetry }: { gate: GateInfo; onRetry: () => void }) {
  const { title, body, cta } = (() => {
    switch (gate.code) {
      case 'GPS_PLAN_REQUIRED':
        return {
          title: 'Live Dispatch requires a Growth plan or higher',
          body: 'Real-time GPS tracking + the customer "where\'s my tech" page are available on Growth ($299/mo) and Pro ($449/mo). Both tiers include 24-hour retention; Pro extends it to 7 days.',
          cta: { label: 'View plans', href: gate.upgradeUrl || '/settings?tab=subscription' },
        };
      case 'GPS_NOT_AVAILABLE_FOR_INDUSTRY':
        return {
          title: 'Live Dispatch is for field-service businesses',
          body: 'This feature is built for HVAC, plumbing, electrical, landscaping, construction, pest control, roofing, and painting businesses where techs travel to job sites. It is not available for chair-based or office-visit verticals.',
          cta: null,
        };
      case 'GPS_BETA_NOT_APPROVED':
        return {
          title: 'Live Dispatch is in limited beta',
          body: 'We\'re rolling this feature out one customer at a time during beta. Contact support to request access for your business.',
          cta: { label: 'Contact support', href: 'mailto:support@smallbizagent.ai?subject=Live%20Dispatch%20beta%20access' },
        };
      case 'GPS_NOT_ENABLED':
        return {
          title: 'Live Dispatch is not enabled yet',
          body: 'Turn it on in Settings → Business → Live Dispatch. Once enabled, your techs can start sharing their location on each job.',
          cta: { label: 'Open Settings', href: gate.settingsUrl || '/settings?tab=dispatch' },
        };
      case 'GPS_FEATURE_DISABLED':
        return {
          title: 'Live Dispatch is temporarily unavailable',
          body: 'The feature has been disabled platform-wide for maintenance. Please check back shortly.',
          cta: null,
        };
      default:
        return {
          title: 'Could not load Live Dispatch',
          body: gate.message || 'Something went wrong. Please try again.',
          cta: { label: 'Try again', onClick: onRetry },
        };
    }
  })();

  return (
    <Card className="border-blue-200 bg-blue-50/40 max-w-2xl">
      <CardContent className="p-6 space-y-3">
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-blue-600 flex-none mt-0.5" />
          <div className="space-y-2">
            <h2 className="font-semibold text-lg">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
            {cta && 'href' in cta && (
              <Button asChild size="sm" className="mt-2">
                <a href={cta.href}>{cta.label}</a>
              </Button>
            )}
            {cta && 'onClick' in cta && (
              <Button size="sm" className="mt-2" onClick={cta.onClick}>
                {cta.label}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
