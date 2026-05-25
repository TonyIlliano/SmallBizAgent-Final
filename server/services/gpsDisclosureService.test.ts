import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB layer BEFORE importing the service under test
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

import {
  DEFAULT_DISCLOSURE_VERSION,
  DEFAULT_DISCLOSURE_COPY,
  CONSENT_REPROMPT_AFTER_DAYS,
  renderDisclosure,
  needsTechReAcceptance,
  getActiveDisclosure,
  recordTechAcceptance,
  bumpDisclosureVersion,
  revokeTechConsent,
} from './gpsDisclosureService';

describe('renderDisclosure', () => {
  it('substitutes {businessName} and {retentionHours} placeholders', () => {
    const out = renderDisclosure('Hello {businessName}, retention is {retentionHours}h', {
      businessName: 'Joe HVAC',
      retentionHours: 48,
    });
    expect(out).toBe('Hello Joe HVAC, retention is 48h');
  });

  it('substitutes ALL occurrences of each placeholder', () => {
    const out = renderDisclosure('{businessName} {businessName} {retentionHours} {retentionHours}', {
      businessName: 'X',
      retentionHours: 1,
    });
    expect(out).toBe('X X 1 1');
  });

  it('renders the default template without errors', () => {
    const out = renderDisclosure(DEFAULT_DISCLOSURE_COPY, {
      businessName: 'Joe HVAC',
      retentionHours: 24,
    });
    expect(out).toContain('Joe HVAC');
    expect(out).toContain('24 hours');
    expect(out).not.toContain('{businessName}');
    expect(out).not.toContain('{retentionHours}');
  });

  it('handles businessName with special regex chars safely', () => {
    const out = renderDisclosure('Hi {businessName}!', {
      businessName: "O'Brien & Sons (HVAC)",
      retentionHours: 24,
    });
    expect(out).toBe("Hi O'Brien & Sons (HVAC)!");
  });
});

describe('needsTechReAcceptance', () => {
  const business = { gpsDisclosureVersion: '2026-05-24' };

  it('requires acceptance when staff has never accepted (null timestamp)', () => {
    const check = needsTechReAcceptance(
      { gpsConsentAcceptedAt: null, gpsConsentVersion: '2026-05-24' },
      business
    );
    expect(check.required).toBe(true);
    expect(check.reason).toBe('never_accepted');
  });

  it('requires acceptance when version mismatches', () => {
    const acceptedRecently = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const check = needsTechReAcceptance(
      { gpsConsentAcceptedAt: acceptedRecently, gpsConsentVersion: '2026-05-01' },
      business
    );
    expect(check.required).toBe(true);
    expect(check.reason).toBe('version_mismatch');
    expect(check.staleSince).toEqual(acceptedRecently);
  });

  it('requires acceptance when acceptance is >90 days old', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const check = needsTechReAcceptance(
      { gpsConsentAcceptedAt: old, gpsConsentVersion: '2026-05-24' },
      business
    );
    expect(check.required).toBe(true);
    expect(check.reason).toBe('expired_90_days');
    expect(check.daysSinceAcceptance).toBeGreaterThanOrEqual(91);
  });

  it('does NOT require acceptance when version matches and within 90 days', () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const check = needsTechReAcceptance(
      { gpsConsentAcceptedAt: recent, gpsConsentVersion: '2026-05-24' },
      business
    );
    expect(check.required).toBe(false);
    expect(check.reason).toBe(null);
  });

  it('exactly at 90 days triggers re-acceptance (>=)', () => {
    const exactly90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const check = needsTechReAcceptance(
      { gpsConsentAcceptedAt: exactly90, gpsConsentVersion: '2026-05-24' },
      business
    );
    expect(check.required).toBe(true);
    expect(check.reason).toBe('expired_90_days');
  });

  it('uses DEFAULT_DISCLOSURE_VERSION when business version is null', () => {
    // Staff has accepted matching the default — should NOT need re-acceptance
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const check = needsTechReAcceptance(
      { gpsConsentAcceptedAt: recent, gpsConsentVersion: DEFAULT_DISCLOSURE_VERSION },
      { gpsDisclosureVersion: null }
    );
    expect(check.required).toBe(false);
  });

  it('coerces string dates to Date objects', () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const check = needsTechReAcceptance(
      { gpsConsentAcceptedAt: recent as any, gpsConsentVersion: '2026-05-24' },
      business
    );
    expect(check.required).toBe(false);
  });
});

