import { claudeJson } from './claudeClient';
import { storage } from '../storage';
import { logAgentAction } from './agentActivityService';
import { createDateInTimezone, formatTimeWithTimezone } from '../utils/timezone';
import { fireEvent } from './webhookService';
import notificationService from './notificationService';
import { classifyReply, isStopRequest } from './smsReplyParser';
import crypto from 'crypto';
import type { SmsConversation, Customer, Staff, Service, Business } from '@shared/schema';
import { logAndSwallow } from '../utils/safeAsync';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingIntent {
  type: 'date_time' | 'staff_preference' | 'service_preference' | 'confirmation' | 'decline' | 'change_mind' | 'ambiguous';
  date?: string;         // YYYY-MM-DD
  time?: string;         // HH:MM 24h
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  staffName?: string;
  serviceName?: string;
  confirmed?: boolean;
  slotSelection?: number; // 1-based index
  propertyAddress?: string; // For field service businesses (landscaping, plumbing, HVAC, etc.)
}

interface BookingPreferences {
  date?: string;
  time?: string;
  staffId?: number;
  staffName?: string;
  serviceId?: number;
  serviceName?: string;
  propertyAddress?: string;
}

interface AvailableSlot {
  date: string;
  time: string;
  displayTime: string;
  displayDate: string;
  staffId: number;
  staffName: string;
}

interface BookingFlowContext {
  step: 'asking_preferences' | 'offering_slots' | 'confirming_booking' | 'selecting_staff' | 'selecting_service';
  preferences: BookingPreferences;
  offeredSlots?: AvailableSlot[];
  offeredOptions?: Array<{ id: number; name: string }>;
  originalAppointmentId?: number;
  originalServiceId?: number;
  originalStaffId?: number;
  turnCount: number;
  lastAgentMessage?: string;
}

// ─── Eligibility Check ──────────────────────────────────────────────────────

export async function canStartConversationalBooking(businessId: number): Promise<boolean> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return false;

    const business = await storage.getBusiness(businessId);
    if (!business?.bookingEnabled) return false;

    const services = await storage.getServices(businessId);
    const activeServices = services.filter(s => s.active);
    if (activeServices.length === 0) return false;

    const staff = await storage.getStaff(businessId);
    const activeStaff = staff.filter(s => s.active);
    if (activeStaff.length === 0) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── Initialize Booking Conversation ────────────────────────────────────────

export async function initializeBookingConversation(
  conversation: SmsConversation,
  customer: Customer | undefined,
  businessId: number,
  options?: { originalAppointmentId?: number },
): Promise<{ replyMessage: string }> {
  const business = await storage.getBusiness(businessId);
  const preferences: BookingPreferences = {};
  let promptMessage: string;

  // If this is a no-show reschedule, pre-populate preferences from original appointment
  if (options?.originalAppointmentId) {
    const originalAppt = await storage.getAppointment(options.originalAppointmentId);
    if (originalAppt) {
      if (originalAppt.serviceId) {
        const service = await storage.getService(originalAppt.serviceId);
        if (service) {
          preferences.serviceId = service.id;
          preferences.serviceName = service.name;
        }
      }
      if (originalAppt.staffId) {
        const staffMember = await storage.getStaffMember(originalAppt.staffId);
        if (staffMember?.active) {
          preferences.staffId = staffMember.id;
          preferences.staffName = staffMember.firstName;
        }
      }
    }
  }

  // Build personalized prompt
  const name = customer?.firstName || 'there';
  const industry = (business?.industry || '').toLowerCase();
  const isFieldService = industry.includes('landscap') || industry.includes('lawn') || industry.includes('plumb') || industry.includes('hvac') || industry.includes('electric') || industry.includes('clean') || industry.includes('handyman');

  if (preferences.serviceName && preferences.staffName) {
    promptMessage = `Hi ${name}! When would you like to reschedule your ${preferences.serviceName} with ${preferences.staffName}? Just tell me a day and time, like "Tuesday at 2pm".`;
  } else if (preferences.serviceName) {
    promptMessage = `Hi ${name}! When would you like to reschedule your ${preferences.serviceName}? Just tell me a day and time, like "Tuesday at 2pm".`;
  } else if (isFieldService) {
    promptMessage = `Hi ${name}! When works for you? Tell me a day and time, like "Tuesday at 2pm". Also, what's the property address where we'll be working?`;
  } else {
    promptMessage = `Hi ${name}! When works for you? Just tell me a day and time, like "Tuesday at 2pm".`;
  }

  const bookingFlow: BookingFlowContext = {
    step: 'asking_preferences',
    preferences,
    originalAppointmentId: options?.originalAppointmentId,
    turnCount: 0,
    lastAgentMessage: promptMessage,
  };

  // Preserve existing context and add booking flow
  const existingContext = (conversation.context as Record<string, any>) ?? {};
  await storage.updateSmsConversation(conversation.id, {
    state: 'collecting_preferences',
    context: { ...existingContext, bookingFlow },
  });

  return { replyMessage: promptMessage };
}

// ─── Main Conversation Handler ──────────────────────────────────────────────

