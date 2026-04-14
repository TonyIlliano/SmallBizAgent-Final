/**
 * Twilio Webhook Routes
 *
 * Handles all inbound Twilio webhooks:
 * - POST /api/twilio/incoming-call
 * - POST /api/twilio/recording-callback
 * - POST /api/twilio/sms (keyword routing: STOP, HELP, CONFIRM, CANCEL, RESCHEDULE, BIRTHDAY, etc.)
 * - POST /api/twilio/appointment-callback
 * - POST /api/twilio/general-callback
 * - POST /api/twilio/voicemail-complete
 */

import { Router, Request, Response } from "express";
import twilio from "twilio";
import { storage } from "../storage";
import twilioService from "../services/twilioService";
import * as virtualReceptionistService from "../services/virtualReceptionistService";
import { logAndSwallow } from "../utils/safeAsync";

const router = Router();

// Twilio webhook signature validation middleware
const validateTwilioWebhook = (req: Request, res: Response, next: Function) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  // In production, warn loudly if auth token is missing — webhooks are unverified
  if (!authToken) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] TWILIO_AUTH_TOKEN not set — Twilio webhooks are NOT verified. Attackers can spoof calls/SMS.');
    }
    return next();
  }

  // Skip validation in development (localhost doesn't have valid signatures)
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  if (!twilioSignature) {
    console.error('[Twilio] Missing x-twilio-signature header — rejecting request');
    return res.status(403).send('Forbidden');
  }

  const baseUrl = process.env.APP_URL || process.env.BASE_URL || '';
  const url = `${baseUrl}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.error('[Twilio] Invalid webhook signature for', req.originalUrl);
    return res.status(403).send('Forbidden');
  }

  next();
};

// =================== TWILIO WEBHOOK ENDPOINTS ===================
// Twilio webhook for incoming calls
router.post("/api/twilio/incoming-call", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { From, Called, CallSid } = req.body;
    // Extract businessId from query params (set by Twilio webhook URL)
    const businessId = parseInt(req.query.businessId as string);
    if (!businessId) {
      console.error('Twilio webhook called without businessId');
      return res.status(400).json({ message: "Business ID required" });
    }

    // Fetch business and receptionist config
    const business = await storage.getBusiness(businessId);
    const config = await storage.getReceptionistConfig(businessId);

    if (!business || !config) {
      return res.status(404).json({ message: "Business or receptionist configuration not found" });
    }

    // Check if caller is an existing customer
    const customer = await storage.getCustomerByPhone(From, businessId);

    // Resolve which phone number was called for multi-line tracking
    let phoneNumberId: number | null = null;
    const phoneNumberUsed = Called || null;
    if (phoneNumberUsed) {
      try {
        const phoneRecord = await storage.getPhoneNumberByTwilioNumber(phoneNumberUsed);
        if (phoneRecord) {
          phoneNumberId = phoneRecord.id;
        }
      } catch (pnErr) {
        console.error('Error resolving phoneNumberId:', pnErr);
      }
    }

    // Create a call log entry
    await storage.createCallLog({
      businessId,
      callerId: From,
      callerName: customer ? `${customer.firstName} ${customer.lastName}` : "",
      transcript: null,
      intentDetected: null,
      isEmergency: false,
      callDuration: 0,
      recordingUrl: null,
      status: 'answered',
      callTime: new Date(),
      phoneNumberId,
      phoneNumberUsed,
    });

    // Build the greeting TwiML
    const gatherCallback = `/api/twilio/gather-callback?businessId=${businessId}&callSid=${CallSid}`;

    // Use our improved TwiML response with speech hints for better recognition
    const twimlString = twilioService.createGreetingTwiml(config.greeting || "Hello, thank you for calling. How can I help you today?", gatherCallback);

    res.type('text/xml');
    res.send(twimlString);
  } catch (error) {
    console.error('Error handling incoming call:', error);

    // Create a friendly fallback response if there's an error
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'alice' }, "Thank you for calling. We're experiencing some technical difficulties. Please try again in a few minutes.");
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Twilio webhook for recording callback
router.post("/api/twilio/recording-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { businessId, callSid } = req.query;
    const { RecordingUrl, RecordingDuration } = req.body;

    // Find the call log and update it
    const callLogs = await storage.getCallLogs(parseInt(businessId as string));
    const callLog = callLogs.find(log => log.callerId === req.body.From);

    if (callLog) {
      await storage.updateCallLog(callLog.id, {
        recordingUrl: RecordingUrl,
        callDuration: parseInt(RecordingDuration)
      });
    }

    // Simple response to acknowledge
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'alice' }, "Thank you for your call. Goodbye.");
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling recording callback:', error);
    res.status(500).json({ message: "Error handling recording callback" });
  }
});


// Twilio webhook for incoming SMS
router.post("/api/twilio/sms", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { From, Body, MessageSid } = req.body;
    const businessId = parseInt(req.query.businessId as string);
    if (!businessId) {
      console.error('SMS webhook called without businessId');
      return res.status(400).send('');
    }

    // Fetch business info
    const business = await storage.getBusiness(businessId);
    if (!business) {
      console.error(`SMS received for unknown business ID: ${businessId}`);
      return res.status(404).send('');
    }

    // Check if sender is an existing customer
    const customer = await storage.getCustomerByPhone(From, businessId);
    const bodyTrimmed = (Body || '').trim().toUpperCase();

    // ── TCPA: Handle STOP/UNSUBSCRIBE keywords ──
    // STOP opts out of MARKETING messages only (agents, promos, review requests).
    // Transactional messages (appointment reminders, confirmations, invoices) still go through
    // because those are expected service communications the customer needs.
    // We do NOT add to the suppression list — that blocks ALL sends at the Twilio layer.
    if (['STOP', 'UNSUBSCRIBE', 'END', 'QUIT'].includes(bodyTrimmed)) {
      if (customer) {
        await storage.updateCustomer(customer.id, {
          marketingOptIn: false,
        });
        console.log(`[SMS] Customer ${customer.id} opted out of marketing via STOP keyword (transactional SMS still active)`);
        // Cancel all pending marketing triggers for this customer
        import('../services/marketingTriggerEngine').then(({ cancelTriggersOnEvent }) => {
          cancelTriggersOnEvent(businessId, customer!.id, 'opted_out').catch(logAndSwallow('Routes'));
        }).catch(logAndSwallow('Routes'));
      }
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(`You've been unsubscribed from ${business.name} promotional messages. You'll still receive appointment reminders & confirmations. Reply START to re-subscribe to all messages.`);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // ── Handle START/SUBSCRIBE keywords (re-opt-in) ──
    if (['START', 'SUBSCRIBE', 'YES'].includes(bodyTrimmed)) {
      if (customer) {
        await storage.updateCustomer(customer.id, {
          smsOptIn: true,
          smsOptInDate: new Date(),
          smsOptInMethod: 'sms_keyword',
          marketingOptIn: true,
          marketingOptInDate: new Date(),
        });
        console.log(`[SMS] Customer ${customer.id} re-opted in via START keyword`);
      }
      // Also remove from suppression list if they were added previously (legacy cleanup)
      try {
        const { pool } = await import("../db");
        await pool.query(
          `DELETE FROM sms_suppression_list WHERE phone_number = $1 AND business_id = $2`,
          [From, businessId]
        );
      } catch (suppressionErr) {
        // Non-critical — suppression list is no longer used for STOP
      }
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(`You're subscribed to ${business.name} updates! Reply STOP to opt out. Msg & data rates may apply.`);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // ── TCPA: Handle HELP keyword ──
    if (bodyTrimmed === 'HELP') {
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(
        `${business.name}: For support, contact us at ${business.phone || 'our business number'} or email ${process.env.SUPPORT_EMAIL || 'support@smallbizagent.ai'}. ` +
        `Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`
      );
      console.log(`[SMS] HELP keyword received from ${From} for business ${businessId}`);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // ── Handle CONFIRM keyword (from appointment reminders) ──
    if (bodyTrimmed === 'CONFIRM' && customer) {
      try {
        const appointments = await storage.getAppointmentsByCustomerId(customer.id);
        const now = new Date();
        const upcoming = appointments
          .filter((apt: any) => new Date(apt.startDate) > now && (apt.status === 'scheduled' || apt.status === 'confirmed'))
          .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        if (upcoming.length > 1) {
          // Multiple appointments — disambiguate
          const allServices = await storage.getServices(businessId);
          const tz = business.timezone || 'America/New_York';
          const aptList = upcoming.map((apt: any, i: number) => {
            const d = new Date(apt.startDate);
            const dateStr = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
            const svc = apt.serviceId ? allServices.find((s: any) => s.id === apt.serviceId) : null;
            return { id: apt.id, dateStr, timeStr, serviceName: svc?.name || 'Appointment' };
          });
          const listText = aptList.map((a: any, i: number) => `${i + 1}. ${a.serviceName} - ${a.dateStr} at ${a.timeStr}`).join('\n');
          await storage.createSmsConversation({
            businessId,
            customerId: customer.id,
            customerPhone: From,
            agentType: 'disambiguation',
            state: 'disambiguating',
            context: { action: 'confirm', appointments: aptList },
            lastMessageSentAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });
          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`You have ${upcoming.length} upcoming appointments:\n${listText}\nWhich one? Reply 1-${upcoming.length}. - ${business.name}`);
          console.log(`[SMS] CONFIRM: disambiguating ${upcoming.length} appointments for customer ${customer.id}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        } else if (upcoming.length === 1) {
          const nextApt = upcoming[0];
          await storage.updateAppointment(nextApt.id, { status: 'confirmed' });
          const aptDate = new Date(nextApt.startDate);
          const biz = await storage.getBusiness(nextApt.businessId);
          const tz = biz?.timezone || 'America/New_York';
          const dateStr = aptDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
          const timeStr = aptDate.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`Your appointment on ${dateStr} at ${timeStr} is confirmed! See you then. - ${business.name}`);
          console.log(`[SMS] CONFIRM keyword: confirmed appointment ${nextApt.id} for customer ${customer.id}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        } else {
          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`Thanks for reaching out! We don't see any upcoming appointments for you. Call us at ${business.twilioPhoneNumber || business.phone || 'our number'} to book. - ${business.name}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        }
      } catch (confirmErr) {
        console.error('[SMS] Error handling CONFIRM:', confirmErr);
      }
    }

    // ── Handle C / CANCEL keyword (cancel next upcoming appointment) ──
    // IMPORTANT: Twilio Messaging Service intercepts plain "CANCEL" as a reserved opt-out keyword
    // and auto-replies with an unsubscribe message BEFORE this webhook fires.
    // SMS templates now tell customers to reply "C" (not "CANCEL") to avoid Twilio interception.
    // We still handle "CANCEL"/"CANCEL APPT" in case Twilio passes them through or the
    // Messaging Service opt-out config is updated to remove CANCEL.
    const isCancelRequest = bodyTrimmed === 'C' || bodyTrimmed === 'CANCEL' || bodyTrimmed === 'CANCEL APPT' || bodyTrimmed === 'CANCEL APPOINTMENT' || bodyTrimmed === 'CANCEL APT';
    if (isCancelRequest && customer) {
      try {
        const appointments = await storage.getAppointmentsByCustomerId(customer.id);
        const now = new Date();
        const upcoming = appointments
          .filter((apt: any) => new Date(apt.startDate) > now && (apt.status === 'scheduled' || apt.status === 'confirmed'))
          .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        if (upcoming.length > 1) {
          // Multiple appointments — disambiguate
          const allServices = await storage.getServices(businessId);
          const tz = business.timezone || 'America/New_York';
          const aptList = upcoming.map((apt: any, i: number) => {
            const d = new Date(apt.startDate);
            const dateStr = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
            const svc = apt.serviceId ? allServices.find((s: any) => s.id === apt.serviceId) : null;
            return { id: apt.id, dateStr, timeStr, serviceName: svc?.name || 'Appointment' };
          });
          const listText = aptList.map((a: any, i: number) => `${i + 1}. ${a.serviceName} - ${a.dateStr} at ${a.timeStr}`).join('\n');
          await storage.createSmsConversation({
            businessId,
            customerId: customer.id,
            customerPhone: From,
            agentType: 'disambiguation',
            state: 'disambiguating',
            context: { action: 'cancel', appointments: aptList },
            lastMessageSentAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });
          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`Which appointment would you like to cancel?\n${listText}\nReply 1-${upcoming.length}. - ${business.name}`);
          console.log(`[SMS] CANCEL: disambiguating ${upcoming.length} appointments for customer ${customer.id}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        } else if (upcoming.length === 1) {
          const nextApt = upcoming[0];
          const aptDate = new Date(nextApt.startDate);
          const biz = await storage.getBusiness(nextApt.businessId);
          const tz = biz?.timezone || 'America/New_York';
          const dateStr = aptDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
          const timeStr = aptDate.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

          await storage.updateAppointment(nextApt.id, {
            status: 'cancelled',
            notes: `${nextApt.notes || ''}\n[Cancelled via SMS on ${new Date().toLocaleDateString()}]`.trim()
          });

          // Dispatch cancellation event for insights recalculation
          import('../services/orchestrationService').then(mod => {
            mod.dispatchEvent('appointment.cancelled', {
              businessId: nextApt.businessId,
              customerId: customer.id,
              referenceType: 'appointment',
              referenceId: nextApt.id,
            }).catch(err => console.error('[Orchestrator] Error dispatching appointment.cancelled:', err));
          }).catch(err => console.error('[Orchestrator] Import error:', err));

          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`Your appointment on ${dateStr} at ${timeStr} has been cancelled. To rebook, reply RESCHEDULE or call ${business.twilioPhoneNumber || business.phone || 'us'}. - ${business.name}`);
          console.log(`[SMS] CANCEL keyword: cancelled appointment ${nextApt.id} for customer ${customer.id}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        } else {
          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`We don't see any upcoming appointments for you to cancel. Call us at ${business.twilioPhoneNumber || business.phone || 'our number'} if you need help. - ${business.name}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        }
      } catch (cancelErr) {
        console.error('[SMS] Error handling CANCEL:', cancelErr);
      }
    }

    // ── Handle RESCHEDULE keyword (conversational AI rescheduling via LangGraph) ──
    // Creates an SMS conversation and routes through the Reply Intelligence Graph
    // for AI-powered date/time parsing, availability checking, and direct DB updates.
    // Falls back to manage link if graph is unavailable.
    if (bodyTrimmed === 'RESCHEDULE' && customer) {
      try {
        const appointments = await storage.getAppointmentsByCustomerId(customer.id);
        const now = new Date();
        const upcoming = appointments
          .filter((apt: any) => new Date(apt.startDate) > now && (apt.status === 'scheduled' || apt.status === 'confirmed'))
          .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';

        if (upcoming.length > 1) {
          // Multiple appointments — disambiguate first, then reschedule
          const allServices = await storage.getServices(businessId);
          const tz = business.timezone || 'America/New_York';
          const aptList = upcoming.map((apt: any, i: number) => {
            const d = new Date(apt.startDate);
            const dateStr = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
            const svc = apt.serviceId ? allServices.find((s: any) => s.id === apt.serviceId) : null;
            return { id: apt.id, dateStr, timeStr, serviceName: svc?.name || 'Appointment' };
          });
          const listText = aptList.map((a: any, i: number) => `${i + 1}. ${a.serviceName} - ${a.dateStr} at ${a.timeStr}`).join('\n');
          await storage.createSmsConversation({
            businessId,
            customerId: customer.id,
            customerPhone: From,
            agentType: 'disambiguation',
            state: 'disambiguating',
            context: { action: 'reschedule', appointments: aptList },
            lastMessageSentAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });
          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`Which appointment would you like to reschedule?\n${listText}\nReply 1-${upcoming.length}. - ${business.name}`);
          console.log(`[SMS] RESCHEDULE: disambiguating ${upcoming.length} appointments for customer ${customer.id}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        } else if (upcoming.length === 1) {
          const nextApt = upcoming[0];
          const aptDate = new Date(nextApt.startDate);
          const tz = business.timezone || 'America/New_York';
          const dateStr = aptDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
          const timeStr = aptDate.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
          const svc = nextApt.serviceId ? (await storage.getService(nextApt.serviceId))?.name : null;

          // Create reschedule conversation — next reply routes through AI graph
          await storage.createSmsConversation({
            businessId,
            customerId: customer.id,
            customerPhone: From,
            agentType: 'reschedule',
            referenceType: 'appointment',
            referenceId: nextApt.id,
            state: 'reschedule_awaiting',
            context: {
              appointmentId: nextApt.id,
              oldDate: dateStr,
              oldTime: timeStr,
              serviceName: svc || 'Appointment',
            },
            lastMessageSentAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });

          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`Sure! Your current appointment is ${dateStr} at ${timeStr}. What day and time works better for you? - ${business.name}`);
          console.log(`[SMS] RESCHEDULE keyword: created reschedule conversation for appointment ${nextApt.id}, customer ${customer.id}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        } else {
          // No upcoming appointment — send booking link
          let bookLink = '';
          if (business.bookingSlug) {
            bookLink = ` Book here: ${appUrl}/book/${business.bookingSlug}`;
          }
          const twiml = new twilio.twiml.MessagingResponse();
          twiml.message(`We don't see any upcoming appointments to reschedule.${bookLink} Or call us at ${business.twilioPhoneNumber || business.phone || 'our number'}. - ${business.name}`);
          res.type('text/xml');
          return res.send(twiml.toString());
        }
      } catch (rescheduleErr) {
        console.error('[SMS] Error handling RESCHEDULE:', rescheduleErr);
      }
    }

    // ── Handle BIRTHDAY text-in (e.g., "BIRTHDAY 03-15" or "BIRTHDAY March 15") ──
    const birthdayMatch = (Body || '').trim().match(/^birthday\s+(\d{1,2})[\/\-](\d{1,2})$/i) ||
                          (Body || '').trim().match(/^birthday\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})$/i);
    if (birthdayMatch && customer) {
      let month: string, day: string;
      const monthNames: Record<string, string> = {
        january: '01', february: '02', march: '03', april: '04',
        may: '05', june: '06', july: '07', august: '08',
        september: '09', october: '10', november: '11', december: '12'
      };
      if (monthNames[birthdayMatch[1].toLowerCase()]) {
        month = monthNames[birthdayMatch[1].toLowerCase()];
        day = birthdayMatch[2].padStart(2, '0');
      } else {
        month = birthdayMatch[1].padStart(2, '0');
        day = birthdayMatch[2].padStart(2, '0');
      }
      const birthday = `${month}-${day}`;
      await storage.updateCustomer(customer.id, { birthday });
      console.log(`[SMS] Customer ${customer.id} set birthday to ${birthday} via text`);

      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(`Thanks, ${customer.firstName}! We saved your birthday (${month}/${day}). Look out for a special treat from ${business.name}! 🎂`);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Log the SMS as a call log entry with 'sms' status
    await storage.createCallLog({
      businessId,
      callerId: From,
      callerName: customer ? `${customer.firstName} ${customer.lastName}` : "",
      transcript: Body,
      intentDetected: 'sms',
      isEmergency: false,
      callDuration: 0,
      recordingUrl: null,
      status: 'sms' as any,
      callTime: new Date()
    });

    // ── Check for active SMS agent conversation from this phone ──
    try {
      const activeConversation = await storage.getActiveSmsConversation(From, businessId);
      if (activeConversation) {
        const { routeConversationReply } = await import('../services/smsConversationRouter');
        const handled = await routeConversationReply(activeConversation, Body, customer ?? undefined, businessId);
        if (handled) {
          // Sanitize AI-generated replies to strip any internal reasoning that may have leaked
          let sanitizedReply = handled.replyMessage;
          sanitizedReply = sanitizedReply.replace(/\s*\((?:Note|Internal|System|Debug|Reminder|Context|Warning|TODO|IMPORTANT)[:\s][^)]*\)/gi, '');
          sanitizedReply = sanitizedReply.replace(/\s*\[(?:Note|Internal|System|Debug|Reminder|Context|Warning|TODO|IMPORTANT)[:\s][^\]]*\]/gi, '');
          sanitizedReply = sanitizedReply.replace(/  +/g, ' ').trim();
          const agentTwiml = new twilio.twiml.MessagingResponse();
          agentTwiml.message(sanitizedReply);
          res.type('text/xml');
          return res.send(agentTwiml.toString());
        }
      }
    } catch (convErr) {
      console.error('[SMS] Error checking agent conversations:', convErr);
    }

    // TODO: Phase 9 — Claude Managed Agent SMS Intelligence will handle freeform text here
    // For now, fall through to generic auto-reply

    // Generate TwiML response for SMS (generic auto-reply)
    const twiml = new twilio.twiml.MessagingResponse();

    // Auto-reply with business hours or acknowledgment
    const config = await storage.getReceptionistConfig(businessId);
    if (config) {
      twiml.message(`Thank you for your message! We'll get back to you as soon as possible. ${business.name}`);
    } else {
      twiml.message(`Thank you for contacting ${business.name}. We'll respond shortly.`);
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling incoming SMS:', error);
    // Return empty response to prevent Twilio retries
    res.type('text/xml');
    res.send('<Response></Response>');
  }
});

