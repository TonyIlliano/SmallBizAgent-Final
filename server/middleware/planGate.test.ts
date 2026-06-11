/**
 * planGate — bounded fail-open tests.
 *
 * The contract under test: requirePaidPlan fails OPEN for the first 5 minutes
 * of consecutive DB failures (transient blips never block paying customers),
 * then fails CLOSED with 503 PLAN_CHECK_UNAVAILABLE (a sustained incident
 * doesn't grant free-tier businesses unlimited paid features). A successful
 * check resets the window.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockWhere } = vi.hoisted(() => ({
  mockWhere: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: mockWhere })),
    })),
  },
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import { requirePaidPlan, planGateBreaker } from './planGate';

function makeReqRes(role = 'user', businessId: number | null = 42) {
  const req: any = { user: { role, businessId } };
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
  planGateBreaker.reset();
  mockWhere.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('requirePaidPlan', () => {
  it('passes paid businesses through', async () => {
    mockWhere.mockResolvedValue([{ id: 42, subscriptionStatus: 'active' }]);
    const { req, res, next } = makeReqRes();
    await requirePaidPlan(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks free-tier businesses with 402', async () => {
    mockWhere.mockResolvedValue([{ id: 42, subscriptionStatus: 'free' }]);
    const { req, res, next } = makeReqRes();
    await requirePaidPlan(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(402);
    expect(res.body.code).toBe('PAID_PLAN_REQUIRED');
  });

  it('admins always pass without a DB hit', async () => {
    const { req, res, next } = makeReqRes('admin');
    await requirePaidPlan(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('fails OPEN on a DB error within the grace window', async () => {
    mockWhere.mockRejectedValue(new Error('connection refused'));
    const { req, res, next } = makeReqRes();
    await requirePaidPlan(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED with 503 once the outage outlasts the grace window', async () => {
    mockWhere.mockRejectedValue(new Error('connection refused'));

    const first = makeReqRes();
    await requirePaidPlan(first.req, first.res, first.next);
    expect(first.next).toHaveBeenCalled(); // within grace

    vi.advanceTimersByTime(6 * 60_000); // past the 5-min window

    const second = makeReqRes();
    await requirePaidPlan(second.req, second.res, second.next);
    expect(second.next).not.toHaveBeenCalled();
    expect(second.res.statusCode).toBe(503);
    expect(second.res.body.code).toBe('PLAN_CHECK_UNAVAILABLE');
  });

  it('a successful check resets the breaker — next outage fails open again', async () => {
    // Exhaust the window
    mockWhere.mockRejectedValue(new Error('down'));
    const a = makeReqRes();
    await requirePaidPlan(a.req, a.res, a.next);
    vi.advanceTimersByTime(6 * 60_000);
    const b = makeReqRes();
    await requirePaidPlan(b.req, b.res, b.next);
    expect(b.res.statusCode).toBe(503);

    // DB recovers
    mockWhere.mockResolvedValue([{ id: 42, subscriptionStatus: 'active' }]);
    const c = makeReqRes();
    await requirePaidPlan(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalled();

    // New outage gets a fresh grace window
    mockWhere.mockRejectedValue(new Error('down again'));
    const d = makeReqRes();
    await requirePaidPlan(d.req, d.res, d.next);
    expect(d.next).toHaveBeenCalled();
  });
});