export async function handleBookingConversation(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  const business = await storage.getBusiness(businessId);
  if (!business) return null;

  const context = (conversation.context as Record<string, any>) ?? {};
  const bookingFlow: BookingFlowContext = context.bookingFlow ?? {
    step: 'asking_preferences',
    preferences: {},
    turnCount: 0,
  };

  // Increment turn count
  bookingFlow.turnCount += 1;

  // Turn limit — fall back to booking link
  if (bookingFlow.turnCount > 8) {
    const link = business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '';
    const fallbackMsg = link
      ? `Looks like we're going back and forth! You can book directly here: ${link} or call us at ${business.phone || 'our office'}.`
      : `Looks like we're going back and forth! Give us a call at ${business.phone || 'our office'} to book.`;

    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    await logAgentAction({
      businessId,
      agentType: conversation.agentType,
      action: 'booking_fallback',
      customerId: customer?.id,
      details: { reason: 'turn_limit_exceeded', turnCount: bookingFlow.turnCount },
    });
    return { replyMessage: fallbackMsg };
  }

  // Quick decline check (before calling OpenAI)
  const upperMsg = messageBody.trim().toUpperCase();
  const stopWords = ['STOP', 'UNSUBSCRIBE', 'END', 'QUIT'];
  if (stopWords.includes(upperMsg)) {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    if (customer?.id) {
      try { await storage.updateCustomer(customer.id, { marketingOptIn: false }); } catch (err) { console.error('[ConversationalBooking] Error:', err instanceof Error ? err.message : err); }
    }
    return { replyMessage: `You've been unsubscribed from ${business.name} promotional messages. You'll still receive appointment reminders & confirmations. Reply START to re-subscribe.` };
  }
  const quickDeclineWords = ['CANCEL', 'NEVERMIND', 'NEVER MIND', 'FORGET IT'];
  if (quickDeclineWords.some(w => upperMsg === w)) {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    return { replyMessage: `No problem! We'll be here when you're ready. - ${business.name}` };
  }

  try {
    const services = await storage.getServices(businessId);
    const activeServices = services.filter(s => s.active);
    const staff = await storage.getStaff(businessId);
    const activeStaff = staff.filter(s => s.active);

    // Auto-select service if only one exists
    if (!bookingFlow.preferences.serviceId && activeServices.length === 1) {
      bookingFlow.preferences.serviceId = activeServices[0].id;
      bookingFlow.preferences.serviceName = activeServices[0].name;
    }

    const step = bookingFlow.step;

    if (step === 'asking_preferences' || step === 'selecting_staff' || step === 'selecting_service') {
      return await handleCollectingPreferences(
        conversation, messageBody, customer, business,
        bookingFlow, activeServices, activeStaff, context,
      );
    }

    if (step === 'offering_slots') {
      return await handleOfferingSlots(
        conversation, messageBody, customer, business,
        bookingFlow, activeServices, activeStaff, context,
      );
    }

    if (step === 'confirming_booking') {
      return await handleConfirmingBooking(
        conversation, messageBody, customer, business,
        bookingFlow, context,
      );
    }

    // Unknown step — reset to collecting
    bookingFlow.step = 'asking_preferences';
    return await handleCollectingPreferences(
      conversation, messageBody, customer, business,
      bookingFlow, activeServices, activeStaff, context,
    );
  } catch (err) {
    console.error('[ConversationalBooking] Error:', err);
    // OpenAI or other failure — fall back to booking link
    const link = business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '';
    const fallbackMsg = link
      ? `Sorry about that! You can book online here: ${link}`
      : `Sorry about that! Give us a call at ${business.phone || 'our office'} to book.`;
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    return { replyMessage: fallbackMsg };
  }
}

// ─── Step Handlers ──────────────────────────────────────────────────────────

