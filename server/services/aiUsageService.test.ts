/**
 * aiUsageService tests — per-tenant AI cost accounting (audit CRIT-10).
 *
 * Contracts under test:
 *  - Every recorded call upserts the (business, day, provider) ledger row
 *    with correct token counts and rate-card cost.
 *  - Recording is fail-soft: a DB error never throws into the AI call path.
 *  - The monthly budget is a SOFT limit: crossing it fires ONE admin alert
 *    per business per month (throttled, deduped, retried if the alert
 *    itself fails) — and never blocks anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPoolQuery, mockSendAdminAlert, state } = vi.hoisted(() => {
  const state = {
    businessRow: null as null | { name: string; ai_monthly_budget: string | null },
    mtdTotal: '0',
    insertShouldFail: false,
  };
  const mockPoolQuery = vi.fn(async (sql: string, _params?: any[]) => {
    if (sql.includes('INSERT INTO ai_usage_daily')) {
      if (state.insertShouldFail) throw new Error('db down');
      return { rows: [] };
    }
    if (sql.includes('SELECT name, ai_monthly_budget')) {
      return { rows: state.businessRow ? [state.businessRow] : [] };
    }
    if (sql.includes('COALESCE(SUM(estimated_cost)')) {
      return { rows: [{ total: state.mtdTotal }] };
    }
    return { rows: [] };
  });
  return { mockPoolQuery, mockSendAdminAlert: vi.fn(async () => undefined), state };
});

vi.mock('../db', () => ({ pool: { query: mockPoolQuery }, db: {} }));
vi.mock('./adminAlertService', () => ({ sendAdminAlert: mockSendAdminAlert }));

import {
  recordAiUsage, estimateCostUsd, getAiUsageSummary, _resetAiUsageState,
} from './aiUsageService';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
  _resetAiUsageState();
  state.businessRow = null;
  state.mtdTotal = '0';
  state.insertShouldFail = false;
  mockPoolQuery.mockClear();
  mockSendAdminAlert.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function insertCalls() {
  return mockPoolQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO ai_usage_daily'));
}

describe('estimateCostUsd', () => {
  it('prices Claude at the Sonnet rate card ($3/M in, $15/M out)', () => {
    expect(estimateCostUsd('claude', 1_000_000, 1_000_000)).toBeCloseTo(18.0, 6);
    expect(estimateCostUsd('claude', 500_000, 0)).toBeCloseTo(1.5, 6);
  });

  it('prices the OpenAI fallback cheaper than Claude', () => {
    expect(estimateCostUsd('openai', 1_000_000, 1_000_000))
      .toBeLessThan(estimateCostUsd('claude', 1_000_000, 1_000_000));
  });

  it('unknown providers fall back to the Claude rate (conservative overestimate)', () => {
    expect(estimateCostUsd('mystery', 1_000_000, 0)).toBeCloseTo(3.0, 6);
  });
});

describe('recordAiUsage — ledger upsert', () => {
  it('upserts with businessId, provider, tokens, and computed cost', async () => {
    await recordAiUsage({ businessId: 42, provider: 'claude', inputTokens: 1000, outputTokens: 500 });
    const [sql, params] = insertCalls()[0];
    expect(sql).toContain('ON CONFLICT (business_id, day, provider)');
    expect(params![0]).toBe(42);
    expect(params![1]).toBe('claude');
    expect(params![2]).toBe(1000);
    expect(params![3]).toBe(500);
    expect(parseFloat(params![4])).toBeCloseTo(estimateCostUsd('claude', 1000, 500), 6);
  });

  it('records platform-level usage under businessId 0 when omitted', async () => {
    await recordAiUsage({ provider: 'claude', inputTokens: 10, outputTokens: 10 });
    expect(insertCalls()[0][1]![0]).toBe(0);
  });

  it('clamps garbage token counts to zero', async () => {
    await recordAiUsage({ businessId: 1, provider: 'openai', inputTokens: -50, outputTokens: NaN as any });
    const params = insertCalls()[0][1]!;
    expect(params[2]).toBe(0);
    expect(params[3]).toBe(0);
  });

  it('is fail-soft: a DB error never throws into the AI call path', async () => {
    state.insertShouldFail = true;
    await expect(
      recordAiUsage({ businessId: 1, provider: 'claude', inputTokens: 10, outputTokens: 10 }),
    ).resolves.toBeUndefined();
  });
});

describe('recordAiUsage — budget soft limit', () => {
  it('fires ONE high-severity alert when month-to-date crosses the budget', async () => {
    state.businessRow = { name: 'Hot HVAC', ai_monthly_budget: '50.00' };
    state.mtdTotal = '61.25';
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 10, outputTokens: 10 });
    expect(mockSendAdminAlert).toHaveBeenCalledTimes(1);
    const alert = mockSendAdminAlert.mock.calls[0][0] as any;
    expect(alert.type).toBe('ai_budget_exceeded');
    expect(alert.severity).toBe('high');
    expect(alert.details.businessId).toBe(7);
    expect(alert.details.note).toContain('NOT being blocked');
  });

  it('dedupes the alert per business per month even across the throttle window', async () => {
    state.businessRow = { name: 'Hot HVAC', ai_monthly_budget: '50.00' };
    state.mtdTotal = '99.00';
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 1, outputTokens: 1 });
    vi.advanceTimersByTime(20 * 60_000); // past the 15-min check throttle
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 1, outputTokens: 1 });
    expect(mockSendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it('throttles budget checks — back-to-back calls do not re-query the budget', async () => {
    state.businessRow = { name: 'Biz', ai_monthly_budget: null };
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 1, outputTokens: 1 });
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 1, outputTokens: 1 });
    const budgetLookups = mockPoolQuery.mock.calls.filter(c => String(c[0]).includes('ai_monthly_budget'));
    expect(budgetLookups).toHaveLength(1);
  });

  it('no alert when under budget or when no budget is set', async () => {
    state.businessRow = { name: 'Biz', ai_monthly_budget: '100.00' };
    state.mtdTotal = '12.00';
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 1, outputTokens: 1 });

    _resetAiUsageState();
    state.businessRow = { name: 'NoBudget Biz', ai_monthly_budget: null };
    state.mtdTotal = '9999.00';
    await recordAiUsage({ businessId: 8, provider: 'claude', inputTokens: 1, outputTokens: 1 });

    expect(mockSendAdminAlert).not.toHaveBeenCalled();
  });

  it('never budget-checks platform usage (businessId 0)', async () => {
    await recordAiUsage({ businessId: 0, provider: 'claude', inputTokens: 1, outputTokens: 1 });
    const budgetLookups = mockPoolQuery.mock.calls.filter(c => String(c[0]).includes('ai_monthly_budget'));
    expect(budgetLookups).toHaveLength(0);
  });

  it('retries the alert on a later check if sending it failed', async () => {
    state.businessRow = { name: 'Biz', ai_monthly_budget: '50.00' };
    state.mtdTotal = '75.00';
    mockSendAdminAlert.mockRejectedValueOnce(new Error('email down'));
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 1, outputTokens: 1 });
    vi.advanceTimersByTime(20 * 60_000);
    await recordAiUsage({ businessId: 7, provider: 'claude', inputTokens: 1, outputTokens: 1 });
    expect(mockSendAdminAlert).toHaveBeenCalledTimes(2); // failed attempt + successful retry
  });
});

describe('getAiUsageSummary', () => {
  it('labels businessId 0 as platform usage and parses numerics', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { business_id: 0, business_name: null, ai_monthly_budget: null, call_count: '12', input_tokens: '5000', output_tokens: '2000', estimated_cost: '0.045000' },
        { business_id: 7, business_name: 'Hot HVAC', ai_monthly_budget: '50.00', call_count: '300', input_tokens: '900000', output_tokens: '150000', estimated_cost: '4.950000' },
      ],
    } as any);
    const rows = await getAiUsageSummary('2026-06');
    expect(rows[0].businessName).toBe('Platform (no tenant)');
    expect(rows[1]).toMatchObject({
      businessId: 7, businessName: 'Hot HVAC', callCount: 300, monthlyBudget: 50,
    });
    expect(rows[1].estimatedCost).toBeCloseTo(4.95, 4);
  });

  it('rejects malformed month strings by defaulting to the current month', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);
    await getAiUsageSummary("2026-06'; DROP TABLE businesses; --");
    const monthParam = mockPoolQuery.mock.calls.at(-1)![1]![0];
    expect(monthParam).toBe('2026-06-01'); // current fake-timer month, not the injected string
  });
});