describe('getActiveDisclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to default copy + version when no business row found', async () => {
    mockSelect.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    });

    const result = await getActiveDisclosure(999);
    expect(result.copy).toBe(DEFAULT_DISCLOSURE_COPY);
    expect(result.version).toBe(DEFAULT_DISCLOSURE_VERSION);
    expect(result.isCustom).toBe(false);
    expect(result.rendered).toContain('your employer');
  });

  it('returns business custom copy + version when set', async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{
          name: 'Joe HVAC',
          gpsDisclosureCopy: 'Custom policy for {businessName}, {retentionHours}h retention.',
          gpsDisclosureVersion: '2026-06-01',
          gpsRetentionHours: 48,
        }]),
      }),
    });

    const result = await getActiveDisclosure(1);
    expect(result.copy).toContain('Custom policy');
    expect(result.version).toBe('2026-06-01');
    expect(result.isCustom).toBe(true);
    expect(result.rendered).toBe('Custom policy for Joe HVAC, 48h retention.');
  });

  it('falls back to default copy when business has no custom copy', async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{
          name: 'Bob Plumbing',
          gpsDisclosureCopy: null,
          gpsDisclosureVersion: null,
          gpsRetentionHours: 24,
        }]),
      }),
    });

    const result = await getActiveDisclosure(2);
    expect(result.copy).toBe(DEFAULT_DISCLOSURE_COPY);
    expect(result.version).toBe(DEFAULT_DISCLOSURE_VERSION);
    expect(result.isCustom).toBe(false);
    expect(result.rendered).toContain('Bob Plumbing');
  });
});

describe('recordTechAcceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates staff with current time + provided version + clears paused flag', async () => {
    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve() });
    mockUpdate.mockReturnValue({ set: setSpy });

    await recordTechAcceptance(42, 1, '2026-06-01');

    expect(mockUpdate).toHaveBeenCalled();
    const setArg = setSpy.mock.calls[0][0];
    expect(setArg.gpsConsentVersion).toBe('2026-06-01');
    expect(setArg.gpsConsentAcceptedAt).toBeInstanceOf(Date);
    expect(setArg.gpsTrackingPaused).toBe(false);
  });
});

describe('bumpDisclosureVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets new copy and stamps today as version (YYYY-MM-DD)', async () => {
    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve() });
    mockUpdate.mockReturnValue({ set: setSpy });

    const result = await bumpDisclosureVersion(1, 'New custom copy');

    const setArg = setSpy.mock.calls[0][0];
    expect(setArg.gpsDisclosureCopy).toBe('New custom copy');
    expect(setArg.gpsDisclosureVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.version).toBe(setArg.gpsDisclosureVersion);
  });

  it('accepts null copy (reset to default)', async () => {
    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve() });
    mockUpdate.mockReturnValue({ set: setSpy });

    await bumpDisclosureVersion(1, null);

    const setArg = setSpy.mock.calls[0][0];
    expect(setArg.gpsDisclosureCopy).toBe(null);
  });
});

describe('revokeTechConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears both gpsConsentAcceptedAt and gpsConsentVersion', async () => {
    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve() });
    mockUpdate.mockReturnValue({ set: setSpy });

    await revokeTechConsent(42, 1);

    const setArg = setSpy.mock.calls[0][0];
    expect(setArg.gpsConsentAcceptedAt).toBe(null);
    expect(setArg.gpsConsentVersion).toBe(null);
  });
});

describe('CONSENT_REPROMPT_AFTER_DAYS constant', () => {
  it('is 90', () => {
    expect(CONSENT_REPROMPT_AFTER_DAYS).toBe(90);
  });
});