async function handleCollectingPreferences(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  business: Business,
  bookingFlow: BookingFlowContext,
  activeServices: Service[],
  activeStaff: Staff[],
  existingContext: Record<string, any>,
): Promise<{ replyMessage: string }> {
  const intent = await parseBookingIntent(messageBody, bookingFlow, {
    name: business.name,
    timezone: business.timezone || 'America/New_York',
    services: activeServices.map(s => ({ id: s.id, name: s.name })),
    staff: activeStaff.map(s => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })),
  });

  // Handle decline
  if (intent.type === 'decline') {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    return { replyMessage: `No problem! We'll be here when you're ready. - ${business.name}` };
  }

  // Handle change of mind — reset preferences
  if (intent.type === 'change_mind') {
    bookingFlow.preferences = {};
    if (activeServices.length === 1) {
      bookingFlow.preferences.serviceId = activeServices[0].id;
      bookingFlow.preferences.serviceName = activeServices[0].name;
    }
    bookingFlow.step = 'asking_preferences';
    const msg = 'No problem! What day and time works better for you?';
    bookingFlow.lastAgentMessage = msg;
    await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
    return { replyMessage: msg };
  }

  // Handle staff preference
  if (intent.type === 'staff_preference' && intent.staffName) {
    const match = matchStaffByName(intent.staffName, activeStaff);
    if (match.exact) {
      bookingFlow.preferences.staffId = match.exact.id;
      bookingFlow.preferences.staffName = match.exact.firstName;

      // If we also got date/time, proceed to slots
      if (intent.date) {
        bookingFlow.preferences.date = intent.date;
        if (intent.time) bookingFlow.preferences.time = intent.time;
        return await tryFindSlots(conversation, business, bookingFlow, activeServices, activeStaff, existingContext, intent);
      }

      const msg = `Got it, ${match.exact.firstName}! What day and time works for you?`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
    if (match.partial.length > 1) {
      bookingFlow.step = 'selecting_staff';
      bookingFlow.offeredOptions = match.partial.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim() }));
      const names = match.partial.map((s, i) => `${i + 1}) ${s.firstName} ${s.lastName}`.trim()).join('\n');
      const msg = `We have a few team members with that name:\n${names}\nWhich one? Reply with a number.`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
    // No match
    const staffList = activeStaff.map(s => s.firstName).join(', ');
    const msg = `I couldn't find that name. Our team includes: ${staffList}. Who would you prefer, or just tell me a day and time?`;
    bookingFlow.lastAgentMessage = msg;
    await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
    return { replyMessage: msg };
  }

  // Handle selecting from offered staff options
  if (bookingFlow.step === 'selecting_staff' && bookingFlow.offeredOptions) {
    const selection = parseSelectionNumber(messageBody, bookingFlow.offeredOptions.length);
    if (selection !== null) {
      const selected = bookingFlow.offeredOptions[selection - 1];
      bookingFlow.preferences.staffId = selected.id;
      bookingFlow.preferences.staffName = selected.name.split(' ')[0];
      bookingFlow.step = 'asking_preferences';
      bookingFlow.offeredOptions = undefined;
      const msg = `Got it, ${bookingFlow.preferences.staffName}! What day and time works for you?`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
  }

  // Handle service preference
  if (intent.type === 'service_preference' && intent.serviceName) {
    const match = matchServiceByName(intent.serviceName, activeServices);
    if (match.exact) {
      bookingFlow.preferences.serviceId = match.exact.id;
      bookingFlow.preferences.serviceName = match.exact.name;

      if (intent.date) {
        bookingFlow.preferences.date = intent.date;
        if (intent.time) bookingFlow.preferences.time = intent.time;
        return await tryFindSlots(conversation, business, bookingFlow, activeServices, activeStaff, existingContext, intent);
      }

      const msg = `${match.exact.name}, got it! What day and time works for you?`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
    if (match.partial.length > 1) {
      bookingFlow.step = 'selecting_service';
      bookingFlow.offeredOptions = match.partial.map(s => ({ id: s.id, name: s.name }));
      const list = match.partial.map((s, i) => `${i + 1}) ${s.name}${s.price ? ` ($${s.price})` : ''}`).join('\n');
      const msg = `Which service?\n${list}\nReply with a number.`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
  }

  // Handle selecting from offered service options
  if (bookingFlow.step === 'selecting_service' && bookingFlow.offeredOptions) {
    const selection = parseSelectionNumber(messageBody, bookingFlow.offeredOptions.length);
    if (selection !== null) {
      const selected = bookingFlow.offeredOptions[selection - 1];
      bookingFlow.preferences.serviceId = selected.id;
      bookingFlow.preferences.serviceName = selected.name;
      bookingFlow.step = 'asking_preferences';
      bookingFlow.offeredOptions = undefined;
      const msg = `${selected.name}, got it! What day and time works for you?`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
  }

  // Capture property address if provided (field service businesses)
  if (intent.propertyAddress && !bookingFlow.preferences.propertyAddress) {
    bookingFlow.preferences.propertyAddress = intent.propertyAddress;
  }

  // Handle date/time
  if (intent.type === 'date_time' && intent.date) {
    bookingFlow.preferences.date = intent.date;
    if (intent.time) bookingFlow.preferences.time = intent.time;

    // Also pick up any staff/service mentions in the same message
    if (intent.staffName && !bookingFlow.preferences.staffId) {
      const staffMatch = matchStaffByName(intent.staffName, activeStaff);
      if (staffMatch.exact) {
        bookingFlow.preferences.staffId = staffMatch.exact.id;
        bookingFlow.preferences.staffName = staffMatch.exact.firstName;
      }
    }

    // If we still need a service and there are multiple
    if (!bookingFlow.preferences.serviceId && activeServices.length > 1) {
      bookingFlow.step = 'selecting_service';
      bookingFlow.offeredOptions = activeServices.map(s => ({ id: s.id, name: s.name }));
      const list = activeServices.map((s, i) => `${i + 1}) ${s.name}${s.price ? ` ($${s.price})` : ''}`).join('\n');
      const msg = `Which service would you like?\n${list}\nReply with a number.`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }

    return await tryFindSlots(conversation, business, bookingFlow, activeServices, activeStaff, existingContext, intent);
  }

  // Ambiguous — re-prompt
  const msg = bookingFlow.preferences.staffName
    ? `When works for you with ${bookingFlow.preferences.staffName}? Tell me a day and time, like "Tuesday at 2pm".`
    : `When works for you? Just tell me a day and time, like "Tuesday at 2pm".`;
  bookingFlow.lastAgentMessage = msg;
  await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
  return { replyMessage: msg };
}

async function tryFindSlots(
  conversation: SmsConversation,
  business: Business,
  bookingFlow: BookingFlowContext,
  activeServices: Service[],
  activeStaff: Staff[],
  existingContext: Record<string, any>,
  intent: BookingIntent,
): Promise<{ replyMessage: string }> {
  const businessTimezone = business.timezone || 'America/New_York';

  // Check if requested date is a closed day
  const hours = await storage.getBusinessHours(business.id);
  if (bookingFlow.preferences.date) {
    const reqDate = new Date(bookingFlow.preferences.date + 'T12:00:00');
    const dayName = reqDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
    const dayHours = hours.find(h => h.day.toLowerCase() === dayName);
    if (!dayHours || dayHours.isClosed || !dayHours.open || !dayHours.close) {
      const openDays = hours.filter(h => !h.isClosed && h.open && h.close).map(h => h.day.charAt(0).toUpperCase() + h.day.slice(1));
      const msg = `We're closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}. We're open ${openDays.join(', ')}. What other day works?`;
      bookingFlow.preferences.date = undefined;
      bookingFlow.preferences.time = undefined;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
  }

  // Check lead time
  if (bookingFlow.preferences.date && bookingFlow.preferences.time) {
    const [year, month, day] = bookingFlow.preferences.date.split('-').map(Number);
    const [hour, min] = bookingFlow.preferences.time.split(':').map(Number);
    const slotDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
    const leadTimeMs = (business.bookingLeadTimeHours || 24) * 60 * 60 * 1000;
    const minBookingTime = new Date(Date.now() + leadTimeMs);
    if (slotDate < minBookingTime) {
      const msg = `We need at least ${business.bookingLeadTimeHours || 24} hours notice for bookings. Try a later date or time?`;
      bookingFlow.preferences.date = undefined;
      bookingFlow.preferences.time = undefined;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
  }

  const slots = await findAvailableSlots(business, {
    date: bookingFlow.preferences.date,
    staffId: bookingFlow.preferences.staffId,
    serviceId: bookingFlow.preferences.serviceId,
    timeOfDay: intent.timeOfDay,
  });

  if (slots.length === 0) {
    const dateStr = bookingFlow.preferences.date
      ? new Date(bookingFlow.preferences.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
      : 'that date';
    const msg = `Sorry, no availability on ${dateStr}${bookingFlow.preferences.staffName ? ` with ${bookingFlow.preferences.staffName}` : ''}. Would you like to try a different day${bookingFlow.preferences.staffId ? ' or another team member' : ''}?`;
    bookingFlow.preferences.date = undefined;
    bookingFlow.preferences.time = undefined;
    bookingFlow.lastAgentMessage = msg;
    await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
    return { replyMessage: msg };
  }

  // If exact match (date + time + specific slot available), go straight to confirmation
  if (bookingFlow.preferences.time && slots.length > 0) {
    const exactMatch = slots.find(s => s.time === bookingFlow.preferences.time);
    if (exactMatch) {
      bookingFlow.step = 'confirming_booking';
      bookingFlow.offeredSlots = [exactMatch];
      bookingFlow.preferences.staffId = exactMatch.staffId;
      bookingFlow.preferences.staffName = exactMatch.staffName;

      const serviceName = bookingFlow.preferences.serviceName || 'your appointment';
      const msg = `${serviceName} with ${exactMatch.staffName} on ${exactMatch.displayDate} at ${exactMatch.displayTime}. Shall I book it? Reply YES to confirm.`;
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'confirming_booking');
      return { replyMessage: msg };
    }
  }

  // Offer top slots
  bookingFlow.step = 'offering_slots';
  bookingFlow.offeredSlots = slots.slice(0, 3);
  const msg = formatSlotOptions(bookingFlow.offeredSlots, bookingFlow.preferences.serviceName);
  bookingFlow.lastAgentMessage = msg;
  await updateConversationContext(conversation.id, existingContext, bookingFlow, 'offering_slots');
  return { replyMessage: msg };
}

async function handleOfferingSlots(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  business: Business,
  bookingFlow: BookingFlowContext,
  activeServices: Service[],
  activeStaff: Staff[],
  existingContext: Record<string, any>,
): Promise<{ replyMessage: string }> {
  const offeredSlots = bookingFlow.offeredSlots ?? [];

  const intent = await parseBookingIntent(messageBody, bookingFlow, {
    name: business.name,
    timezone: business.timezone || 'America/New_York',
    services: activeServices.map(s => ({ id: s.id, name: s.name })),
    staff: activeStaff.map(s => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })),
  });

  if (intent.type === 'decline') {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    return { replyMessage: `No problem! We'll be here when you're ready. - ${business.name}` };
  }

  if (intent.type === 'change_mind') {
    bookingFlow.step = 'asking_preferences';
    bookingFlow.offeredSlots = undefined;
    bookingFlow.preferences.date = undefined;
    bookingFlow.preferences.time = undefined;
    const msg = 'No problem! What day and time works better for you?';
    bookingFlow.lastAgentMessage = msg;
    await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
    return { replyMessage: msg };
  }

  // Try to identify which slot the customer wants
  let selectedSlot: AvailableSlot | undefined;

  // Check for numeric selection
  const selection = parseSelectionNumber(messageBody, offeredSlots.length);
  if (selection !== null) {
    selectedSlot = offeredSlots[selection - 1];
  }

  // Check for slot selection from intent
  if (!selectedSlot && intent.slotSelection && intent.slotSelection <= offeredSlots.length) {
    selectedSlot = offeredSlots[intent.slotSelection - 1];
  }

  // Check for time match
  if (!selectedSlot && intent.time) {
    selectedSlot = offeredSlots.find(s => s.time === intent.time);
  }

  // Check for confirmation (assume first slot if only one)
  if (!selectedSlot && intent.type === 'confirmation' && offeredSlots.length === 1) {
    selectedSlot = offeredSlots[0];
  }

  if (selectedSlot) {
    bookingFlow.step = 'confirming_booking';
    bookingFlow.preferences.date = selectedSlot.date;
    bookingFlow.preferences.time = selectedSlot.time;
    bookingFlow.preferences.staffId = selectedSlot.staffId;
    bookingFlow.preferences.staffName = selectedSlot.staffName;

    const serviceName = bookingFlow.preferences.serviceName || 'your appointment';
    const msg = `${serviceName} with ${selectedSlot.staffName} on ${selectedSlot.displayDate} at ${selectedSlot.displayTime}. Shall I book it? Reply YES to confirm.`;
    bookingFlow.lastAgentMessage = msg;
    await updateConversationContext(conversation.id, existingContext, bookingFlow, 'confirming_booking');
    return { replyMessage: msg };
  }

  // If they gave a new date/time, find new slots
  if (intent.type === 'date_time' && intent.date) {
    bookingFlow.preferences.date = intent.date;
    if (intent.time) bookingFlow.preferences.time = intent.time;
    bookingFlow.step = 'asking_preferences';
    return await tryFindSlots(conversation, business, bookingFlow, activeServices, activeStaff, existingContext, intent);
  }

  // Re-prompt
  const msg = `Reply with a number (1-${offeredSlots.length}) to pick a slot, or suggest a different day and time.`;
  bookingFlow.lastAgentMessage = msg;
  await updateConversationContext(conversation.id, existingContext, bookingFlow, 'offering_slots');
  return { replyMessage: msg };
}

async function handleConfirmingBooking(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  business: Business,
  bookingFlow: BookingFlowContext,
  existingContext: Record<string, any>,
): Promise<{ replyMessage: string }> {
  // Use centralized word-boundary-aware reply parser
  const replyIntent = classifyReply(messageBody);

  // Handle STOP during booking flow — opt out of marketing only
  if (replyIntent === 'stop') {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    if (customer?.id) {
      try { await storage.updateCustomer(customer.id, { marketingOptIn: false }); } catch (err) { console.error('[ConversationalBooking] Error:', err instanceof Error ? err.message : err); }
    }
    return { replyMessage: `You've been unsubscribed from ${business.name} promotional messages. You'll still receive appointment reminders & confirmations. Reply START to re-subscribe.` };
  }

  // Also check for change-of-mind words that don't map to negative
  const changeWords = ['different', 'change', 'actually', 'wait'];
  const upperMsg = messageBody.trim().toUpperCase();
  const wantsChange = changeWords.some(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(messageBody);
  });

  if (replyIntent === 'positive' && !wantsChange) {
    // Test mode — skip real booking creation
    if (existingContext?.isTest === true) {
      await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
      const sName = bookingFlow.preferences.serviceName || 'Your appointment';
      const stName = bookingFlow.preferences.staffName || '';
      return {
        replyMessage: `(Test mode) ${sName}${stName ? ` with ${stName}` : ''} would be booked on ${bookingFlow.preferences.date || 'the selected date'} at ${bookingFlow.preferences.time || 'the selected time'}. No real appointment was created. - ${business.name}`,
      };
    }

    // Create the booking
    if (!customer?.id || !bookingFlow.preferences.date || !bookingFlow.preferences.time || !bookingFlow.preferences.serviceId) {
      const link = business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '';
      await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
      return { replyMessage: link ? `Something went wrong. Book online here: ${link}` : `Something went wrong. Call us at ${business.phone || 'our office'} to book.` };
    }

    const extraNotes = bookingFlow.preferences.propertyAddress
      ? `Property: ${bookingFlow.preferences.propertyAddress}`
      : undefined;
    const result = await createBookingFromSms(
      business,
      customer.id,
      bookingFlow.preferences.date,
      bookingFlow.preferences.time,
      bookingFlow.preferences.staffId ?? null,
      bookingFlow.preferences.serviceId,
      extraNotes,
    );

    if (result.success && result.appointment) {
      await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
      // Release engagement lock so other agents can contact this customer
      if (customer.id) {
        import('./orchestrationService').then(mod => {
          mod.dispatchEvent('conversation.resolved', { businessId: business.id, customerId: customer!.id }).catch(logAndSwallow('ConversationalBooking'));
        }).catch(logAndSwallow('ConversationalBooking'));
      }
      await logAgentAction({
        businessId: business.id,
        agentType: conversation.agentType,
        action: 'appointment_booked',
        customerId: customer.id,
        referenceType: 'appointment',
        referenceId: result.appointment.id,
        details: {
          date: bookingFlow.preferences.date,
          time: bookingFlow.preferences.time,
          staffId: bookingFlow.preferences.staffId,
          serviceId: bookingFlow.preferences.serviceId,
          serviceName: bookingFlow.preferences.serviceName,
          staffName: bookingFlow.preferences.staffName,
        },
      });

      const serviceName = bookingFlow.preferences.serviceName || 'Your appointment';
      const staffName = bookingFlow.preferences.staffName || '';
      const timezone = business.timezone || 'America/New_York';
      const displayDate = new Date(bookingFlow.preferences.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
      });
      const [h, m] = bookingFlow.preferences.time.split(':').map(Number);
      const [yr, mo, dy] = bookingFlow.preferences.date.split('-').map(Number);
      const displayTime = formatTimeWithTimezone(
        createDateInTimezone(yr, mo - 1, dy, h, m, timezone), timezone,
      );

      return {
        replyMessage: `Booked! ${serviceName}${staffName ? ` with ${staffName}` : ''} on ${displayDate} at ${displayTime}. We'll send a confirmation shortly. - ${business.name}`,
      };
    }

    // Booking failed
    if (result.error === 'conflict') {
      bookingFlow.step = 'asking_preferences';
      bookingFlow.preferences.date = undefined;
      bookingFlow.preferences.time = undefined;
      const msg = 'Sorry, that slot was just booked! What other time works for you?';
      bookingFlow.lastAgentMessage = msg;
      await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
      return { replyMessage: msg };
    }
    if (result.error === 'duplicate') {
      await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
      if (customer.id) {
        import('./orchestrationService').then(mod => {
          mod.dispatchEvent('conversation.resolved', { businessId: business.id, customerId: customer!.id }).catch(logAndSwallow('ConversationalBooking'));
        }).catch(logAndSwallow('ConversationalBooking'));
      }
      return { replyMessage: `You already have an appointment that day. Try a different day, or call us at ${business.phone || 'our office'}.` };
    }

    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    if (customer.id) {
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId: business.id, customerId: customer!.id }).catch(logAndSwallow('ConversationalBooking'));
      }).catch(logAndSwallow('ConversationalBooking'));
    }
    const link = business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '';
    return { replyMessage: link ? `Something went wrong. Book online here: ${link}` : `Something went wrong. Call us at ${business.phone || 'our office'}.` };
  }

  if (replyIntent === 'negative' || wantsChange) {
    bookingFlow.step = 'asking_preferences';
    bookingFlow.preferences.date = undefined;
    bookingFlow.preferences.time = undefined;
    const msg = 'No problem! What day and time works better for you?';
    bookingFlow.lastAgentMessage = msg;
    await updateConversationContext(conversation.id, existingContext, bookingFlow, 'collecting_preferences');
    return { replyMessage: msg };
  }

  // Ambiguous
  return { replyMessage: 'Would you like me to book this appointment? Reply YES to confirm or NO to choose a different time.' };
}

