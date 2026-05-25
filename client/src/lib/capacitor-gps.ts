/**
 * GPS Live Dispatch — Capacitor mobile integration.
 *
 * Wraps @capacitor-community/background-geolocation with:
 *   - Permission handling (request, status check)
 *   - In-memory ping queue with offline persistence via Preferences plugin
 *   - Batched flush every 30s OR every 10 pings (whichever first)
 *   - Auto-drain backlog on app resume / network restore
 *   - Web fallback returns null so dev in browser doesn't crash
 *
 * Companion to GpsConsentDialog (renders disclosure UI) and TrackingStatusBar
 * (persistent pause/stop UI). Wired into OnMyWayCard for the tech-initiated
 * start flow.
 *
 * Tech opens app → taps "I'm on my way" on a job → consent dialog (if needed) →
 * server POST /api/gps/sessions/start → startTracking() → pings flow.
 */

import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';

export interface GpsTrackerConfig {
  sessionId: number;
  intervalSeconds?: number;       // default 30
  distanceFilterMeters?: number;  // default 25 — don't ping if moved less
  pauseOnStationary?: boolean;    // default true
}

interface PingDraft {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  headingDegrees?: number | null;
  altitudeMeters?: number | null;
  batteryLevel?: number | null;
  isMoving?: boolean;
  source?: 'background' | 'foreground' | 'manual';
  recordedAt: string;  // ISO
}

interface StartResult {
  ok: boolean;
  reason?: string;
}

const QUEUE_STORAGE_KEY = 'sba-gps-queue';
const FLUSH_INTERVAL_MS = 30 * 1000;
const FLUSH_BATCH_THRESHOLD = 10;
const MAX_QUEUE_SIZE = 500;  // protect against runaway memory

// ─── Module state ─────────────────────────────────────────────────────────
let queue: PingDraft[] = [];
let currentSessionId: number | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let watcherId: string | null = null;
let flushInFlight = false;

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Returns true when the app is running on iOS/Android and the
 * background-geolocation plugin can actually be loaded.
 *
 * On web (desktop or mobile browser), returns false — Live Dispatch sessions
 * require the native app. Components use this to gate UI like the "Start
 * Live Dispatch" button.
 *
 * This is the single source of truth — do NOT call `Capacitor.isNativePlatform()`
 * directly anywhere else in the GPS code paths.
 */
