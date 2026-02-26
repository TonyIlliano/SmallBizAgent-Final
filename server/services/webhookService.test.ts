import { describe, it, expect, vi } from 'vitest';

// Mock the db module before importing webhookService
vi.mock('../db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { WEBHOOK_EVENTS } from './webhookService';

describe('WEBHOOK_EVENTS', () => {
  it('includes all appointment events', () => {
    expect(WEBHOOK_EVENTS).toContain('appointment.created');
    expect(WEBHOOK_EVENTS).toContain('appointment.updated');
    expect(WEBHOOK_EVENTS).toContain('appointment.cancelled');
    expect(WEBHOOK_EVENTS).toContain('appointment.completed');
    expect(WEBHOOK_EVENTS).toContain('appointment.deleted');
  });

  it('includes all reservation events', () => {
    expect(WEBHOOK_EVENTS).toContain('reservation.created');
    expect(WEBHOOK_EVENTS).toContain('reservation.updated');
    expect(WEBHOOK_EVENTS).toContain('reservation.cancelled');
  });

  it('includes customer events', () => {
    expect(WEBHOOK_EVENTS).toContain('customer.created');
    expect(WEBHOOK_EVENTS).toContain('customer.updated');
  });

  it('includes invoice events', () => {
    expect(WEBHOOK_EVENTS).toContain('invoice.created');
    expect(WEBHOOK_EVENTS).toContain('invoice.paid');
  });

  it('includes job events', () => {
    expect(WEBHOOK_EVENTS).toContain('job.created');
    expect(WEBHOOK_EVENTS).toContain('job.completed');
  });

  it('includes call and quote events', () => {
    expect(WEBHOOK_EVENTS).toContain('call.completed');
    expect(WEBHOOK_EVENTS).toContain('quote.created');
    expect(WEBHOOK_EVENTS).toContain('quote.accepted');
  });

  it('has no duplicates', () => {
    const uniqueEvents = new Set(WEBHOOK_EVENTS);
    expect(uniqueEvents.size).toBe(WEBHOOK_EVENTS.length);
  });
});
