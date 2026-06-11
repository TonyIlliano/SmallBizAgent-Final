/**
 * FailOpenBreaker — bounded fail-open semantics for the billing gates.
 *
 * The contract under test: the first consecutive failure opens a grace
 * window (fail OPEN); failures past the window fail CLOSED; any success
 * resets the window. This is the mechanism that stops a multi-hour Stripe
 * outage from handing out unbillable free access while still tolerating
 * 30-second blips without locking out paying customers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FailOpenBreaker } from './failOpenBreaker';

describe('FailOpenBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails open on the first failure', () => {
    const breaker = new FailOpenBreaker('test');
    expect(breaker.recordFailure()).toBe(true);
    expect(breaker.isFailingClosed()).toBe(false);
  });

  it('keeps failing open for failures within the grace window', () => {
    const breaker = new FailOpenBreaker('test', 5 * 60_000);
    expect(breaker.recordFailure()).toBe(true);
    vi.advanceTimersByTime(4 * 60_000 + 59_000); // 4:59 in
    expect(breaker.recordFailure()).toBe(true);
    expect(breaker.isFailingClosed()).toBe(false);
  });

  it('fails closed once consecutive failures exceed the grace window', () => {
    const breaker = new FailOpenBreaker('test', 5 * 60_000);
    expect(breaker.recordFailure()).toBe(true);
    vi.advanceTimersByTime(5 * 60_000); // exactly at the boundary
    expect(breaker.recordFailure()).toBe(false);
    expect(breaker.isFailingClosed()).toBe(true);
  });

  it('a success resets the window — next failure fails open again', () => {
    const breaker = new FailOpenBreaker('test', 5 * 60_000);
    breaker.recordFailure();
    vi.advanceTimersByTime(10 * 60_000);
    expect(breaker.recordFailure()).toBe(false); // closed

    breaker.recordSuccess(); // upstream recovered
    expect(breaker.isFailingClosed()).toBe(false);
    expect(breaker.recordFailure()).toBe(true); // fresh window, open again
  });

  it('the window anchors to the FIRST failure, not the latest', () => {
    const breaker = new FailOpenBreaker('test', 5 * 60_000);
    breaker.recordFailure(); // t=0
    vi.advanceTimersByTime(3 * 60_000);
    breaker.recordFailure(); // t=3min — must NOT re-anchor
    vi.advanceTimersByTime(2 * 60_000 + 1_000); // t=5:01 from first failure
    expect(breaker.recordFailure()).toBe(false);
  });

  it('isFailingClosed is false when no failure has been recorded', () => {
    const breaker = new FailOpenBreaker('test');
    expect(breaker.isFailingClosed()).toBe(false);
    vi.advanceTimersByTime(60 * 60_000);
    expect(breaker.isFailingClosed()).toBe(false);
  });

  it('respects a custom grace window', () => {
    const breaker = new FailOpenBreaker('test', 1_000);
    expect(breaker.recordFailure()).toBe(true);
    vi.advanceTimersByTime(1_001);
    expect(breaker.recordFailure()).toBe(false);
  });

  it('reset() clears all state', () => {
    const breaker = new FailOpenBreaker('test', 1_000);
    breaker.recordFailure();
    vi.advanceTimersByTime(5_000);
    expect(breaker.isFailingClosed()).toBe(true);
    breaker.reset();
    expect(breaker.isFailingClosed()).toBe(false);
    expect(breaker.recordFailure()).toBe(true);
  });
});
