/**
 * Auto-Refine Pipeline Service
 *
 * Analyzes call transcripts weekly per business and produces structured
 * improvement suggestions for the AI receptionist's configuration and
 * knowledge base. Suggestions surface in the "AI Insights" tab for
 * one-click accept / edit / dismiss.
 *
 * Legal safeguard: analysis ONLY runs if the receptionist greeting
 * contains a recording disclosure ("recorded", "recording", "monitored").
 */

import OpenAI from 'openai';
import { storage } from '../storage';
import { debouncedUpdateRetellAgent } from './retellProvisioningService';

// ── Greeting disclosure check ────────────────────────────────────────
const DISCLOSURE_KEYWORDS = ['recorded', 'recording', 'monitored', 'monitor'];

export function hasRecordingDisclosure(greeting: string | null | undefined): boolean {
  if (!greeting) return false;
  const lower = greeting.toLowerCase();
  return DISCLOSURE_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Types ────────────────────────────────────────────────────────────
interface ParsedSuggestion {
  type: string;
  title: string;
  description: string;
  currentValue?: string | null;
  suggestedValue?: string | null;
  occurrenceCount?: number;
  riskLevel?: string;
}

// ── System prompt ────────────────────────────────────────────────────
const ANALYSIS_SYSTEM_PROMPT = `You are an AI receptionist performance analyst. You are reviewing one week of phone call transcripts for a small business AI receptionist.

Your job is to identify gaps and suggest specific improvements to make the receptionist smarter and more helpful.

Analyze the transcripts and current configuration, then produce a JSON array of suggestions. Each suggestion object:

{
  "type": "NEW_FAQ" | "UPDATE_GREETING" | "UPDATE_INSTRUCTIONS" | "UPDATE_AFTER_HOURS" | "ADD_EMERGENCY_KEYWORD" | "GENERAL_INSIGHT",
  "title": "Short title (max 80 chars)",
  "description": "Detailed explanation of the gap found and why this change would help",
  "currentValue": "The current config value (for UPDATE_* types) or null",
  "suggestedValue": "The recommended new value or knowledge entry",
  "occurrenceCount": 3,
  "riskLevel": "low" or "high"
}

Rules:
- For NEW_FAQ: suggestedValue should be a JSON string like {"question":"...","answer":"..."}
- For UPDATE_GREETING/UPDATE_INSTRUCTIONS/UPDATE_AFTER_HOURS: provide the full new text
- For ADD_EMERGENCY_KEYWORD: suggestedValue is the keyword to add
- For GENERAL_INSIGHT: suggestedValue can be null (observation only, no action)
- Maximum 8 suggestions per analysis
- Mark "high" risk only for changes to greeting, instructions, or emergency keywords
- Mark "low" risk for new FAQ entries and general insights
- Do NOT suggest things already covered in the existing knowledge base
- Do NOT duplicate pending unanswered questions unless you have a better, more complete answer
- If the receptionist is performing well with no gaps, return an empty array: []
- Return valid JSON array only, no markdown fences, no commentary`;

// ── Main weekly runner ───────────────────────────────────────────────

/**
 * Run the weekly auto-refine pipeline for all eligible businesses.
 */
export async function runWeeklyAutoRefine(): Promise<void> {
  console.log(`[AutoRefine] Starting weekly auto-refine at ${new Date().toISOString()}`);

  const allBusinesses = await storage.getAllBusinesses();
  let processed = 0;
  let skipped = 0;

  for (const business of allBusinesses) {
    // Only analyze active or trialing businesses
    if (business.subscriptionStatus !== 'active' && business.subscriptionStatus !== 'trialing') {
      skipped++;
      continue;
    }

    try {
      await analyzeBusinessWeek(business.id);
      processed++;
    } catch (err) {
      console.error(`[AutoRefine] Error for business ${business.id}:`, err);
    }

    // Rate-limit between businesses to avoid OpenAI rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[AutoRefine] Done — ${processed} analyzed, ${skipped} skipped`);
}

// ── Per-business analysis ────────────────────────────────────────────

/**
 * Analyze one business's calls from the past 7 days and generate suggestions.
 */
export async function analyzeBusinessWeek(businessId: number): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('[AutoRefine] No OPENAI_API_KEY set — skipping');
    return;
  }

  // Check if AI insights are enabled for this business
  const config = await storage.getReceptionistConfig(businessId);
  if (!config) return;
  if (!config.aiInsightsEnabled) return;

  // Legal safeguard: greeting must contain recording disclosure
  if (!hasRecordingDisclosure(config.greeting)) {
    console.log(`[AutoRefine] Business ${businessId}: greeting lacks recording disclosure — skipping`);
    return;
  }

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch last 7 days of call transcripts
  const calls = await storage.getCallLogs(businessId, {
    startDate: weekStart,
    endDate: now,
  });

  // Filter to calls with meaningful transcripts
  const callsWithTranscripts = calls.filter(c => c.transcript && c.transcript.length > 100);
  if (callsWithTranscripts.length < 3) {
    // Not enough data for meaningful analysis
    return;
  }

  // Fetch current knowledge base and pending unanswered questions
  const knowledge = await storage.getBusinessKnowledge(businessId, { isApproved: true });
  const pendingQuestions = await storage.getUnansweredQuestions(businessId, { status: 'pending' });

  // Build transcript summaries (cap at 20, truncate each to 2000 chars)
  const transcriptSummaries = callsWithTranscripts
    .slice(0, 20)
    .map(c =>
      `[Call #${c.id} | Status: ${c.status} | Intent: ${c.intentDetected || 'unknown'} | Duration: ${c.callDuration || '?'}s]\n${(c.transcript || '').substring(0, 2000)}`
    )
    .join('\n---\n');

  const currentKnowledge = knowledge
    .slice(0, 30)
    .map(k => `Q: ${k.question}\nA: ${k.answer}`)
    .join('\n\n');

  const pendingQuestionsText = pendingQuestions
    .slice(0, 10)
    .map(q => `- ${q.question}`)
    .join('\n');

  // Build the user prompt with full context
  const userPrompt = `Analyze this week's calls for a business. Here's the context:

CURRENT RECEPTIONIST CONFIGURATION:
- Greeting: ${config.greeting || '(not set)'}
- After-hours message: ${config.afterHoursMessage || '(not set)'}
- Custom instructions: ${config.customInstructions || '(none)'}
- Emergency keywords: ${JSON.stringify(config.emergencyKeywords || [])}
- Assistant name: ${config.assistantName || 'Alex'}

EXISTING KNOWLEDGE BASE (${knowledge.length} entries):
${currentKnowledge || '(empty)'}

PENDING UNANSWERED QUESTIONS (${pendingQuestions.length}):
${pendingQuestionsText || '(none)'}

THIS WEEK'S CALL TRANSCRIPTS (${callsWithTranscripts.length} calls):
${transcriptSummaries}

Based on all of the above, identify gaps and suggest improvements. Return a JSON array.`;

  // Call OpenAI
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    temperature: 0.3,
    max_completion_tokens: 4000,
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) return;

  // Parse response
  const suggestions = parseAIResponse(content);
  if (suggestions.length === 0) {
    console.log(`[AutoRefine] Business ${businessId}: no suggestions this week (performing well!)`);
    return;
  }

  console.log(`[AutoRefine] Business ${businessId}: ${suggestions.length} suggestions generated`);

  // Store suggestions
  for (const suggestion of suggestions) {
    await storage.createAiSuggestion({
      businessId,
      weekStart,
      type: suggestion.type,
      title: suggestion.title,
      description: suggestion.description,
      currentValue: suggestion.currentValue || null,
      suggestedValue: suggestion.suggestedValue || null,
      occurrenceCount: suggestion.occurrenceCount || 1,
      riskLevel: suggestion.riskLevel || 'low',
      status: 'pending',
    });
  }

  // Notify the business owner via email
  await sendSuggestionsReadyEmail(businessId, suggestions.length);
}