// ─── OpenAI Intent Parser ───────────────────────────────────────────────────

async function parseBookingIntent(
  message: string,
  bookingFlow: BookingFlowContext,
  businessInfo: {
    name: string;
    timezone: string;
    services: Array<{ id: number; name: string }>;
    staff: Array<{ id: number; firstName: string; lastName: string }>;
  },
): Promise<BookingIntent> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long', timeZone: businessInfo.timezone });

  const staffList = businessInfo.staff.map(s => `${s.firstName} ${s.lastName}`.trim()).join(', ');
  const serviceList = businessInfo.services.map(s => s.name).join(', ');

  const currentPrefs = JSON.stringify(bookingFlow.preferences);

  const systemPrompt = `You parse SMS messages from a customer booking an appointment. Extract structured data as JSON.

Business: "${businessInfo.name}" in timezone ${businessInfo.timezone}.
Today: ${todayStr} (${dayOfWeek}).
Staff: ${staffList || 'not specified'}
Services: ${serviceList || 'not specified'}

Current conversation step: ${bookingFlow.step}
Current preferences: ${currentPrefs}
${bookingFlow.lastAgentMessage ? `Last agent message: "${bookingFlow.lastAgentMessage}"` : ''}

Return ONLY a JSON object with these fields:
{
  "type": "date_time" | "staff_preference" | "service_preference" | "confirmation" | "decline" | "change_mind" | "ambiguous",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM (24h) or null",
  "timeOfDay": "morning" | "afternoon" | "evening" | null,
  "staffName": "name or null",
  "serviceName": "service name or null",
  "confirmed": true | false | null,
  "slotSelection": number | null,
  "propertyAddress": "street address or null"
}

Rules:
- Relative day names resolve from today. "Tuesday" = next Tuesday. "Tomorrow" = tomorrow's date.
- "2pm" = "14:00", "9:30 am" = "09:30", "morning" = timeOfDay "morning" (no specific time).
- "morning" = before 12:00, "afternoon" = 12:00-17:00, "evening" = after 17:00.
- "with Sarah" or "I see Sarah" = staff_preference with staffName "Sarah".
- "1", "the first one", "option 1" = slotSelection 1.
- "yes", "perfect", "book it", "sounds good" = confirmation.
- "no", "nah", "never mind", "cancel" = decline.
- "actually", "different time", "change" = change_mind.
- If message has both a date AND time, type should be "date_time".
- If message has both a staff name AND date/time, type should be "date_time" but also set staffName.
- If unclear, type = "ambiguous".`;

  try {
    const parsed = await claudeJson<any>({
      system: systemPrompt,
      prompt: message,
      maxTokens: 300,
    });

    return {
      type: parsed.type || 'ambiguous',
      date: parsed.date || undefined,
      time: parsed.time || undefined,
      timeOfDay: parsed.timeOfDay || undefined,
      staffName: parsed.staffName || undefined,
      serviceName: parsed.serviceName || undefined,
      confirmed: parsed.confirmed ?? undefined,
      slotSelection: parsed.slotSelection ?? undefined,
      propertyAddress: parsed.propertyAddress || undefined,
    };
  } catch (err) {
    console.error('[ConversationalBooking] AI parse error:', err);
    // Fallback: try simple keyword matching
    return fallbackIntentParse(message);
  }
}

