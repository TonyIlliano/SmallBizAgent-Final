/**
 * claudeClient usage-recording tests.
 *
 * Contract under test: every helper (claudeJson/claudeText/claudeWithTools)
 * records token usage against the caller's businessId — on BOTH the Claude
 * path and the OpenAI fallback path — and a recording failure never breaks
 * the AI call itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMessagesCreate, mockRecordAiUsage, mockOpenAiCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockRecordAiUsage: vi.fn(async () => undefined),
  mockOpenAiCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
  },
}));

vi.mock('./aiUsageService', () => ({
  recordAiUsage: mockRecordAiUsage,
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockOpenAiCreate } };
  },
}));

import { claudeJson, claudeText, claudeWithTools } from './claudeClient';

function claudeResponse(text: string, inputTokens = 120, outputTokens = 45) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

async function flushRecording() {
  // recordUsage runs through a dynamic import — give it a macrotask
  await new Promise(r => setTimeout(r, 10));
}

beforeEach(() => {
  mockMessagesCreate.mockReset();
  mockRecordAiUsage.mockClear();
  mockOpenAiCreate.mockReset();
});

describe('usage recording', () => {
  it('claudeText records tokens against the businessId', async () => {
    mockMessagesCreate.mockResolvedValue(claudeResponse('hello'));
    const out = await claudeText({ system: 's', prompt: 'p', businessId: 42 });
    expect(out).toBe('hello');
    await flushRecording();
    expect(mockRecordAiUsage).toHaveBeenCalledWith({
      businessId: 42, provider: 'claude', inputTokens: 120, outputTokens: 45,
    });
  });

  it('claudeJson records tokens against the businessId', async () => {
    mockMessagesCreate.mockResolvedValue(claudeResponse('{"ok":true}', 200, 30));
    const out = await claudeJson<{ ok: boolean }>({ system: 's', prompt: 'p', businessId: 7 });
    expect(out).toEqual({ ok: true });
    await flushRecording();
    expect(mockRecordAiUsage).toHaveBeenCalledWith({
      businessId: 7, provider: 'claude', inputTokens: 200, outputTokens: 30,
    });
  });

  it('claudeWithTools records tokens against the businessId', async () => {
    mockMessagesCreate.mockResolvedValue(claudeResponse('tool stuff', 500, 80));
    const { provider } = await claudeWithTools({ system: 's', messages: [], tools: [], businessId: 9 });
    expect(provider).toBe('claude');
    await flushRecording();
    expect(mockRecordAiUsage).toHaveBeenCalledWith({
      businessId: 9, provider: 'claude', inputTokens: 500, outputTokens: 80,
    });
  });

  it('records under platform (businessId undefined) when no tenant is passed', async () => {
    mockMessagesCreate.mockResolvedValue(claudeResponse('x'));
    await claudeText({ system: 's', prompt: 'p' });
    await flushRecording();
    expect(mockRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: undefined, provider: 'claude' }),
    );
  });

  it('the OpenAI fallback path records usage too, tagged as openai', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('claude down'));
    mockOpenAiCreate.mockResolvedValue({
      choices: [{ message: { content: 'fallback text' } }],
      usage: { prompt_tokens: 90, completion_tokens: 20 },
    });
    const out = await claudeText({ system: 's', prompt: 'p', businessId: 3 });
    expect(out).toBe('fallback text');
    await flushRecording();
    expect(mockRecordAiUsage).toHaveBeenCalledWith({
      businessId: 3, provider: 'openai', inputTokens: 90, outputTokens: 20,
    });
  });

  it('missing usage payloads record zeros instead of crashing', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'no usage' }] });
    const out = await claudeText({ system: 's', prompt: 'p', businessId: 5 });
    expect(out).toBe('no usage');
    await flushRecording();
    expect(mockRecordAiUsage).toHaveBeenCalledWith({
      businessId: 5, provider: 'claude', inputTokens: 0, outputTokens: 0,
    });
  });

  it('a recording failure never breaks the AI call', async () => {
    mockRecordAiUsage.mockRejectedValueOnce(new Error('ledger down'));
    mockMessagesCreate.mockResolvedValue(claudeResponse('still works'));
    const out = await claudeText({ system: 's', prompt: 'p', businessId: 1 });
    expect(out).toBe('still works');
    await flushRecording();
  });
});
