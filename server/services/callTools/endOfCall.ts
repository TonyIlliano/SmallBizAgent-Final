/**
 * callTools/endOfCall — post-call processing: call logging, customer
 * creation/name-backfill from transcript, intelligence kickoff, webhooks.
 * Extracted from callToolHandlers.ts (audit R1 split).
 */

import { storage } from '../../storage';
import { db } from '../../db';
import twilioService from '../twilioService';
import { fireEvent } from '../webhookService';
import { createCustomer, recognizeCaller, extractCallerNameFromTranscript } from './crmTools';
import type { EndOfCallData } from './types';

/**
 * Process end of call — provider-agnostic.
 * Each voice AI provider's webhook handler normalizes its payload into EndOfCallData
 * before calling this function.
 */
export async function processEndOfCall(data: EndOfCallData): Promise<void> {
  const { businessId, callerPhone, transcript, callDurationSeconds, endedReason, recordingUrl, calledNumber } = data;

  if (businessId) {
    let callLogId: number | null = null;
    const reason = endedReason || '';

    try {
      // Look up caller name from customer records
      let callerName = '';
      if (callerPhone && callerPhone !== 'Unknown') {
        try {
          const callerCustomer = await storage.getCustomerByPhone(callerPhone, businessId);
          if (callerCustomer) {
            callerName = `${callerCustomer.firstName || ''} ${callerCustomer.lastName || ''}`.trim();
          }
        } catch (err) {
          console.error('Error looking up caller name:', err);
        }
      }

      // Map endedReason to standard status values (answered/missed/voicemail)
      let callStatus = 'answered';
      if (reason === 'customer-did-not-answer' || reason === 'silence-timed-out' || reason === 'no-input' || reason === 'dial_no_answer' || reason === 'no_answer') {
        callStatus = 'missed';
      } else if (reason === 'voicemail' || reason === 'voicemail-reached') {
        callStatus = 'voicemail';
      }

      // Resolve which phone number was called for multi-line tracking
      let phoneNumberId: number | null = null;
      if (calledNumber) {
        try {
          const phoneRecord = await storage.getPhoneNumberByTwilioNumber(calledNumber);
          if (phoneRecord) {
            phoneNumberId = phoneRecord.id;
          }
        } catch (pnErr) {
          console.error('Error resolving phoneNumberId:', pnErr);
        }
      }

      const callLog = await storage.createCallLog({
        businessId,
        callerId: callerPhone || 'Unknown',
        callerName,
        transcript: transcript || null,
        intentDetected: 'ai-call',
        isEmergency: false,
        callDuration: callDurationSeconds,
        recordingUrl: recordingUrl || null,
        status: callStatus,
        callTime: new Date(),
        phoneNumberId,
        phoneNumberUsed: calledNumber,
      });
      callLogId = callLog?.id || null;

      // Fire webhook event for call completed (fire-and-forget)
      if (callLog) {
        fireEvent(businessId, 'call.completed', { callLog })
          .catch(err => console.error('Webhook fire error:', err));
      }

      // PostHog: call_received event. Tag whether this was the business's
      // first-ever call so we can build a "signup → first call" funnel
      // (the moment the product actually starts producing value).
      void (async () => {
        try {
          const { capture, groupIdentify } = await import('../posthogService');
          const { users } = await import('@shared/schema');
          const { db } = await import('../../db');
          const { eq, sql } = await import('drizzle-orm');
          const { callLogs } = await import('@shared/schema');

          // Count prior call logs to detect first-ever call. Single COUNT
          // query — fast even on businesses with many calls.
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(callLogs)
            .where(eq(callLogs.businessId, businessId));
          const isFirstCall = count <= 1; // includes the one we just inserted

          const [u] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.businessId, businessId))
            .limit(1);
          if (u?.id) {
            capture(String(u.id), 'call_received', {
              business_id: businessId,
              duration_seconds: callDurationSeconds,
              is_first_call: isFirstCall,
              ended_reason: endedReason || null,
              has_transcript: !!transcript,
              has_recording: !!recordingUrl,
              caller_recognized: !!callerName,
            }, { business: String(businessId) });
            if (isFirstCall) {
              capture(String(u.id), 'first_call_received', {
                business_id: businessId,
                duration_seconds: callDurationSeconds,
              }, { business: String(businessId) });
              groupIdentify(businessId, {
                first_call_at: new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          console.error('[PostHog] call_received capture failed:', err);
        }
      })();
    } catch (error) {
      console.error('Error logging call:', error);
    }

    // Auto-create customer record if not already created by recognizeCaller (edge case: no recognizeCaller call)
    // Also try to extract caller name from transcript if still a placeholder
    if (callerPhone && callerPhone !== 'Unknown') {
      try {
        const existingCustomer = await storage.getCustomerByPhone(callerPhone, businessId);
        if (!existingCustomer) {
          // Edge case: recognizeCaller wasn't called (very short call, error, etc.)
          await storage.createCustomer({
            businessId,
            firstName: 'Caller',
            lastName: callerPhone.replace(/\D/g, '').slice(-4),
            phone: callerPhone,
            email: '',
            address: '',
            notes: 'Auto-created from phone call — name pending'
          });
        } else if (existingCustomer.firstName === 'Caller' && transcript) {
          // Customer exists but still has placeholder name — try extracting from transcript
          const extractedName = extractCallerNameFromTranscript(transcript);
          if (extractedName) {
            console.log(`[handleEndOfCall] Extracted name "${extractedName.firstName} ${extractedName.lastName}" from transcript for customer ${existingCustomer.id}`);
            await storage.updateCustomer(existingCustomer.id, {
              firstName: extractedName.firstName,
              lastName: extractedName.lastName || existingCustomer.lastName,
              notes: existingCustomer.notes?.replace('name pending', 'name extracted from transcript') || ''
            });
          }
        }
      } catch (error) {
        console.error('Error auto-creating/updating customer from call:', error);
      }
    }

    // Analyze transcript for unanswered questions (fire-and-forget — doesn't delay webhook response)
    if (transcript && transcript.length > 100 && callLogId) {
      import('../unansweredQuestionService').then(({ analyzeTranscriptForUnansweredQuestions }) => {
        analyzeTranscriptForUnansweredQuestions(businessId, callLogId!, transcript, callerPhone || undefined)
          .catch(err => console.error('Error analyzing transcript for unanswered questions:', err));
      }).catch(err => console.error('Error importing unanswered question service:', err));

      // Extract structured intelligence from transcript (fire-and-forget — doesn't delay webhook response)
      import('../callIntelligenceService').then(({ analyzeCallIntelligence }) => {
        analyzeCallIntelligence(businessId, callLogId!, transcript, callerPhone || undefined)
          .catch(err => console.error('Error analyzing call intelligence:', err));
      }).catch(err => console.error('Error importing call intelligence service:', err));
    }

    // Missed call text-back: If the call was very short or ended abnormally, send an SMS
    const isMissedCall = (
      callDurationSeconds < 15 || // Call shorter than 15 seconds
      reason === 'customer-did-not-answer' ||
      reason === 'assistant-error' ||
      reason === 'phone-call-provider-closedwebsocket' ||
      reason === 'silence-timed-out' ||
      reason === 'dial_no_answer' ||
      reason === 'error_llm_websocket_open' ||
      reason === 'error_inbound_webhook'
    );

    if (isMissedCall && callerPhone && callerPhone !== 'Unknown') {
      const business = await storage.getBusiness(businessId);
      if (business && business.twilioPhoneNumber) {
        // TCPA compliance: Only send missed-call text-back if the caller is a known customer with SMS opt-in
        const existingCustomer = await storage.getCustomerByPhone(callerPhone, businessId);
        if (!existingCustomer || !existingCustomer.smsOptIn) {
          // Caller has no SMS opt-in — skip text-back
        } else {

        const businessName = business.name || 'Our business';
        const industry = (business.industry || '').toLowerCase();

        // Industry-specific missed call text-back messages
        let textMessage: string;
        if (industry.includes('landscap')) {
          textMessage = `Hi! We noticed we missed your call to ${businessName}. We offer free estimates for all landscaping services — reply to this text or call us back and we'll get you scheduled!`;
        } else if (industry.includes('auto') || industry.includes('mechanic')) {
          textMessage = `Hi! We missed your call to ${businessName}. We offer free diagnostics — call us back or reply here and we'll get your vehicle taken care of!`;
        } else if (industry.includes('dental') || industry.includes('dentist')) {
          textMessage = `Hi! We missed your call to ${businessName}. We have same-day appointments available for emergencies — call us back or reply here to get scheduled!`;
        } else if (industry.includes('salon') || industry.includes('barber') || industry.includes('spa')) {
          textMessage = `Hi! We missed your call to ${businessName}. We'd love to get you booked — call us back or reply here and we'll find a time that works for you!`;
        } else if (industry.includes('plumb')) {
          textMessage = `Hi! We missed your call to ${businessName}. If you have an urgent issue, call us back and we'll prioritize your repair. Or reply here to schedule a visit!`;
        } else if (industry.includes('hvac') || industry.includes('heating') || industry.includes('cooling')) {
          textMessage = `Hi! We missed your call to ${businessName}. If your AC or heating is down, call us back for priority service. Or reply here to schedule a tune-up!`;
        } else if (industry.includes('electric')) {
          textMessage = `Hi! We missed your call to ${businessName}. For electrical emergencies, call us back right away. Otherwise, reply here to schedule an appointment!`;
        } else if (industry.includes('clean')) {
          textMessage = `Hi! We missed your call to ${businessName}. We'd love to get you a free quote — call us back or reply here and we'll set up an estimate!`;
        } else if (industry.includes('medical') || industry.includes('doctor') || industry.includes('clinic')) {
          textMessage = `Hi! We missed your call to ${businessName}. Call us back to schedule your appointment, or reply here and we'll get you booked!`;
        } else if (industry.includes('vet')) {
          textMessage = `Hi! We missed your call to ${businessName}. If your pet needs urgent care, please call us back. Otherwise, reply here to schedule a visit!`;
        } else if (industry.includes('fitness') || industry.includes('gym') || industry.includes('trainer')) {
          textMessage = `Hi! We missed your call to ${businessName}. Call us back or reply here to get started — we'd love to help you reach your goals!`;
        } else if (industry.includes('restaurant') || industry.includes('food')) {
          textMessage = `Hi! We missed your call to ${businessName}. Call us back to place an order or make a reservation, or reply here and we'll help you out!`;
        } else if (industry.includes('construct') || industry.includes('contractor')) {
          textMessage = `Hi! We missed your call to ${businessName}. We offer free estimates — call us back or reply here and we'll schedule a walkthrough!`;
        } else {
          textMessage = `Hi! We noticed we missed your call to ${businessName}. We'd love to help — feel free to call us back or reply to this text and we'll get back to you shortly!`;
        }

        twilioService.sendSms(callerPhone, textMessage, business.twilioPhoneNumber, businessId)
          .then(() => {
            // Log the notification
            storage.createNotificationLog({
              businessId,
              customerId: null,
              type: 'missed_call_textback',
              channel: 'sms',
              recipient: callerPhone,
              message: textMessage,
              status: 'sent',
              referenceType: 'call_log',
              referenceId: callLogId,
            }).catch(err => console.error('[MissedCallTextBack] Error logging notification:', err));
          })
          .catch(err => {
            console.error(`[MissedCallTextBack] Failed to send text to ${callerPhone}:`, err);
          });

        } // end smsOptIn check
      }
    }
  }
}


