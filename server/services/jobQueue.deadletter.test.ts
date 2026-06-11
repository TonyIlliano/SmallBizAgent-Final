/**
 * jobQueue dead-letter tests.
 *
 * The contract under test: when a job fails BOTH the pg-boss enqueue AND the
 * direct-execution fallback, it is written to dead_letter_jobs and an admin
 * alert fires — instead of being silently lost with only a console.error.
 * These are customer-facing actions (SMS confirmations, payment
 * notifications); losing them silently is a slow churn driver.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSend, mockInsertValues, mockSendSms, mockSendAdminAlert } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockInsertValues: vi.fn(async () => undefined),
  mockSendSms: vi.fn(),
  mockSendAdminAlert: vi.fn(async () => undefined),
}));

vi.mock('pg-boss', () => ({
  default: class MockPgBoss {
    constructor() {}
    on() {}
    send(...args: any[]) { return mockSend(...args); }
    async start() {}
    async stop() {}
  },
}));

vi.mock('../db', () => ({
  db: {
    insert: vi.fn(() => ({ values: mockInsertValues })),
  },
  pool: { connect: vi.fn(), query: vi.fn() },
}));

vi.mock('./twilioService', () => ({
  sendSms: mockSendSms,
  default: { sendSms: mockSendSms },
}));

vi.mock('./adminAlertService', () => ({
  sendAdminAlert: mockSendAdminAlert,
}));

import { enqueue, executeJobDirectly } from './jobQueue';

beforeEach(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost/test';
  mockSend.mockReset();
  mockInsertValues.mockClear();
  mockSendSms.mockReset();
  mockSendAdminAlert.mockClear();
});

/** Wait until a mock has been called at least n times (detached-promise settling). */
async function waitForCalls(mock: { mock: { calls: unknown[] } }, n = 1) {
  await vi.waitFor(() => {
    if (mock.mock.calls.length < n) throw new Error('not settled yet');
  }, { timeout: 2000 });
}

describe('enqueue fallback dead-lettering', () => {
  it('dead-letters the job when enqueue fails AND the direct fallback fails', async () => {
    mockSend.mockRejectedValue(new Error('pg-boss is down'));
    mockSendSms.mockRejectedValue(new Error('twilio is also down'));

    const result = await enqueue('send-sms', { to: '+15551234567', message: 'hi', businessId: 1 });
    expect(result).toBeNull();
    // The dead-letter write runs in the handler's detached .catch chain
    await waitForCalls(mockInsertValues);
    await waitForCalls(mockSendAdminAlert);

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const row = mockInsertValues.mock.calls[0][0] as any;
    expect(row.jobType).toBe('send-sms');
    expect(row.status).toBe('pending');
    expect(row.payload).toMatchObject({ to: '+15551234567', businessId: 1 });
    expect(row.error).toContain('twilio is also down');

    expect(mockSendAdminAlert).toHaveBeenCalledTimes(1);
    expect(mockSendAdminAlert.mock.calls[0][0]).toMatchObject({
      type: 'job_dead_lettered',
      severity: 'high',
    });
  });

  it('does NOT dead-letter when the direct fallback succeeds', async () => {
    mockSend.mockRejectedValue(new Error('pg-boss is down'));
    mockSendSms.mockResolvedValue({ sid: 'SM123' });

    await enqueue('send-sms', { to: '+15551234567', message: 'hi' });
    await waitForCalls(mockSendSms);
    // Give a detached .catch chain time to fire if it (incorrectly) would
    await new Promise(r => setTimeout(r, 50));

    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockSendAdminAlert).not.toHaveBeenCalled();
  });

  it('does not touch the fallback path when pg-boss enqueue succeeds', async () => {
    mockSend.mockResolvedValue('job-id-123');

    const result = await enqueue('send-sms', { to: '+15551234567', message: 'hi' });
    expect(result).toBe('job-id-123');
    await new Promise(r => setTimeout(r, 20));

    expect(mockSendSms).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('dead-letters jobs with no registered handler instead of dropping them', async () => {
    mockSend.mockRejectedValue(new Error('pg-boss is down'));

    await enqueue('not-a-real-job' as any, { foo: 'bar' });
    await new Promise(r => setTimeout(r, 20));

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const row = mockInsertValues.mock.calls[0][0] as any;
    expect(row.jobType).toBe('not-a-real-job');
    expect(row.error).toContain('No handler registered');
  });

  it('survives the dead-letter insert itself failing (observability never makes it worse)', async () => {
    mockSend.mockRejectedValue(new Error('pg-boss is down'));
    mockSendSms.mockRejectedValue(new Error('twilio down'));
    mockInsertValues.mockRejectedValueOnce(new Error('db totally down'));

    // Must not throw
    await enqueue('send-sms', { to: '+15551234567', message: 'hi' });
    await new Promise(r => setTimeout(r, 50));
    // Alert still attempted even though the insert failed
    expect(mockSendAdminAlert).toHaveBeenCalled();
  });
});

describe('executeJobDirectly (admin replay path)', () => {
  it('runs the handler and propagates success', async () => {
    mockSendSms.mockResolvedValue({ sid: 'SM456' });
    await executeJobDirectly('send-sms', { to: '+15550000000', message: 'replay' });
    expect(mockSendSms).toHaveBeenCalledWith('+15550000000', 'replay', undefined, undefined);
  });

  it('throws on handler failure so the replay endpoint can report it', async () => {
    mockSendSms.mockRejectedValue(new Error('still down'));
    await expect(executeJobDirectly('send-sms', { to: '+15550000000', message: 'replay' }))
      .rejects.toThrow('still down');
  });

  it('throws on unknown job types', async () => {
    await expect(executeJobDirectly('bogus', {})).rejects.toThrow('Unknown job type');
  });
});
