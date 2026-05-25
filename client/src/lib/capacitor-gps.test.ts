/**
 * Capacitor GPS module tests.
 *
 * Mocks the Capacitor native bridge + background-geolocation plugin so the
 * queue/flush logic can be tested in isolation under jsdom.
 *
 * Focuses on the bits that matter for correctness:
 *   - Permission denial path
 *   - Web fallback returns unsupported_in_browser
 *   - Threshold flush at 10 pings
 *   - Stop tracking flushes + removes watcher
 *   - 410/404 from server triggers auto-stop (session ended server-side)
 *   - Queue overflow drops oldest pings
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted state — accessible inside vi.mock factories AND in tests
const { mockIsNative, mockAddWatcher, mockRemoveWatcher, mockCheckPerms, mockRequestPerms, mockPrefsGet, mockPrefsSet, mockApiRequest } = vi.hoisted(() => ({
  mockIsNative: vi.fn(() => true),
  mockAddWatcher: vi.fn(),
  mockRemoveWatcher: vi.fn(),
  mockCheckPerms: vi.fn(),
  mockRequestPerms: vi.fn(),
  mockPrefsGet: vi.fn(async () => ({ value: null })),
  mockPrefsSet: vi.fn(async () => undefined),
  mockApiRequest: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNative(),
  },
}));

vi.mock('@capacitor-community/background-geolocation', () => ({
  BackgroundGeolocation: {
    addWatcher: (...args: any[]) => mockAddWatcher(...args),
    removeWatcher: (...args: any[]) => mockRemoveWatcher(...args),
    checkPermissions: (...args: any[]) => mockCheckPerms(...args),
    requestPermissions: (...args: any[]) => mockRequestPerms(...args),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: (...args: any[]) => mockPrefsGet(...args),
    set: (...args: any[]) => mockPrefsSet(...args),
  },
}));

vi.mock('./queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

import {
  startTracking,
  stopTracking,
  pauseTracking,
  resumeTracking,
  flushNow,
  getPermissionStatus,
  getCurrentSessionId,
  getQueueDepth,
} from './capacitor-gps';

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Stub `addWatcher` to:
 *   1. Return a resolved Promise<watcherId>
 *   2. Capture the location callback so tests can simulate location events
 */
function stubAddWatcher(): { watcherId: string; emitLocation: (loc: any) => void } {
  let callback: ((location: any, error: any) => void) | null = null;
  mockAddWatcher.mockImplementation((_config, cb) => {
    callback = cb;
    return Promise.resolve('watcher-1');
  });
  return {
    watcherId: 'watcher-1',
    emitLocation: (loc: any) => callback?.(loc, null),
  };
}

