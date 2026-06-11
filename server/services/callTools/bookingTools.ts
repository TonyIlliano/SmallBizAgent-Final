/**
 * callTools/bookingTools — the appointment engine: availability slots,
 * booking (with diagnostic-first swap + member awareness), recurring series,
 * reschedule, cancel, confirm.
 *
 * Extracted from callToolHandlers.ts (audit R1 split). This is the largest
 * voice domain and the revenue-critical path: every AI-booked appointment
 * flows through bookAppointment() here.
 */

import { storage } from '../../storage';
import { db } from '../../db';
import { recurringSchedules } from '@shared/schema';
import twilioService from '../twilioService';
import { fireEvent } from '../webhookService';
import { getTimezoneAbbreviation } from '../../utils/timezone';
import { logAndSwallow } from '../../utils/safeAsync';
import { getIndustryConfig } from '@shared/industry-config';
import {
  dataCache, getCachedBusinessHours, getCachedServices, getCachedStaff,
  getCachedStaffHours, getCachedBusiness, getCachedStaffServiceMap,
  isStaffOffOnDate, getAppointmentsOptimized,
} from './cache';
import {
  formatDateForVoice, getNowInTimezone, getLocalTimeInTimezone,
  getLocalDateString, getTodayInTimezone, createDateInTimezone,
  parseNaturalDate, parseNaturalTime,
} from './datetime';
import { createCustomer } from './crmTools';
import type {
  FunctionResult, BookAppointmentParams, BookRecurringAppointmentParams,
  RescheduleAppointmentParams, CancelAppointmentParams, ConfirmAppointmentParams,
} from './types';

/**
 * Check if the date string represents a range request (like "next week")
 */
export function isDateRangeRequest(dateStr: string): boolean {
  const input = dateStr.toLowerCase().trim();
  return input === 'next week' ||
         input === 'this week' ||
         input.includes('any day') ||
         input.includes('anytime') ||
         input.includes('sometime');
}

/**
 * Get available slots for a single day
 * Now supports staff-specific hours for salons/barbershops
 */
export async function getAvailableSlotsForDay(
  businessId: number,
  date: Date,
  businessHours: any[],
  appointments: any[],
  duration: number,
  staffHours?: any[], // Optional staff-specific hours
  slotIntervalMinutes: number = 30, // Configurable slot interval
  timezone: string = 'America/New_York' // Business timezone for "is today" checks
): Promise<{ slots: string[], isClosed: boolean, dayName: string }> {
  const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayOfWeek = date.getDay();
  const dayName = daysMap[dayOfWeek].charAt(0).toUpperCase() + daysMap[dayOfWeek].slice(1);


  // If staff hours are provided, use them instead of business hours
  const useStaffHours = staffHours && staffHours.length > 0;

  let openTime: string;
  let closeTime: string;
  let isClosed = false;

  if (useStaffHours) {
    // Use staff-specific hours
    const staffDayHours = staffHours.find(h => h.day === daysMap[dayOfWeek]);

    // Staff explicitly marked as off this day
    if (staffDayHours?.isOff === true) {
      return { slots: [], isClosed: true, dayName };
    }

    // If staff has hours configured for this day, use them
    if (staffDayHours && (staffDayHours.startTime || staffDayHours.endTime)) {
      openTime = staffDayHours.startTime || '09:00';
      closeTime = staffDayHours.endTime || '17:00';
    } else {
      // No staff hours for this day - fall back to business hours
      const dayHours = businessHours.find(h => h.day === daysMap[dayOfWeek]);
      if (dayHours?.isClosed === true || !dayHours || (!dayHours.open && !dayHours.close)) {
        return { slots: [], isClosed: true, dayName };
      }
      openTime = dayHours.open || '09:00';
      closeTime = dayHours.close || '17:00';
    }
  } else {
    // Use business hours
    const dayHours = businessHours.find(h => h.day === daysMap[dayOfWeek]);

    // Check if closed — explicit isClosed flag OR no hours configured for this day
    if (dayHours?.isClosed === true) {
      console.log(`[getAvailableSlotsForDay] Business ${businessId}: ${dayName} is explicitly closed (isClosed=true)`);
      return { slots: [], isClosed: true, dayName };
    }
    if (!dayHours || (!dayHours.open && !dayHours.close)) {
      console.log(`[getAvailableSlotsForDay] Business ${businessId}: ${dayName} has no hours row or empty open/close — treating as closed. businessHours has ${businessHours.length} entries: [${businessHours.map(h => h.day).join(', ')}]`);
      return { slots: [], isClosed: true, dayName };
    }

    // Use the actual configured hours for this day
    openTime = dayHours.open || '09:00';
    closeTime = dayHours.close || '17:00';
    console.log(`[getAvailableSlotsForDay] Business ${businessId}: ${dayName} hours = ${openTime} to ${closeTime}`);
  }

  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Get appointments for that day (use timezone-aware date comparison to handle late-night slots)
  const targetDateStr = getLocalDateString(date, timezone);
  const dayAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.startDate);
    return getLocalDateString(aptDate, timezone) === targetDateStr && apt.status !== 'cancelled';
  });

  // Store both start and end times for proper overlap detection
  // CRITICAL: Use timezone-aware time extraction — getHours() returns UTC on Railway servers
  const bookedRanges = dayAppointments.map(apt => {
    const start = new Date(apt.startDate);
    const startLocal = getLocalTimeInTimezone(start, timezone);
    const startMinutes = startLocal.hours * 60 + startLocal.minutes;

    let endMinutes: number;
    if (apt.endDate) {
      const end = new Date(apt.endDate);
      const endLocal = getLocalTimeInTimezone(end, timezone);
      const calculatedEndMinutes = endLocal.hours * 60 + endLocal.minutes;
      // If end time is midnight (0) or before start time, it's likely a data issue - use default duration
      if (calculatedEndMinutes === 0 || calculatedEndMinutes <= startMinutes) {
        endMinutes = startMinutes + (duration || 60);
      } else {
        endMinutes = calculatedEndMinutes;
      }
    } else {
      // No end date - assume default duration
      endMinutes = startMinutes + (duration || 60);
    }

    return { start: startMinutes, end: endMinutes, aptId: apt.id };
  });

  // Generate available slots
  const availableSlots: string[] = [];

  // Check if date is today (in business timezone) - skip past times
  const now = getNowInTimezone(timezone);
  // Compare year/month/day directly (both are "wall clock" dates in the business timezone)
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  console.log(`[SlotFilter] tz=${timezone}, dateParam=${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}, nowDate=${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}, isToday=${isToday}, nowTime=${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}, cutoffMin=${currentMinutes + 30}`);

  // Generate slots based on configurable interval
  for (let slotStart = openMinutes; slotStart < closeMinutes; slotStart += slotIntervalMinutes) {
    const endTimeInMinutes = slotStart + duration;

    // Skip if appointment would end after business hours
    if (endTimeInMinutes > closeMinutes) continue;
    // Skip if in the past or within 30 minutes from now (today only)
    if (isToday && slotStart <= currentMinutes + 30) continue;

    // Check if this slot overlaps with any booked appointment
    // Overlap occurs when: new slot starts before existing ends AND new slot ends after existing starts
    const isBooked = bookedRanges.some(booked => {
      return (slotStart < booked.end && endTimeInMinutes > booked.start);
    });

    if (!isBooked) {
      const hour = Math.floor(slotStart / 60);
      const minute = slotStart % 60;
      // Format time directly without Date object to avoid UTC/timezone issues on Railway
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const amPm = hour < 12 ? 'AM' : 'PM';
      const minuteStr = minute.toString().padStart(2, '0');
      availableSlots.push(`${hour12}:${minuteStr} ${amPm}`);
    }
  }

  return { slots: availableSlots, isClosed: false, dayName };
}

/**
 * Parse a time slot string (e.g., "9:00 AM", "2:30 PM") into a 24-hour integer.
 */
export function parseSlotHour(slot: string): number {
  const hour = parseInt(slot.split(':')[0]);
  const isPM = slot.toLowerCase().includes('pm');
  if (isPM && hour !== 12) return hour + 12;
  if (!isPM && hour === 12) return 0;
  return hour;
}

/**
 * Pick 3-5 representative time slots spread across the day
 * (morning, midday, afternoon, evening) instead of returning all 48.
 */
export function pickBestSlots(slots: string[], maxSlots: number = 5): string[] {
  if (slots.length <= maxSlots) return slots;

  const morning: string[] = [];   // before 12pm
  const midday: string[] = [];    // 12pm-2pm
  const afternoon: string[] = []; // 2pm-5pm
  const evening: string[] = [];   // after 5pm

  for (const slot of slots) {
    const hour = parseSlotHour(slot);
    if (hour < 12) morning.push(slot);
    else if (hour < 14) midday.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }

  // Pick first slot from each time-of-day bucket
  const picks: string[] = [];
  for (const bucket of [morning, midday, afternoon, evening]) {
    if (bucket.length > 0 && picks.length < maxSlots) picks.push(bucket[0]);
  }
  // Fill remaining slots if we still have room
  for (const slot of slots) {
    if (picks.length >= maxSlots) break;
    if (!picks.includes(slot)) picks.push(slot);
  }
  // Sort chronologically so the AI reads them in order
  picks.sort((a, b) => parseSlotHour(a) - parseSlotHour(b));
  return picks;
}

