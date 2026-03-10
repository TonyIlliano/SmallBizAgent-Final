import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getAgentSettings: vi.fn(),
  },
}));

vi.mock('../storage', () => ({ storage: mockStorage }));

import { isAgentEnabled, getAgentConfig, getDefaultConfig, getAgentTypes, fillTemplate } from './agentSettingsService';

describe('agentSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAgentEnabled', () => {
    it('returns true when agent settings have enabled = true', async () => {
      mockStorage.getAgentSettings.mockResolvedValue({ enabled: true, config: {} });

      const result = await isAgentEnabled(1, 'no_show');

      expect(result).toBe(true);
    });

    it('returns false when agent settings have enabled = false', async () => {
      mockStorage.getAgentSettings.mockResolvedValue({ enabled: false, config: {} });

      const result = await isAgentEnabled(1, 'no_show');

      expect(result).toBe(false);
    });

    it('returns false when no settings exist (default)', async () => {
      mockStorage.getAgentSettings.mockResolvedValue(null);

      const result = await isAgentEnabled(1, 'no_show');

      expect(result).toBe(false);
    });
  });

  describe('getAgentConfig', () => {
    it('returns default config when no custom settings exist', async () => {
      mockStorage.getAgentSettings.mockResolvedValue(null);

      const config = await getAgentConfig(1, 'no_show');

      expect(config).toHaveProperty('messageTemplate');
      expect(config).toHaveProperty('expirationHours');
    });

    it('merges custom settings over defaults', async () => {
      mockStorage.getAgentSettings.mockResolvedValue({
        enabled: true,
        config: { expirationHours: 48, customField: 'test' },
      });

      const config = await getAgentConfig(1, 'no_show');

      // Custom value should override default
      expect(config.expirationHours).toBe(48);
      // Custom field should be present
      expect(config.customField).toBe('test');
      // Default field should still be present
      expect(config.messageTemplate).toBeDefined();
    });

    it('returns empty object for unknown agent type', async () => {
      mockStorage.getAgentSettings.mockResolvedValue(null);

      const config = await getAgentConfig(1, 'unknown_agent_type');

      expect(config).toEqual({});
    });
  });

  describe('getDefaultConfig', () => {
    it('returns follow_up defaults', async () => {
      const config = await getDefaultConfig('follow_up');
      expect(config).toHaveProperty('thankYouTemplate');
      expect(config).toHaveProperty('upsellTemplate');
      expect(config.enableThankYou).toBe(true);
    });

    it('returns no_show defaults', async () => {
      const config = await getDefaultConfig('no_show');
      expect(config).toHaveProperty('messageTemplate');
      expect(config).toHaveProperty('rescheduleReplyTemplate');
      expect(config).toHaveProperty('declineReplyTemplate');
      expect(config.expirationHours).toBe(24);
    });

    it('returns rebooking defaults', async () => {
      const config = await getDefaultConfig('rebooking');
      expect(config).toHaveProperty('defaultIntervalDays');
      expect(config.defaultIntervalDays).toBe(42);
    });

    it('returns empty object for unknown agent type', async () => {
      const config = await getDefaultConfig('nonexistent');
      expect(config).toEqual({});
    });
  });

  describe('getAgentTypes', () => {
    it('returns all agent types', () => {
      const types = getAgentTypes();

      expect(types).toContain('follow_up');
      expect(types).toContain('no_show');
      expect(types).toContain('estimate_follow_up');
      expect(types).toContain('rebooking');
      expect(types).toContain('review_response');
      expect(types.length).toBe(5);
    });
  });

  describe('fillTemplate', () => {
    it('replaces single variable', () => {
      const result = fillTemplate('Hello {customerName}!', { customerName: 'John' });
      expect(result).toBe('Hello John!');
    });

    it('replaces multiple variables', () => {
      const result = fillTemplate(
        'Hi {customerName}, thanks for visiting {businessName}!',
        { customerName: 'Jane', businessName: 'Test Salon' },
      );
      expect(result).toBe('Hi Jane, thanks for visiting Test Salon!');
    });

    it('replaces multiple occurrences of same variable', () => {
      const result = fillTemplate(
        '{name} says hi. Bye {name}!',
        { name: 'Bob' },
      );
      expect(result).toBe('Bob says hi. Bye Bob!');
    });

    it('leaves unmatched placeholders as-is', () => {
      const result = fillTemplate('Hello {unknown}!', { customerName: 'John' });
      expect(result).toBe('Hello {unknown}!');
    });

    it('handles empty variables', () => {
      const result = fillTemplate('Call {businessPhone}', { businessPhone: '' });
      expect(result).toBe('Call ');
    });

    it('handles template with no variables', () => {
      const result = fillTemplate('No variables here', { customerName: 'John' });
      expect(result).toBe('No variables here');
    });

    it('handles empty template', () => {
      const result = fillTemplate('', { customerName: 'John' });
      expect(result).toBe('');
    });
  });
});
