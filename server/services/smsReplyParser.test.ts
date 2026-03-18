import { describe, it, expect } from 'vitest';
import { classifyReply, isStopRequest, isBookingConfirmation } from './smsReplyParser';

describe('smsReplyParser', () => {
  describe('classifyReply', () => {
    // ── Positive replies ──
    it.each([
      'YES', 'yes', 'Yeah', 'yep', 'sure', 'ok', 'okay', 'please',
      'Y', 'y', 'BOOK', 'reschedule', 'absolutely', 'definitely',
      'Sounds good', 'PERFECT', 'great', 'confirm', 'Do it',
    ])('classifies "%s" as positive', (reply) => {
      expect(classifyReply(reply)).toBe('positive');
    });

    // ── Negative replies ──
    it.each([
      'NO', 'no', 'Nope', 'nah', 'not now', 'later', 'pass',
      'decline', 'nevermind', 'never mind', 'not interested',
      'no thanks', 'N', 'n',
    ])('classifies "%s" as negative', (reply) => {
      expect(classifyReply(reply)).toBe('negative');
    });

    // ── Stop/unsubscribe ──
    it.each([
      'STOP', 'stop', 'unsubscribe', 'quit', 'END',
    ])('classifies "%s" as stop', (reply) => {
      expect(classifyReply(reply)).toBe('stop');
    });

    // ── Ambiguous ──
    it.each([
      'hmm idk', 'what time?', 'maybe', 'how much does it cost?',
      'tell me more', 'is Sarah available?',
    ])('classifies "%s" as ambiguous', (reply) => {
      expect(classifyReply(reply)).toBe('ambiguous');
    });

    // ── THE CRITICAL BUG FIX: words containing 'N' should NOT match as negative ──
    it('does NOT match "SURE THING" as negative (N in THING)', () => {
      // This was the original bug — "THING" contains 'N', which was matched
      // by the old .includes('N') check, making "SURE THING" ambiguous
      expect(classifyReply('SURE THING')).toBe('positive');
    });

    it('does NOT match "EVENING" as negative', () => {
      expect(classifyReply('EVENING')).toBe('ambiguous');
    });

    it('does NOT match "MORNING" as negative', () => {
      expect(classifyReply('MORNING')).toBe('ambiguous');
    });

    it('does NOT match "ANY TIME" as negative', () => {
      expect(classifyReply('ANY TIME')).toBe('ambiguous');
    });

    it('does NOT match "FINE" as having a standalone N', () => {
      // "FINE" should not match "N" as a word
      expect(classifyReply('FINE')).toBe('ambiguous');
    });

    it('treats "yes but no" as ambiguous (conflicting signals)', () => {
      expect(classifyReply('yes but no')).toBe('ambiguous');
    });

    it('handles "Sure, book me in" as positive', () => {
      // "in" contains 'n' but should not match as standalone "n"
      expect(classifyReply('Sure, book me in')).toBe('positive');
    });

    it('handles "Yes please!" with punctuation as positive', () => {
      expect(classifyReply('Yes please!')).toBe('positive');
    });

    it('handles "No thank you" as negative', () => {
      expect(classifyReply('No thank you')).toBe('negative');
    });
  });

  describe('isStopRequest', () => {
    it('returns true for STOP', () => {
      expect(isStopRequest('STOP')).toBe(true);
    });

    it('returns true for unsubscribe', () => {
      expect(isStopRequest('unsubscribe')).toBe(true);
    });

    it('returns false for normal replies', () => {
      expect(isStopRequest('YES')).toBe(false);
      expect(isStopRequest('NO')).toBe(false);
      expect(isStopRequest('what time?')).toBe(false);
    });
  });

  describe('isBookingConfirmation', () => {
    it('returns true for positive replies', () => {
      expect(isBookingConfirmation('YES')).toBe(true);
      expect(isBookingConfirmation('sounds good')).toBe(true);
    });

    it('returns false for negative replies', () => {
      expect(isBookingConfirmation('NO')).toBe(false);
    });

    it('returns false for ambiguous replies', () => {
      expect(isBookingConfirmation('maybe')).toBe(false);
    });
  });
});
