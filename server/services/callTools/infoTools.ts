/**
 * callTools/infoTools — business/service/staff information tools: hours,
 * services, staff schedules, estimates, directions, wait times, live
 * open/closed status.
 * Extracted from callToolHandlers.ts (audit R1 split).
 */

import { storage } from '../../storage';
import twilioService from '../twilioService';
import { toMoney } from '../../utils/money';
import {
  getCachedBusinessHours, getCachedServices, getCachedStaff, getCachedStaffHours,
  getCachedBusiness, isStaffOffOnDate, getUpcomingTimeOff, groupConsecutiveDays,
  getAppointmentsOptimized,
} from './cache';
import { getNowInTimezone, getLocalTimeInTimezone, getLocalDateString, parseTimeToMinutes } from './datetime';
import type { FunctionResult, GetEstimateParams } from './types';

/**
 * Get services offered by the business
 */
export async function getServices(businessId: number): Promise<FunctionResult> {
  try {
    const services = await getCachedServices(businessId);

    if (services.length === 0) {
      // Check if the business exists
      const business = await getCachedBusiness(businessId);
      if (!business) {
        console.error(`Business ${businessId} not found when fetching services`);
        return {
          result: {
            services: [],
            error: 'Business not found',
            message: "I'm having trouble accessing our service list. Let me help you schedule a general appointment or have someone call you back with our service offerings."
          }
        };
      }

      return {
        result: {
          services: [],
          message: 'This business has not listed specific services yet. I can help you book a general appointment, or I can take your information and have someone call you back with our service offerings.'
        }
      };
    }

    // Filter to only active services if the field exists
    const activeServices = services.filter(s => s.active !== false);

    const serviceList = activeServices.map(s => ({
      id: s.id,
      name: s.name,
      price: s.price,
      duration: s.duration,
      description: s.description
    }));

    return {
      result: {
        services: serviceList,
        count: activeServices.length,
      }
    };
  } catch (error) {
    console.error(`Error fetching services for business ${businessId}:`, error);
    return {
      result: {
        services: [],
        error: 'Failed to fetch services',
        message: "I'm having some technical difficulties accessing our service list. I can still help you schedule an appointment or take a message. What would you prefer?"
      }
    };
  }
}

/**
 * Get staff members (barbers, stylists, technicians, etc.) for the business
 */
export async function getStaffMembers(businessId: number): Promise<FunctionResult> {
  try {
    const staffList = await getCachedStaff(businessId);
    const business = await getCachedBusiness(businessId);
    const businessTimezone = business?.timezone || 'America/New_York';

    // Filter to only active staff
    const activeStaff = staffList.filter(s => s.active);

    if (activeStaff.length === 0) {
      return {
        result: {
          staff: [],
          message: "We don't have specific team members listed. I can help you book a general appointment. What day and time works best for you?"
        }
      };
    }

    // Get today's day name in business timezone to check who's working
    const now = getNowInTimezone(businessTimezone);
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayDayName = daysOfWeek[now.getDay()];
    const businessHours = await storage.getBusinessHours(businessId);
    const todayBizHours = businessHours.find(h => h.day === todayDayName);
    const businessOpenToday = todayBizHours && !todayBizHours.isClosed;

    // Check each staff member's schedule for today
    const staffDetailsWithSchedule = await Promise.all(activeStaff.map(async (s) => {
      let workingToday = businessOpenToday; // Default to business hours

      // Check staff-specific hours
      const staffHours = await storage.getStaffHours(s.id);
      if (staffHours && staffHours.length > 0) {
        const todayStaffHours = staffHours.find(h => h.day === todayDayName);
        if (todayStaffHours) {
          workingToday = !todayStaffHours.isOff;
        }
      }

      // Check time-off / vacation
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const isOff = await isStaffOffOnDate(s.id, today);
      if (isOff) workingToday = false;

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        firstName: s.firstName,
        specialty: s.specialty || null,
        bio: s.bio || null,
        workingToday,
      };
    }));

    const workingNow = staffDetailsWithSchedule.filter(s => s.workingToday);
    const offToday = staffDetailsWithSchedule.filter(s => !s.workingToday);

    return {
      result: {
        staff: staffDetailsWithSchedule,
        count: activeStaff.length,
        workingToday: workingNow.map(s => s.firstName),
        offToday: offToday.map(s => s.firstName),
        todayIs: todayDayName,
      }
    };
  } catch (error) {
    console.error(`Error fetching staff for business ${businessId}:`, error);
    return {
      result: {
        staff: [],
        error: 'Failed to fetch staff members',
      }
    };
  }
}

