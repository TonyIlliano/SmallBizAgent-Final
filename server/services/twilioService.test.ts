import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted ensures they're available when vi.mock factories run) ──

const { mockMessagesCreate, mockCallsCreate, mockIncomingPhoneNumbersList, mockPoolQuery } = vi.hoisted(() => {
  // Set Twilio env vars early so isTwilioConfigured evaluates true at module load
  process.env.TWILIO_ACCOUNT_SID = 'ACtest1234567890abcdef1234567890';
  process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_secret';
  process.env.TWILIO_PHONE_NUMBER = '+15551230000';
  // Start without Messaging Service SID; some tests set it
  process.env.TWILIO_MESSAGING_SERVICE_SID = '';

  return {
    mockMessagesCreate: vi.fn(),
    mockCallsCreate: vi.fn(),
    mockIncomingPhoneNumbersList: vi.fn(),
    mockPoolQuery: vi.fn(),
  };
});

// Mock twilio SDK — constructor returns a fake client with messages/calls/incomingPhoneNumbers
vi.mock('twilio', () => {
  const mockClient = {
    messages: { create: mockMessagesCreate },
    calls: { create: mockCallsCreate },
    incomingPhoneNumbers: { list: mockIncomingPhoneNumbersList },
  };
  const twilioConstructor = vi.fn().mockReturnValue(mockClient);
  // Attach twiml.VoiceResponse as a minimal class that the source destructures
  (twilioConstructor as any).twiml = {
    VoiceResponse: class {
      private xml: string[] = [];
      say(opts: any, text: string) { this.xml.push(`<Say voice="${opts.voice}">${text}</Say>`); }
      gather(_opts: any) { this.xml.push(`<Gather />`); }
      record(_opts: any) { this.xml.push(`<Record />`); }
      dial(_opts: any, number: string) { this.xml.push(`<Dial>${number}</Dial>`); }
      hangup() { this.xml.push(`<Hangup />`); }
      toString() { return `<?xml version="1.0" encoding="UTF-8"?><Response>${this.xml.join('')}</Response>`; }
    },
  };
  return { default: twilioConstructor };
});

// Mock ../db for the suppression list and business phone number queries
vi.mock('../db', () => ({
  pool: { query: mockPoolQuery },
}));

// Import the service AFTER mocks and env are set
import twilioService, { sendSms, makeCall, createGreetingTwiml, createAfterHoursTwiml, createVoicemailTwiml, createTransferTwiml, createGoodbyeTwiml } from './twilioService';

// ── Tests ──

