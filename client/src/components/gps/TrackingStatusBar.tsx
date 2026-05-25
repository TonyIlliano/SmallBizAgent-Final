/**
 * GPS Live Dispatch — persistent status bar shown to the tech while a session is active.
 *
 * Renders:
 *   - "Tracking active · X pings sent" with green pulse dot
 *   - "Paused" indicator if session is paused
 *   - Pause / Resume button
 *   - Stop tracking button (ends session)
 *
 * Used inside OnMyWayCard or as a sticky bottom bar on job detail pages.
 * The actual session lifecycle is owned by the parent — this component just
 * surfaces the controls.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play, StopCircle, Radio } from "lucide-react";
import { pauseTracking, resumeTracking, stopTracking, getQueueDepth } from "@/lib/capacitor-gps";
import { useToast } from "@/hooks/use-toast";

export interface TrackingStatusBarProps {
  sessionId: number;
  initialStatus: 'active' | 'paused';
  pingCount?: number;
  /** Called after stop is confirmed, so the parent can re-render. */
  onStopped: () => void;
  /** Called after pause/resume so parent can update local state. */
  onStatusChange?: (status: 'active' | 'paused') => void;
}

export function TrackingStatusBar({
  sessionId,
  initialStatus,
  pingCount = 0,
  onStopped,
  onStatusChange,
}: TrackingStatusBarProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<'active' | 'paused'>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [queueDepth, setQueueDepth] = useState(0);

  // Poll queue depth every 5s so the tech sees pending pings count
  useEffect(() => {
    const t = setInterval(() => setQueueDepth(getQueueDepth()), 5000);
    return () => clearInterval(t);
  }, []);

  const handlePauseToggle = async () => {
    setBusy(true);
    try {
      if (status === 'active') {
        await pauseTracking();
        setStatus('paused');
        onStatusChange?.('paused');
        toast({ title: 'Tracking paused', description: 'Resume when you\'re back on the job.' });
      } else {
        await resumeTracking();
        setStatus('active');
        onStatusChange?.('active');
        toast({ title: 'Tracking resumed' });
      }
    } catch (err: any) {
      toast({
        title: 'Could not update tracking',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const result = await stopTracking();
      // Server-side end happens in parent (knows the reason).
      toast({
        title: 'Tracking stopped',
        description: result.flushedSuccessfully
          ? `Sent ${result.totalPings} location updates.`
          : 'Stored locally — will sync when online.',
      });
      onStopped();
    } catch (err: any) {
      toast({
        title: 'Could not stop tracking',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        {status === 'active' ? (
          <div className="relative flex h-2.5 w-2.5 flex-none">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </div>
        ) : (
          <Pause className="h-4 w-4 text-amber-600" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {status === 'active' ? 'Tracking active' : 'Tracking paused'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {pingCount > 0 && `${pingCount} update${pingCount === 1 ? '' : 's'} sent`}
            {pingCount > 0 && queueDepth > 0 && ' · '}
            {queueDepth > 0 && <><Radio className="inline h-3 w-3 mr-0.5" />{queueDepth} pending</>}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-none">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePauseToggle}
          disabled={busy}
          data-testid="gps-pause-toggle"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'active' ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="ml-1.5 hidden sm:inline">{status === 'active' ? 'Pause' : 'Resume'}</span>
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleStop}
          disabled={busy}
          data-testid="gps-stop"
        >
          <StopCircle className="h-4 w-4" />
          <span className="ml-1.5 hidden sm:inline">Stop</span>
        </Button>
      </div>
    </div>
  );
}