/**
 * Get a staff member's working schedule/hours
 */
export async function getStaffSchedule(
  businessId: number,
  staffName?: string,
  staffId?: number
): Promise<FunctionResult> {
  try {
    const allStaff = await getCachedStaff(businessId);
    let staffMember: any = null;

    // Find staff by name or ID
    if (staffId) {
      staffMember = allStaff.find(s => s.id === staffId);
    } else if (staffName) {
      staffMember = allStaff.find(s =>
        s.firstName.toLowerCase() === staffName.toLowerCase() ||
        `${s.firstName} ${s.lastName}`.toLowerCase() === staffName.toLowerCase()
      );
    }

    if (!staffMember) {
      const staffNames = allStaff.filter(s => s.active).map(s => s.firstName).join(', ');
      return {
        result: {
          found: false,
          availableStaff: staffNames,
        }
      };
    }

    // Get staff hours
    const staffHours = await getCachedStaffHours(staffMember.id, businessId);
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    if (!staffHours || staffHours.length === 0) {
      // Fall back to business hours
      const businessHours = await getCachedBusinessHours(businessId);
      const workingDays = businessHours
        .filter(h => !h.isClosed && h.open)
        .sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day))
        .map(h => h.day.charAt(0).toUpperCase() + h.day.slice(1));

      return {
        result: {
          found: true,
          staffName: staffMember.firstName,
          staffId: staffMember.id,
          usesBusinessHours: true,
          workingDays: workingDays,
        }
      };
    }

    // Format staff-specific hours, merging with business hours for uncovered days
    // If staff only has entries for Mon-Thu, use business hours for Fri-Sun
    const businessHours = await getCachedBusinessHours(businessId);
    const staffHoursByDay = new Map(staffHours.map(h => [h.day, h]));
    const workingDays: string[] = [];
    const schedule: string[] = [];
    const daysOff: string[] = [];

    const formatTime = (time: string) => {
      if (!time) return '';
      const [hourStr, minStr] = time.split(':');
      const hour = parseInt(hourStr);
      const min = parseInt(minStr || '0');
      const period = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      return min > 0 ? `${hour12}:${minStr} ${period}` : `${hour12} ${period}`;
    };

    for (const day of dayOrder) {
      const dayName = day.charAt(0).toUpperCase() + day.slice(1);
      const staffDay = staffHoursByDay.get(day);

      if (staffDay) {
        // Staff has explicit hours for this day
        if (staffDay.isOff) {
          daysOff.push(dayName);
        } else {
          workingDays.push(dayName);
          schedule.push(`${dayName}: ${formatTime(staffDay.startTime)} to ${formatTime(staffDay.endTime)}`);
        }
      } else {
        // No staff-specific entry — fall back to business hours for this day
        const bizDay = businessHours.find(h => h.day === day);
        if (bizDay && !bizDay.isClosed && bizDay.open) {
          workingDays.push(dayName);
          schedule.push(`${dayName}: ${formatTime(bizDay.open)} to ${formatTime(bizDay.close)} (business hours)`);
        }
        // If business is also closed this day, don't add to either list
      }
    }

    // Check for upcoming time off (vacation, sick days, etc.)
    const upcomingTimeOff = await getUpcomingTimeOff(staffMember.id);
    const timeOffInfo: string[] = [];
    for (const entry of upcomingTimeOff.slice(0, 3)) { // Show up to 3 upcoming
      const start = new Date(entry.startDate);
      const end = new Date(entry.endDate);
      const startStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (start.toDateString() === end.toDateString()) {
        timeOffInfo.push(`${startStr}${entry.reason ? ` (${entry.reason})` : ''}`);
      } else {
        const endStr = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        timeOffInfo.push(`${startStr} through ${endStr}${entry.reason ? ` (${entry.reason})` : ''}`);
      }
    }

    let message = `${staffMember.firstName} works ${groupConsecutiveDays(workingDays)}.`;
    if (daysOff.length > 0) {
      message += ` ${staffMember.firstName} is off on ${groupConsecutiveDays(daysOff)}.`;
    }
    if (timeOffInfo.length > 0) {
      message += ` ${staffMember.firstName} also has time off scheduled: ${timeOffInfo.join(', ')}.`;
    }
    message += ` Would you like to schedule an appointment with ${staffMember.firstName}?`;

    return {
      result: {
        found: true,
        staffName: staffMember.firstName,
        staffId: staffMember.id,
        workingDays: workingDays,
        daysOff: daysOff,
        schedule: schedule,
        upcomingTimeOff: timeOffInfo.length > 0 ? timeOffInfo : undefined,
      }
    };
  } catch (error) {
    console.error(`Error fetching staff schedule:`, error);
    return {
      result: {
        error: 'Failed to fetch schedule',
        message: "I'm having trouble getting that information. Would you like me to check their availability for a specific day instead?"
      }
    };
  }
}