function fallbackIntentParse(message: string): BookingIntent {
  // Use centralized word-boundary-aware parser
  const intent = classifyReply(message);

  if (intent === 'stop' || intent === 'negative') {
    return { type: 'decline' };
  }
  if (intent === 'positive') {
    return { type: 'confirmation', confirmed: true };
  }

  // Check for numeric selection
  const num = parseInt(message.trim());
  if (!isNaN(num) && num >= 1 && num <= 10) {
    return { type: 'confirmation', slotSelection: num };
  }

  return { type: 'ambiguous' };
}

// ─── Availability Finder ────────────────────────────────────────────────────

async function findAvailableSlots(
  business: Business,
  options: {
    date?: string;
    staffId?: number;
    serviceId?: number;
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
  },
): Promise<AvailableSlot[]> {
  const businessTimezone = business.timezone || 'America/New_York';
  const hours = await storage.getBusinessHours(business.id);
  const allStaff = await storage.getStaff(business.id);
  const activeStaff = allStaff.filter(s => s.active);
  const bufferMinutes = business.bookingBufferMinutes || 15;
  const slotInterval = business.bookingSlotIntervalMinutes || 30;

  let serviceDuration = 60;
  if (options.serviceId) {
    const service = await storage.getService(options.serviceId);
    if (service?.duration) serviceDuration = service.duration;
  }

  // If no date specified, check today + next 5 business days
  const datesToCheck: string[] = [];
  if (options.date) {
    datesToCheck.push(options.date);
  } else {
    const today = new Date();
    for (let i = 0; i < 14 && datesToCheck.length < 5; i++) {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
      const dayHours = hours.find(h => h.day.toLowerCase() === dayName);
      if (dayHours && !dayHours.isClosed && dayHours.open && dayHours.close) {
        datesToCheck.push(dateStr);
      }
    }
  }

  const result: AvailableSlot[] = [];

  for (const dateStr of datesToCheck) {
    if (result.length >= 5) break;

    const reqDate = new Date(dateStr + 'T12:00:00');
    const dayName = reqDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
    const dayHours = hours.find(h => h.day.toLowerCase() === dayName);
    if (!dayHours || dayHours.isClosed || !dayHours.open || !dayHours.close) continue;

    const [openHour, openMin] = dayHours.open.split(':').map(Number);
    const [closeHour, closeMin] = dayHours.close.split(':').map(Number);
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;

    const [rYear, rMonth, rDay] = dateStr.split('-').map(Number);
    const startOfDay = createDateInTimezone(rYear, rMonth - 1, rDay, 0, 0, businessTimezone);
    const endOfDay = createDateInTimezone(rYear, rMonth - 1, rDay, 23, 59, businessTimezone);

    const existingAppointments = await storage.getAppointments(business.id, {
      startDate: startOfDay,
      endDate: endOfDay,
    });

    // Determine which staff to check
    let staffToCheck = activeStaff;
    if (options.staffId) {
      staffToCheck = activeStaff.filter(s => s.id === options.staffId);
    }

    // Filter staff by service compatibility
    if (options.serviceId) {
      const eligibleStaff: Staff[] = [];
      for (const s of staffToCheck) {
        const assignedServices = await storage.getStaffServices(s.id);
        if (assignedServices.length === 0 || assignedServices.includes(options.serviceId)) {
          eligibleStaff.push(s);
        }
      }
      staffToCheck = eligibleStaff;
    }

    const leadTimeMs = (business.bookingLeadTimeHours || 24) * 60 * 60 * 1000;
    const minBookingTime = new Date(Date.now() + leadTimeMs);

    for (let minutes = openMinutes; minutes + serviceDuration <= closeMinutes; minutes += slotInterval) {
      if (result.length >= 5) break;

      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;

      // Time of day filter
      if (options.timeOfDay) {
        if (options.timeOfDay === 'morning' && hour >= 12) continue;
        if (options.timeOfDay === 'afternoon' && (hour < 12 || hour >= 17)) continue;
        if (options.timeOfDay === 'evening' && hour < 17) continue;
      }

      const slotStart = createDateInTimezone(rYear, rMonth - 1, rDay, hour, min, businessTimezone);
      if (slotStart <= minBookingTime) continue;

      const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

      for (const staffMember of staffToCheck) {
        // Check staff individual hours
        const staffDayHours = await storage.getStaffHoursByDay(staffMember.id, dayName);
        if (staffDayHours?.isOff) continue;
        if (staffDayHours?.startTime && staffDayHours?.endTime) {
          const [staffStartH, staffStartM] = staffDayHours.startTime.split(':').map(Number);
          const [staffEndH, staffEndM] = staffDayHours.endTime.split(':').map(Number);
          if (minutes < staffStartH * 60 + staffStartM || minutes + serviceDuration > staffEndH * 60 + staffEndM) continue;
        }

        // Check for conflicts
        const hasConflict = existingAppointments.some(apt => {
          if (apt.staffId !== staffMember.id) return false;
          if (apt.status === 'cancelled') return false;
          const aptStart = new Date(apt.startDate);
          const aptEnd = new Date(apt.endDate);
          const aptStartWithBuffer = aptStart.getTime() - bufferMinutes * 60 * 1000;
          const aptEndWithBuffer = aptEnd.getTime() + bufferMinutes * 60 * 1000;
          return (slotStart.getTime() < aptEndWithBuffer && slotEnd.getTime() > aptStartWithBuffer);
        });

        if (!hasConflict) {
          const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
          const displayTime = formatTimeWithTimezone(slotStart, businessTimezone);
          const displayDate = reqDate.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
          });

          result.push({
            date: dateStr,
            time: timeStr,
            displayTime,
            displayDate,
            staffId: staffMember.id,
            staffName: staffMember.firstName,
          });
          break; // One slot per time — pick first available staff
        }
      }
    }
  }

  return result;
}