// ── Accept / apply a suggestion ──────────────────────────────────────

/**
 * Accept a suggestion and apply it to the receptionist config or knowledge base.
 */
export async function acceptSuggestion(
  suggestionId: number,
  editedValue?: string
): Promise<{ success: boolean; error?: string }> {
  const suggestion = await storage.getAiSuggestion(suggestionId);
  if (!suggestion) return { success: false, error: 'Suggestion not found' };
  if (suggestion.status !== 'pending') return { success: false, error: 'Suggestion already processed' };

  const valueToApply = editedValue || suggestion.suggestedValue;

  try {
    switch (suggestion.type) {
      case 'NEW_FAQ': {
        const faq = JSON.parse(valueToApply!);
        await storage.createBusinessKnowledge({
          businessId: suggestion.businessId,
          question: faq.question,
          answer: faq.answer,
          category: 'faq',
          source: 'ai_suggestion',
          isApproved: true,
          priority: 7,
        });
        break;
      }
      case 'UPDATE_GREETING': {
        const config = await storage.getReceptionistConfig(suggestion.businessId);
        if (config) {
          await storage.updateReceptionistConfig(config.id, { greeting: valueToApply });
        }
        break;
      }
      case 'UPDATE_INSTRUCTIONS': {
        const config = await storage.getReceptionistConfig(suggestion.businessId);
        if (config) {
          await storage.updateReceptionistConfig(config.id, { customInstructions: valueToApply });
        }
        break;
      }
      case 'UPDATE_AFTER_HOURS': {
        const config = await storage.getReceptionistConfig(suggestion.businessId);
        if (config) {
          await storage.updateReceptionistConfig(config.id, { afterHoursMessage: valueToApply });
        }
        break;
      }
      case 'ADD_EMERGENCY_KEYWORD': {
        const config = await storage.getReceptionistConfig(suggestion.businessId);
        if (config) {
          const existing = (config.emergencyKeywords as string[]) || [];
          const newKeywords = [...existing, valueToApply!];
          await storage.updateReceptionistConfig(config.id, { emergencyKeywords: newKeywords });
        }
        break;
      }
      case 'GENERAL_INSIGHT':
        // No action to apply — just mark as acknowledged
        break;
    }

    // Mark suggestion as accepted/edited
    await storage.updateAiSuggestion(suggestionId, {
      status: editedValue ? 'edited' : 'accepted',
      acceptedAt: new Date(),
    });

    // Trigger Vapi assistant update so changes take effect on calls
    if (suggestion.type !== 'GENERAL_INSIGHT') {
      debouncedUpdateRetellAgent(suggestion.businessId);
    }

    return { success: true };
  } catch (error: any) {
    console.error(`[AutoRefine] Error accepting suggestion ${suggestionId}:`, error);
    return { success: false, error: error.message || String(error) };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseAIResponse(content: string): ParsedSuggestion[] {
  try {
    let jsonStr = content;
    // Strip markdown code fences if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    // Validate and cap at 8
    const validTypes = ['NEW_FAQ', 'UPDATE_GREETING', 'UPDATE_INSTRUCTIONS', 'UPDATE_AFTER_HOURS', 'ADD_EMERGENCY_KEYWORD', 'GENERAL_INSIGHT'];

    return parsed
      .filter((s: any) =>
        s.type && validTypes.includes(s.type) &&
        s.title && typeof s.title === 'string' &&
        s.description && typeof s.description === 'string'
      )
      .slice(0, 8)
      .map((s: any) => ({
        type: s.type,
        title: s.title.substring(0, 120),
        description: s.description,
        currentValue: s.currentValue || null,
        suggestedValue: typeof s.suggestedValue === 'object' ? JSON.stringify(s.suggestedValue) : s.suggestedValue || null,
        occurrenceCount: Number(s.occurrenceCount) || 1,
        riskLevel: s.riskLevel === 'high' ? 'high' : 'low',
      }));
  } catch (err) {
    console.warn('[AutoRefine] Failed to parse AI response:', content?.substring(0, 200));
    return [];
  }
}

async function sendSuggestionsReadyEmail(businessId: number, count: number): Promise<void> {
  try {
    const business = await storage.getBusiness(businessId);
    if (!business || !business.email) return;

    const ownerEmail = business.email;

    const { sendEmail } = await import('../emailService');
    const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';

    await sendEmail({
      to: ownerEmail,
      subject: `${count} AI Improvement Suggestion${count > 1 ? 's' : ''} Ready - SmallBizAgent`,
      text: `Hi,\n\nYour AI receptionist has analyzed this week's calls and has ${count} suggestion${count > 1 ? 's' : ''} to improve performance.\n\nLog in to review: ${appUrl}/receptionist\n\nSmallBizAgent`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #92400e; margin: 0;">✨ ${count} AI Insight${count > 1 ? 's' : ''} Ready</h2>
          </div>
          <p>Your AI receptionist analyzed this week's calls and found ${count} way${count > 1 ? 's' : ''} to improve.</p>
          <p style="margin: 24px 0; text-align: center;">
            <a href="${appUrl}/receptionist" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Review Suggestions</a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">SmallBizAgent</p>
        </div>
      `,
    }).catch(err => console.error('[AutoRefine] Email send failed:', err));
  } catch (err) {
    console.error(`[AutoRefine] Failed to send notification email for business ${businessId}:`, err);
  }
}