/**
 * Get business hours
 */
export async function getBusinessHours(businessId: number): Promise<FunctionResult> {
  const business = await getCachedBusiness(businessId);
  if (!business) {
    return { result: { error: 'Business not found' } };
  }

  const hours = await getCachedBusinessHours(businessId);

  if (hours.length === 0) {
    return {
      result: {
        hours: 'Monday through Friday, 9 AM to 5 PM',
        isOpen: false,
      }
    };
  }

  const daysOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const sortedHours = hours.sort((a, b) => daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day));

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${hour}${m > 0 ? ':' + m.toString().padStart(2, '0') : ''} ${period}`;
  };

  // Group consecutive days with the same hours for natural speech
  const dayEntries = sortedHours.map(h => {
    const day = h.day.charAt(0).toUpperCase() + h.day.slice(1);
    if (h.isClosed) {
      return { day, key: 'Closed', label: 'Closed' };
    }
    const timeRange = `${formatTime(h.open || '09:00')} to ${formatTime(h.close || '17:00')}`;
    return { day, key: timeRange, label: timeRange };
  });

  const groups: { days: string[]; label: string }[] = [];
  for (const entry of dayEntries) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === entry.label) {
      lastGroup.days.push(entry.day);
    } else {
      groups.push({ days: [entry.day], label: entry.label });
    }
  }

  const hoursText = groups.map(g => {
    const dayRange = g.days.length > 2
      ? `${g.days[0]} through ${g.days[g.days.length - 1]}`
      : g.days.length === 2
        ? `${g.days[0]} and ${g.days[1]}`
        : g.days[0];
    return `${dayRange}: ${g.label}`;
  }).join(', ');

  // Check if business is currently open (use business timezone, not UTC)
  const bizTimezone = business?.timezone || 'America/New_York';
  const now = getNowInTimezone(bizTimezone);
  const currentDay = daysOrder[now.getDay() === 0 ? 6 : now.getDay() - 1];
  const todayHours = sortedHours.find(h => h.day === currentDay);

  let isOpen = false;
  let statusMessage = '';

  if (todayHours && !todayHours.isClosed) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [openH, openM] = (todayHours.open || '09:00').split(':').map(Number);
    const [closeH, closeM] = (todayHours.close || '17:00').split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

    if (isOpen) {
      statusMessage = `We're currently open until ${formatTime(todayHours.close || '17:00')}.`;
    } else if (currentMinutes < openMinutes) {
      statusMessage = `We open today at ${formatTime(todayHours.open || '09:00')}.`;
    } else {
      statusMessage = `We're closed for today. `;
      // Find next open day
      for (let i = 1; i <= 7; i++) {
        const nextIndex = (daysOrder.indexOf(currentDay) + i) % 7;
        const nextDay = sortedHours.find(h => h.day === daysOrder[nextIndex]);
        if (nextDay && !nextDay.isClosed) {
          const nextDayName = daysOrder[nextIndex].charAt(0).toUpperCase() + daysOrder[nextIndex].slice(1);
          statusMessage += `We open again ${nextDayName} at ${formatTime(nextDay.open || '09:00')}.`;
          break;
        }
      }
    }
  } else {
    statusMessage = `We're closed today.`;
  }

  return {
    result: {
      hours: hoursText,
      isOpen,
      statusMessage,
      voiceHint: 'Read the hours exactly as written — say "through" not commas between day ranges.',
    }
  };
}

