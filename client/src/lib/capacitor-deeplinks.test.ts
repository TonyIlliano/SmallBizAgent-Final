import { describe, it, expect } from 'vitest';
import { parseDeepLink } from './capacitor-deeplinks';

describe('parseDeepLink', () => {
  it('returns null for malformed URLs', () => {
    expect(parseDeepLink('not-a-url')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
  });

  it('routes book/* paths', () => {
    expect(parseDeepLink('https://smallbizagent.ai/book/joes-hvac')).toBe('/book/joes-hvac');
  });

  it('routes appointments/* paths', () => {
    expect(parseDeepLink('https://smallbizagent.ai/appointments/123')).toBe('/appointments/123');
  });

  it('routes jobs/* paths', () => {
    expect(parseDeepLink('https://www.smallbizagent.ai/jobs/456')).toBe('/jobs/456');
  });

  it('routes invoices/* paths', () => {
    expect(parseDeepLink('https://smallbizagent.ai/invoices/789')).toBe('/invoices/789');
  });

  it('routes quotes/* paths', () => {
    expect(parseDeepLink('https://smallbizagent.ai/quotes/abc-token')).toBe('/quotes/abc-token');
  });

  it('routes customers/* paths', () => {
    expect(parseDeepLink('https://smallbizagent.ai/customers/12')).toBe('/customers/12');
  });

  it('routes portal/* paths', () => {
    expect(parseDeepLink('https://smallbizagent.ai/portal/invoice/token-abc')).toBe('/portal/invoice/token-abc');
  });

  it('routes exact-match top-level pages', () => {
    expect(parseDeepLink('https://smallbizagent.ai/dashboard')).toBe('/dashboard');
    expect(parseDeepLink('https://smallbizagent.ai/settings')).toBe('/settings');
    expect(parseDeepLink('https://smallbizagent.ai/receptionist')).toBe('/receptionist');
  });

  it('preserves query strings on allowlisted routes', () => {
    expect(parseDeepLink('https://smallbizagent.ai/jobs/123?from=sms')).toBe('/jobs/123?from=sms');
  });

  it('falls back to /dashboard for unknown paths', () => {
    expect(parseDeepLink('https://smallbizagent.ai/some/arbitrary/path')).toBe('/dashboard');
    expect(parseDeepLink('https://smallbizagent.ai/admin/secret')).toBe('/dashboard');
  });

  it('handles custom-scheme URLs (smallbizagent://)', () => {
    expect(parseDeepLink('smallbizagent://jobs/123')).toBe('/dashboard');
    // Note: custom-scheme URLs don't have a leading slash path in URL parsing;
    // they get routed to /dashboard as a safe fallback. iOS / Android typically
    // deliver universal-link HTTPS URLs anyway, which DO parse correctly.
  });

  it('returns /dashboard for the bare root path', () => {
    expect(parseDeepLink('https://smallbizagent.ai/')).toBe('/dashboard');
  });
});
