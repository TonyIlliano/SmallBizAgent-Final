/**
 * callTools/crmTools — caller recognition + customer profile tools:
 * recognizeCaller (the per-call context engine), customer CRUD, equipment
 * capture, membership lookup, transcript name extraction.
 * Extracted from callToolHandlers.ts (audit R1 split).
 */

import { storage } from '../../storage';
import { getLatestCustomerIntelligence } from '../callIntelligenceService';
import { searchMemory } from '../mem0Service';
import { getCachedServices, getCachedBusiness } from './cache';
import { formatDateForVoice, getLocalDateString } from './datetime';
import { getCurrentBusinessStatus } from './infoTools';
import type { FunctionResult, CreateCustomerParams, UpdateCustomerInfoParams, CaptureEquipmentParams, CheckMembershipParams } from './types';

/**
 * Extract caller name from a Vapi transcript when the AI asked for it.
 * Looks for patterns like "My name is John Smith", "It's John", "This is Tony Illiano", etc.
 * Returns null if no name can be confidently extracted.
 */
export function extractCallerNameFromTranscript(transcript: string): { firstName: string; lastName: string } | null {
  if (!transcript || transcript.length < 20) return null;

  // Normalize whitespace
  const text = transcript.replace(/\s+/g, ' ');

  // Common patterns where callers give their name (ordered by specificity)
  const patterns = [
    // "My name is John Smith" / "My name's John Smith"
    /(?:my name(?:'s| is)) (\w+)(?:\s+(\w+))?/i,
    // "This is John Smith" / "It's John Smith" / "Yeah it's John"
    /(?:this is|it'?s|yeah it'?s) (\w+)(?:\s+(\w+))?/i,
    // "I'm John Smith"
    /(?:I'?m) (\w+)(?:\s+(\w+))?/i,
    // "Call me John" / "You can call me John"
    /(?:call me|you can call me) (\w+)(?:\s+(\w+))?/i,
    // "Yeah John" / "It's just John" (single name after being asked)
    /(?:yeah|yes|sure|just|it's just) (\w+)\b/i,
    // Direct response after AI asks for name: "John Smith" or "John"
    // Only match if preceded by the AI asking for a name
    /(?:name|who am I speaking|may I get your name).*?\n.*?(?:user|customer|caller):\s*(\w+)(?:\s+(\w+))?/i,
  ];

  // Words that should NOT be treated as names
  const notNames = new Set([
    'yeah', 'yes', 'no', 'sure', 'okay', 'ok', 'um', 'uh', 'hi', 'hello', 'hey',
    'thanks', 'thank', 'good', 'great', 'fine', 'well', 'just', 'calling',
    'about', 'need', 'want', 'would', 'like', 'can', 'could', 'the', 'a', 'an',
    'looking', 'wondering', 'trying', 'interested', 'calling', 'morning', 'afternoon',
    'here', 'there', 'back', 'appointment', 'booking', 'schedule', 'available',
    'haircut', 'trim', 'cut', 'style', 'color', 'shave', 'wash', 'service'
  ]);

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const firstName = match[1].trim();
      const lastName = match[2]?.trim() || '';

      // Validate: must be a real name (2+ chars, not a common word, starts with letter)
      if (
        firstName.length >= 2 &&
        /^[A-Z]/i.test(firstName) &&
        !notNames.has(firstName.toLowerCase()) &&
        (!lastName || (!notNames.has(lastName.toLowerCase()) && /^[A-Z]/i.test(lastName)))
      ) {
        // Capitalize properly
        const capFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        const capLast = lastName ? lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase() : '';
        return { firstName: capFirst, lastName: capLast };
      }
    }
  }

  return null;
}


/**
 * Get customer information by phone number
 */
export async function getCustomerInfo(
  businessId: number,
  phoneNumber?: string
): Promise<FunctionResult> {
  if (!phoneNumber) {
    return { result: { found: false, error: 'Phone number required' } };
  }

  const customer = await storage.getCustomerByPhone(phoneNumber, businessId);

  if (!customer) {
    return {
      result: {
        found: false,
        message: 'No existing customer record found for this phone number.'
      }
    };
  }

  // Get customer's recent appointments
  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const recentAppointments = appointments
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, 3);

  return {
    result: {
      found: true,
      customerId: customer.id,
      name: `${customer.firstName} ${customer.lastName}`,
      phone: customer.phone,
      email: customer.email,
      recentAppointments: recentAppointments.map(apt => ({
        date: new Date(apt.startDate).toLocaleDateString(),
        service: apt.notes || 'Appointment',
        status: apt.status
      })),
      message: `Found customer: ${customer.firstName} ${customer.lastName}`
    }
  };
}


/**
 * Create a new customer
 */
export async function createCustomer(
  businessId: number,
  params: {
    name?: string;
    firstName?: string;
    lastName?: string;
    phone: string;
    email?: string;
  }
): Promise<FunctionResult> {
  let firstName = params.firstName || '';
  let lastName = params.lastName || '';

  if (params.name && !firstName) {
    const nameParts = params.name.split(' ');
    firstName = nameParts[0] || '';
    lastName = nameParts.slice(1).join(' ') || '';
  }

  try {
    // Check for existing customer by phone to prevent duplicates
    const existingCustomer = await storage.getCustomerByPhone(params.phone, businessId);
    if (existingCustomer) {
      // Update name/email if we now have better info
      const updates: any = {};
      if (firstName && firstName !== 'New' && (existingCustomer.firstName === 'Caller' || existingCustomer.firstName === 'New')) {
        updates.firstName = firstName;
      }
      if (lastName && lastName !== 'Customer' && (existingCustomer.lastName === 'Customer' || /^\d{4}$/.test(existingCustomer.lastName || ''))) {
        updates.lastName = lastName;
      }
      if (params.email && !existingCustomer.email) {
        updates.email = params.email;
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateCustomer(existingCustomer.id, updates);
      }

      return {
        result: {
          success: true,
          customerId: existingCustomer.id,
          message: `Found existing customer record for ${existingCustomer.firstName} ${existingCustomer.lastName}`
        }
      };
    }

    const customer = await storage.createCustomer({
      businessId,
      firstName: firstName || 'New',
      lastName: lastName || 'Customer',
      phone: params.phone,
      email: params.email || '',
      address: '',
      notes: 'Created via AI phone receptionist'
    });

    return {
      result: {
        success: true,
        customerId: customer.id,
        message: `Created new customer record for ${firstName} ${lastName}`
      }
    };
  } catch (error) {
    return {
      result: {
        success: false,
        error: 'Failed to create customer record'
      }
    };
  }
}


/**
 * Recognize the caller at the start of the call
 */
export async function recognizeCaller(
  businessId: number,
  callerPhone?: string
): Promise<FunctionResult> {
  // Get status + customer lookup in parallel (saves ~50ms vs sequential)
  const [currentStatus, customer] = await Promise.all([
    getCurrentBusinessStatus(businessId),
    callerPhone ? storage.getCustomerByPhone(callerPhone, businessId) : Promise.resolve(null),
  ]);

  if (!callerPhone) {
    console.log(`[recognizeCaller] No callerPhone for business ${businessId} — cannot identify caller`);
    return {
      result: {
        recognized: false,
        currentStatus,
        message: 'How can I help you today?'
      }
    };
  }

  if (!customer) {
    console.log(`[recognizeCaller] No customer found for phone=${callerPhone}, business=${businessId} — new caller`);
    // Create customer record immediately so updateCustomerInfo can save their name mid-call
    try {
      const newCustomer = await storage.createCustomer({
        businessId,
        firstName: 'Caller',
        lastName: callerPhone.replace(/\D/g, '').slice(-4), // Last 4 digits as placeholder
        phone: callerPhone,
        email: '',
        address: '',
        notes: 'Auto-created from phone call — name pending',
        smsOptIn: true, // Caller provided phone by calling — opt into transactional SMS
      });
      console.log(`[recognizeCaller] Created placeholder customer id=${newCustomer.id} for new caller ${callerPhone}`);
      return {
        result: {
          recognized: false,
          isNewCaller: true,
          customerId: newCustomer.id,
          currentStatus,
          message: 'How can I help you today?'
        }
      };
    } catch (createErr) {
      console.error(`[recognizeCaller] Error creating placeholder customer:`, createErr);
      return {
        result: {
          recognized: false,
          isNewCaller: true,
          currentStatus,
          message: 'How can I help you today?'
        }
      };
    }
  }

  console.log(`[recognizeCaller] Found customer: ${customer.firstName} ${customer.lastName} (id=${customer.id}) for phone=${callerPhone}`);

  // ── Single parallel batch: fetch ALL caller data at once ──
  // Previously 3 sequential await blocks (~500-600ms). Now 1 batch (~100-150ms).
  const mem0Promise = searchMemory(businessId, customer.id, 'customer preferences history concerns', 5, 2000)
    .catch(() => ''); // Never throws
  const mem0Timeout = new Promise<string>((resolve) => setTimeout(() => resolve(''), 100)); // 100ms max for Mem0

  const [appointments, recogBusiness, allServices, intelligenceResult, insightsResult, conversationalContext, equipmentRecords, activeMembership] = await Promise.all([
    storage.getAppointmentsByCustomerId(customer.id),
    getCachedBusiness(businessId),
    getCachedServices(businessId),
    getLatestCustomerIntelligence(customer.id, businessId).catch(() => null),
    storage.getCustomerInsights(customer.id, businessId).catch(() => null),
    Promise.race([mem0Promise, mem0Timeout]),
    // Step 3 of HVAC roadmap — surface known equipment in the summary so
    // the AI can reference it naturally ("I see we last serviced your Trane
    // unit in May — is that what's having trouble today?"). Active rows only,
    // limit-bounded by the storage method.
    storage.getCustomerEquipment(customer.id, businessId).catch(() => []),
    // Step 4 of HVAC roadmap — pull the caller's active membership so the
    // AI can lead with member benefits ("you're an Elite member, so I'll
    // waive the diagnostic fee").
    storage.getActiveMembershipByCustomer(customer.id, businessId).catch(() => undefined),
  ]);

  const intelligence = intelligenceResult;
  const insights = insightsResult;
  const now = new Date();

  // Find upcoming appointments (include confirmed and pending — not just 'scheduled')
  const activeStatuses = ['scheduled', 'confirmed', 'pending'];
  const upcoming = appointments
    .filter(apt => new Date(apt.startDate) > now && apt.status && activeStatuses.includes(apt.status))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  // Find recent past appointments (last 90 days)
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const recent = appointments
    .filter(apt => {
      const aptDate = new Date(apt.startDate);
      return aptDate < now && aptDate > ninetyDaysAgo;
    })
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  let context = '';
  let likelyReason = '';
  const recogTimezone = recogBusiness?.timezone || 'America/New_York';

  if (upcoming.length > 0) {
    const nextApt = upcoming[0];
    const aptLocalDate = getLocalDateString(new Date(nextApt.startDate), recogTimezone);
    const todayStr = getLocalDateString(now, recogTimezone);
    const tomorrowStr = getLocalDateString(new Date(now.getTime() + 86400000), recogTimezone);
    const hoursUntilApt = (new Date(nextApt.startDate).getTime() - now.getTime()) / (1000 * 60 * 60);

    if (aptLocalDate === todayStr) {
      context = 'appointment_today';
      if (hoursUntilApt <= 1) {
        likelyReason = 'Probably running late or needs last-minute directions — appointment is within the hour';
      } else if (hoursUntilApt <= 3) {
        likelyReason = 'Likely confirming or has a quick question about their appointment today';
      } else {
        likelyReason = 'May be confirming their appointment later today or needs to reschedule';
      }
    } else if (aptLocalDate === tomorrowStr) {
      context = 'appointment_tomorrow';
      likelyReason = 'Likely confirming or adjusting their appointment tomorrow';
    } else {
      context = 'has_upcoming';
      likelyReason = 'Has an upcoming appointment — may want to confirm, reschedule, or ask a question';
    }
  } else if (recent.length > 0) {
    context = 'returning_customer';
    const daysSinceLast = insights?.daysSinceLastVisit || 0;
    if (daysSinceLast > 30) {
      likelyReason = 'Has not visited in over a month — probably looking to rebook';
    } else {
      likelyReason = 'Recent customer — may need a follow-up visit or have a question about their last service';
    }
  } else {
    // No upcoming and no recent — could be a very old customer returning or has a new need
    if (appointments.length > 0) {
      likelyReason = 'Past customer returning after a long time — be welcoming and help them rebook';
    }
  }

  // Check for pending follow-up or estimate — overrides general reason
  if (intelligence?.pendingFollowUp) {
    likelyReason = `Likely calling about: ${intelligence.pendingFollowUp}`;
  }

  // Build structured upcoming appointments list (so AI can reschedule/cancel without re-fetching)
  const upcomingAppointments = upcoming.slice(0, 3).map(apt => {
    const aptDate = new Date(apt.startDate);
    const svc = apt.serviceId ? allServices.find((s: any) => s.id === apt.serviceId) : null;
    return {
      appointmentId: apt.id,
      date: aptDate.toLocaleDateString('en-US', { timeZone: recogTimezone, weekday: 'long', month: 'long', day: 'numeric' }),
      time: aptDate.toLocaleTimeString('en-US', { timeZone: recogTimezone, hour: 'numeric', minute: '2-digit', hour12: true }),
      serviceName: svc?.name || 'appointment',
      serviceId: apt.serviceId || undefined,
      staffId: apt.staffId || undefined,
    };
  });

  // Build a concise narrative summary combining all intelligence into natural language
  // This gives the AI everything it needs in a format it can weave into conversation
  const summaryParts: string[] = [];

  // Upcoming appointment (crucial context — AI references this when relevant)
  if (upcoming.length > 0) {
    const nextApt = upcoming[0];
    const aptDate = new Date(nextApt.startDate);
    const aptTimeStr = aptDate.toLocaleTimeString('en-US', { timeZone: recogTimezone, hour: 'numeric', minute: '2-digit', hour12: true });
    const aptDateStr = formatDateForVoice(aptDate, recogTimezone);
    let svcName = '';
    if (nextApt.serviceId) {
      const svc = allServices.find((s: any) => s.id === nextApt.serviceId);
      if (svc) svcName = ` for ${svc.name}`;
    }
    summaryParts.push(`Next appointment${svcName}: ${aptDateStr} at ${aptTimeStr}`);
  }

  // Visit history
  if (insights?.totalVisits && insights.totalVisits > 1) {
    summaryParts.push(`Regular customer (${insights.totalVisits} visits)`);
  } else if (recent.length > 0) {
    summaryParts.push('Returning customer');
  }

  // Service & staff preferences
  if (intelligence?.preferredServices) {
    summaryParts.push(`Usually books: ${intelligence.preferredServices}`);
  }
  if (intelligence?.staffPreference) {
    summaryParts.push(`Preferred staff: ${intelligence.staffPreference}`);
  }

  // Timing preferences
  if (insights?.preferredDayOfWeek || insights?.preferredTimeOfDay) {
    const timeParts: string[] = [];
    if (insights.preferredDayOfWeek) timeParts.push(insights.preferredDayOfWeek + 's');
    if (insights.preferredTimeOfDay) timeParts.push(insights.preferredTimeOfDay);
    summaryParts.push(`Prefers: ${timeParts.join(', ')}`);
  }

  // Last visit info
  if (insights?.daysSinceLastVisit) {
    summaryParts.push(`Last visit: ${insights.daysSinceLastVisit} days ago`);
  }

  // Last call context
  if (intelligence?.lastCallSummary) {
    summaryParts.push(`Last call: ${intelligence.lastCallSummary}`);
  }

  // Pending follow-up
  if (intelligence?.pendingFollowUp) {
    summaryParts.push(`Pending follow-up: ${intelligence.pendingFollowUp}`);
  }

  // Step 4 of HVAC roadmap — surface active membership so the AI leads
  // with member-aware language. This is the demo magic moment ("you're
  // an Elite member, so the diagnostic fee is waived"). Prepended HIGH
  // in the summary because membership is the most actionable context
  // for the AI to leverage.
  if (activeMembership) {
    try {
      const plan = await storage.getMembershipPlanById(
        activeMembership.planId,
        businessId,
      );
      if (plan) {
        const memberBits: string[] = [`${plan.name} member`];
        if (activeMembership.status === 'past_due') memberBits.push('PAST DUE');
        if (activeMembership.tuneUpsRemaining > 0) {
          memberBits.push(`${activeMembership.tuneUpsRemaining} tune-up${activeMembership.tuneUpsRemaining > 1 ? 's' : ''} remaining`);
        }
        if (plan.priorityDispatch) memberBits.push('priority dispatch');
        if (plan.waivesDiagnosticFee) memberBits.push('diagnostic fee waived');
        if (Number(plan.memberDiscountPercent) > 0) {
          memberBits.push(`${plan.memberDiscountPercent}% off labor + parts`);
        }
        summaryParts.unshift(memberBits.join(', '));
      }
    } catch (e) {
      console.warn('[recognizeCaller] Failed to load plan for active membership:', e);
    }
  }

  // Step 3 of HVAC roadmap — surface known equipment so the AI can lead
  // with it ("I see we last serviced your Trane furnace in May — is that
  // what's having trouble?"). Cap at 3 most-recently-serviced to keep the
  // summary inside the 450-char budget.
  if (Array.isArray(equipmentRecords) && equipmentRecords.length > 0) {
    const topEquipment = equipmentRecords
      .filter((e: any) => e.active !== false)
      .slice(0, 3)
      .map((e: any) => {
        const parts = [e.make, e.model].filter(Boolean).join(' ');
        const typeLabel = String(e.equipmentType || 'unit').replace(/_/g, ' ');
        const where = e.location ? ` in ${e.location}` : '';
        const last = e.lastServiceDate ? ` (last serviced ${e.lastServiceDate})` : '';
        return parts ? `${parts} ${typeLabel}${where}${last}` : `${typeLabel}${where}${last}`;
      });
    if (topEquipment.length > 0) {
      summaryParts.push(`Known equipment: ${topEquipment.join('; ')}`);
    }
  }

  // Risk level (only if at-risk)
  if (insights?.riskLevel === 'at_risk' || insights?.riskLevel === 'high') {
    summaryParts.push('Note: at-risk customer — be extra warm and accommodating');
  }

  // Mem0 conversational memory (append if present)
  if (conversationalContext) {
    summaryParts.push(`Past notes: ${conversationalContext}`);
  }

  // Build summary — include enough context for natural conversation
  // Smart truncation: prioritize actionable data over historical when over limit
  let summary = '';
  const MAX_SUMMARY_LENGTH = 450;

  if (summaryParts.length > 0) {
    summary = summaryParts.join('. ') + '.';

    if (summary.length > MAX_SUMMARY_LENGTH) {
      // Prioritize: upcoming appointment, pending follow-up, preferences, then history
      // Remove parts from the end (least important) until under limit
      const prioritized = [...summaryParts];
      while (prioritized.length > 1 && prioritized.join('. ').length + 1 > MAX_SUMMARY_LENGTH) {
        prioritized.pop(); // Drop least important (history, mem0 notes)
      }
      summary = prioritized.join('. ') + '.';
      if (summary.length > MAX_SUMMARY_LENGTH) {
        summary = summary.substring(0, MAX_SUMMARY_LENGTH - 3) + '...';
      }
    }
  }

  // Build a pre-composed response hint so the model speaks ONE natural sentence
  let responseHint = `Hey ${customer.firstName}!`;
  if (upcomingAppointments.length > 0) {
    const apt = upcomingAppointments[0];
    responseHint += ` You've got a ${apt.serviceName || 'appointment'} at ${apt.time}. What can I help with?`;
  } else {
    responseHint += ` What can I do for you?`;
  }

  return {
    result: {
      recognized: true,
      customerId: customer.id,
      firstName: customer.firstName,
      customerName: `${customer.firstName} ${customer.lastName}`,
      context,
      likelyReason,
      summary,
      currentStatus,
      upcomingAppointments: upcomingAppointments.length > 0 ? upcomingAppointments : undefined,
      responseHint, // Say THIS exact sentence — nothing more, nothing less
    }
  };
}

/**
 * Update customer information mid-call
 * Allows the AI to correct a customer's name or add email without requiring a booking
 */
export async function updateCustomerInfo(
  businessId: number,
  params: {
    customerId?: number;
    firstName?: string;
    lastName?: string;
    email?: string;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  try {
    // Find the customer by ID or phone number
    let customer: any = null;

    if (params.customerId) {
      customer = await storage.getCustomer(params.customerId);
    } else if (callerPhone) {
      customer = await storage.getCustomerByPhone(callerPhone, businessId);
    }

    if (!customer) {
      return {
        result: {
          success: false,
          error: 'Customer not found. I can update their information after booking an appointment.'
        }
      };
    }

    // Verify customer belongs to this business
    if (customer.businessId !== businessId) {
      return {
        result: {
          success: false,
          error: 'Customer not found for this business.'
        }
      };
    }

    // Build update object with only provided fields
    const updates: Record<string, any> = {};
    if (params.firstName && params.firstName.trim()) {
      updates.firstName = params.firstName.trim();
    }
    if (params.lastName && params.lastName.trim()) {
      updates.lastName = params.lastName.trim();
    }
    if (params.email && params.email.trim()) {
      updates.email = params.email.trim();
    }

    if (Object.keys(updates).length === 0) {
      return {
        result: {
          success: false,
          error: 'No information provided to update.'
        }
      };
    }

    // Perform the update
    const updatedCustomer = await storage.updateCustomer(customer.id, updates);


    const fullName = `${updatedCustomer.firstName} ${updatedCustomer.lastName}`.trim();

    return {
      result: {
        success: true,
        customerId: updatedCustomer.id,
        customerName: fullName,
        firstName: updatedCustomer.firstName,
        lastName: updatedCustomer.lastName,
      }
    };
  } catch (error) {
    console.error(`[updateCustomerInfo] Error updating customer for business ${businessId}:`, error);
    return {
      result: {
        success: false,
        error: 'There was a technical issue updating the customer information. Please try again.'
      }
    };
  }
}

/**
 * captureEquipment — Step 3 of HVAC roadmap.
 *
 * The AI receptionist calls this whenever a caller naturally mentions their
 * equipment ("I have a Trane unit, about 8 years old, in the attic"). We
 * persist the row to customer_equipment so the next tech walks in knowing
 * what they're working on.
 *
 * Tenant-safe: validates the customer belongs to the calling business
 * before any write. Fail-soft: returns success=false instead of throwing so
 * a bad capture never breaks the call flow.
 *
 * Deduplication: if a row with the same equipmentType + make + model already
 * exists for this customer, the handler updates that row instead of creating
 * a duplicate. Mid-conversation re-mentions ("yeah it's a Trane") don't
 * spam the database.
 */
export async function captureEquipment(
  businessId: number,
  params: CaptureEquipmentParams,
): Promise<FunctionResult> {
  try {
    if (!params.customerId) {
      return {
        result: {
          success: false,
          error: 'Missing customerId. Call recognizeCaller first to identify the customer.',
        },
      };
    }
    if (!params.equipmentType) {
      return {
        result: {
          success: false,
          error: 'Missing equipmentType.',
        },
      };
    }

    const VALID_TYPES = [
      'furnace', 'ac', 'heat_pump', 'mini_split', 'boiler',
      'water_heater', 'thermostat', 'vehicle', 'pet', 'other',
    ];
    if (!VALID_TYPES.includes(params.equipmentType)) {
      return {
        result: {
          success: false,
          error: `Invalid equipmentType "${params.equipmentType}". Must be one of: ${VALID_TYPES.join(', ')}.`,
        },
      };
    }

    // Tenant check — customer must belong to the calling business
    const customer = await storage.getCustomer(params.customerId);
    if (!customer || customer.businessId !== businessId) {
      return {
        result: {
          success: false,
          error: 'Customer not found for this business.',
        },
      };
    }

    // Dedup: if an active row already exists for this customer with the same
    // type + make (case-insensitive), update it rather than creating a
    // duplicate. Real-world: the caller mentions the unit once, then mentions
    // it again 30 seconds later; we shouldn't end up with two rows.
    const existing = await storage.getCustomerEquipment(params.customerId, businessId);
    const dupe = existing.find(
      (e) =>
        e.equipmentType === params.equipmentType &&
        (e.make || '').toLowerCase() === (params.make || '').toLowerCase() &&
        e.active === true,
    );

    if (dupe) {
      // Merge — only patch fields the caller actually mentioned
      const patch: Record<string, any> = {};
      if (params.model && !dupe.model) patch.model = params.model;
      if (params.installDate && !dupe.installDate) patch.installDate = params.installDate;
      if (params.location && !dupe.location) patch.location = params.location;
      if (params.notes) {
        patch.notes = dupe.notes
          ? `${dupe.notes}\n${new Date().toISOString().slice(0, 10)}: ${params.notes}`
          : params.notes;
      }

      if (Object.keys(patch).length > 0) {
        await storage.updateCustomerEquipment(dupe.id, businessId, patch);
      }

      return {
        result: {
          success: true,
          updated: true,
          equipmentId: dupe.id,
        },
      };
    }

    const created = await storage.createCustomerEquipment({
      businessId,
      customerId: params.customerId,
      equipmentType: params.equipmentType as any,
      make: params.make || null,
      model: params.model || null,
      installDate: params.installDate || null,
      location: params.location || null,
      notes: params.notes || null,
      active: true,
    } as any);

    console.log(
      `[captureEquipment] business ${businessId} customer ${params.customerId}: persisted ${params.equipmentType}${params.make ? ` ${params.make}` : ''}${params.model ? ` ${params.model}` : ''} (id=${created.id})`,
    );

    return {
      result: {
        success: true,
        created: true,
        equipmentId: created.id,
      },
    };
  } catch (error: any) {
    console.error('[captureEquipment] error:', error?.message);
    return {
      result: {
        success: false,
        error: 'There was a technical issue saving the equipment. Please continue the conversation; the customer can add it manually later.',
      },
    };
  }
}

/**
 * checkMembership — Step 4 of HVAC roadmap.
 *
 * Returns the caller's active membership + plan + benefits remaining so
 * the AI can reference them in conversation:
 *   - "You're an Elite member, so I'll waive the diagnostic fee."
 *   - "You've got 1 tune-up left on your plan — want to use it?"
 *   - "Looks like you're a Premium member — you get priority dispatch."
 *
 * Returns { hasMembership: false } when the customer has no active
 * membership. Fail-soft: never throws, never blocks the call flow.
 */
export async function checkMembership(
  businessId: number,
  params: CheckMembershipParams,
): Promise<FunctionResult> {
  try {
    if (!params.customerId) {
      return {
        result: {
          success: false,
          hasMembership: false,
          message: 'I need to recognize the caller first before I can look up their membership.',
        },
      };
    }

    const membership = await storage.getActiveMembershipByCustomer(
      params.customerId,
      businessId,
    );
    if (!membership) {
      return {
        result: {
          success: true,
          hasMembership: false,
          message: 'This caller does not have an active membership plan.',
        },
      };
    }

    const plan = await storage.getMembershipPlanById(
      membership.planId,
      businessId,
    );
    if (!plan) {
      return {
        result: {
          success: true,
          hasMembership: false,
          message: 'Membership exists but the plan is missing — treat as no active membership.',
        },
      };
    }

    return {
      result: {
        success: true,
        hasMembership: true,
        planName: plan.name,
        status: membership.status,
        tuneUpsRemaining: membership.tuneUpsRemaining,
        serviceCallsRemaining: membership.serviceCallsRemaining,
        memberDiscountPercent: Number(plan.memberDiscountPercent),
        waivesDiagnosticFee: plan.waivesDiagnosticFee,
        priorityDispatch: plan.priorityDispatch,
        nextBillingDate: membership.nextBillingDate,
        // Pre-composed sentence the model can use verbatim or paraphrase
        summary: `${plan.name} member${membership.status === 'past_due' ? ' (past due)' : ''}${
          membership.tuneUpsRemaining > 0
            ? `. ${membership.tuneUpsRemaining} tune-up${membership.tuneUpsRemaining > 1 ? 's' : ''} remaining`
            : ''
        }${
          plan.priorityDispatch ? '. Priority dispatch.' : ''
        }${
          plan.waivesDiagnosticFee ? ' Diagnostic fee waived.' : ''
        }${
          Number(plan.memberDiscountPercent) > 0 ? ` ${plan.memberDiscountPercent}% member discount.` : ''
        }`,
      },
    };
  } catch (error: any) {
    console.error('[checkMembership] error:', error?.message);
    return {
      result: {
        success: false,
        hasMembership: false,
        error: 'Could not look up membership at this time.',
      },
    };
  }
}