/**
 * Get an estimate for services
 */
export async function getEstimate(
  businessId: number,
  params: {
    serviceNames?: string[];
    description?: string;
  }
): Promise<FunctionResult> {
  const services = await storage.getServices(businessId);

  if (services.length === 0) {
    return {
      result: {
        message: "I'd be happy to get you an estimate. Can you describe what you need done, and I'll have someone call you back with pricing?"
      }
    };
  }

  let matchedServices: any[] = [];
  let totalEstimate = 0;
  let totalDuration = 0;

  if (params.serviceNames && params.serviceNames.length > 0) {
    for (const name of params.serviceNames) {
      const match = services.find(s =>
        s.name.toLowerCase().includes(name.toLowerCase()) ||
        (s.description && s.description.toLowerCase().includes(name.toLowerCase()))
      );
      if (match) {
        matchedServices.push(match);
        totalEstimate += toMoney(match.price);
        totalDuration += match.duration || 60;
      }
    }
  }

  if (matchedServices.length === 0 && params.description) {
    // Try to match based on description
    const keywords = params.description.toLowerCase().split(' ');
    for (const service of services) {
      for (const keyword of keywords) {
        if (service.name.toLowerCase().includes(keyword) ||
            (service.description && service.description.toLowerCase().includes(keyword))) {
          matchedServices.push(service);
          totalEstimate += toMoney(service.price);
          totalDuration += service.duration || 60;
          break;
        }
      }
    }
  }

  if (matchedServices.length === 0) {
    // Cap at 5 most popular services instead of dumping the entire catalog over voice
    const topServices = services.slice(0, 5);
    return {
      result: {
        estimateAvailable: false,
        services: topServices.map(s => ({ name: s.name, price: s.price })),
        totalServicesAvailable: services.length,
        message: services.length > 5
          ? `I have ${services.length} services available. Here are some popular ones — or tell me more about what you need and I can narrow it down.`
          : undefined,
      }
    };
  }

  const serviceList = matchedServices.map(s => `${s.name}: $${s.price}`).join(', ');

  return {
    result: {
      estimateAvailable: true,
      services: matchedServices.map(s => ({ name: s.name, price: s.price, duration: s.duration })),
      totalEstimate,
      totalDuration,
    }
  };
}


/**
 * Get real-time open/closed status for a business (called per-call, not cached in prompt)
 */
export async function getCurrentBusinessStatus(businessId: number): Promise<string> {
  try {
    const [business, hours] = await Promise.all([
      getCachedBusiness(businessId),
      getCachedBusinessHours(businessId),
    ]);
    const timezone = business?.timezone || 'America/New_York';
    const now = new Date();
    const todayFull = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const today = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' }).toLowerCase();
    const todayHours = hours?.find((h: any) => h.day === today);

    if (!todayHours || todayHours.isClosed || (!todayHours.open && !todayHours.close)) {
      return `TODAY IS ${todayFull}. CLOSED today. Hours resume next open day.`;
    }

    // Parse current time in business timezone
    const currentTimeStr = now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
    const [curH, curM] = currentTimeStr.split(':').map(Number);
    const currentMinutes = curH * 60 + curM;

    const openMin = parseTimeToMinutes(todayHours.open);
    const closeMin = parseTimeToMinutes(todayHours.close);

    if (currentMinutes >= openMin && currentMinutes < closeMin) {
      return `TODAY IS ${todayFull}. OPEN now (hours: ${todayHours.open} to ${todayHours.close})`;
    } else {
      return `TODAY IS ${todayFull}. CLOSED right now (hours were ${todayHours.open} to ${todayHours.close}). You can still book appointments.`;
    }
  } catch (err) {
    console.error(`[getCurrentBusinessStatus] Error for business ${businessId}:`, err);
    return 'Hours unavailable';
  }
}


