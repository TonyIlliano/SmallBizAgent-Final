import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage layer BEFORE importing the service under test so the
// dynamic import picks up the mocked module.
const mockGetBusinessKnowledge = vi.fn();
const mockGetBusiness = vi.fn();
const mockGetBusinessHours = vi.fn();
const mockCreateBusinessKnowledge = vi.fn();

vi.mock('../storage', () => ({
  storage: {
    getBusinessKnowledge: (...args: any[]) => mockGetBusinessKnowledge(...args),
    getBusiness: (...args: any[]) => mockGetBusiness(...args),
    getBusinessHours: (...args: any[]) => mockGetBusinessHours(...args),
    createBusinessKnowledge: (...args: any[]) => mockCreateBusinessKnowledge(...args),
  },
}));

vi.mock('./retellProvisioningService', () => ({
  debouncedUpdateRetellAgent: vi.fn(),
}));

import { seedHvacKnowledgeBase, isHvacIndustry } from './hvacOnboardingService';
import { HVAC_KB_SEED } from '../data/hvacKnowledgeBase';

describe('isHvacIndustry', () => {
  it('matches HVAC variants', () => {
    expect(isHvacIndustry('HVAC')).toBe(true);
    expect(isHvacIndustry('hvac')).toBe(true);
    expect(isHvacIndustry('Heating & Cooling')).toBe(true);
    expect(isHvacIndustry('Air Conditioning')).toBe(true);
    expect(isHvacIndustry('HVAC / Plumbing')).toBe(true);
  });

  it('rejects non-HVAC industries', () => {
    expect(isHvacIndustry('Plumbing')).toBe(false);
    expect(isHvacIndustry('Restaurant')).toBe(false);
    expect(isHvacIndustry('Salon')).toBe(false);
    expect(isHvacIndustry(null)).toBe(false);
    expect(isHvacIndustry(undefined)).toBe(false);
    expect(isHvacIndustry('')).toBe(false);
  });
});

describe('seedHvacKnowledgeBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid businessId', async () => {
    const result = await seedHvacKnowledgeBase(0);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('invalid businessId');
    expect(mockCreateBusinessKnowledge).not.toHaveBeenCalled();
  });

  it('skips when business not found', async () => {
    mockGetBusinessKnowledge.mockResolvedValue([]);
    mockGetBusiness.mockResolvedValue(null);

    const result = await seedHvacKnowledgeBase(42);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('business not found');
    expect(mockCreateBusinessKnowledge).not.toHaveBeenCalled();
  });

  it('skips when entries already exist (idempotent)', async () => {
    mockGetBusinessKnowledge.mockResolvedValue([{ id: 1, source: 'hvac_template' }]);

    const result = await seedHvacKnowledgeBase(42);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already seeded');
    expect(mockGetBusiness).not.toHaveBeenCalled();
    expect(mockCreateBusinessKnowledge).not.toHaveBeenCalled();
  });

  it('seeds all entries when KB is empty', async () => {
    mockGetBusinessKnowledge.mockResolvedValue([]);
    mockGetBusiness.mockResolvedValue({
      id: 42,
      name: "Joe's HVAC",
      phone: '+15551234567',
      twilioPhoneNumber: '+15559999999',
    });
    mockGetBusinessHours.mockResolvedValue([]);
    mockCreateBusinessKnowledge.mockResolvedValue({ id: 1 });

    const result = await seedHvacKnowledgeBase(42);
    expect(result.skipped).toBe(false);
    expect(result.seeded).toBe(HVAC_KB_SEED.length);
    expect(mockCreateBusinessKnowledge).toHaveBeenCalledTimes(HVAC_KB_SEED.length);
  });

  it('substitutes {businessName} and {businessPhone} placeholders', async () => {
    mockGetBusinessKnowledge.mockResolvedValue([]);
    mockGetBusiness.mockResolvedValue({
      id: 42,
      name: "Joe's HVAC",
      phone: '+15551234567',
      twilioPhoneNumber: null,
    });
    mockGetBusinessHours.mockResolvedValue([]);
    mockCreateBusinessKnowledge.mockResolvedValue({ id: 1 });

    await seedHvacKnowledgeBase(42);

    // Find a call whose question references the business name
    const calls = mockCreateBusinessKnowledge.mock.calls;
    const businessNameCall = calls.find(c =>
      typeof c[0]?.answer === 'string' && c[0].answer.includes("Joe's HVAC")
    );
    expect(businessNameCall).toBeDefined();

    const phoneCall = calls.find(c =>
      typeof c[0]?.answer === 'string' && c[0].answer.includes('+15551234567')
    );
    expect(phoneCall).toBeDefined();

    // No raw placeholders should remain in any seeded answer
    for (const call of calls) {
      const entry = call[0];
      expect(entry.answer).not.toMatch(/\{businessName\}/);
      expect(entry.answer).not.toMatch(/\{businessPhone\}/);
      expect(entry.answer).not.toMatch(/\{businessHours\}/);
    }
  });

  it('marks all entries with source=hvac_template and isApproved=true', async () => {
    mockGetBusinessKnowledge.mockResolvedValue([]);
    mockGetBusiness.mockResolvedValue({ id: 42, name: 'Test', phone: '555', twilioPhoneNumber: null });
    mockGetBusinessHours.mockResolvedValue([]);
    mockCreateBusinessKnowledge.mockResolvedValue({ id: 1 });

    await seedHvacKnowledgeBase(42);

    for (const call of mockCreateBusinessKnowledge.mock.calls) {
      expect(call[0].source).toBe('hvac_template');
      expect(call[0].isApproved).toBe(true);
      expect(call[0].businessId).toBe(42);
    }
  });

  it('continues seeding when individual inserts fail', async () => {
    mockGetBusinessKnowledge.mockResolvedValue([]);
    mockGetBusiness.mockResolvedValue({ id: 42, name: 'Test', phone: '555', twilioPhoneNumber: null });
    mockGetBusinessHours.mockResolvedValue([]);

    // Fail the 2nd insert, succeed for the rest.
    let callCount = 0;
    mockCreateBusinessKnowledge.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('simulated DB failure');
      return { id: callCount };
    });

    const result = await seedHvacKnowledgeBase(42);
    expect(result.skipped).toBe(false);
    expect(result.seeded).toBe(HVAC_KB_SEED.length - 1); // one failed
  });

  it('continues seeding when idempotency check throws', async () => {
    mockGetBusinessKnowledge.mockRejectedValue(new Error('DB blip'));
    mockGetBusiness.mockResolvedValue({ id: 42, name: 'Test', phone: '555', twilioPhoneNumber: null });
    mockGetBusinessHours.mockResolvedValue([]);
    mockCreateBusinessKnowledge.mockResolvedValue({ id: 1 });

    const result = await seedHvacKnowledgeBase(42);
    expect(result.skipped).toBe(false);
    expect(result.seeded).toBe(HVAC_KB_SEED.length);
  });
});