/**
 * Check available appointment slots for a date or date range
 * Now supports filtering by staff member for salons/barbershops
 */
export async function checkAvailability(
  businessId: number,
  dateStr: string,
  serviceId?: number,
  staffId?: number,
  staffName?: string
): Promise<FunctionResult> {
  const business = await getCachedBusiness(businessId);
  if (!business) {
    console.error('Business not found:', businessId);
    return { result: { available: false, error: 'Business not found' } };
  }

  // Look up staff member by name if provided
  let resolvedStaffId = staffId;
  let staffMember: any = null;

  if (staffName && !staffId) {
    const allStaff = await getCachedStaff(businessId);
    const matchedStaff = allStaff.find(s =>
      s.active !== false &&
      (s.firstName.toLowerCase() === staffName.toLowerCase() ||
       `${s.firstName} ${s.lastName}`.toLowerCase() === staffName.toLowerCase() ||
       s.firstName.toLowerCase().includes(staffName.toLowerCase()))
    );
    if (matchedStaff) {
      resolvedStaffId = matchedStaff.id;
      staffMember = matchedStaff;
    } else {
      // Staff member not found by name
      const staffNames = allStaff.filter(s => s.active !== false).map(s => s.firstName).join(', ');
      return {
        result: {
          available: false,
          staffNotFound: true,
          message: `I don't have anyone by that name. Our team includes ${staffNames}. Would you like to book with one of them?`,
          availableStaff: allStaff.filter(s => s.active !== false).map(s => ({
            id: s.id,
            name: `${s.firstName} ${s.lastName}`,
            specialty: s.specialty
          }))
        }
      };
    }
  } else if (resolvedStaffId) {
    staffMember = await storage.getStaffMember(resolvedStaffId);
  }

  // Staff-service compatibility check:
  // If a specific staff member AND service are requested, verify the staff can do that service.
  // Backward compat: if staff has NO service assignments, they can do ALL services.
  // Uses batched cached map instead of N sequential queries.
  if (resolvedStaffId && serviceId) {
    const staffServiceMap = await getCachedStaffServiceMap(businessId);
    const staffServiceIds = staffServiceMap.get(resolvedStaffId) || [];
    if (staffServiceIds.length > 0 && !staffServiceIds.includes(serviceId)) {
      // This staff member can't do this service — suggest eligible alternatives
      const allStaff = await getCachedStaff(businessId);
      const allSvcs = await getCachedServices(businessId);
      const serviceLookup = allSvcs.find((s: any) => s.id === serviceId);
      const serviceLabel = serviceLookup?.name || 'that service';
      const staffLabel = staffMember ? staffMember.firstName : 'That team member';

      // Find staff who either are in the eligible list OR have no assignments at all (backward compat)
      const eligibleStaffWithFallback: typeof allStaff = [];
      for (const s of allStaff.filter(st => st.active && st.id !== resolvedStaffId)) {
        const theirServices = staffServiceMap.get(s.id) || [];
        if (theirServices.length === 0 || theirServices.includes(serviceId)) {
          eligibleStaffWithFallback.push(s);
        }
      }

      if (eligibleStaffWithFallback.length > 0) {
        const names = eligibleStaffWithFallback.map(s => s.firstName).join(', ');
        return {
          result: {
            available: false,
            staffServiceMismatch: true,
            message: `${staffLabel} doesn't do ${serviceLabel}, but ${names} ${eligibleStaffWithFallback.length === 1 ? 'does' : 'do'}. Would you like me to check availability with ${eligibleStaffWithFallback.length === 1 ? eligibleStaffWithFallback[0].firstName : 'one of them'}?`,
            eligibleStaff: eligibleStaffWithFallback.map(s => ({
              id: s.id,
              name: `${s.firstName} ${s.lastName || ''}`.trim(),
              specialty: s.specialty
            }))
          }
        };
      } else {
        return {
          result: {
            available: false,
            staffServiceMismatch: true,
            message: `I'm sorry, ${staffLabel} doesn't do ${serviceLabel} and I couldn't find another team member for that service. Would you like to try a different service?`
          }
        };
      }
    }
  }

  // ── Batch all independent queries in parallel for speed ──
  // These are all independent once staff is resolved. Running them sequentially
  // added 400-800ms of unnecessary latency (8+ serial DB round-trips).
  const [allServices, businessHours, appointments, staffHoursData] = await Promise.all([
    getCachedServices(businessId),
    getCachedBusinessHours(businessId),
    resolvedStaffId
      ? getAppointmentsOptimized(businessId, { staffId: resolvedStaffId })
      : getAppointmentsOptimized(businessId),
    resolvedStaffId
      ? getCachedStaffHours(resolvedStaffId, businessId)
      : Promise.resolve([]),
  ]);

  // Get slot interval from business settings (default 30 min)
  const slotIntervalMinutes = business.bookingSlotIntervalMinutes || 30;

  // If no business hours are configured, ask for callback instead
  if (businessHours.length === 0) {
    return {
      result: {
        available: false,
        noHoursConfigured: true,
        message: "I don't have our current schedule in the system yet. Let me take your information and have someone call you back to schedule an appointment. What's a good number to reach you?"
      }
    };
  }

  // Get service duration from cached services (no extra DB query)
  let duration: number;
  let serviceName: string | null = null;

  if (serviceId) {
    const service = allServices.find((s: any) => s.id === serviceId);
    if (service) {
      duration = service.duration || 30;
      serviceName = service.name;
    } else {
      duration = 30;
    }
  } else {
    // No service specified — use shortest service duration to show all possible slots
    if (allServices.length > 0) {
      duration = Math.min(...allServices.map((s: any) => s.duration || 30));
    } else {
      duration = 30;
    }
  }

  const staffLabel = staffMember ? staffMember.firstName : null;

  const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Use business timezone for all date calculations
  const businessTimezone = business.timezone || 'America/New_York';
  const tzAbbr = getTimezoneAbbreviation(businessTimezone);

  // Check if this is a range request (like "next week")
  if (isDateRangeRequest(dateStr)) {
    // Get availability for the next 7 business days (in business timezone)
    const today = getTodayInTimezone(businessTimezone);

    const availableDays: { day: string, date: string, slots: string[], totalAvailable?: number }[] = [];
    let daysChecked = 0;
    let currentDate = new Date(today);

    // For "next week", start from next Monday
    if (dateStr.toLowerCase().includes('next week')) {
      const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
      currentDate.setDate(currentDate.getDate() + daysUntilMonday);
    } else {
      // Start from tomorrow for "this week" or general requests
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Check up to 14 days to find at least 5 available days
    while (availableDays.length < 5 && daysChecked < 14) {
      // Skip this day if staff has time off (vacation, sick, etc.)
      if (resolvedStaffId && await isStaffOffOnDate(resolvedStaffId, currentDate)) {
        currentDate.setDate(currentDate.getDate() + 1);
        daysChecked++;
        continue;
      }

      const result = await getAvailableSlotsForDay(
        businessId,
        currentDate,
        businessHours,
        appointments,
        duration,
        staffHoursData.length > 0 ? staffHoursData : undefined,
        slotIntervalMinutes,
        businessTimezone
      );

      if (!result.isClosed && result.slots.length > 0) {
        const dateDisplay = currentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        });
        // Use the same pickBestSlots logic as single-day requests — 3-5 representative
        // slots spread across morning/midday/afternoon/evening. The old 2-slot
        // morning+afternoon sampling was hiding most of the day's availability,
        // causing the AI to tell callers "we only have 9:30 and 12" when 3pm was open.
        const representativeSlots = pickBestSlots(result.slots, 5);

        availableDays.push({
          day: result.dayName,
          date: dateDisplay,
          slots: representativeSlots,
          totalAvailable: result.slots.length,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
      daysChecked++;
    }

    if (availableDays.length === 0) {
      return {
        result: {
          available: false,
          staffName: staffLabel,
        }
      };
    }

    // Return curated multi-day availability — the AI composes its own natural phrasing
    // Include service info so the AI can answer "how much?" and "how long?" without an extra tool call
    const serviceInfo = serviceId ? allServices.find((s: any) => s.id === serviceId) : null;
    return {
      result: {
        available: true,
        isMultipleDays: true,
        staffName: staffLabel,
        availableDays: availableDays,
        ...(serviceInfo && {
          servicePrice: serviceInfo.price ? `$${Number(serviceInfo.price).toFixed(2)}` : null,
          serviceDuration: `${serviceInfo.duration || 30} minutes`,
          serviceName: serviceInfo.name,
        }),
      }
    };
  }

  // Single date request - original logic with improvements
  console.log(`[checkAvailability] Business ${businessId}: dateStr="${dateStr}" → parsing...`);
  const date = parseNaturalDate(dateStr, businessTimezone);
  console.log(`[checkAvailability] Parsed to: ${date.toISOString().split('T')[0]} (${date.toLocaleDateString('en-US', { weekday: 'long' })})`);

  // Check if date is in the past (in business timezone)
  const today = getTodayInTimezone(businessTimezone);
  if (date < today) {
    return {
      result: {
        available: false,
        error: 'That date has already passed. Would you like to check a future date?'
      }
    };
  }

  // Check if staff has time off on this date (vacation, sick, etc.)
  if (resolvedStaffId && await isStaffOffOnDate(resolvedStaffId, date)) {
    const displayDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    // Find next available day for this staff member
    let nextAvailable = '';
    let checkDate = new Date(date);
    for (let i = 1; i <= 14; i++) {
      checkDate.setDate(checkDate.getDate() + 1);
      if (!await isStaffOffOnDate(resolvedStaffId, checkDate)) {
        const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = daysMap[checkDate.getDay()];
        // Also check regular schedule
        if (staffHoursData.length > 0) {
          const staffDay = staffHoursData.find(h => h.day === dayName);
          if (staffDay?.isOff) continue;
        } else {
          const bizDay = businessHours.find(h => h.day === dayName);
          if (bizDay?.isClosed) continue;
        }
        nextAvailable = checkDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        break;
      }
    }
    return {
      result: {
        available: false,
        staffName: staffLabel,
        date: displayDate,
        staffOff: true,
        nextAvailable: nextAvailable || undefined,
      }
    };
  }

  const result = await getAvailableSlotsForDay(businessId, date, businessHours, appointments, duration, staffHoursData.length > 0 ? staffHoursData : undefined, slotIntervalMinutes, businessTimezone);

  console.log(`[checkAvailability] Business ${businessId}: date=${date.toISOString().split('T')[0]} (${result.dayName}), isClosed=${result.isClosed}, slotsFound=${result.slots.length}, duration=${duration}min, staffId=${resolvedStaffId || 'none'}, interval=${slotIntervalMinutes}min`);

  // Format date for voice output — plain numbers, no ordinal suffixes (TTS reads "28th" as "20 eighth")
  const displayDate = formatDateForVoice(date);

  if (result.isClosed) {
    // Find next open day - check staff hours if applicable
    let nextOpenDay = '';
    let nextOpenDate = new Date(date);
    for (let i = 1; i <= 7; i++) {
      nextOpenDate.setDate(nextOpenDate.getDate() + 1);
      const nextDayOfWeek = nextOpenDate.getDay();
      const nextDayName = daysMap[nextDayOfWeek];

      // Check staff hours if we have them, otherwise use business hours
      let isOpen = false;
      if (staffHoursData.length > 0) {
        const staffDayHours = staffHoursData.find(h => h.day === nextDayName);
        isOpen = staffDayHours && !staffDayHours.isOff;
      } else {
        const nextDayHours = businessHours.find(h => h.day === nextDayName);
        isOpen = nextDayHours && !nextDayHours.isClosed;
      }

      if (isOpen) {
        nextOpenDay = nextDayName.charAt(0).toUpperCase() + nextDayName.slice(1);
        break;
      }
    }

    // Distinguish between "business closed" and "staff not working"
    const reason = staffLabel && staffHoursData.length > 0
      ? `${staffLabel} is not working on ${result.dayName}`
      : `The business is closed on ${result.dayName}`;
    return {
      result: {
        available: false,
        isClosed: true,
        staffNotWorking: staffLabel && staffHoursData.length > 0 ? true : false,
        reason,
        staffName: staffLabel,
        dayName: result.dayName,
        suggestedDay: nextOpenDay,
      }
    };
  }

  const availableSlots = result.slots;

  if (availableSlots.length === 0) {
    return {
      result: {
        available: false,
        date: displayDate,
        timezone: tzAbbr,
        staffName: staffLabel,
      }
    };
  }

  // Return 3 curated slots to offer (easier to process by ear), PLUS all slots for exact-time checks
  const bestSlots = pickBestSlots(availableSlots, 3);

  // Include service info so the AI can answer "how much?" and "how long?" without an extra tool call
  const serviceInfo = serviceId ? allServices.find((s: any) => s.id === serviceId) : null;
  // Include both display date and YYYY-MM-DD for bookAppointment
  const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    result: {
      available: true,
      date: displayDate,
      dateForBooking: isoDate, // Use this exact date when calling bookAppointment — do NOT calculate your own
      timezone: tzAbbr,
      staffName: staffLabel,
      suggestedSlots: bestSlots, // Offer these 3-5 slots to the caller
      allSlots: availableSlots, // ALL available slots — if caller asks for a specific time, check this list
      totalAvailable: availableSlots.length,
      ...(serviceInfo && {
        servicePrice: serviceInfo.price ? `$${Number(serviceInfo.price).toFixed(2)}` : null,
        serviceDuration: `${serviceInfo.duration || 30} minutes`,
        serviceName: serviceInfo.name,
      }),
    }
  };
}

/**
 * Book an appointment
 */
export async function bookAppointment(
  businessId: number,
  params: {
    customerId?: number;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    date: string;
    time: string;
    serviceId?: number;
    serviceName?: string;
    staffId?: number;
    staffName?: string;
    notes?: string;
    estimatedDuration?: number;
    urgency?: string;
    issueType?: string;
    symptoms?: string;
    accessNotes?: string;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await getCachedBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  // Resolve staff member by name if provided
  let resolvedStaffId = params.staffId;
  let staffMember: any = null;

  if (params.staffName && !params.staffId) {
    const allStaff = await getCachedStaff(businessId);
    const matchedStaff = allStaff.find(s =>
      s.active &&
      (s.firstName.toLowerCase() === params.staffName!.toLowerCase() ||
       `${s.firstName} ${s.lastName}`.toLowerCase() === params.staffName!.toLowerCase())
    );
    if (matchedStaff) {
      resolvedStaffId = matchedStaff.id;
      staffMember = matchedStaff;
    }
  } else if (resolvedStaffId) {
    staffMember = await storage.getStaffMember(resolvedStaffId);
  }

  // Get or create customer
  let customerId = params.customerId;
  let customer;

  if (!customerId) {
    const phone = params.customerPhone || callerPhone;
    if (!phone) {
      return { result: { success: false, error: 'Customer phone number required' } };
    }

    // Reject bookings without a real customer name — tell the AI to ask for it
    const hasRealName = params.customerName &&
      params.customerName.trim() !== '' &&
      params.customerName.toLowerCase() !== 'new customer' &&
      params.customerName.toLowerCase() !== 'unknown' &&
      params.customerName.toLowerCase() !== 'caller';

    // Try to find existing customer
    customer = await storage.getCustomerByPhone(phone, businessId);

    // If no existing customer AND no real name provided, reject the booking
    if (!customer && !hasRealName) {
      return {
        result: {
          success: false,
          needsCustomerName: true,
          error: 'I need the customer\'s name before I can book the appointment. Please ask "May I get your name for the appointment?" and then try booking again with their name.'
        }
      };
    }

    if (!customer) {
      // Create new customer — we know we have a real name at this point
      const nameParts = (params.customerName || 'New Customer').split(' ');
      try {
        customer = await storage.createCustomer({
          businessId,
          firstName: nameParts[0] || 'New',
          lastName: nameParts.slice(1).join(' ') || 'Customer',
          phone: phone,
          email: params.customerEmail || '',
          address: '',
          notes: 'Created via AI phone receptionist',
          smsOptIn: true, // Caller provided phone by calling — opt into transactional SMS
        });
        // Send one-time TCPA opt-in welcome message (fire-and-forget)
        import('../notificationService').then(ns => {
          ns.sendSmsOptInWelcome(customer!.id, businessId).catch(logAndSwallow('CallTools'));
        }).catch(logAndSwallow('CallTools'));
      } catch (customerError: any) {
        console.error('Failed to create customer:', {
          error: customerError.message,
          stack: customerError.stack
        });
        return {
          result: {
            success: false,
            error: 'Unable to create customer record. Please try again.',
            details: customerError.message
          }
        };
      }
    } else if (params.customerName && params.customerName !== 'New Customer') {
      // Upgrade placeholder names if we now have a real name from the conversation
      const nameParts = params.customerName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const isPlaceholder = (
        customer.firstName === 'New' ||
        customer.firstName === 'Caller' ||
        customer.firstName === 'Test' ||
        (customer.lastName === 'Customer') ||
        (customer.lastName === 'User') ||
        /^\d{4}$/.test(customer.lastName || '')
      );
      // Always update if the provided name is different from current name and looks real
      const nameChanged = (
        firstName.toLowerCase() !== (customer.firstName || '').toLowerCase() ||
        (lastName && lastName.toLowerCase() !== (customer.lastName || '').toLowerCase())
      );
      if ((isPlaceholder || nameChanged) && firstName && firstName !== 'New' && firstName !== 'Caller') {
        try {
          const updates: any = { firstName };
          if (lastName && lastName !== 'Customer' && lastName !== 'User') {
            updates.lastName = lastName;
          }
          if (params.customerEmail && !customer.email) {
            updates.email = params.customerEmail;
          }
          await storage.updateCustomer(customer.id, updates);
          customer = { ...customer, ...updates };
        } catch (err) {
          console.error('Error updating customer name:', err);
        }
      }
    }

    // Ensure SMS opt-in is set for callers booking via phone (they called in = consent to transactional SMS)
    if (!customer.smsOptIn) {
      try {
        await storage.updateCustomer(customer.id, { smsOptIn: true });
        customer = { ...customer, smsOptIn: true };
        // Send one-time TCPA opt-in welcome message (fire-and-forget)
        import('../notificationService').then(ns => {
          ns.sendSmsOptInWelcome(customer!.id, businessId).catch(logAndSwallow('CallTools'));
        }).catch(logAndSwallow('CallTools'));
      } catch (err) {
        console.error('[bookAppointment] Error setting smsOptIn:', err);
      }
    }

    customerId = customer.id;
  }

  // Resolve service FIRST so we can use its duration for end time calculation
  let serviceId = params.serviceId;
  const services = await getCachedServices(businessId);

  if (serviceId) {
    // Validate that the provided serviceId actually belongs to this business
    const validService = services.find(s => s.id === serviceId);
    if (!validService) {
      console.warn(`ServiceId ${serviceId} does not belong to business ${businessId}, ignoring it`);
      serviceId = undefined; // Reset to undefined, will try to match by name below
    }
  }

  if (!serviceId && params.serviceName) {
    const matchedService = services.find(s =>
      s.name.toLowerCase().includes(params.serviceName!.toLowerCase())
    );
    if (matchedService) {
      serviceId = matchedService.id;
    } else {
      console.warn(`Could not find service matching "${params.serviceName}" for business ${businessId}`);
    }
  }

  // Auto-assign service if only one exists and none was specified
  if (!serviceId && services.length === 1) {
    serviceId = services[0].id;
  }

  // ── Diagnostic-first swap (Step 2 of HVAC roadmap) ──
  // For industries configured as `diagnostic_first` (HVAC, plumbing, electrical,
  // automotive), if the resolved service is marked `requiresDiagnostic`, swap to
  // the business's diagnostic service before booking. The AI receptionist's
  // prompt already tells the model not to quote prices for these, but this is
  // the server-side safety net — even if the model slips and tries to book the
  // repair service directly, we route it to a diagnostic visit instead.
  let diagnosticSwap: {
    originalServiceId: number;
    originalServiceName: string;
    diagnosticServiceId: number;
    diagnosticServiceName: string;
    diagnosticFee: number | null;
  } | null = null;
  try {
    const industryConfig = getIndustryConfig(business.industry);
    if (industryConfig.bookingFlow === 'diagnostic_first' && serviceId) {
      const requestedService = services.find((s) => s.id === serviceId);
      if (requestedService && (requestedService as any).requiresDiagnostic === true) {
        // Find the business's diagnostic service. Match: pricingType='fixed'
        // AND name contains "diagnostic" (case-insensitive). Falls back to any
        // service whose name says diagnostic if pricingType is null on a legacy
        // row.
        const diagnosticService =
          services.find(
            (s) =>
              s.active !== false &&
              (s as any).pricingType === 'fixed' &&
              /diagnostic/i.test(s.name),
          ) ||
          services.find(
            (s) => s.active !== false && /diagnostic/i.test(s.name),
          );

        if (diagnosticService) {
          diagnosticSwap = {
            originalServiceId: requestedService.id,
            originalServiceName: requestedService.name,
            diagnosticServiceId: diagnosticService.id,
            diagnosticServiceName: diagnosticService.name,
            diagnosticFee:
              diagnosticService.price !== null && diagnosticService.price !== undefined
                ? Number(diagnosticService.price)
                : industryConfig.diagnosticFeeDefault,
          };
          serviceId = diagnosticService.id;
          console.log(
            `[bookAppointment] Diagnostic-first swap: business ${businessId} caller asked for "${requestedService.name}" (id=${requestedService.id}), routed to "${diagnosticService.name}" (id=${diagnosticService.id}) instead.`,
          );
        } else {
          // No diagnostic service in catalog — leave the original booking
          // intact but warn so the owner knows their catalog is missing a
          // Diagnostic Visit entry. The AI prompt should already discourage
          // quoting; we just don't have a target to swap to.
          console.warn(
            `[bookAppointment] Business ${businessId} has diagnostic_first booking but no "Diagnostic" service in catalog. Booking "${requestedService.name}" as-is.`,
          );
        }
      }
    }
  } catch (err) {
    console.warn('[bookAppointment] Diagnostic-first swap check failed:', err);
  }

  // Staff-service compatibility check before booking:
  // Uses batched cached map instead of N sequential queries.
  if (resolvedStaffId && serviceId) {
    const staffServiceMap = await getCachedStaffServiceMap(businessId);
    const staffServiceIds = staffServiceMap.get(resolvedStaffId) || [];
    if (staffServiceIds.length > 0 && !staffServiceIds.includes(serviceId)) {
      const serviceLookup = services.find(s => s.id === serviceId);
      const serviceLabel = serviceLookup?.name || 'that service';
      const staffLabel = staffMember ? staffMember.firstName : 'That team member';

      // Find alternative staff who CAN do this service
      const allStaff = await getCachedStaff(businessId);
      const eligibleStaffWithFallback: typeof allStaff = [];
      for (const s of allStaff.filter(st => st.active && st.id !== resolvedStaffId)) {
        const theirServices = staffServiceMap.get(s.id) || [];
        if (theirServices.length === 0 || theirServices.includes(serviceId)) {
          eligibleStaffWithFallback.push(s);
        }
      }

      if (eligibleStaffWithFallback.length > 0) {
        const names = eligibleStaffWithFallback.map(s => s.firstName).join(', ');
        return {
          result: {
            success: false,
            staffServiceMismatch: true,
            message: `${staffLabel} doesn't do ${serviceLabel}, but ${names} ${eligibleStaffWithFallback.length === 1 ? 'does' : 'do'}. Would you like me to book with ${eligibleStaffWithFallback.length === 1 ? eligibleStaffWithFallback[0].firstName : 'one of them'} instead?`,
            eligibleStaff: eligibleStaffWithFallback.map(s => ({
              id: s.id,
              name: `${s.firstName} ${s.lastName || ''}`.trim()
            }))
          }
        };
      } else {
        return {
          result: {
            success: false,
            staffServiceMismatch: true,
            message: `I'm sorry, ${staffLabel} doesn't do ${serviceLabel} and no other team members are available for that service right now. Would you like to try a different service?`
          }
        };
      }
    }
  }

  // Parse date and time using natural language parser (in business timezone)
  const businessTimezone = business.timezone || 'America/New_York';
  const parsedDate = parseNaturalDate(params.date, businessTimezone);
  const timeStr = parseNaturalTime(params.time);
  const [hours, minutes] = timeStr.split(':').map(Number);

  // CRITICAL: Create a proper UTC Date that represents the desired local time in the business timezone.
  // On Railway (UTC server), setHours(14,0) would create 14:00 UTC = 9:00 AM ET — wrong!
  // createDateInTimezone ensures 2pm ET is stored as 19:00 UTC (correct).
  const appointmentDate = createDateInTimezone(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    hours,
    minutes,
    businessTimezone
  );

  // Calculate duration: prefer DB service duration, then AI estimate, then default 60min
  let duration = 60;
  if (serviceId) {
    const matchedService = services.find(s => s.id === serviceId);
    if (matchedService?.duration) {
      duration = matchedService.duration;
    }
  }
  if (!serviceId && params.estimatedDuration && params.estimatedDuration > 0) {
    duration = Math.min(params.estimatedDuration, 480); // Cap at 8 hours
  }
  const endTime = new Date(appointmentDate);
  endTime.setMinutes(endTime.getMinutes() + duration);

  // ── Guard: appointment must be in the future ──────────────────────────────
  // Catches LLM/parser errors that produce past dates (e.g. "Tuesday" parsed
  // as last Tuesday). Past-dated bookings silently break reminders + calendar
  // sync and confuse customers/staff.
  const nowForBookingValidation = new Date();
  if (appointmentDate.getTime() <= nowForBookingValidation.getTime()) {
    return {
      result: {
        success: false,
        pastDate: true,
        error: "I can't book in the past. What date would you like?"
      }
    };
  }

  // ── Guard: appointment must be within 1 year ──────────────────────────────
  // Catches LLM hallucinations (wrong year) and parser edge cases on year
  // boundaries. 1 year is more than any service business books out.
  const oneYearFromNow = new Date(nowForBookingValidation.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (appointmentDate.getTime() > oneYearFromNow.getTime()) {
    return {
      result: {
        success: false,
        tooFarOut: true,
        error: "I can only book up to a year out. What date were you thinking?"
      }
    };
  }

  // ── Guard: business must be open on this day, and time must be within hours ─
  // Day-of-week and HH:MM are computed in BUSINESS timezone (not server UTC).
  // Same pattern used by getAvailableSlotsForDay and others in this file.
  const apptDayName = appointmentDate.toLocaleDateString('en-US', {
    timeZone: businessTimezone,
    weekday: 'long',
  }).toLowerCase();

  const businessHoursForValidation = await getCachedBusinessHours(businessId);
  const dayHours = businessHoursForValidation.find(h => h.day === apptDayName);

  // Closed: explicit isClosed flag, no row, or no open/close times configured
  if (!dayHours || dayHours.isClosed === true || (!dayHours.open && !dayHours.close)) {
    const dayCapitalized = apptDayName.charAt(0).toUpperCase() + apptDayName.slice(1);
    return {
      result: {
        success: false,
        businessClosed: true,
        error: `We're closed on ${dayCapitalized}s. What other day works for you?`
      }
    };
  }

  // Convert HH:MM strings to minutes-since-midnight for comparison
  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const apptStartHHMM = appointmentDate.toLocaleTimeString('en-US', {
    timeZone: businessTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const apptEndHHMM = endTime.toLocaleTimeString('en-US', {
    timeZone: businessTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const apptStartMin = toMinutes(apptStartHHMM);
  const apptEndMin = toMinutes(apptEndHHMM);
  const openMin = toMinutes(dayHours.open);
  const closeMin = toMinutes(dayHours.close);

  // Allow appointments that end exactly at close time (e.g. 5–6pm at a 6pm closer)
  if (apptStartMin < openMin || apptEndMin > closeMin) {
    const fmtTime = (hhmm: string): string => {
      const [h, m] = hhmm.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
    };
    const dayCapitalized = apptDayName.charAt(0).toUpperCase() + apptDayName.slice(1);
    return {
      result: {
        success: false,
        outsideHours: true,
        error: `We're open ${fmtTime(dayHours.open)} to ${fmtTime(dayHours.close)} on ${dayCapitalized}s. Want to try a time within those hours?`
      }
    };
  }

  // Check if staff has time off on the booking date (vacation, sick, etc.)
  if (resolvedStaffId && await isStaffOffOnDate(resolvedStaffId, parsedDate)) {
    const staffLabel = staffMember ? staffMember.firstName : 'That team member';
    const dateDisplay = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return {
      result: {
        success: false,
        staffOff: true,
        error: `${staffLabel} is off on ${dateDisplay}. Would you like to try a different date or book with another team member?`
      }
    };
  }

  // Double-booking prevention: Check if the time slot is already taken (optimized query)
  const existingAppointments = await getAppointmentsOptimized(businessId, {
    staffId: resolvedStaffId,
    daysAhead: 1, // Only need to check today/tomorrow for conflict
    startDate: new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000) // Start from day before
  });

  const conflictingAppointment = existingAppointments.find(apt => {
    if (apt.status === 'cancelled') return false;

    const aptStart = new Date(apt.startDate);
    const aptEnd = new Date(apt.endDate);
    const newStart = appointmentDate;
    const newEnd = endTime;

    // Check for overlap: new appointment starts before existing ends AND new appointment ends after existing starts
    return (newStart < aptEnd && newEnd > aptStart);
  });

  if (conflictingAppointment) {
    const conflictTime = new Date(conflictingAppointment.startDate).toLocaleTimeString('en-US', {
      timeZone: businessTimezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const staffLabel = staffMember ? staffMember.firstName : 'We';
    return {
      result: {
        success: false,
        doubleBooked: true,
        conflictTime: conflictTime,
        message: `I'm sorry, ${staffLabel === 'We' ? 'that time slot is' : staffLabel + ' is'} already booked at ${conflictTime}. Would you like to try a different time?`
      }
    };
  }

  // Auto-cancel previous upcoming appointment for this customer+service (reschedule detection)
  // If the AI called bookAppointment instead of rescheduleAppointment, mark the old one as rescheduled
  if (customerId) {
    try {
      const existingCustomerAppointments = await storage.getAppointmentsByCustomerId(customerId);
      const now = new Date();
      const previousAppointment = existingCustomerAppointments
        .filter(apt =>
          new Date(apt.startDate) > now &&
          apt.status === 'scheduled' &&
          (!serviceId || apt.serviceId === serviceId)
        )
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];

      if (previousAppointment) {
        const oldDateStr = new Date(previousAppointment.startDate).toLocaleDateString('en-US', {
          timeZone: businessTimezone,
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        });
        await storage.updateAppointment(previousAppointment.id, {
          status: 'cancelled',
          notes: `${previousAppointment.notes || ''}\n[Rescheduled to new appointment on ${appointmentDate.toLocaleDateString('en-US', { timeZone: businessTimezone, weekday: 'long', month: 'long', day: 'numeric' })}]`.trim()
        });

        // Also cancel the linked job for the previous appointment
        try {
          const previousJob = await storage.getJobByAppointmentId(previousAppointment.id);
          if (previousJob && previousJob.status !== 'completed' && previousJob.status !== 'cancelled') {
            await storage.updateJob(previousJob.id, {
              status: 'cancelled',
              notes: `${previousJob.notes || ''}\n[Cancelled: appointment rescheduled to new date]`.trim()
            });
          }
        } catch (jobCancelErr) {
          console.error('Error cancelling job for rescheduled appointment:', jobCancelErr);
        }
      }
    } catch (err) {
      console.error('Error auto-cancelling previous appointment:', err);
    }
  }

  // Create the appointment using transactional double-booking prevention
  try {
    const { createAppointmentSafely } = await import('../appointmentService');
    const safeResult = await createAppointmentSafely({
      businessId,
      customerId: customerId!,
      serviceId: serviceId || null,
      staffId: resolvedStaffId || null,
      startDate: appointmentDate,
      endDate: endTime,
      status: 'scheduled',
      notes: params.notes || ''
    });

    if (!safeResult.success) {
      return {
        result: {
          success: false,
          doubleBooked: true,
          message: safeResult.error || 'That time slot was just booked by someone else. Would you like to try a different time?'
        }
      };
    }

    const appointment = safeResult.appointment;

    // Invalidate appointments cache after creating new appointment
    dataCache.invalidate(businessId, 'appointments');

    // Set manage token for self-service cancel/reschedule (same as booking page)
    const crypto = await import('crypto');
    const manageToken = crypto.randomBytes(24).toString('hex');
    try {
      await storage.updateAppointment(appointment.id, { manageToken });
    } catch (tokenErr) {
      console.error('Failed to set manage token on VAPI appointment:', tokenErr);
    }

    // Auto-create a linked Job for this appointment
    let createdJob: any = null;
    try {
      // Build the job title from service name + customer name
      const serviceName = params.serviceName
        || (serviceId ? services.find(s => s.id === serviceId)?.name : null)
        || 'General Appointment';

      // Resolve customer name for the title
      let customerDisplayName = params.customerName || '';
      if (!customerDisplayName && customer) {
        customerDisplayName = `${customer.firstName} ${customer.lastName || ''}`.trim();
      }
      if (!customerDisplayName) {
        try {
          const fetchedCustomer = await storage.getCustomer(customerId!);
          if (fetchedCustomer) {
            customerDisplayName = `${fetchedCustomer.firstName} ${fetchedCustomer.lastName || ''}`.trim();
          }
        } catch (e) {
          // Non-critical, continue with service name only
        }
      }

      const jobTitle = customerDisplayName
        ? `${serviceName} - ${customerDisplayName}`
        : serviceName;

      // Format scheduledDate as YYYY-MM-DD string in the business timezone
      const scheduledDateStr = appointmentDate.toLocaleDateString('en-CA', {
        timeZone: businessTimezone
      });

      createdJob = await storage.createJob({
        businessId,
        customerId: customerId!,
        appointmentId: appointment.id,
        staffId: resolvedStaffId || null,
        title: jobTitle,
        description: serviceName !== 'General Appointment'
          ? `Service: ${serviceName}${params.notes ? `\nNotes: ${params.notes}` : ''}`
          : params.notes || null,
        scheduledDate: scheduledDateStr,
        status: 'pending',
        notes: 'Auto-created from AI receptionist booking',
        urgency: (params.urgency as 'emergency' | 'urgent' | 'routine' | undefined) || null,
        issueType: params.issueType || null,
        symptoms: params.symptoms || null,
        accessNotes: params.accessNotes || null,
      });


      // Fire webhook event (fire-and-forget)
      fireEvent(businessId, 'job.created', { job: createdJob })
        .catch(err => console.error('Webhook fire error (auto-created job):', err));
    } catch (jobError: any) {
      // Job creation failure must NOT block the appointment booking
      console.error('Failed to auto-create job for appointment:', {
        appointmentId: appointment.id,
        error: jobError.message,
      });
    }

    // Sync to Google Calendar if connected (fire-and-forget)
    try {
      const { CalendarService } = await import("../calendarService");
      const calendarService = new CalendarService();
      calendarService.syncAppointment(appointment.id).catch(err =>
        console.error('Background calendar sync error (VAPI):', err)
      );
    } catch (calErr) {
      console.error('Calendar sync import error:', calErr);
    }

    // Format confirmation message (using business timezone for display)
    const dateStr = appointmentDate.toLocaleDateString('en-US', {
      timeZone: businessTimezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    const tzAbbr = getTimezoneAbbreviation(businessTimezone, appointmentDate);
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
      timeZone: businessTimezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' ' + tzAbbr;

    // Build confirmation message with staff name if applicable
    const staffLabel = staffMember ? staffMember.firstName : null;
    const withStaff = staffLabel ? ` with ${staffLabel}` : '';

    // Send SMS confirmation — try multiple sources for the phone number
    let customerPhone = params.customerPhone || callerPhone;
    // Fallback: if no phone from params or caller, look up from the customer record
    if (!customerPhone && customer?.phone) {
      customerPhone = customer.phone;
    }
    console.log(`[bookAppointment] SMS: params.phone="${params.customerPhone}", callerPhone="${callerPhone}", customer.phone="${customer?.phone}", resolved="${customerPhone}"`);
    if (customerPhone) {
      try {
        await twilioService.sendSms(
          customerPhone,
          `Your appointment${withStaff} at ${business.name} is confirmed for ${dateStr} at ${timeStr}. Reply CONFIRM, RESCHEDULE to change, or C to cancel.`,
          undefined,
          businessId || undefined
        );
      } catch (smsError) {
        console.error('Failed to send SMS confirmation:', smsError);
      }
    }


    // Build booking instructions from business context
    const bookingTips: string[] = [];
    // Suggest arriving early for in-person services
    const serviceBasedIndustries = ['salon', 'barber', 'spa', 'dental', 'medical', 'veterinary', 'fitness', 'auto', 'automotive'];
    const businessIndustry = (business.industry || '').toLowerCase();
    if (serviceBasedIndustries.some(ind => businessIndustry.includes(ind))) {
      bookingTips.push('Please arrive about 10 minutes early');
    }
    if (business.address) {
      bookingTips.push(`Located at ${business.address}`);
    }

    return {
      result: {
        success: true,
        appointmentId: appointment.id,
        jobId: createdJob?.id || null,
        staffId: resolvedStaffId,
        staffName: staffLabel,
        confirmed: true,
        date: dateStr,
        time: timeStr,
        // If a diagnostic-first swap happened, report the booked service (the
        // diagnostic) — not the caller's request — so the AI confirms what was
        // actually scheduled. Also surface the swap context so the model can
        // explain it naturally on the call.
        service: diagnosticSwap
          ? diagnosticSwap.diagnosticServiceName
          : (params.serviceName || 'General appointment'),
        ...(diagnosticSwap && {
          diagnosticSwap: {
            requested: diagnosticSwap.originalServiceName,
            booked: diagnosticSwap.diagnosticServiceName,
            fee: diagnosticSwap.diagnosticFee,
            explanation: `The caller asked about "${diagnosticSwap.originalServiceName}" but we booked a diagnostic visit instead. Explain naturally: "Our tech will diagnose the issue on-site and give you a written quote${diagnosticSwap.diagnosticFee !== null ? ` — the $${diagnosticSwap.diagnosticFee} diagnostic fee is waived if you proceed with the repair` : ''}."`,
          },
        }),
        ...(bookingTips.length > 0 && { bookingTips }),
      }
    };
  } catch (error: any) {
    console.error('Error creating appointment:', {
      error: error.message,
      stack: error.stack,
      businessId,
      customerId,
      serviceId,
      staffId: resolvedStaffId,
      appointmentDate,
      endTime
    });
    return {
      result: {
        success: false,
        error: 'Failed to create appointment. Please try again.',
        details: error.message
      }
    };
  }
}

/**
 * Book a recurring appointment series.
 * Creates a recurring_schedule record and books the first appointment.
 * The scheduler service handles future occurrences automatically.
 */
export async function bookRecurringAppointment(
  businessId: number,
  params: {
    customerId?: number;
    customerName?: string;
    customerPhone?: string;
    serviceId?: number;
    serviceName?: string;
    staffId?: number;
    staffName?: string;
    startDate: string;  // "this Friday", "April 7th", or YYYY-MM-DD
    time: string;
    frequency: string;  // "weekly", "biweekly", "monthly"
    occurrences?: number; // number of appointments, default 4
    notes?: string;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  try {
    const business = await getCachedBusiness(businessId);
    if (!business) {
      return { result: { success: false, error: 'Business not found' } };
    }

    const businessTimezone = business.timezone || 'America/New_York';

    // Validate frequency
    const validFrequencies = ['weekly', 'biweekly', 'monthly'];
    const frequency = params.frequency?.toLowerCase();
    if (!frequency || !validFrequencies.includes(frequency)) {
      return {
        result: {
          success: false,
          error: `Frequency must be weekly, biweekly, or monthly. What frequency would you like?`
        }
      };
    }

    // Parse start date
    const parsedDate = parseNaturalDate(params.startDate, businessTimezone);
    const startDateStr = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
    const dayOfWeek = parsedDate.getDay(); // 0-6

    // Resolve customer
    let customerId = params.customerId;
    const customerPhone = params.customerPhone || callerPhone;
    if (!customerId && customerPhone) {
      const customer = await storage.getCustomerByPhone(customerPhone, businessId);
      if (customer) customerId = customer.id;
    }
    if (!customerId) {
      return { result: { success: false, error: 'Could not find your customer record. Can you confirm your name?' } };
    }

    // Resolve service
    let serviceId = params.serviceId;
    let serviceName = params.serviceName || 'Appointment';
    if (!serviceId && params.serviceName) {
      const allServices = await getCachedServices(businessId);
      const match = allServices.find((s: any) =>
        s.name.toLowerCase().includes(params.serviceName!.toLowerCase())
      );
      if (match) {
        serviceId = match.id;
        serviceName = match.name;
      }
    }

    // Resolve staff
    let staffId = params.staffId;
    let staffLabel = '';
    if (!staffId && params.staffName) {
      const allStaff = await getCachedStaff(businessId);
      const match = allStaff.find((s: any) =>
        s.active !== false &&
        (s.firstName.toLowerCase() === params.staffName!.toLowerCase() ||
         s.firstName.toLowerCase().includes(params.staffName!.toLowerCase()))
      );
      if (match) {
        staffId = match.id;
        staffLabel = match.firstName;
      }
    }
    if (staffId && !staffLabel) {
      const staffMember = await storage.getStaffMember(staffId);
      if (staffMember) staffLabel = staffMember.firstName;
    }

    const occurrences = params.occurrences || 4;
    const withStaff = staffLabel ? ` with ${staffLabel}` : '';
    const displayDate = formatDateForVoice(parsedDate, businessTimezone);

    // Calculate end date based on frequency + occurrences
    const endDate = new Date(parsedDate);
    if (frequency === 'weekly') {
      endDate.setDate(endDate.getDate() + (7 * occurrences));
    } else if (frequency === 'biweekly') {
      endDate.setDate(endDate.getDate() + (14 * occurrences));
    } else if (frequency === 'monthly') {
      endDate.setMonth(endDate.getMonth() + occurrences);
    }
    const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    // Create the recurring schedule
    const [schedule] = await db
      .insert(recurringSchedules)
      .values({
        businessId,
        customerId,
        serviceId: serviceId || null,
        staffId: staffId || null,
        name: `${frequency} ${serviceName}${withStaff} for ${params.customerName || 'Customer'}`,
        frequency,
        interval: 1,
        dayOfWeek: (frequency === 'weekly' || frequency === 'biweekly') ? dayOfWeek : undefined,
        dayOfMonth: frequency === 'monthly' ? parsedDate.getDate() : undefined,
        startDate: startDateStr,
        endDate: endDateStr,
        nextRunDate: startDateStr,
        jobTitle: serviceName,
        jobDescription: params.notes || `Recurring ${frequency} ${serviceName}${withStaff}`,
        estimatedDuration: serviceId ? (await getCachedServices(businessId)).find((s: any) => s.id === serviceId)?.duration || 30 : 30,
        autoCreateInvoice: false,
        status: 'active',
      })
      .returning();

    // Book ALL appointments upfront so the caller can see them immediately
    const bookedDates: string[] = [];
    let failedCount = 0;
    const intervalDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 0;

    for (let i = 0; i < occurrences; i++) {
      const appointmentDate = new Date(parsedDate);
      if (frequency === 'monthly') {
        appointmentDate.setMonth(appointmentDate.getMonth() + i);
      } else {
        appointmentDate.setDate(appointmentDate.getDate() + (intervalDays * i));
      }

      const aptDateStr = `${appointmentDate.getFullYear()}-${String(appointmentDate.getMonth() + 1).padStart(2, '0')}-${String(appointmentDate.getDate()).padStart(2, '0')}`;
      const aptDisplayDate = formatDateForVoice(appointmentDate, businessTimezone);

      try {
        // Always pass customerPhone so bookAppointment can send SMS for first appointment
        const result = await bookAppointment(businessId, {
          customerId,
          customerName: params.customerName,
          customerPhone: customerPhone || callerPhone,
          date: aptDateStr,
          time: params.time,
          serviceId,
          serviceName,
          staffId,
          staffName: staffLabel || undefined,
          notes: `${params.notes || ''} [Recurring: ${frequency}, ${i + 1}/${occurrences}]`.trim(),
        }, i === 0 ? (callerPhone || customerPhone) : undefined); // SMS only for first appointment

        const aptResult = result.result;
        if (aptResult?.success) {
          bookedDates.push(aptDisplayDate);
        } else {
          failedCount++;
          console.warn(`[bookRecurringAppointment] Failed to book occurrence ${i + 1}: ${aptResult?.error}`);
        }
      } catch (err) {
        failedCount++;
        console.error(`[bookRecurringAppointment] Error booking occurrence ${i + 1}:`, err instanceof Error ? err.message : String(err));
      }
    }

    console.log(`[bookRecurringAppointment] Schedule ${schedule.id}: ${bookedDates.length}/${occurrences} booked, ${failedCount} failed`);

    // Send a single summary SMS with all booked dates (the first appointment already got its own confirmation)
    if (bookedDates.length > 1 && customerPhone) {
      try {
        const tzAbbr = getTimezoneAbbreviation(businessTimezone);
        const dateList = bookedDates.map((d, i) => `${i + 1}. ${d}`).join('\n');
        await twilioService.sendSms(
          customerPhone,
          `Your ${frequency} ${serviceName}${withStaff} series at ${business.name} is confirmed!\n\n${dateList}\n\nAll at ${params.time} ${tzAbbr}. Reply CONFIRM, RESCHEDULE to change, or C to cancel.`,
          undefined,
          businessId || undefined
        );
      } catch (smsError) {
        console.error('[bookRecurringAppointment] Failed to send summary SMS:', smsError);
      }
    }

    return {
      result: {
        success: bookedDates.length > 0,
        scheduleId: schedule.id,
        frequency,
        occurrences,
        appointmentsBooked: bookedDates.length,
        appointmentDates: bookedDates,
        time: params.time,
        service: serviceName,
        staffName: staffLabel || null,
        message: `Booked ${bookedDates.length} ${frequency} ${serviceName} appointments${withStaff}: ${bookedDates.join(', ')} at ${params.time}.${failedCount > 0 ? ` ${failedCount} could not be booked.` : ''}`
      }
    };
  } catch (error: any) {
    console.error('[bookRecurringAppointment] Error:', error.message);
    return {
      result: {
        success: false,
        error: 'Failed to set up recurring appointments. Would you like to try again or book a single appointment instead?'
      }
    };
  }
}

/**
 * Reschedule an existing appointment
 */
export async function rescheduleAppointment(
  businessId: number,
  params: {
    appointmentId?: number;
    newDate: string;
    newTime: string;
    reason?: string;
    staffName?: string;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  // Find the appointment - either by ID or by customer phone
  let appointment;
  const reschedTimezone = business?.timezone || 'America/New_York';
  if (params.appointmentId) {
    appointment = await storage.getAppointment(params.appointmentId);
  } else if (callerPhone) {
    const customer = await storage.getCustomerByPhone(callerPhone, businessId);
    if (customer) {
      const appointments = await storage.getAppointmentsByCustomerId(customer.id);
      const now = new Date();
      const activeStatuses = ['scheduled', 'confirmed', 'pending'];
      const upcoming = appointments
        .filter(apt => new Date(apt.startDate) > now && activeStatuses.includes(apt.status || ''))
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      if (upcoming.length > 1) {
        // Multiple upcoming appointments — ask the caller which one
        const allServices = await getCachedServices(businessId);
        const appointmentList = upcoming.map((apt) => {
          const aptDate = new Date(apt.startDate);
          const dateStr = aptDate.toLocaleDateString('en-US', { timeZone: reschedTimezone, weekday: 'long', month: 'long', day: 'numeric' });
          const timeStr = aptDate.toLocaleTimeString('en-US', { timeZone: reschedTimezone, hour: 'numeric', minute: '2-digit', hour12: true });
          const svc = apt.serviceId ? allServices.find((s: any) => s.id === apt.serviceId) : null;
          return { appointmentId: apt.id, date: dateStr, time: timeStr, service: svc?.name || 'Appointment' };
        });
        return {
          result: {
            success: false,
            multipleAppointments: true,
            appointments: appointmentList,
            message: `You have ${upcoming.length} upcoming appointments. Which one would you like to reschedule?`
          }
        };
      }

      appointment = upcoming[0];
    }
  }

  // Fallback: if callerPhone is missing but we have the appointment, get phone from customer record
  if (!callerPhone && appointment?.customerId) {
    try {
      const customer = await storage.getCustomer(appointment.customerId);
      if (customer?.phone) {
        callerPhone = customer.phone;
        console.log(`[rescheduleAppointment] Recovered callerPhone from customer record: ${callerPhone}`);
      }
    } catch { /* non-critical */ }
  }

  if (!appointment) {
    return {
      result: {
        success: false,
        error: 'Could not find your upcoming appointment. Can you provide more details?'
      }
    };
  }

  // Parse new date and time using natural language parser (in business timezone)
  const businessTimezone = business?.timezone || 'America/New_York';
  const parsedNewDate = parseNaturalDate(params.newDate, businessTimezone);
  const timeStr = parseNaturalTime(params.newTime);
  const [hours, minutes] = timeStr.split(':').map(Number);
  // Use timezone-aware date construction (same fix as bookAppointment)
  const newDateTime = createDateInTimezone(
    parsedNewDate.getFullYear(),
    parsedNewDate.getMonth(),
    parsedNewDate.getDate(),
    hours,
    minutes,
    businessTimezone
  );

  // Calculate end time based on original duration
  const originalDuration = (new Date(appointment.endDate).getTime() - new Date(appointment.startDate).getTime()) / 60000;
  const newEndTime = new Date(newDateTime);
  newEndTime.setMinutes(newEndTime.getMinutes() + originalDuration);

  // Store old date for the message (display in business timezone)
  const oldDateStr = new Date(appointment.startDate).toLocaleDateString('en-US', {
    timeZone: businessTimezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  // Resolve staff change if caller requested a different person
  let newStaffId: number | undefined;
  if (params.staffName) {
    const allStaff = await storage.getStaff(businessId);
    const match = allStaff.find((s: any) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(params.staffName!.toLowerCase()) ||
      s.firstName.toLowerCase() === params.staffName!.toLowerCase()
    );
    if (match) {
      newStaffId = match.id;
    }
  }

  // ── Availability checks before rescheduling (prevents double-bookings, closed days, staff conflicts) ──
  const rescheduleStaffId = newStaffId ?? appointment.staffId;
  const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const newDayName = daysMap[parsedNewDate.getDay()];

  // 1. Check if business is open on the new date
  const businessHours = await getCachedBusinessHours(businessId);
  const dayHours = businessHours.find(h => h.day === newDayName);
  if (!dayHours || dayHours.isClosed) {
    const newDateDisplay = parsedNewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return {
      result: {
        success: false,
        error: `We're closed on ${newDateDisplay}. Would you like to pick a different day?`
      }
    };
  }

  // 2. Check if staff has time off on the new date
  if (rescheduleStaffId && await isStaffOffOnDate(rescheduleStaffId, parsedNewDate)) {
    const staffMember = await storage.getStaffMember(rescheduleStaffId);
    const staffName = staffMember?.firstName || 'Your stylist';
    const newDateDisplay = parsedNewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return {
      result: {
        success: false,
        error: `${staffName} is off on ${newDateDisplay}. Would you like to try a different day or a different team member?`
      }
    };
  }

  // 3. Check for overlapping appointments (double-booking prevention)
  const existingAppointments = rescheduleStaffId
    ? await getAppointmentsOptimized(businessId, { staffId: rescheduleStaffId })
    : await getAppointmentsOptimized(businessId);

  const hasConflict = existingAppointments.some((apt: any) => {
    if (apt.id === appointment.id) return false; // Skip the appointment being rescheduled
    if (apt.status === 'cancelled') return false;
    const aptStart = new Date(apt.startDate).getTime();
    const aptEnd = new Date(apt.endDate).getTime();
    const newStart = newDateTime.getTime();
    const newEnd = newEndTime.getTime();
    return newStart < aptEnd && newEnd > aptStart; // Overlap check
  });

  if (hasConflict) {
    const newDateDisplay = parsedNewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return {
      result: {
        success: false,
        error: `That time slot is already booked on ${newDateDisplay}. Would you like me to check what's available?`
      }
    };
  }

  // Update the appointment
  try {
    await storage.updateAppointment(appointment.id, {
      startDate: newDateTime,
      endDate: newEndTime,
      ...(newStaffId !== undefined ? { staffId: newStaffId } : {}),
      notes: `${appointment.notes || ''}\n[Rescheduled from ${oldDateStr}${params.reason ? `: ${params.reason}` : ''}${newStaffId !== undefined ? ` (staff changed)` : ''}]`.trim()
    });

    // Update the linked job's scheduled date if one exists
    try {
      const linkedJob = await storage.getJobByAppointmentId(appointment.id);
      if (linkedJob && linkedJob.status !== 'completed' && linkedJob.status !== 'cancelled') {
        const newScheduledDateStr = newDateTime.toLocaleDateString('en-CA', {
          timeZone: businessTimezone
        });
        await storage.updateJob(linkedJob.id, {
          scheduledDate: newScheduledDateStr,
          notes: `${linkedJob.notes || ''}\n[Rescheduled from ${oldDateStr}${params.reason ? `: ${params.reason}` : ''}]`.trim()
        });
      }
    } catch (jobUpdateErr) {
      console.error('Failed to update linked job for rescheduled appointment:', {
        appointmentId: appointment.id,
        error: jobUpdateErr instanceof Error ? jobUpdateErr.message : String(jobUpdateErr)
      });
    }

    const newDateStr = newDateTime.toLocaleDateString('en-US', {
      timeZone: businessTimezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    const newTimeStr = newDateTime.toLocaleTimeString('en-US', {
      timeZone: businessTimezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Send SMS confirmation
    if (callerPhone) {
      try {
        await twilioService.sendSms(
          callerPhone,
          `Your appointment with ${business.name} has been rescheduled to ${newDateStr} at ${newTimeStr}.`,
          undefined,
          businessId || undefined
        );
      } catch (smsError) {
        console.error('Failed to send reschedule SMS:', smsError);
      }
    }

    return {
      result: {
        success: true,
        message: `Your appointment has been rescheduled from ${oldDateStr} to ${newDateStr} at ${newTimeStr}. You'll receive a text confirmation.`,
        newDate: newDateStr,
        newTime: newTimeStr
      }
    };
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return {
      result: {
        success: false,
        error: 'Failed to reschedule appointment. Please try again.'
      }
    };
  }
}

/**
 * Cancel an existing appointment
 */
export async function cancelAppointment(
  businessId: number,
  params: {
    appointmentId?: number;
    reason?: string;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  // Find the appointment
  let appointment;
  if (params.appointmentId) {
    appointment = await storage.getAppointment(params.appointmentId);
  } else if (callerPhone) {
    const customer = await storage.getCustomerByPhone(callerPhone, businessId);
    if (customer) {
      const appointments = await storage.getAppointmentsByCustomerId(customer.id);
      const now = new Date();
      const cancelTimezoneForLookup = business?.timezone || 'America/New_York';
      const activeStatuses = ['scheduled', 'confirmed', 'pending'];
      const upcoming = appointments
        .filter(apt => new Date(apt.startDate) > now && activeStatuses.includes(apt.status || ''))
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      if (upcoming.length > 1) {
        // Multiple upcoming appointments — ask the caller which one
        const allServices = await getCachedServices(businessId);
        const appointmentList = upcoming.map((apt, i) => {
          const aptDate = new Date(apt.startDate);
          const dateStr = aptDate.toLocaleDateString('en-US', { timeZone: cancelTimezoneForLookup, weekday: 'long', month: 'long', day: 'numeric' });
          const timeStr = aptDate.toLocaleTimeString('en-US', { timeZone: cancelTimezoneForLookup, hour: 'numeric', minute: '2-digit', hour12: true });
          const svc = apt.serviceId ? allServices.find((s: any) => s.id === apt.serviceId) : null;
          return { appointmentId: apt.id, date: dateStr, time: timeStr, service: svc?.name || 'Appointment' };
        });
        return {
          result: {
            success: false,
            multipleAppointments: true,
            appointments: appointmentList,
            message: `You have ${upcoming.length} upcoming appointments. Which one would you like to cancel?`
          }
        };
      }

      appointment = upcoming[0];
    }
  }

  // Fallback: if callerPhone is missing but we have the appointment, get phone from customer record
  if (!callerPhone && appointment?.customerId) {
    try {
      const customer = await storage.getCustomer(appointment.customerId);
      if (customer?.phone) {
        callerPhone = customer.phone;
        console.log(`[cancelAppointment] Recovered callerPhone from customer record: ${callerPhone}`);
      }
    } catch { /* non-critical */ }
  }

  if (!appointment) {
    return {
      result: {
        success: false,
        error: 'Could not find your upcoming appointment. Do you have an appointment scheduled with us?'
      }
    };
  }

  const cancelTimezone = business?.timezone || 'America/New_York';
  const dateStr = new Date(appointment.startDate).toLocaleDateString('en-US', {
    timeZone: cancelTimezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = new Date(appointment.startDate).toLocaleTimeString('en-US', {
    timeZone: cancelTimezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  try {
    await storage.updateAppointment(appointment.id, {
      status: 'cancelled',
      notes: `${appointment.notes || ''}\n[Cancelled via phone${params.reason ? `: ${params.reason}` : ''}]`.trim()
    });

    // Cancel the linked job if one exists
    try {
      const linkedJob = await storage.getJobByAppointmentId(appointment.id);
      if (linkedJob && linkedJob.status !== 'cancelled' && linkedJob.status !== 'completed') {
        await storage.updateJob(linkedJob.id, {
          status: 'cancelled',
          notes: `${linkedJob.notes || ''}\n[Cancelled via AI receptionist${params.reason ? `: ${params.reason}` : ''}]`.trim()
        });
      }
    } catch (jobCancelErr) {
      console.error('Failed to cancel linked job for appointment:', {
        appointmentId: appointment.id,
        error: jobCancelErr instanceof Error ? jobCancelErr.message : String(jobCancelErr)
      });
    }

    // Send SMS confirmation
    if (callerPhone) {
      try {
        await twilioService.sendSms(
          callerPhone,
          `Your appointment with ${business.name} on ${dateStr} at ${timeStr} has been cancelled. Call us anytime to reschedule.`,
          undefined,
          businessId || undefined
        );
      } catch (smsError) {
        console.error('Failed to send cancellation SMS:', smsError);
      }
    }

    return {
      result: {
        success: true,
        message: `Your appointment for ${dateStr} at ${timeStr} has been cancelled. Would you like to reschedule for another time?`,
        cancelledDate: dateStr,
        cancelledTime: timeStr
      }
    };
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return {
      result: {
        success: false,
        error: 'Failed to cancel appointment. Please try again.'
      }
    };
  }
}

/**
 * Confirm an upcoming appointment (reminder confirmation)
 */
export async function confirmAppointment(
  businessId: number,
  params: {
    appointmentId?: number;
    confirmed: boolean;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  // Find the appointment
  let appointment;
  if (params.appointmentId) {
    appointment = await storage.getAppointment(params.appointmentId);
  } else if (callerPhone) {
    const customer = await storage.getCustomerByPhone(callerPhone, businessId);
    if (customer) {
      const appointments = await storage.getAppointmentsByCustomerId(customer.id);
      const now = new Date();
      appointment = appointments
        .filter(apt => new Date(apt.startDate) > now && apt.status === 'scheduled')
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
    }
  }

  if (!appointment) {
    return {
      result: {
        success: false,
        error: "I couldn't find an upcoming appointment to confirm. Would you like to schedule one?"
      }
    };
  }

  const confirmBusiness = await getCachedBusiness(businessId);
  const confirmTimezone = confirmBusiness?.timezone || 'America/New_York';
  const aptDate = new Date(appointment.startDate);
  const dateStr = aptDate.toLocaleDateString('en-US', { timeZone: confirmTimezone, weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = aptDate.toLocaleTimeString('en-US', { timeZone: confirmTimezone, hour: 'numeric', minute: '2-digit', hour12: true });

  try {
    if (params.confirmed) {
      await storage.updateAppointment(appointment.id, {
        status: 'confirmed',
        notes: `${appointment.notes || ''}\n[Confirmed via phone on ${new Date().toLocaleDateString()}]`.trim()
      });

      return {
        result: {
          success: true,
          confirmed: true,
          date: dateStr,
          time: timeStr,
        }
      };
    } else {
      // They want to reschedule
      return {
        result: {
          success: true,
          confirmed: false,
          currentDate: dateStr,
          currentTime: timeStr,
        }
      };
    }
  } catch (error) {
    console.error('Error confirming appointment:', error);
    return {
      result: {
        success: false,
        error: 'I had trouble updating the appointment. Please try again.'
      }
    };
  }
}