/**
 * Expand common address abbreviations for TTS (text-to-speech) readability.
 * "123 Canton BLVD" → "123 Canton Boulevard"
 */
export function expandAddressAbbreviations(address: string): string {
  const abbrevs: Record<string, string> = {
    'BLVD': 'Boulevard', 'Blvd': 'Boulevard', 'blvd': 'boulevard',
    'ST': 'Street', 'St': 'Street', 'st': 'street',
    'AVE': 'Avenue', 'Ave': 'Avenue', 'ave': 'avenue',
    'DR': 'Drive', 'Dr': 'Drive', 'dr': 'drive',
    'LN': 'Lane', 'Ln': 'Lane', 'ln': 'lane',
    'CT': 'Court', 'Ct': 'Court', 'ct': 'court',
    'PL': 'Place', 'Pl': 'Place', 'pl': 'place',
    'RD': 'Road', 'Rd': 'Road', 'rd': 'road',
    'PKY': 'Parkway', 'Pky': 'Parkway', 'PKWY': 'Parkway', 'Pkwy': 'Parkway',
    'CIR': 'Circle', 'Cir': 'Circle',
    'HWY': 'Highway', 'Hwy': 'Highway',
    'STE': 'Suite', 'Ste': 'Suite',
    'APT': 'Apartment', 'Apt': 'Apartment',
    'FLR': 'Floor', 'Flr': 'Floor',
    'N': 'North', 'S': 'South', 'E': 'East', 'W': 'West',
    'NE': 'Northeast', 'NW': 'Northwest', 'SE': 'Southeast', 'SW': 'Southwest',
  };
  // Only replace whole words (word boundaries)
  return address.replace(/\b([A-Za-z]+)\b/g, (match) => abbrevs[match] || match);
}

/**
 * Get directions to the business and optionally text a Google Maps link.
 * If sendSms is true AND callerPhone is available, sends the link immediately.
 */
export async function getDirections(businessId: number, callerPhone?: string, sendSms?: boolean): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { error: 'Business not found' } };
  }

  const rawAddress = [business.address, business.city, business.state, business.zip]
    .filter(Boolean)
    .join(', ');

  if (!rawAddress) {
    return {
      result: {
        hasAddress: false,
        message: "I don't have the exact address on file. Would you like me to have someone call you with directions?"
      }
    };
  }

  // Expand abbreviations for voice readability
  const spokenAddress = expandAddressAbbreviations(rawAddress);
  const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(rawAddress)}`;

  // If caller asked for a text, send it now
  if (sendSms && callerPhone) {
    try {
      await twilioService.sendSms(
        callerPhone,
        `Here are directions to ${business.name}: ${mapsUrl}`,
        undefined,
        businessId
      );
      return {
        result: {
          hasAddress: true,
          address: spokenAddress,
          smsSent: true,
          message: `Our address is ${spokenAddress}. I just texted you a Google Maps link.`
        }
      };
    } catch (err) {
      console.error('[getDirections] Failed to send SMS:', err instanceof Error ? err.message : String(err));
      return {
        result: {
          hasAddress: true,
          address: spokenAddress,
          smsSent: false,
          message: `Our address is ${spokenAddress}. I wasn't able to send the text, but you can look us up on Google Maps.`
        }
      };
    }
  }

  return {
    result: {
      hasAddress: true,
      address: spokenAddress,
      smsSent: false,
      voiceHint: 'Read the address aloud. Then ask: "Want me to text you a Google Maps link?" If yes, call getDirections again with sendSms true.'
    }
  };
}

/**
 * Check current wait time or next available appointment
 */
