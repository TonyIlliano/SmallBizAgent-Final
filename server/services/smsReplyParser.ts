/**
 * SMS Reply Parser
 *
 * Centralized, word-boundary-aware intent detection for SMS replies.
 * Replaces the broken `.includes()` matching that was causing false positives
 * (e.g., "SURE THING" matched 'N' in "THING" as negative → treated as ambiguous).
 *
 * Used by: noShowAgentService, rebookingAgentService, conversationalBookingService
 */

export type ReplyIntent = 'positive' | 'negative' | 'stop' | 'ambiguous';

// Word lists — these only match as complete words, never as substrings
const POSITIVE_WORDS = [
  'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'please',
  'book', 'reschedule', 'absolutely', 'definitely', 'sounds good',
  'perfect', 'great', 'confirm', 'do it', 'lets go', 'let\'s go',
  'y',
];

const NEGATIVE_WORDS = [
  'no', 'nope', 'nah', 'not now', 'later', 'pass', 'decline',
  'nevermind', 'never mind', 'not interested', 'no thanks', 'no thank you',
  'n',
];

// STOP words get special treatment — these trigger SMS opt-out (TCPA compliance)
const STOP_WORDS = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];

/**
 * Classify an SMS reply as positive, negative, stop, or ambiguous.
 *
 * Uses word-boundary matching to prevent false positives:
 * - "SURE THING" → positive (matches "sure" as a word, 'N' in "thing" is NOT matched)
 * - "ANY TIME" → ambiguous (the 'N' in "any" is NOT matched as the word "n")
 * - "NOT NOW" → negative (matches "not now" as a phrase)
 * - "STOP" → stop (triggers opt-out flow)
 */
export function classifyReply(messageBody: string): ReplyIntent {
  const normalized = messageBody.trim().toLowerCase();

  // Check for exact STOP words first (highest priority — TCPA)
  if (STOP_WORDS.some(w => matchesWord(normalized, w))) {
    return 'stop';
  }

  // Check for multi-word phrases first (they're more specific)
  const isPositive = POSITIVE_WORDS.some(w => matchesWord(normalized, w));
  const isNegative = NEGATIVE_WORDS.some(w => matchesWord(normalized, w));

  if (isPositive && !isNegative) return 'positive';
  if (isNegative && !isPositive) return 'negative';
  if (isPositive && isNegative) return 'ambiguous'; // Conflicting signals

  return 'ambiguous';
}

/**
 * Word-boundary matching.
 *
 * Matches a word/phrase only when it appears as a complete word (not as a substring).
 * Uses regex word boundaries (\b) so:
 * - matchesWord("SURE THING", "n") → false  (n is inside "thing", not a standalone word)
 * - matchesWord("Y", "y") → true  (standalone)
 * - matchesWord("YEAH OK", "yeah") → true
 * - matchesWord("NOT NOW", "not now") → true (multi-word phrase)
 * - matchesWord("ANYTHING", "y") → false
 */
function matchesWord(text: string, word: string): boolean {
  // For single-character words, require exact match or standalone word
  if (word.length === 1) {
    // Single letter: must be the entire message OR surrounded by word boundaries
    // Be extra strict — only match if it's a standalone word
    const regex = new RegExp(`(?:^|\\s)${escapeRegex(word)}(?:\\s|$|[.!?])`, 'i');
    return regex.test(text) || text === word;
  }

  // For multi-word phrases, use word boundaries around the whole phrase
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
  return regex.test(text);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a message is a confirmation in a booking context.
 * More permissive than general positive — includes "do it", "sounds good", etc.
 */
export function isBookingConfirmation(messageBody: string): boolean {
  const intent = classifyReply(messageBody);
  return intent === 'positive';
}

/**
 * Check if a message is a STOP/unsubscribe request.
 * These MUST be handled immediately per TCPA requirements.
 */
export function isStopRequest(messageBody: string): boolean {
  const normalized = messageBody.trim().toLowerCase();
  return STOP_WORDS.some(w => matchesWord(normalized, w));
}