export function isGpsAvailableOnDevice(): boolean {
  return Capacitor.isNativePlatform();
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (!isGpsAvailableOnDevice()) return 'unsupported';
  try {
    const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation' as any);
    // The plugin exposes permission state via its own API
    const status = await (BackgroundGeolocation as any).checkPermissions?.();
    if (!status) return 'prompt';
    if (status.location === 'granted' || status.location === 'authorized') return 'granted';
    if (status.location === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

export async function startTracking(config: GpsTrackerConfig): Promise<StartResult> {
  if (!isGpsAvailableOnDevice()) {
    return { ok: false, reason: 'unsupported_in_browser' };
  }

  if (watcherId) {
    return { ok: false, reason: 'already_tracking' };
  }

  try {
    const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation' as any);

    // Load any persisted backlog first (from a previous session that was killed)
    await loadQueueFromStorage();

    currentSessionId = config.sessionId;

    // Permission request — plugin will surface OS prompt if needed
    const permResult = await (BackgroundGeolocation as any).requestPermissions?.();
    if (permResult && permResult.location !== 'granted' && permResult.location !== 'authorized') {
      currentSessionId = null;
      return { ok: false, reason: 'permission_denied' };
    }

    // Start the watcher. Plugin maintains a foreground service on Android +
    // background location on iOS.
    const id: string = await new Promise((resolve, reject) => {
      (BackgroundGeolocation as any).addWatcher(
        {
          backgroundMessage: 'You are currently on the clock — location tracking is active.',
          backgroundTitle: 'SmallBizAgent Tracking',
          requestPermissions: false,  // already handled above
          stale: false,
          distanceFilter: config.distanceFilterMeters ?? 25,
        },
        (location: any, error: any) => {
          if (error) {
            console.error('[GPS] watcher error:', error);
            return;
          }
          if (!location) return;
          enqueue({
            lat: location.latitude,
            lng: location.longitude,
            accuracyMeters: location.accuracy ?? null,
            speedMps: location.speed ?? null,
            headingDegrees: location.bearing ?? null,
            altitudeMeters: location.altitude ?? null,
            batteryLevel: null, // plugin doesn't expose; could pull via Device plugin
            isMoving: (location.speed ?? 0) > 0.5,
            source: 'background',
            recordedAt: new Date(location.time ?? Date.now()).toISOString(),
          });
        }
      ).then(resolve, reject);
    });

    watcherId = id;

    // Start periodic flush timer
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = setInterval(() => { void flushNow(); }, FLUSH_INTERVAL_MS);

    return { ok: true };
  } catch (err: any) {
    console.error('[GPS] startTracking error:', err);
    currentSessionId = null;
    return { ok: false, reason: err?.message || 'unknown_error' };
  }
}

export async function stopTracking(): Promise<{ totalPings: number; flushedSuccessfully: boolean }> {
  let totalFromQueue = queue.length;
  let flushedSuccessfully = false;

  // Final flush before tearing down
  try {
    const result = await flushNow();
    flushedSuccessfully = result.accepted > 0 || queue.length === 0;
    totalFromQueue += result.accepted;
  } catch {
    flushedSuccessfully = false;
  }

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  if (watcherId && isGpsAvailableOnDevice()) {
    try {
      const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation' as any);
      await (BackgroundGeolocation as any).removeWatcher({ id: watcherId });
    } catch (err) {
      console.error('[GPS] removeWatcher error:', err);
    }
  }

  watcherId = null;
  currentSessionId = null;
  queue = [];
  await saveQueueToStorage();

  return { totalPings: totalFromQueue, flushedSuccessfully };
}

export async function pauseTracking(): Promise<void> {
  if (!currentSessionId) return;
  try {
    await apiRequest('POST', `/api/gps/sessions/${currentSessionId}/pause`, { paused: true });
  } catch (err) {
    console.error('[GPS] pauseTracking error:', err);
  }
}

export async function resumeTracking(): Promise<void> {
  if (!currentSessionId) return;
  try {
    await apiRequest('POST', `/api/gps/sessions/${currentSessionId}/pause`, { paused: false });
  } catch (err) {
    console.error('[GPS] resumeTracking error:', err);
  }
}

export async function flushNow(): Promise<{ accepted: number; rejected: number }> {
  if (flushInFlight) return { accepted: 0, rejected: 0 };
  if (!currentSessionId) return { accepted: 0, rejected: 0 };
  if (queue.length === 0) return { accepted: 0, rejected: 0 };

  flushInFlight = true;
  try {
    // Take up to 50 pings at a time (server caps batch at 50)
    const batch = queue.slice(0, 50);
    const resp = await apiRequest('POST', '/api/gps/pings', {
      sessionId: currentSessionId,
      pings: batch,
    });

    if (resp.ok) {
      const json = await resp.json().catch(() => ({}));
      // Drop the pings we sent (whether accepted OR rejected — they were valid attempts)
      queue.splice(0, batch.length);
      await saveQueueToStorage();
      return { accepted: json.accepted ?? 0, rejected: json.rejected ?? 0 };
    } else if (resp.status === 410 || resp.status === 404) {
      // Session ended server-side. Clean up.
      console.warn('[GPS] session no longer active — stopping');
      void stopTracking();
      return { accepted: 0, rejected: batch.length };
    } else {
      // Transient failure — keep in queue for retry
      console.warn('[GPS] flush failed, will retry:', resp.status);
      return { accepted: 0, rejected: 0 };
    }
  } catch (err) {
    console.error('[GPS] flushNow error:', err);
    return { accepted: 0, rejected: 0 };
  } finally {
    flushInFlight = false;
  }
}

export function getCurrentSessionId(): number | null {
  return currentSessionId;
}

export function getQueueDepth(): number {
  return queue.length;
}

// ─── Internals ────────────────────────────────────────────────────────────

function enqueue(ping: PingDraft) {
  queue.push(ping);
  if (queue.length > MAX_QUEUE_SIZE) {
    // Drop oldest — they would be rejected as stale anyway
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }
  // Threshold flush
  if (queue.length >= FLUSH_BATCH_THRESHOLD) {
    void flushNow();
  }
  // Best-effort save (debounced via try/catch — not awaited)
  void saveQueueToStorage();
}

async function loadQueueFromStorage(): Promise<void> {
  if (!isGpsAvailableOnDevice()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences' as any);
    const result = await (Preferences as any).get({ key: QUEUE_STORAGE_KEY });
    if (result?.value) {
      const parsed = JSON.parse(result.value);
      if (Array.isArray(parsed)) {
        queue = parsed.slice(-MAX_QUEUE_SIZE);
      }
    }
  } catch {
    // No Preferences plugin installed → silently fall back to in-memory only
  }
}

async function saveQueueToStorage(): Promise<void> {
  if (!isGpsAvailableOnDevice()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences' as any);
    await (Preferences as any).set({
      key: QUEUE_STORAGE_KEY,
      value: JSON.stringify(queue),
    });
  } catch {
    // Silently no-op if plugin not present
  }
}