describe('twilioService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── sanitizeSmsBody (tested indirectly through sendSms) ──

  describe('sendSms - sanitization of AI reasoning', () => {
    it('strips "(Note: ...)" patterns from SMS body', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Hello! (Note: The assistant must follow call flow instructions.) How are you?');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Hello! How are you?',
        }),
      );
    });

    it('strips "(Internal: ...)" patterns from SMS body', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Your appointment is confirmed. (Internal: customer seems upset, use empathetic tone)');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Your appointment is confirmed.',
        }),
      );
    });

    it('strips "(System: ...)" patterns from SMS body', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Thanks for calling! (System: do not reveal pricing info) We look forward to seeing you.');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Thanks for calling! We look forward to seeing you.',
        }),
      );
    });

    it('strips "[Debug: ...]" square bracket patterns from SMS body', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Great news! [Debug: function returned 200 OK] Your booking is set.');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Great news! Your booking is set.',
        }),
      );
    });

    it('strips multiple AI reasoning patterns in a single message', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms(
        '+15559999999',
        'Hi John! (Note: use friendly tone) Your haircut is at 3pm. [Reminder: check if customer has insurance] See you then! (Warning: do not offer discounts)',
      );

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Hi John! Your haircut is at 3pm. See you then!',
        }),
      );
    });

    it('strips "(TODO: ...)" and "(IMPORTANT: ...)" patterns', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Reminder: your appointment is tomorrow. (TODO: add upsell link) (IMPORTANT: follow compliance rules)');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Reminder: your appointment is tomorrow.',
        }),
      );
    });

    it('is case-insensitive when stripping AI reasoning patterns', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'See you soon! (note: remember to include disclaimers) Have a great day. [CONTEXT: customer is VIP]');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'See you soon! Have a great day.',
        }),
      );
    });

    it('collapses extra whitespace left after stripping', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Hello!   (Note: extra spaces around)   World!');

      const calledBody = mockMessagesCreate.mock.calls[0][0].body;
      // Should not have runs of multiple spaces
      expect(calledBody).not.toMatch(/  +/);
      expect(calledBody).toContain('Hello!');
      expect(calledBody).toContain('World!');
    });

    it('does not strip normal parenthetical text that is not AI reasoning', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Your appointment (with Dr. Smith) is at 3pm.');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Your appointment (with Dr. Smith) is at 3pm.',
        }),
      );
    });
  });

  // ── sendSms core functionality ──

  describe('sendSms - sending', () => {
    it('sends SMS successfully with configured phone number', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM_abc123', status: 'queued', from: '+15551230000' });

      const result = await sendSms('+15559999999', 'Test message');

      expect(mockMessagesCreate).toHaveBeenCalledWith({
        body: 'Test message',
        from: '+15551230000',
        to: '+15559999999',
      });
      expect(result.sid).toBe('SM_abc123');
      expect(result.status).toBe('queued');
    });

    it('uses explicit from number when provided', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM_abc', status: 'queued', from: '+15557770000' });

      await sendSms('+15559999999', 'Hello', '+15557770000');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+15557770000',
        }),
      );
    });

    it('looks up business phone number when businessId is provided and no from number', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // suppression list check (empty = not suppressed)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ twilio_phone_number: '+15558880000' }] }); // business phone lookup
      mockMessagesCreate.mockResolvedValue({ sid: 'SM_biz', status: 'queued', from: '+15558880000' });

      await sendSms('+15559999999', 'Business SMS', undefined, 42);

      // First query: suppression list check
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('sms_suppression_list'),
        ['+15559999999', 42],
      );
      // Second query: business phone lookup
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('twilio_phone_number'),
        [42],
      );
      // SMS sent with business phone number
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+15558880000',
        }),
      );
    });

    it('falls back to configured phone number when business has no phone', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // suppression list: clear
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ twilio_phone_number: null }] }); // no business phone
      mockMessagesCreate.mockResolvedValue({ sid: 'SM_fb', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Fallback test', undefined, 42);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+15551230000',
        }),
      );
    });

    it('throws when Twilio SDK throws an error', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('Twilio API error: invalid number'));

      await expect(sendSms('+15559999999', 'Should fail')).rejects.toThrow('Twilio API error: invalid number');
    });

    it('falls back to env phone number when business phone lookup fails', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // suppression check: clear
      mockPoolQuery.mockRejectedValueOnce(new Error('DB connection lost')); // business phone lookup fails
      mockMessagesCreate.mockResolvedValue({ sid: 'SM_fallback', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'Lookup failure fallback', undefined, 42);

      // Should still send SMS despite business lookup failure
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+15551230000',
          to: '+15559999999',
        }),
      );
    });
  });

  // ── TCPA Suppression ──

  describe('sendSms - TCPA suppression list', () => {
    it('blocks SMS when recipient is on suppression list', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // suppression list HIT

      const result = await sendSms('+15559999999', 'Should be blocked', undefined, 1);

      expect(result.sid).toBe('suppressed');
      expect(result.status).toBe('suppressed');
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('blocks SMS when suppression list check fails (TCPA safety)', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database connection lost'));

      const result = await sendSms('+15559999999', 'Should be blocked on error', undefined, 1);

      expect(result.sid).toBe('suppression_check_failed');
      expect(result.status).toBe('blocked');
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('skips suppression check when no businessId is provided', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM_no_biz', status: 'queued', from: '+15551230000' });

      await sendSms('+15559999999', 'No business context');

      // Pool should not be queried at all when no businessId
      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(mockMessagesCreate).toHaveBeenCalled();
    });
  });

  // ── makeCall ──

  describe('makeCall', () => {
    it('makes an outbound call with configured phone number', async () => {
      mockCallsCreate.mockResolvedValue({ sid: 'CA_test123', status: 'queued' });

      const result = await makeCall('+15559999999', 'https://example.com/twiml');

      expect(mockCallsCreate).toHaveBeenCalledWith({
        url: 'https://example.com/twiml',
        from: '+15551230000',
        to: '+15559999999',
      });
      expect(result.sid).toBe('CA_test123');
    });

    it('throws when Twilio call creation fails', async () => {
      mockCallsCreate.mockRejectedValue(new Error('Call failed: number unreachable'));

      await expect(makeCall('+15559999999', 'https://example.com/twiml')).rejects.toThrow('Call failed: number unreachable');
    });
  });

  // ── TwiML generation ──

  describe('TwiML generation', () => {
    it('createGreetingTwiml generates valid TwiML with greeting and gather', () => {
      const twiml = createGreetingTwiml('Welcome to our business!', '/api/gather-callback');

      expect(twiml).toContain('Welcome to our business!');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('<Gather');
    });

    it('createAfterHoursTwiml generates TwiML with after-hours message', () => {
      const twiml = createAfterHoursTwiml('We are currently closed.', '/api/after-hours-callback');

      expect(twiml).toContain('We are currently closed.');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Say');
    });

    it('createVoicemailTwiml generates TwiML with record instructions', () => {
      const twiml = createVoicemailTwiml('Please leave a message.', '/api/recording-callback');

      expect(twiml).toContain('Please leave a message.');
      expect(twiml).toContain('<Record');
    });

    it('createTransferTwiml generates TwiML with dial', () => {
      const twiml = createTransferTwiml('Transferring your call.', '+15551234567');

      expect(twiml).toContain('Transferring your call.');
      expect(twiml).toContain('<Dial>');
      expect(twiml).toContain('+15551234567');
    });

    it('createGoodbyeTwiml generates TwiML with hangup', () => {
      const twiml = createGoodbyeTwiml('Goodbye, thanks for calling!');

      expect(twiml).toContain('Goodbye, thanks for calling!');
      expect(twiml).toContain('<Hangup');
    });

    it('createGoodbyeTwiml uses default message when none provided', () => {
      const twiml = createGoodbyeTwiml();

      expect(twiml).toContain('Thank you for your call. Goodbye.');
    });
  });

  // ── Default export shape ──

  describe('module exports', () => {
    it('exports all expected functions on the default export', () => {
      expect(twilioService).toHaveProperty('sendSms');
      expect(twilioService).toHaveProperty('makeCall');
      expect(twilioService).toHaveProperty('createGreetingTwiml');
      expect(twilioService).toHaveProperty('createAfterHoursTwiml');
      expect(twilioService).toHaveProperty('createVoicemailTwiml');
      expect(twilioService).toHaveProperty('createTransferTwiml');
      expect(twilioService).toHaveProperty('createGoodbyeTwiml');
      expect(typeof twilioService.sendSms).toBe('function');
      expect(typeof twilioService.makeCall).toBe('function');
    });
  });
});