// Twilio webhook for appointment scheduling callback
router.post("/api/twilio/appointment-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { businessId, callSid } = req.query;
    const { SpeechResult, From } = req.body;
    const parsedBusinessId = parseInt(businessId as string);
    if (!parsedBusinessId) {
      console.error('Appointment callback called without businessId');
      return res.status(400).send('');
    }

    const twiml = new twilio.twiml.VoiceResponse();
    const userInput = (SpeechResult || '').toLowerCase();

    // Check if user is saying "no" to correct - extract the actual day they want
    // e.g., "no tuesday" or "no, not tomorrow, tuesday" should extract "tuesday"
    const isCorrection = userInput.includes('no') || userInput.includes('not');

    // Get business and customer info
    const business = await storage.getBusiness(parsedBusinessId);
    const customer = await storage.getCustomerByPhone(From, parsedBusinessId);

    // Parse time preference from speech
    let preferredTime: Date | null = null;
    let timeDescription = '';

    // Helper to get next occurrence of a day of week
    const getNextDayOfWeek = (dayName: string): Date => {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = new Date();
      const todayDay = today.getDay();
      const targetDay = days.indexOf(dayName.toLowerCase());

      if (targetDay === -1) return today;

      let daysUntil = targetDay - todayDay;
      if (daysUntil <= 0) daysUntil += 7; // Always schedule for next week if today or past

      const result = new Date(today);
      result.setDate(result.getDate() + daysUntil);
      return result;
    };

    // Helper to format date nicely
    const formatDate = (date: Date): string => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    };

    const now = new Date();

    // Helper to parse month names
    const parseMonth = (monthStr: string): number => {
      const months: { [key: string]: number } = {
        'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
        'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
        'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
        'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
      };
      return months[monthStr.toLowerCase()] ?? -1;
    };

    // Check for specific dates like "February 3rd" or "March 15"
    const dateMatch = userInput.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);

    // Check for days of the week
    const dayMatches = userInput.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    let targetDate: Date | null = null;

    if (dateMatch) {
      // Specific date like "February 3rd"
      const month = parseMonth(dateMatch[1]);
      const day = parseInt(dateMatch[2]);
      targetDate = new Date(now.getFullYear(), month, day);
      // If the date has passed this year, schedule for next year
      if (targetDate < now) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
    } else if (dayMatches) {
      targetDate = getNextDayOfWeek(dayMatches[1]);
    } else if (userInput.includes('tomorrow')) {
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (userInput.includes('today')) {
      targetDate = new Date(now);
    } else if (userInput.includes('next week')) {
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 7);
    }

    // Parse time of day
    let hour = 9; // Default to 9 AM
    let timeOfDay = 'at 9 AM';

    // Check for specific times
    const timeMatch = userInput.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      const isPM = timeMatch[3] && timeMatch[3].toLowerCase().includes('p');
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      const minutes = timeMatch[2] ? `:${timeMatch[2]}` : '';
      timeOfDay = `at ${timeMatch[1]}${minutes} ${isPM ? 'PM' : 'AM'}`;
    } else if (userInput.includes('morning')) {
      hour = 9;
      timeOfDay = 'in the morning at 9 AM';
    } else if (userInput.includes('afternoon')) {
      hour = 14;
      timeOfDay = 'in the afternoon at 2 PM';
    } else if (userInput.includes('evening')) {
      hour = 17;
      timeOfDay = 'in the evening at 5 PM';
    } else if (userInput.includes('noon') || userInput.includes('lunch')) {
      hour = 12;
      timeOfDay = 'at noon';
    }

    // If we have a target date, set the time
    if (targetDate) {
      preferredTime = new Date(targetDate);
      preferredTime.setHours(hour, 0, 0, 0);
      timeDescription = `${formatDate(preferredTime)} ${timeOfDay}`;
    } else if (timeMatch || userInput.includes('morning') || userInput.includes('afternoon') || userInput.includes('evening')) {
      // Time specified but no day - default to tomorrow
      preferredTime = new Date(now);
      preferredTime.setDate(preferredTime.getDate() + 1);
      preferredTime.setHours(hour, 0, 0, 0);
      timeDescription = `tomorrow ${timeOfDay}`;
    }

    // Check if user is confirming a previously proposed time
    const isConfirming = userInput.includes('yes') || userInput.includes('correct') ||
                         userInput.includes('that\'s right') || userInput.includes('confirm') ||
                         userInput.includes('sounds good') || userInput.includes('perfect');

    // Get pending appointment from query params (if confirming)
    const pendingTime = req.query.pendingTime as string;
    const pendingTimeDescription = req.query.pendingDesc as string;

    if (isConfirming && pendingTime && customer) {
      // User confirmed - now actually book the appointment
      const confirmedTime = new Date(pendingTime);
      const endTime = new Date(confirmedTime);
      endTime.setHours(endTime.getHours() + 1);

      const result = await virtualReceptionistService.processAppointmentRequest(
        parsedBusinessId,
        customer.id,
        {
          startDate: confirmedTime,
          endDate: endTime,
          notes: `Booked via phone call from ${From}`
        },
        { transcript: SpeechResult, callSid }
      );

      if (result.success) {
        twiml.say({ voice: 'alice' },
          `Your appointment has been confirmed for ${decodeURIComponent(pendingTimeDescription || '')}. You'll receive a text confirmation shortly. Is there anything else I can help you with?`
        );

        // Send SMS confirmation
        if (From && business) {
          try {
            await twilioService.sendSms(From,
              `Your appointment with ${business.name} is confirmed for ${decodeURIComponent(pendingTimeDescription || '')}. Reply CONFIRM, RESCHEDULE to change, or C to cancel.`
            );
          } catch (smsError) {
            console.error('Error sending appointment confirmation SMS:', smsError);
          }
        }

        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/general-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else {
        twiml.say({ voice: 'alice' },
          `I'm sorry, there was a problem booking that time. Would you like to try a different time?`
        );
        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      }
    } else if (preferredTime && customer) {
      // We parsed a time - ask for confirmation before booking
      twiml.say({ voice: 'alice' },
        `I have ${timeDescription}. Is that correct?`
      );

      // Pass the pending time in the callback URL for confirmation
      twiml.gather({
        input: ['speech', 'dtmf'],
        action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}&pendingTime=${encodeURIComponent(preferredTime.toISOString())}&pendingDesc=${encodeURIComponent(timeDescription)}`,
        speechTimeout: 'auto',
        speechModel: 'phone_call'
      });
    } else if (preferredTime && !customer) {
      // We have a time but need to create customer first
      const newCustomer = await storage.createCustomer({
        businessId: parsedBusinessId,
        firstName: 'New',
        lastName: 'Caller',
        phone: From,
        email: '',
        address: '',
        notes: 'Created via phone call'
      });

      twiml.say({ voice: 'alice' },
        `I have ${timeDescription}. Is that correct?`
      );

      twiml.gather({
        input: ['speech', 'dtmf'],
        action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}&pendingTime=${encodeURIComponent(preferredTime.toISOString())}&pendingDesc=${encodeURIComponent(timeDescription)}`,
        speechTimeout: 'auto',
        speechModel: 'phone_call'
      });
    } else if (!preferredTime && (userInput.includes('no') || userInput.includes('different'))) {
      // User wants a different time
      twiml.say({ voice: 'alice' },
        `No problem. What day and time would work better for you?`
      );
      twiml.gather({
        input: ['speech', 'dtmf'],
        action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
        speechTimeout: 'auto',
        speechModel: 'phone_call'
      });
    } else if (!customer) {
      // No customer record - create one and ask for time
      const newCustomer = await storage.createCustomer({
        businessId: parsedBusinessId,
        firstName: 'New',
        lastName: 'Caller',
        phone: From,
        email: '',
        address: '',
        notes: 'Created via phone call'
      });

      twiml.say({ voice: 'alice' },
        `I've created a new account for you. What day and time would work best for your appointment? For example, you can say Tuesday February 4th at 2 PM.`
      );

      twiml.gather({
        input: ['speech', 'dtmf'],
        action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
        speechTimeout: 'auto',
        speechModel: 'phone_call'
      });
    } else {
      // Couldn't parse time - ask again with examples
      twiml.say({ voice: 'alice' },
        `I didn't catch that. What day and time would you like? For example, you can say Monday at 10 AM, or February 5th at 3 PM.`
      );

      twiml.gather({
        input: ['speech', 'dtmf'],
        action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
        speechTimeout: 'auto',
        speechModel: 'phone_call'
      });
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling appointment callback:', error);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'alice' },
      "I'm sorry, I'm having trouble with the scheduling system. Please try calling back later or visit our website to book online."
    );
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Twilio webhook for general conversation callback
router.post("/api/twilio/general-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { businessId, callSid } = req.query;
    const { SpeechResult, From } = req.body;
    const parsedBusinessId = parseInt(businessId as string);
    if (!parsedBusinessId) {
      console.error('General callback called without businessId');
      return res.status(400).send('');
    }

    const twiml = new twilio.twiml.VoiceResponse();
    const userInput = (SpeechResult || '').toLowerCase();

    // Check if user is trying to correct/reschedule (contains day/time references with "no")
    const hasTimeReference = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|morning|afternoon|evening|noon|\d{1,2}\s*(am|pm)?)\b/i.test(userInput);
    const isCorrection = userInput.includes('no') && hasTimeReference;

    // Check if user is done - but not if they're correcting a time
    if (!isCorrection && (userInput.includes('that\'s all') ||
        userInput.includes('nothing') || userInput.includes('bye') ||
        userInput.includes('goodbye') || userInput.includes('thank you') ||
        (userInput === 'no') || userInput.includes('no thank'))) {
      twiml.say({ voice: 'alice' },
        "Thank you for calling. Have a great day! Goodbye."
      );
      twiml.hangup();
    } else if (isCorrection || userInput.includes('appointment') ||
               userInput.includes('schedule') || userInput.includes('book') ||
               hasTimeReference) {
      // User is correcting time or wants to schedule - redirect to appointment flow
      // Redirect to appointment flow
      twiml.say({ voice: 'alice' },
        "I'd be happy to help you schedule an appointment. What day and time works best for you?"
      );

      twiml.gather({
        input: ['speech', 'dtmf'],
        action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
        speechTimeout: 'auto',
        speechModel: 'phone_call'
      });
    } else {
      // Route through the main gather callback for other intents
      twiml.redirect({
        method: 'POST'
      }, `/api/twilio/gather-callback?businessId=${parsedBusinessId}&callSid=${callSid}`);
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling general callback:', error);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'alice' }, "Thank you for your call. Goodbye.");
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Twilio webhook for voicemail completion - send notification to business
router.post("/api/twilio/voicemail-complete", validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.query;
    const { RecordingUrl, RecordingSid, RecordingDuration, TranscriptionText, From } = req.body;
    const parsedBusinessId = parseInt(businessId as string);
    if (!parsedBusinessId) {
      console.error('Voicemail callback called without businessId');
      return res.status(400).send('');
    }

    // Get business info for notification
    const business = await storage.getBusiness(parsedBusinessId);
    const customer = await storage.getCustomerByPhone(From, parsedBusinessId);

    // Update the call log with voicemail info
    const callLogs = await storage.getCallLogs(parsedBusinessId);
    const callLog = callLogs.find(log => log.callerId === From);

    if (callLog) {
      await storage.updateCallLog(callLog.id, {
        recordingUrl: RecordingUrl,
        callDuration: parseInt(RecordingDuration) || 0,
        transcript: TranscriptionText || callLog.transcript,
        status: 'voicemail'
      });
    }

    // Send SMS notification to business owner if configured
    const callerName = customer ? `${customer.firstName} ${customer.lastName}` : undefined;
    if (business?.phone) {
      const displayName = callerName || From;
      const message = `New voicemail from ${displayName}. Duration: ${RecordingDuration}s. ${TranscriptionText ? `Message: "${TranscriptionText.substring(0, 100)}..."` : 'Listen at: ' + RecordingUrl}`;

      try {
        await twilioService.sendSms(business.phone, message);
      } catch (smsError) {
        console.error('Error sending voicemail notification:', smsError);
      }
    }

    // Send email notification for missed call (fire-and-forget)
    import('../services/ownerNotificationService').then(mod => {
      mod.notifyOwnerMissedCall(parsedBusinessId, From, callerName || undefined)
        .catch(err => console.error('[OwnerNotify] Missed call alert error:', err));
    }).catch(err => console.error('[OwnerNotify] Import error:', err));

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling voicemail complete:', error);
    res.status(500).send('Error');
  }
});

export default router;