function makeLocation(overrides: any = {}) {
  return {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 10,
    speed: 0,
    bearing: 90,
    altitude: 0,
    time: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  // Tear down any prior session BEFORE clearing mocks (so the teardown
  // uses real mock state, not undefined returns).
  mockIsNative.mockReturnValue(true);
  mockApiRequest.mockResolvedValue({
    ok: true, status: 200, json: async () => ({ accepted: 0, rejected: 0 }),
  });
  await stopTracking().catch(() => {});

  // Now clear mocks for a fresh test, and re-set defaults the test relies on.
  vi.clearAllMocks();
  mockIsNative.mockReturnValue(true);
  mockPrefsGet.mockResolvedValue({ value: null });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('getPermissionStatus', () => {
  it('returns "unsupported" when not on native platform', async () => {
    mockIsNative.mockReturnValue(false);
    const status = await getPermissionStatus();
    expect(status).toBe('unsupported');
  });

  it('returns "granted" when plugin reports granted', async () => {
    mockCheckPerms.mockResolvedValue({ location: 'granted' });
    const status = await getPermissionStatus();
    expect(status).toBe('granted');
  });

  it('returns "denied" when plugin reports denied', async () => {
    mockCheckPerms.mockResolvedValue({ location: 'denied' });
    const status = await getPermissionStatus();
    expect(status).toBe('denied');
  });

  it('returns "prompt" when status unknown', async () => {
    mockCheckPerms.mockResolvedValue({ location: 'unknown_state' });
    const status = await getPermissionStatus();
    expect(status).toBe('prompt');
  });
});

describe('startTracking', () => {
  it('returns unsupported_in_browser on non-native platform', async () => {
    mockIsNative.mockReturnValue(false);
    const result = await startTracking({ sessionId: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported_in_browser');
  });

  it('returns permission_denied when user denies', async () => {
    mockRequestPerms.mockResolvedValue({ location: 'denied' });
    const result = await startTracking({ sessionId: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('permission_denied');
  });

  it('starts watcher on permission grant', async () => {
    mockRequestPerms.mockResolvedValue({ location: 'granted' });
    stubAddWatcher();

    const result = await startTracking({ sessionId: 42 });
    expect(result.ok).toBe(true);
    expect(getCurrentSessionId()).toBe(42);
    expect(mockAddWatcher).toHaveBeenCalled();
  });

  it('blocks double-start (already_tracking)', async () => {
    mockRequestPerms.mockResolvedValue({ location: 'granted' });
    stubAddWatcher();
    await startTracking({ sessionId: 1 });

    const second = await startTracking({ sessionId: 2 });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('already_tracking');
  });
});

describe('queue + flush behavior', () => {
  beforeEach(async () => {
    mockRequestPerms.mockResolvedValue({ location: 'granted' });
  });

  it('enqueues pings from watcher callback', async () => {
    const w = stubAddWatcher();
    await startTracking({ sessionId: 1 });
    w.emitLocation(makeLocation());
    w.emitLocation(makeLocation({ latitude: 40.71, longitude: -74.01 }));
    expect(getQueueDepth()).toBe(2);
  });

  it('flushes at the 10-ping threshold automatically', async () => {
    const w = stubAddWatcher();
    mockApiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accepted: 10, rejected: 0 }),
    });
    await startTracking({ sessionId: 1 });

    for (let i = 0; i < 10; i++) {
      w.emitLocation(makeLocation());
    }

    // The threshold-flush is fire-and-forget; await microtasks
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/gps/pings', expect.objectContaining({
      sessionId: 1,
      pings: expect.any(Array),
    }));
  });

  it('manual flushNow() returns counts', async () => {
    const w = stubAddWatcher();
    mockApiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accepted: 2, rejected: 0 }),
    });
    await startTracking({ sessionId: 1 });
    w.emitLocation(makeLocation());
    w.emitLocation(makeLocation());

    const result = await flushNow();
    expect(result.accepted).toBe(2);
    expect(getQueueDepth()).toBe(0); // drained
  });

  it('keeps pings in queue on transient network failure', async () => {
    const w = stubAddWatcher();
    mockApiRequest.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await startTracking({ sessionId: 1 });
    w.emitLocation(makeLocation());

    const result = await flushNow();
    expect(result.accepted).toBe(0);
    expect(getQueueDepth()).toBe(1); // NOT dropped on 5xx
  });

  it('auto-stops when server returns 410 (session ended)', async () => {
    const w = stubAddWatcher();
    mockApiRequest.mockResolvedValue({
      ok: false,
      status: 410,
      json: async () => ({}),
    });
    await startTracking({ sessionId: 1 });
    w.emitLocation(makeLocation());
    await flushNow();

    // Give the fire-and-forget stopTracking() a moment
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getCurrentSessionId()).toBe(null);
  });

  it('flushNow is a no-op when no session is active', async () => {
    const result = await flushNow();
    expect(result.accepted).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});

describe('stopTracking', () => {
  beforeEach(() => {
    mockRequestPerms.mockResolvedValue({ location: 'granted' });
  });

  it('flushes remaining queue then removes watcher', async () => {
    const w = stubAddWatcher();
    mockApiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accepted: 1, rejected: 0 }),
    });
    await startTracking({ sessionId: 1 });
    w.emitLocation(makeLocation());

    const result = await stopTracking();
    expect(result.flushedSuccessfully).toBe(true);
    expect(mockRemoveWatcher).toHaveBeenCalledWith({ id: 'watcher-1' });
    expect(getCurrentSessionId()).toBe(null);
  });

  it('clears queue on stop', async () => {
    const w = stubAddWatcher();
    mockApiRequest.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ accepted: 1, rejected: 0 }),
    });
    await startTracking({ sessionId: 1 });
    w.emitLocation(makeLocation());
    await stopTracking();
    expect(getQueueDepth()).toBe(0);
  });
});

describe('pause/resume', () => {
  beforeEach(async () => {
    mockRequestPerms.mockResolvedValue({ location: 'granted' });
    stubAddWatcher();
    await startTracking({ sessionId: 42 });
    vi.clearAllMocks(); // discard the startup calls
  });

  it('pauseTracking calls server with paused=true', async () => {
    mockApiRequest.mockResolvedValue({ ok: true });
    await pauseTracking();
    expect(mockApiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/gps/sessions/42/pause',
      { paused: true }
    );
  });

  it('resumeTracking calls server with paused=false', async () => {
    mockApiRequest.mockResolvedValue({ ok: true });
    await resumeTracking();
    expect(mockApiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/gps/sessions/42/pause',
      { paused: false }
    );
  });

  it('pause/resume are no-ops with no active session', async () => {
    await stopTracking();
    vi.clearAllMocks();
    await pauseTracking();
    await resumeTracking();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});