// ─── Appointment Creator ────────────────────────────────────────────────────

async function createBookingFromSms(
  business: Business,
  customerId: number,
  date: string,
  time: string,
  staffId: number | null,
  serviceId: number,
  extraNotes?: string,
): Promise<{ success: boolean; appointment?: any; error?: string }> {
  try {
    const service = await storage.getService(serviceId);
    if (!service) return { success: false, error: 'service_not_found' };

    const businessTimezone = business.timezone || 'America/New_York';
    const [year, month, day] = date.split('-').map(Number);
    const [hour, min] = time.split(':').map(Number);

    const startDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
    const endDate = new Date(startDate.getTime() + (service.duration || 60) * 60 * 1000);

    // Lead time check
    const leadTimeMs = (business.bookingLeadTimeHours || 24) * 60 * 60 * 1000;
    if (startDate < new Date(Date.now() + leadTimeMs)) {
      return { success: false, error: 'lead_time' };
    }

    // Duplicate booking check
    const dayStart = createDateInTimezone(year, month - 1, day, 0, 0, businessTimezone);
    const dayEnd = createDateInTimezone(year, month - 1, day, 23, 59, businessTimezone);
    const existingAppointments = await storage.getAppointments(business.id, {
      startDate: dayStart,
      endDate: dayEnd,
    });
    const duplicate = existingAppointments.find(apt => apt.customerId === customerId && apt.status !== 'cancelled');
    if (duplicate) return { success: false, error: 'duplicate' };

    // Staff-service compatibility
    if (staffId) {
      const staffServiceIds = await storage.getStaffServices(staffId);
      if (staffServiceIds.length > 0 && !staffServiceIds.includes(serviceId)) {
        staffId = null; // Fall back to auto-assign
      }
    }

    // Auto-assign staff if needed
    if (!staffId) {
      const availableStaff = await storage.getAvailableStaffForSlot(business.id, startDate, time);
      const eligible: Staff[] = [];
      for (const s of availableStaff) {
        const assignedServices = await storage.getStaffServices(s.id);
        if (assignedServices.length === 0 || assignedServices.includes(serviceId)) {
          eligible.push(s);
        }
      }
      staffId = eligible[0]?.id ?? availableStaff[0]?.id ?? null;
    }

    // Race-condition conflict check
    if (staffId) {
      const bufferMinutes = business.bookingBufferMinutes || 15;
      const staffAppts = existingAppointments.filter(apt => apt.staffId === staffId && apt.status !== 'cancelled');
      const hasConflict = staffAppts.some(apt => {
        const aptStart = new Date(apt.startDate);
        const aptEnd = new Date(apt.endDate);
        const aptStartWithBuffer = aptStart.getTime() - bufferMinutes * 60 * 1000;
        const aptEndWithBuffer = aptEnd.getTime() + bufferMinutes * 60 * 1000;
        return (startDate.getTime() < aptEndWithBuffer && endDate.getTime() > aptStartWithBuffer);
      });
      if (hasConflict) return { success: false, error: 'conflict' };
    }

    // Create appointment
    const appointmentNotes = extraNotes ? `Booked via SMS. ${extraNotes}` : 'Booked via SMS';
    const appointment = await storage.createAppointment({
      businessId: business.id,
      customerId,
      staffId: staffId || null,
      serviceId,
      startDate,
      endDate,
      status: 'scheduled',
      notes: appointmentNotes,
    });

    // Set manage token
    const manageToken = crypto.randomBytes(24).toString('hex');
    try {
      await storage.updateAppointment(appointment.id, { manageToken });
    } catch (e) {
      console.error('[ConversationalBooking] Failed to set manage token:', e);
    }

    // Create linked job
    try {
      const customer = await storage.getCustomer(customerId);
      const customerName = customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : '';
      const jobTitle = customerName ? `${service.name} - ${customerName}` : service.name;

      const job = await storage.createJob({
        businessId: business.id,
        customerId,
        appointmentId: appointment.id,
        staffId: staffId || null,
        title: jobTitle,
        description: `Service: ${service.name}`,
        scheduledDate: date,
        status: 'pending',
        notes: 'Auto-created from SMS booking',
      });

      fireEvent(business.id, 'job.created', { job }).catch(err =>
        console.error('[ConversationalBooking] Webhook error (job.created):', err));
    } catch (jobErr) {
      console.error('[ConversationalBooking] Failed to create job:', jobErr);
    }

    // Fire webhook
    fireEvent(business.id, 'appointment.created', { appointment }).catch(err =>
      console.error('[ConversationalBooking] Webhook error (appointment.created):', err));

    // Send confirmation (fire-and-forget)
    notificationService.sendAppointmentConfirmation(appointment.id, business.id).catch(err =>
      console.error('[ConversationalBooking] Confirmation send error:', err));

    // Calendar sync (fire-and-forget)
    try {
      const { CalendarService } = await import('./calendarService');
      const calendarService = new CalendarService();
      calendarService.syncAppointment(appointment.id).catch(err =>
        console.error('[ConversationalBooking] Calendar sync error:', err));
    } catch {
      // Calendar service may not be available
    }

    return { success: true, appointment };
  } catch (err) {
    console.error('[ConversationalBooking] Create booking error:', err);
    return { success: false, error: 'unknown' };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function matchStaffByName(
  name: string,
  staffList: Staff[],
): { exact: Staff | null; partial: Staff[] } {
  const lower = name.toLowerCase().trim();

  // Exact first name match
  const exactFirst = staffList.filter(s => s.firstName.toLowerCase() === lower);
  if (exactFirst.length === 1) return { exact: exactFirst[0], partial: [] };

  // Exact full name match
  const exactFull = staffList.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().trim() === lower);
  if (exactFull.length === 1) return { exact: exactFull[0], partial: [] };

  // Partial / starts-with match
  const partial = staffList.filter(s =>
    s.firstName.toLowerCase().startsWith(lower) ||
    s.lastName.toLowerCase().startsWith(lower) ||
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(lower),
  );

  if (partial.length === 1) return { exact: partial[0], partial: [] };
  return { exact: null, partial };
}

function matchServiceByName(
  name: string,
  serviceList: Service[],
): { exact: Service | null; partial: Service[] } {
  const lower = name.toLowerCase().trim();

  const exact = serviceList.filter(s => s.name.toLowerCase() === lower);
  if (exact.length === 1) return { exact: exact[0], partial: [] };

  const partial = serviceList.filter(s =>
    s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()),
  );

  if (partial.length === 1) return { exact: partial[0], partial: [] };
  return { exact: null, partial };
}

