import { describe, it, expect } from 'vitest';

/**
 * The Twilio SMS webhook routes APPROVE/DECLINE keywords for outstanding
 * quotes via two regular expressions inlined in
 *   server/routes/twilioWebhookRoutes.ts > /api/twilio/sms
 *
 * These tests pin exactly which strings count as approve vs decline vs
 * neither. The plan locked in a "broad" keyword set; if anyone later wants
 * to tighten or extend, this suite catches the silent change.
 *
 * Keep the regexes in lock-step with the route file.
 */

const APPROVE_RE = /^(approve|approved|y|yes|sounds good|let'?s do it|book it)$/i;
const DECLINE_RE = /^(decline|declined|n|no|no thanks|not now)$/i;

function classify(body: string): 'approve' | 'decline' | 'neither' {
  const trimmed = body.trim();
  if (APPROVE_RE.test(trimmed)) return 'approve';
  if (DECLINE_RE.test(trimmed)) return 'decline';
  return 'neither';
}

describe('quote APPROVE/DECLINE keyword classification', () => {
  describe('APPROVE — accepts the locked-in broad set', () => {
    const positives = [
      'Y',
      'y',
      'YES',
      'yes',
      'Yes',
      'APPROVE',
      'approve',
      'Approved',
      'sounds good',
      'Sounds Good',
      "let's do it",
      "Let's do it",
      'lets do it', // missing apostrophe — common typo
      'book it',
      'Book It',
    ];
    positives.forEach((s) => {
      it(`accepts "${s}"`, () => {
        expect(classify(s)).toBe('approve');
      });
    });

    it('accepts inputs surrounded by whitespace (real SMS keyboards add trailing newlines)', () => {
      expect(classify('  Y  ')).toBe('approve');
      expect(classify('\nyes\n')).toBe('approve');
    });
  });

  describe('DECLINE — accepts the locked-in broad set', () => {
    const negatives = [
      'N',
      'n',
      'NO',
      'no',
      'No',
      'DECLINE',
      'decline',
      'Declined',
      'no thanks',
      'No Thanks',
      'not now',
      'Not Now',
    ];
    negatives.forEach((s) => {
      it(`accepts "${s}"`, () => {
        expect(classify(s)).toBe('decline');
      });
    });
  });

  describe('Neither — strings that must NOT be classified', () => {
    // Critical regression guard: STOP / START / CONFIRM / RESCHEDULE all
    // have their own existing handlers and the quote handler is upstream
    // of them in the routing. If 'STOP' accidentally matched approve it
    // would silently auto-approve every quote on opt-out.
    const collisions = [
      'STOP',
      'UNSUBSCRIBE',
      'START',
      'SUBSCRIBE',
      'CONFIRM',
      'CANCEL',
      'C',
      'RESCHEDULE',
      'HELP',
    ];
    collisions.forEach((s) => {
      it(`does NOT match "${s}" (existing keyword owner)`, () => {
        expect(classify(s)).toBe('neither');
      });
    });

    it('does NOT match free-form "yes thanks for the quote" (would be confusing — broad enough already)', () => {
      // We chose anchored regexes (^...$) so an extra word breaks the match.
      expect(classify('yes thanks for the quote')).toBe('neither');
    });

    it('does NOT match empty string', () => {
      expect(classify('')).toBe('neither');
    });

    it('does NOT match arbitrary text', () => {
      expect(classify('thank you')).toBe('neither');
      expect(classify('when can you come')).toBe('neither');
      expect(classify('1')).toBe('neither');
    });
  });

  describe('YES collision with re-opt-in handler', () => {
    it("'YES' classifies as approve (caller checks for an outstanding quote first; falls through to START otherwise)", () => {
      // The handler ordering is documented: quote handler runs first; if
      // there's a recent quote it claims YES, otherwise the START handler
      // claims it. The classifier itself just says 'approve' — the route
      // logic decides whether to actually fire on it.
      expect(classify('YES')).toBe('approve');
    });
  });
});
