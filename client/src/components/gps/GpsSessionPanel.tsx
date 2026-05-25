/**
 * GPS Live Dispatch — per-job session panel.
 *
 * Companion to OnMyWayCard. Lives on the job detail page. Three states:
 *   1. No active session → "Start Live Dispatch" button (shown when status='en_route')
 *      Tap → consent dialog (if needed) → server start session → startTracking()
 *   2. Active session → TrackingStatusBar (pause/stop) + "Send tracking link" button
 *   3. Tracking link sent → "Link sent · revoke" badge with copy-to-clipboard
 *
 * Gated on:
 *   - business.gpsTrackingEnabled (server-side)
 *   - field-service industry (server-side, via requireGpsPlan)
 *   - Growth+ plan (server-side)
 *   - Capacitor native platform (client-side; web fallback hidden)
 *
 * If any gate fails, the panel renders nothing (silent — owner sees the feature
 * in Settings but techs only see the UI when everything is configured).
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Send, X, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GpsConsentDialog } from "./GpsConsentDialog";
import { TrackingStatusBar } from "./TrackingStatusBar";
import { startTracking, isGpsAvailableOnDevice } from "@/lib/capacitor-gps";

export interface GpsSessionPanelProps {
  jobId: number;
  jobStatus: string | null | undefined;
  staffId: number | null;
  customerId: number | null;
}

interface ActiveSession {
  sessionId: number;
  staffId: number;
  jobId: number | null;
  status: 'active' | 'paused';
  pingCount: number;
}

interface ShareLink {
  linkId: number;
  token: string;
  expiresAt: string;
  viewCount: number;
}

export function GpsSessionPanel({ jobId, jobStatus, staffId, customerId }: GpsSessionPanelProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [consentOpen, setConsentOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  // Probe GPS eligibility — single call to /api/gps/disclosure tells us if the
  // server-side gates pass. If it returns 200, GPS is available for this user.
  // 402/403/404 = not eligible, render nothing.
  const eligibility = useQuery({
    queryKey: ['gps-eligibility'],
    queryFn: async () => {
      try {
        const r = await apiRequest('GET', '/api/gps/disclosure');
        if (!r.ok) return { eligible: false };
        return { eligible: true };
      } catch {
        return { eligible: false };
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Poll for active session every 10s while panel is visible
  useEffect(() => {
    if (!eligibility.data?.eligible || !staffId) return;
    let cancelled = false;

    const fetchActive = async () => {
      try {
        const r = await apiRequest('GET', '/api/gps/sessions/active');
        if (!r.ok) return;
        const json = await r.json();
        const mine = (json.sessions ?? []).find((s: any) => s.staffId === staffId && s.jobId === jobId);
        if (!cancelled) {
          if (mine) {
            setActiveSession({
              sessionId: mine.sessionId,
              staffId: mine.staffId,
              jobId: mine.jobId,
              status: mine.status,
              pingCount: mine.pingCount ?? 0,
            });
          } else {
            setActiveSession(null);
          }
        }
      } catch (err) {
        console.error('[GpsSessionPanel] active session poll error:', err);
      }
    };

    void fetchActive();
    const t = setInterval(fetchActive, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [eligibility.data?.eligible, staffId, jobId]);

  // Fetch existing share links for this job
  useEffect(() => {
    if (!eligibility.data?.eligible) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiRequest('GET', `/api/gps/jobs/${jobId}/links`);
        if (!r.ok) return;
        const json = await r.json();
        const latest = (json.links ?? [])[0];
        if (!cancelled) setShareLink(latest ?? null);
      } catch (err) {
        console.error('[GpsSessionPanel] link fetch error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [eligibility.data?.eligible, jobId, activeSession?.sessionId]);

  // ─── Bail outs (render nothing if any gate fails) ──────────────────────
  if (!eligibility.data?.eligible) return null;
  if (!staffId) return null;
  // Only show when tech is actually en route or on site
  if (jobStatus !== 'en_route' && jobStatus !== 'in_progress' && !activeSession) return null;

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleStartClick = async () => {
    // Check consent first
    try {
      const checkResp = await apiRequest('GET', `/api/gps/consent/check/${staffId}`);
      const check = await checkResp.json();
      if (check.required) {
        setConsentOpen(true);
      } else {
        await actuallyStartSession();
      }
    } catch (err: any) {
      toast({
        title: 'Could not start tracking',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const onConsentAccepted = async () => {
    setConsentOpen(false);
    await actuallyStartSession();
  };

  const actuallyStartSession = async () => {
    setStarting(true);
    try {
      // Fetch current disclosure version (required for session start)
      const discResp = await apiRequest('GET', '/api/gps/disclosure');
      const disc = await discResp.json();

      // Start server-side session
      const startResp = await apiRequest('POST', '/api/gps/sessions/start', {
        staffId,
        jobId,
        disclosureVersion: disc.version,
      });
      const start = await startResp.json();

      // Start client-side watcher (only on native)
      if (isGpsAvailableOnDevice()) {
        const result = await startTracking({ sessionId: start.sessionId });
        if (!result.ok) {
          toast({
            title: 'Tracking permission denied',
            description: result.reason || 'Enable location in device settings to use Live Dispatch.',
            variant: 'destructive',
          });
          // Clean up the server-side session since the client can't actually track
          await apiRequest('POST', `/api/gps/sessions/${start.sessionId}/end`, { reason: 'permissions_revoked' });
          return;
        }
      } else {
        toast({
          title: 'Live Dispatch requires the mobile app',
          description: 'Open SmallBizAgent on your phone to track location.',
        });
        await apiRequest('POST', `/api/gps/sessions/${start.sessionId}/end`, { reason: 'manual' });
        return;
      }

      setActiveSession({
        sessionId: start.sessionId,
        staffId: staffId!,
        jobId,
        status: 'active',
        pingCount: 0,
      });
      toast({ title: 'Live Dispatch started', description: 'Your location is now being shared with dispatch.' });
    } catch (err: any) {
      console.error('[GpsSessionPanel] start error:', err);
      toast({
        title: 'Could not start tracking',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  };

  const handleStopped = async () => {
    if (!activeSession) return;
    try {
      await apiRequest('POST', `/api/gps/sessions/${activeSession.sessionId}/end`, { reason: 'manual' });
    } catch (err) {
      console.error('[GpsSessionPanel] server end error:', err);
    }
    setActiveSession(null);
    qc.invalidateQueries({ queryKey: ['gps-active-sessions'] });
  };

  const handleSendTrackingLink = async () => {
    setSendingSms(true);
    try {
      // 1. Create a link
      const linkResp = await apiRequest('POST', '/api/gps/links', {
        jobId,
        customerId,
      });
      const link = await linkResp.json();
      setShareLink({
        linkId: link.linkId,
        token: link.token,
        expiresAt: link.expiresAt,
        viewCount: 0,
      });

      // 2. Trigger the SMS via existing notification path
      // Sends a separate transactional SMS — does not modify the en_route SMS
      await apiRequest('POST', `/api/jobs/${jobId}/send-tracking-link`, {
        trackingUrl: link.url,
      });

      toast({
        title: 'Tracking link sent',
        description: 'Customer can now follow your location until you arrive.',
      });
    } catch (err: any) {
      console.error('[GpsSessionPanel] send link error:', err);
      toast({
        title: 'Could not send tracking link',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingSms(false);
    }
  };

  const handleRevokeLink = async () => {
    if (!shareLink) return;
    try {
      await apiRequest('DELETE', `/api/gps/links/${shareLink.linkId}`);
      setShareLink(null);
      toast({ title: 'Tracking link revoked' });
    } catch (err: any) {
      toast({
        title: 'Could not revoke link',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/track/${shareLink.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <Card className="border-blue-200 bg-blue-50/40 mt-3">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600" />
          <p className="font-medium text-sm">Live Dispatch</p>
        </div>

        {!activeSession ? (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Share your live location with dispatch and (optionally) the customer.
            </p>
            <Button
              size="sm"
              onClick={handleStartClick}
              disabled={starting || !isGpsAvailableOnDevice()}
              data-testid="gps-start"
            >
              {starting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MapPin className="mr-1.5 h-4 w-4" />}
              Start Live Dispatch
            </Button>
          </div>
        ) : (
          <>
            <TrackingStatusBar
              sessionId={activeSession.sessionId}
              initialStatus={activeSession.status}
              pingCount={activeSession.pingCount}
              onStopped={handleStopped}
              onStatusChange={(s) => setActiveSession({ ...activeSession, status: s })}
            />

            {/* Customer share. In 'auto' mode the customer already received
                the link bundled into the en-route SMS — this button becomes
                a "resend" for the rare case (lost SMS, customer asks again). */}
            <div className="border-t pt-3">
              {!shareLink ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendTrackingLink}
                  disabled={sendingSms || !customerId}
                  className="w-full"
                  data-testid="gps-send-link"
                >
                  {sendingSms ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send tracking link to customer
                </Button>
              ) : (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                      <Send className="mr-1 h-3 w-3" />
                      Link sent
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      Viewed {shareLink.viewCount} time{shareLink.viewCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={handleCopyLink} data-testid="gps-copy-link">
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleRevokeLink} data-testid="gps-revoke-link">
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      <GpsConsentDialog
        open={consentOpen}
        staffId={staffId!}
        onCancel={() => setConsentOpen(false)}
        onAccepted={onConsentAccepted}
      />
    </Card>
  );
}