function parseSelectionNumber(message: string, maxOptions: number): number | null {
  const trimmed = message.trim();
  const num = parseInt(trimmed);
  if (!isNaN(num) && num >= 1 && num <= maxOptions) return num;

  // Match ordinal words
  const ordinals: Record<string, number> = {
    'first': 1, 'one': 1, '1st': 1,
    'second': 2, 'two': 2, '2nd': 2,
    'third': 3, 'three': 3, '3rd': 3,
    'fourth': 4, 'four': 4, '4th': 4,
    'fifth': 5, 'five': 5, '5th': 5,
  };

  const lower = trimmed.toLowerCase();
  for (const [word, val] of Object.entries(ordinals)) {
    if (lower.includes(word) && val <= maxOptions) return val;
  }

  return null;
}

function formatSlotOptions(slots: AvailableSlot[], serviceName?: string): string {
  const header = serviceName ? `Available for ${serviceName}:` : 'Available times:';
  const lines = slots.map((s, i) => `${i + 1}) ${s.displayDate}, ${s.displayTime} - ${s.staffName}`);
  return `${header}\n${lines.join('\n')}\nReply 1-${slots.length} to pick, or suggest another time.`;
}

async function updateConversationContext(
  conversationId: number,
  existingContext: Record<string, any>,
  bookingFlow: BookingFlowContext,
  state: string,
): Promise<void> {
  await storage.updateSmsConversation(conversationId, {
    state,
    context: { ...existingContext, bookingFlow },
  });
}

export default { canStartConversationalBooking, initializeBookingConversation, handleBookingConversation };
