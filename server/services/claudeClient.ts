/**
 * Claude Client — Shared AI inference layer with OpenAI fallback
 *
 * Primary: Anthropic Claude (claude-sonnet-4-6)
 * Fallback: OpenAI (gpt-5.4-mini) — automatically used if Claude fails
 *
 * OpenAI SDK instantiation is lazy to avoid crash when OPENAI_API_KEY is missing in tests.
 * Retell AI voice + TTS service still use OpenAI directly (not through this client).
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Lazy OpenAI client — only instantiated on first fallback call.
// Uses ESM dynamic import() because require() is not supported in the
// production ESM build (same class of bug fixed in commit 3d5a661 for crypto).
let _openai: any = null;
async function getOpenAI() {
  if (!_openai) {
    const mod: any = await import('openai');
    const OpenAI = mod.default || mod;
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) from a model
 * response before JSON.parse. Claude sometimes wraps JSON in fences despite
 * being asked not to; OpenAI rarely does. Belt-and-suspenders.
 */
function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/**
 * Per-tenant AI cost accounting (audit CRIT-10). Every helper records token
 * usage against the calling business's daily ledger — fire-and-forget via
 * dynamic import so accounting can never block or fail the AI call, and so
 * tests that mock this module's consumers don't drag in the DB.
 * businessId omitted → recorded under 0 (platform-level usage).
 */
function recordUsage(
  businessId: number | undefined,
  provider: 'claude' | 'openai',
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): void {
  import('./aiUsageService')
    .then((m) => m.recordAiUsage({
      businessId,
      provider,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
    }))
    .catch((err) => console.warn('[AI] usage recording failed:', err?.message || err));
}

export default anthropic;

/**
 * JSON extraction — Claude primary, OpenAI fallback.
 * Expects the model to return parseable JSON.
 */
export async function claudeJson<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Tenant for AI cost accounting. Omit for platform-level calls. */
  businessId?: number;
}): Promise<T> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    });
    recordUsage(opts.businessId, 'claude', response.usage?.input_tokens, response.usage?.output_tokens);
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(stripJsonFences(text));
  } catch (err) {
    console.warn('[AI] Claude failed, falling back to OpenAI:', (err as Error).message);
    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      max_completion_tokens: opts.maxTokens || 1024,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    });
    recordUsage(opts.businessId, 'openai', response.usage?.prompt_tokens, response.usage?.completion_tokens);
    return JSON.parse(stripJsonFences(response.choices[0]?.message?.content || ''));
  }
}

/**
 * Text generation — Claude primary, OpenAI fallback.
 * Returns the model's text response as a string.
 */
export async function claudeText(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Tenant for AI cost accounting. Omit for platform-level calls. */
  businessId?: number;
}): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    });
    recordUsage(opts.businessId, 'claude', response.usage?.input_tokens, response.usage?.output_tokens);
    return response.content[0].type === 'text' ? response.content[0].text : '';
  } catch (err) {
    console.warn('[AI] Claude failed, falling back to OpenAI:', (err as Error).message);
    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      max_completion_tokens: opts.maxTokens || 1024,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    });
    recordUsage(opts.businessId, 'openai', response.usage?.prompt_tokens, response.usage?.completion_tokens);
    return response.choices[0]?.message?.content || '';
  }
}

/**
 * Tool_use conversations — Claude primary, OpenAI fallback.
 * Returns provider name so caller can parse the response format correctly
 * (Claude tool_use format differs from OpenAI function_calling format).
 */
export async function claudeWithTools(opts: {
  system: string;
  messages: any[];
  tools: any[];        // Claude format: { name, description, input_schema }
  openaiTools?: any[]; // OpenAI format: { type: 'function', function: { name, parameters } }
  maxTokens?: number;
  /** Tenant for AI cost accounting. Omit for platform-level calls. */
  businessId?: number;
}): Promise<{ provider: 'claude' | 'openai'; response: any }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 1024,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
    });
    recordUsage(opts.businessId, 'claude', response.usage?.input_tokens, response.usage?.output_tokens);
    return { provider: 'claude', response };
  } catch (err) {
    console.warn('[AI] Claude failed, falling back to OpenAI:', (err as Error).message);
    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      max_completion_tokens: opts.maxTokens || 1024,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages],
      tools: opts.openaiTools || opts.tools,
    });
    recordUsage(opts.businessId, 'openai', response.usage?.prompt_tokens, response.usage?.completion_tokens);
    return { provider: 'openai', response };
  }
}
