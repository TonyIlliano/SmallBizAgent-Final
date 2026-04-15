import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (vi.hoisted ensures they're available when vi.mock factories run) ──

const { mockAnthropicCreate, mockConsoleWarn } = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  return {
    mockAnthropicCreate: vi.fn(),
    mockConsoleWarn: vi.fn(),
  };
});

// Mock the Anthropic SDK (top-level ESM import in claudeClient.ts)
vi.mock('@anthropic-ai/sdk', () => {
  function AnthropicMock() {
    return {
      messages: {
        create: mockAnthropicCreate,
      },
    };
  }
  return { default: AnthropicMock };
});

import { claudeJson, claudeText, claudeWithTools } from './claudeClient';

// ── Helpers to build realistic mock responses ──

function makeClaudeTextResponse(text: string) {
  return {
    id: 'msg_01ABC',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 50, output_tokens: 30 },
  };
}

function makeClaudeToolUseResponse(toolName: string, input: Record<string, unknown>) {
  return {
    id: 'msg_01DEF',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [
      { type: 'tool_use', id: 'toolu_01GHI', name: toolName, input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 80, output_tokens: 60 },
  };
}

// ── Test suite ──

describe('claudeClient', () => {
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    vi.clearAllMocks();
    originalConsoleWarn = console.warn;
    console.warn = mockConsoleWarn;
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  // ─── claudeJson ──────────────────────────────────────────────────────

  describe('claudeJson', () => {
    it('returns parsed JSON from Claude response', async () => {
      const jsonPayload = { intent: 'booking', confidence: 0.95, services: ['haircut'] };
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse(JSON.stringify(jsonPayload)),
      );

      const result = await claudeJson<typeof jsonPayload>({
        system: 'You are a JSON extraction assistant.',
        prompt: 'Extract the intent from this call transcript.',
      });

      expect(result).toEqual(jsonPayload);
      expect(mockAnthropicCreate).toHaveBeenCalledOnce();
      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are a JSON extraction assistant.',
        messages: [{ role: 'user', content: 'Extract the intent from this call transcript.' }],
      });
    });

    it('respects custom maxTokens parameter', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse('{"ok": true}'),
      );

      await claudeJson({ system: 'sys', prompt: 'test', maxTokens: 2048 });

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 2048 }),
      );
    });

    it('uses default maxTokens of 1024 when not specified', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse('{"default": true}'),
      );

      await claudeJson({ system: 'sys', prompt: 'test' });

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1024 }),
      );
    });

    it('parses deeply nested JSON correctly', async () => {
      const nested = {
        customer: {
          name: 'Tony',
          history: {
            visits: [{ date: '2025-01-01', service: 'Haircut' }],
            totalSpend: 500.00,
          },
        },
        sentiment: { score: 4.5, trend: 'improving' },
      };
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse(JSON.stringify(nested)),
      );

      const result = await claudeJson<typeof nested>({ system: 'sys', prompt: 'test' });
      expect(result.customer.history.visits[0].service).toBe('Haircut');
      expect(result.sentiment.score).toBe(4.5);
    });

    it('throws when Claude returns malformed JSON (no OpenAI fallback available)', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse('not valid json {broken'),
      );

      // The JSON.parse will throw, triggering fallback.
      // Since we can't mock require('openai'), the fallback will also fail.
      // The important thing is: it DOES attempt fallback (warns) and eventually throws.
      await expect(
        claudeJson({ system: 'sys', prompt: 'test' }),
      ).rejects.toThrow();

      // Verify fallback was attempted
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[AI] Claude failed, falling back to OpenAI:'),
        expect.any(String),
      );
    });

    it('throws when Claude response has non-text content block', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool1', name: 'test', input: {} }],
      });

      // Empty string from non-text block → JSON.parse('') throws → fallback
      await expect(
        claudeJson({ system: 'sys', prompt: 'test' }),
      ).rejects.toThrow();
    });

    it('throws when Claude throws an API error', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('Claude API overloaded'));

      await expect(
        claudeJson({ system: 'sys', prompt: 'test' }),
      ).rejects.toThrow();

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[AI] Claude failed, falling back to OpenAI:'),
        'Claude API overloaded',
      );
    });
  });

  // ─── claudeText ──────────────────────────────────────────────────────

  describe('claudeText', () => {
    it('returns text from Claude response', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse('Hello, this is the AI receptionist!'),
      );

      const result = await claudeText({
        system: 'You are a helpful receptionist.',
        prompt: 'Greet the customer.',
      });

      expect(result).toBe('Hello, this is the AI receptionist!');
      expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    });

    it('returns empty string when Claude content block is non-text type', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool1', name: 'test', input: {} }],
      });

      const result = await claudeText({ system: 'sys', prompt: 'test' });
      expect(result).toBe('');
    });

    it('attempts OpenAI fallback when Claude throws', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('Claude rate limited'));

      await expect(
        claudeText({ system: 'sys', prompt: 'test' }),
      ).rejects.toThrow();

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[AI] Claude failed, falling back to OpenAI:'),
        'Claude rate limited',
      );
    });

    it('passes correct model and parameters to Claude', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse('response'),
      );

      await claudeText({ system: 'System prompt', prompt: 'User prompt', maxTokens: 512 });

      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: 'System prompt',
        messages: [{ role: 'user', content: 'User prompt' }],
      });
    });
  });

  // ─── claudeWithTools ─────────────────────────────────────────────────

  describe('claudeWithTools', () => {
    const sampleTools = [
      {
        name: 'checkAvailability',
        description: 'Check available appointment slots',
        input_schema: {
          type: 'object',
          properties: { date: { type: 'string' } },
        },
      },
    ];

    it('returns response with provider="claude" on success', async () => {
      const toolResponse = makeClaudeToolUseResponse('checkAvailability', { date: '2025-07-01' });
      mockAnthropicCreate.mockResolvedValueOnce(toolResponse);

      const result = await claudeWithTools({
        system: 'You are a booking assistant.',
        messages: [{ role: 'user', content: 'Check availability for tomorrow' }],
        tools: sampleTools,
      });

      expect(result.provider).toBe('claude');
      expect(result.response).toEqual(toolResponse);
      expect(result.response.content[0].name).toBe('checkAvailability');
    });

    it('passes tools correctly to Claude', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeToolUseResponse('test', {}),
      );

      await claudeWithTools({
        system: 'sys',
        messages: [{ role: 'user', content: 'test' }],
        tools: sampleTools,
        maxTokens: 2048,
      });

      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: 'sys',
        messages: [{ role: 'user', content: 'test' }],
        tools: sampleTools,
      });
    });

    it('returns full tool_use response from Claude for caller to parse', async () => {
      const toolResponse = makeClaudeToolUseResponse('bookAppointment', {
        date: '2025-07-01',
        time: '14:00',
        serviceId: 5,
      });
      mockAnthropicCreate.mockResolvedValueOnce(toolResponse);

      const result = await claudeWithTools({
        system: 'sys',
        messages: [{ role: 'user', content: 'Book me for tomorrow at 2pm' }],
        tools: sampleTools,
      });

      expect(result.provider).toBe('claude');
      const toolUse = result.response.content[0];
      expect(toolUse.type).toBe('tool_use');
      expect(toolUse.name).toBe('bookAppointment');
      expect(toolUse.input.serviceId).toBe(5);
    });

    it('attempts OpenAI fallback when Claude throws', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('Claude tool error'));

      await expect(
        claudeWithTools({
          system: 'sys',
          messages: [{ role: 'user', content: 'test' }],
          tools: sampleTools,
        }),
      ).rejects.toThrow();

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[AI] Claude failed, falling back to OpenAI:'),
        'Claude tool error',
      );
    });

    it('uses default maxTokens of 1024', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeToolUseResponse('test', {}),
      );

      await claudeWithTools({
        system: 'sys',
        messages: [{ role: 'user', content: 'test' }],
        tools: sampleTools,
      });

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1024 }),
      );
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('multiple sequential calls work independently', async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce(makeClaudeTextResponse('first'))
        .mockResolvedValueOnce(makeClaudeTextResponse('second'));

      const first = await claudeText({ system: 'sys', prompt: 'first' });
      const second = await claudeText({ system: 'sys', prompt: 'second' });

      expect(first).toBe('first');
      expect(second).toBe('second');
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
    });

    it('claudeJson handles empty content array from Claude', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({ content: [] });

      // content[0] is undefined → .type check fails → empty string → JSON.parse('') throws
      await expect(
        claudeJson({ system: 'sys', prompt: 'test' }),
      ).rejects.toThrow();
    });

    it('claudeText handles Unicode and special characters', async () => {
      const unicodeText = 'Hola! ¿Cómo estás? 你好 🎉';
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse(unicodeText),
      );

      const result = await claudeText({ system: 'sys', prompt: 'test' });
      expect(result).toBe(unicodeText);
    });

    it('claudeJson handles large JSON responses', async () => {
      const largeObj: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeObj[`key_${i}`] = `value_${i}`;
      }
      mockAnthropicCreate.mockResolvedValueOnce(
        makeClaudeTextResponse(JSON.stringify(largeObj)),
      );

      const result = await claudeJson<typeof largeObj>({ system: 'sys', prompt: 'test' });
      expect(Object.keys(result)).toHaveLength(100);
      expect(result.key_50).toBe('value_50');
    });
  });
});