export async function checkWaitTime(businessId: number): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { error: 'Business not found' } };
  }

  // Get today's appointments using business timezone
  const waitTimezone = business?.timezone || 'America/New_York';
  const now = getNowInTimezone(waitTimezone);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const appointments = await storage.getUpcomingAppointmentsByBusinessId(businessId);

  const todayAppointments = appointments
    .filter(apt => {
      const aptDate = new Date(apt.startDate);
      return aptDate >= today && aptDate < new Date(today.getTime() + 86400000) && apt.status === 'scheduled';
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  // Find next available slot
  const businessHours = await storage.getBusinessHours(businessId);
  const todayDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  const todayHours = businessHours.find(h => h.day === todayDayName);

  if (!todayHours || todayHours.isClosed) {
    return {
      result: {
        isOpen: false,
      }
    };
  }

  const [closeH, closeM] = (todayHours.close || '17:00').split(':').map(Number);
  const closeTime = closeH * 60 + closeM;
  const currentTime = now.getHours() * 60 + now.getMinutes();

  if (currentTime >= closeTime) {
    return {
      result: {
        isOpen: false,
        closedForDay: true,
      }
    };
  }

  // Calculate next available slot (use wall-clock now)
  let nextAvailableMinutes = Math.ceil(currentTime / 30) * 30; // Round to next 30 min

  const bookedTimes = todayAppointments.map(apt => {
    const start = new Date(apt.startDate);
    const local = getLocalTimeInTimezone(start, waitTimezone);
    return local.hours * 60 + local.minutes;
  });

  // Find first open slot
  while (nextAvailableMinutes < closeTime) {
    if (!bookedTimes.some(bt => Math.abs(bt - nextAvailableMinutes) < 60)) {
      break;
    }
    nextAvailableMinutes += 30;
  }

  const nextHour = Math.floor(nextAvailableMinutes / 60);
  const nextMin = nextAvailableMinutes % 60;
  const nextHour12 = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour;
  const nextAmPm = nextHour < 12 ? 'AM' : 'PM';
  const nextTimeStr = `${nextHour12}:${nextMin.toString().padStart(2, '0')} ${nextAmPm}`;
  const waitMinutes = Math.max(0, nextAvailableMinutes - currentTime);

  return {
    result: {
      isOpen: true,
      nextAvailable: nextTimeStr,
      waitMinutes,
      appointmentsToday: todayAppointments.length,
    }
  };
}


/**
 * Get detailed information about a specific service
 */
export async function getServiceDetails(
  businessId: number,
  serviceName: string
): Promise<FunctionResult> {
  try {
    const services = await getCachedServices(businessId);

    if (services.length === 0) {
      return {
        result: {
          found: false,
          message: "I don't have detailed service information on file, but I can have someone call you back to discuss our services. Would that help?"
        }
      };
    }

    // Filter to active services
    const activeServices = services.filter(s => s.active !== false);

    // Try to find matching service with improved matching
    const searchTerms = serviceName.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    let bestMatch = null;
    let bestScore = 0;

    for (const service of activeServices) {
      let score = 0;
      const nameLower = service.name.toLowerCase();
      const descLower = (service.description || '').toLowerCase();

      // Exact name match gets highest score
      if (nameLower === serviceName.toLowerCase()) {
        score = 100;
      } else {
        // Check if service name contains the search query
        if (nameLower.includes(serviceName.toLowerCase())) {
          score += 20;
        }

        // Check individual terms
        for (const term of searchTerms) {
          if (nameLower.includes(term)) score += 5;
          if (descLower.includes(term)) score += 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = service;
      }
    }

    if (bestMatch && bestScore > 0) {
      const durationText = bestMatch.duration
        ? ` and typically takes about ${bestMatch.duration} minutes`
        : '';

      return {
        result: {
          found: true,
          service: {
            id: bestMatch.id,
            name: bestMatch.name,
            price: bestMatch.price,
            duration: bestMatch.duration,
            description: bestMatch.description
          },
        }
      };
    }

    // Didn't find a match, list available services
    const serviceList = activeServices.slice(0, 4).map(s => s.name).join(', ');
    return {
      result: {
        found: false,
        availableServices: activeServices.map(s => ({ name: s.name, price: s.price })),
      }
    };
  } catch (error) {
    console.error(`Error in getServiceDetails:`, error);
    return {
      result: {
        found: false,
        error: 'Failed to fetch service details',
      }
    };
  }
}

