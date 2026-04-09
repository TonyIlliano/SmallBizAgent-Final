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

// Lazy OpenAI client — only instantiated on first fallback call
let _openai: any = null;
function getOpenAI() {
  if (!_openai) {
    const OpenAI = require('openai').default || require('openai');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
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
}): Promise<T> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text);
  } catch (err) {
    console.warn('[AI] Claude failed, falling back to OpenAI:', (err as Error).message);
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      max_completion_tokens: opts.maxTokens || 1024,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    });
    return JSON.parse(response.choices[0]?.message?.content || '');
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
}): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
  } catch (err) {
    console.warn('[AI] Claude failed, falling back to OpenAI:', (err as Error).message);
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      max_completion_tokens: opts.maxTokens || 1024,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    });
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
}): Promise<{ provider: 'claude' | 'openai'; response: any }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 1024,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
    });
    return { provider: 'claude', response };
  } catch (err) {
    console.warn('[AI] Claude failed, falling back to OpenAI:', (err as Error).message);
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      max_completion_tokens: opts.maxTokens || 1024,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages],
      tools: opts.openaiTools || opts.tools,
    });
    return { provider: 'openai', response };
  }
}
