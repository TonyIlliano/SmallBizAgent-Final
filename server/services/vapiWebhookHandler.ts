/**
 * Vapi Webhook Handler
 *
 * Handles function calls from Vapi AI during phone conversations
 * This is where the AI gets real data and performs actions
 */

import { storage } from '../storage';
import twilioService from './twilioService';
import { getCachedMenu as getCloverCachedMenu, createOrder as createCloverOrder, formatMenuForPrompt, type CachedMenu } from './cloverService';
import { getCachedMenu as getSquareCachedMenu, createOrder as createSquareOrder } from './squareService';

/**
 * ===========================================
 * PERFORMANCE: In-Memory Cache with TTL
 * ===========================================
 * Caches frequently accessed data to reduce database queries
 * during phone calls. Data is cached per-business with a 5-minute TTL.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class BusinessDataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly SHORT_TTL = 2 * 60 * 1000;   // 2 minutes for appointments

  private getCacheKey(type: string, businessId: number, extra?: string): string {
    return `${type}:${businessId}${extra ? `:${extra}` : ''}`;
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  get<T>(type: string, businessId: number, extra?: string): T | null {
    const key = this.getCacheKey(type, businessId, extra);
    const entry = this.cache.get(key);

    if (!entry || this.isExpired(entry)) {
      if (entry) this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(type: string, businessId: number, data: T, extra?: string, customTtl?: number): void {
    const key = this.getCacheKey(type, businessId, extra);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: customTtl || this.DEFAULT_TTL
    });
  }

  // Invalidate cache for a business (call after writes)
  invalidate(businessId: number, type?: string): void {
    const prefix = type ? `${type}:${businessId}` : `:${businessId}`;
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.includes(prefix)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Clear all cache (useful for testing)
  clear(): void {
    this.cache.clear();
  }

  // Get cache stats for debugging
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Singleton cache instance
const dataCache = new BusinessDataCache();

/**
 * Cached data fetchers - wrap storage calls with caching
 */
async function getCachedBusinessHours(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('hours', businessId);
  if (cached) {
    console.log(`[CACHE HIT] Business hours for business ${businessId}`);
    return cached;
  }

  console.log(`[CACHE MISS] Fetching business hours for business ${businessId}`);
  const hours = await storage.getBusinessHours(businessId);
  dataCache.set('hours', businessId, hours);
  return hours;
}

async function getCachedServices(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('services', businessId);
  if (cached) {
    console.log(`[CACHE HIT] Services for business ${businessId}`);
    return cached;
  }

  console.log(`[CACHE MISS] Fetching services for business ${businessId}`);
  const services = await storage.getServices(businessId);
  dataCache.set('services', businessId, services);
  return services;
}

async function getCachedStaff(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('staff', businessId);
  if (cached) {
    console.log(`[CACHE HIT] Staff for business ${businessId}`);
    return cached;
  }

  console.log(`[CACHE MISS] Fetching staff for business ${businessId}`);
  const staff = await storage.getStaff(businessId);
  dataCache.set('staff', businessId, staff);
  return staff;
}

async function getCachedStaffHours(staffId: number, businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('staffHours', businessId, `staff${staffId}`);
  if (cached) {
    console.log(`[CACHE HIT] Staff hours for staff ${staffId}`);
    return cached;
  }

  console.log(`[CACHE MISS] Fetching staff hours for staff ${staffId}`);
  const hours = await storage.getStaffHours(staffId);
  dataCache.set('staffHours', businessId, hours, `staff${staffId}`);
  return hours;
}

async function getCachedBusiness(businessId: number): Promise<any | undefined> {
  const cached = dataCache.get<any>('business', businessId);
  if (cached) {
    console.log(`[CACHE HIT] Business ${businessId}`);
    return cached;
  }

  console.log(`[CACHE MISS] Fetching business ${businessId}`);
  const business = await storage.getBusiness(businessId);
  if (business) {
    dataCache.set('business', businessId, business);
  }
  return business;
}

/**
 * Get appointments with date range limit for performance
 * Only fetches appointments for the next 30 days by default
 */
async function getAppointmentsOptimized(
  businessId: number,
  options?: {
    staffId?: number;
    daysAhead?: number;
    startDate?: Date;
  }
): Promise<any[]> {
  const daysAhead = options?.daysAhead || 30;
  const startDate = options?.startDate || new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysAhead);

  // Use shorter cache TTL for appointments since they change more frequently
  const cacheKey = options?.staffId ? `staff${options.staffId}` : 'all';
  const cached = dataCache.get<any[]>('appointments', businessId, cacheKey);

  if (cached) {
    console.log(`[CACHE HIT] Appointments for business ${businessId} (${cacheKey})`);
    // Filter cached data by date range (in case cache has wider range)
    return cached.filter(apt => {
      const aptDate = new Date(apt.startDate);
      return aptDate >= startDate && aptDate <= endDate;
    });
  }

  console.log(`[CACHE MISS] Fetching appointments for business ${businessId} (next ${daysAhead} days)`);

  let appointments;
  if (options?.staffId) {
    appointments = await storage.getAppointments(businessId, {
      staffId: options.staffId,
      startDate,
      endDate
    });
  } else {
    appointments = await storage.getAppointments(businessId, {
      startDate,
      endDate
    });
  }

  // Cache with shorter TTL (2 minutes) since appointments change more often
  dataCache.set('appointments', businessId, appointments, cacheKey, 2 * 60 * 1000);
  return appointments;
}

// Export cache for invalidation from routes when data changes
export { dataCache };

/**
 * ===========================================
 * TIMEZONE UTILITIES
 * ===========================================
 * Uses Node.js built-in Intl.DateTimeFormat to get the current
 * date/time in a business's timezone. This ensures "tomorrow at 2pm"
 * means 2pm in the business's local time, not the server's timezone.
 */

/**
 * Get the current date/time in a specific IANA timezone.
 * Returns a Date whose local components (getHours, getDate, etc.)
 * correspond to the wall clock time in the given timezone.
 */
function getNowInTimezone(timezone: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const get = (type: string) => parts.find(p => p.type === type)?.value || '0';

    return new Date(
      parseInt(get('year')),
      parseInt(get('month')) - 1,
      parseInt(get('day')),
      parseInt(get('hour')),
      parseInt(get('minute')),
      parseInt(get('second'))
    );
  } catch (error) {
    console.warn(`Invalid timezone "${timezone}", falling back to America/New_York:`, error);
    return getNowInTimezone('America/New_York');
  }
}

/**
 * Get today's date at midnight in a specific timezone.
 * Returns a "wall clock" Date (year/month/day match the timezone, but hours are 0).
 */
function getTodayInTimezone(timezone: string): Date {
  const now = getNowInTimezone(timezone);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Create a proper UTC Date from "wall clock" components in a specific timezone.
 *
 * Problem: On Railway (UTC server), `new Date(2025, 1, 12, 14, 0)` creates 14:00 UTC,
 * but if the business is in America/New_York, 2pm ET = 7pm UTC (19:00 UTC).
 *
 * Solution: Calculate the UTC offset for the given timezone and adjust accordingly.
 * This ensures that when Drizzle/Postgres stores the Date, the correct absolute time is saved.
 *
 * Example: createDateInTimezone(2025, 1, 12, 14, 0, 'America/New_York')
 *  → Returns Date representing 2025-02-12T19:00:00.000Z (2pm ET = 7pm UTC)
 */
function createDateInTimezone(year: number, month: number, day: number, hours: number, minutes: number, timezone: string): Date {
  // Create a date string in ISO-like format, then use Intl to find the offset
  // Step 1: Create a "guess" date in UTC
  const utcGuess = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));

  // Step 2: Format that UTC instant in the target timezone to see what local time it maps to
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(utcGuess);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');

  // Step 3: Calculate the offset: how many minutes difference between UTC and local
  const localAtUtcGuess = new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = utcGuess.getTime() - localAtUtcGuess.getTime();

  // Step 4: The desired local time as if it were UTC, then add offset to get true UTC
  const desiredAsUtc = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  const result = new Date(desiredAsUtc.getTime() + offsetMs);

  // Step 5: Verify - the offset might be slightly wrong if we crossed a DST boundary
  // Re-check: format the result in the target timezone and verify hours match
  const verifyParts = formatter.formatToParts(result);
  const verifyHour = parseInt(verifyParts.find(p => p.type === 'hour')?.value || '0');
  const verifyMin = parseInt(verifyParts.find(p => p.type === 'minute')?.value || '0');

  if (verifyHour !== hours || verifyMin !== minutes) {
    // DST edge case: recalculate with the corrected offset
    const correction = ((hours - verifyHour) * 60 + (minutes - verifyMin)) * 60 * 1000;
    return new Date(result.getTime() + correction);
  }

  return result;
}

/**
 * Parse natural language date expressions into actual dates
 * Handles: "tomorrow", "next tuesday", "in 2 days", "next week", etc.
 */
function parseNaturalDate(dateStr: string, timezone: string = 'America/New_York'): Date {
  const now = getNowInTimezone(timezone);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const input = dateStr.toLowerCase().trim();

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(input + 'T12:00:00');
  }

  // "today"
  if (input === 'today') {
    return today;
  }

  // "tomorrow"
  if (input === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // "day after tomorrow"
  if (input.includes('day after tomorrow')) {
    const dat = new Date(today);
    dat.setDate(dat.getDate() + 2);
    return dat;
  }

  // "in X days"
  const inDaysMatch = input.match(/in (\d+) days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1]);
    const future = new Date(today);
    future.setDate(future.getDate() + days);
    return future;
  }

  // "next week" (next Monday)
  if (input === 'next week') {
    const nextWeek = new Date(today);
    const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
    nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
    return nextWeek;
  }

  // "this week" day names
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // "next tuesday", "this friday", etc.
  for (let i = 0; i < daysOfWeek.length; i++) {
    const day = daysOfWeek[i];
    if (input.includes(day)) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysToAdd = targetDay - currentDay;

      // If "next" is specified or the day has passed, go to next week
      if (input.includes('next') || daysToAdd <= 0) {
        daysToAdd += 7;
      }

      const result = new Date(today);
      result.setDate(result.getDate() + daysToAdd);
      return result;
    }
  }

  // "end of week" (Friday)
  if (input.includes('end of') && input.includes('week')) {
    const endOfWeek = new Date(today);
    const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
    endOfWeek.setDate(endOfWeek.getDate() + daysUntilFriday);
    return endOfWeek;
  }

  // Try parsing as a date directly
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Default: return today if we can't parse
  console.warn(`Could not parse date: ${dateStr}, defaulting to today`);
  return today;
}

/**
 * Parse natural language time expressions
 * Handles: "2pm", "2:30", "afternoon", "morning", etc.
 */
function parseNaturalTime(timeStr: string): string {
  const input = timeStr.toLowerCase().trim();

  // Already in HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(input)) {
    const [h, m] = input.split(':').map(Number);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // "2pm", "2:30pm", "10am"
  const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3]?.toLowerCase();

    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    // If no am/pm specified and hour is 1-7, assume PM (business hours)
    if (!period && hours >= 1 && hours <= 7) hours += 12;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // Time of day keywords
  if (input.includes('morning') || input.includes('first thing')) {
    return '09:00';
  }
  if (input.includes('noon') || input.includes('lunch')) {
    return '12:00';
  }
  if (input.includes('afternoon')) {
    return '14:00';
  }
  if (input.includes('evening') || input.includes('end of day')) {
    return '16:00';
  }

  // Default: 10am if we can't parse
  console.warn(`Could not parse time: ${timeStr}, defaulting to 10:00`);
  return '10:00';
}

interface VapiWebhookRequest {
  message: {
    type: string;
    call?: {
      id: string;
      phoneNumber?: {
        number: string;
      };
      customer?: {
        number: string;
      };
      assistant?: {
        metadata?: {
          businessId?: string;
        };
      };
      metadata?: {
        businessId?: string;
      };
    };
    functionCall?: {
      name: string;
      parameters: Record<string, any>;
    };
    transcript?: string;
    endedReason?: string;
    assistant?: {
      metadata?: {
        businessId?: string;
      };
    };
  };
  metadata?: {
    businessId?: string;
  };
}

interface FunctionResult {
  result: any;
}

/**
 * Handle Vapi webhook requests
 */
export async function handleVapiWebhook(
  request: VapiWebhookRequest
): Promise<FunctionResult | { error: string } | null> {
  const { message, metadata } = request;

  // Log the FULL request to understand the structure
  console.log('=== Vapi Webhook FULL REQUEST ===');
  console.log(JSON.stringify(request, null, 2));

  // Try to find businessId from multiple possible locations in the Vapi payload
  // Vapi can send metadata in various places depending on the event type
  let businessIdStr =
    // Root level metadata
    metadata?.businessId ||
    // Inside message.call.assistant.metadata (common for function calls)
    message?.call?.assistant?.metadata?.businessId ||
    // Inside message.call.metadata
    message?.call?.metadata?.businessId ||
    // Inside message.assistant.metadata (for some event types)
    message?.assistant?.metadata?.businessId ||
    // Direct on request.call (some webhook versions)
    (request as any)?.call?.assistant?.metadata?.businessId ||
    // assistantOverrides metadata (used in some Vapi configurations)
    (message as any)?.call?.assistantOverrides?.metadata?.businessId ||
    // Check if metadata is at assistant level directly
    (message as any)?.assistant?.metadata?.businessId ||
    // Check phoneNumber metadata (if metadata was attached to phone number)
    (message as any)?.call?.phoneNumber?.metadata?.businessId ||
    null;

  let businessId = businessIdStr ? parseInt(businessIdStr) : null;

  // FALLBACK: If businessId is not in metadata, try to look it up from the phone number being called
  if (!businessId) {
    const calledNumber = message?.call?.phoneNumber?.number;
    console.log(`BusinessId not in metadata. Called number from payload: ${calledNumber || 'NOT FOUND'}`);

    if (calledNumber) {
      console.log(`Attempting to look up business by phone number: ${calledNumber}`);
      const business = await storage.getBusinessByTwilioPhoneNumber(calledNumber);
      if (business) {
        businessId = business.id;
        console.log(`SUCCESS: Found business "${business.name}" (ID: ${businessId}) from phone number lookup`);
      } else {
        console.warn(`FAILED: Could not find business for phone number: ${calledNumber}`);
        // Debug: List all businesses and their phone numbers
        const allBusinesses = await storage.getAllBusinesses();
        console.log('DEBUG - All businesses in database:');
        allBusinesses.forEach(b => {
          console.log(`  - ID: ${b.id}, Name: ${b.name}, Twilio Phone: ${b.twilioPhoneNumber || 'NOT SET'}`);
        });
      }
    } else {
      console.warn('No phone number found in webhook payload to use for fallback lookup');
    }
  }

  console.log('=== Vapi Webhook ===');
  console.log('Type:', message.type);
  console.log('Function:', message.functionCall?.name);
  console.log('Root metadata:', JSON.stringify(metadata));
  console.log('Call metadata:', JSON.stringify(message?.call?.metadata));
  console.log('Call assistant metadata:', JSON.stringify(message?.call?.assistant?.metadata));
  console.log('Message assistant metadata:', JSON.stringify(message?.assistant?.metadata));
  console.log('AssistantOverrides metadata:', JSON.stringify((message as any)?.call?.assistantOverrides?.metadata));
  console.log('PhoneNumber metadata:', JSON.stringify((message as any)?.call?.phoneNumber?.metadata));
  console.log('Resolved Business ID:', businessId);
  console.log('Caller:', message.call?.customer?.number);

  // Check if receptionist is enabled for this business
  if (businessId) {
    const business = await storage.getBusiness(businessId);
    if (business && business.receptionistEnabled === false) {
      console.log(`AI Receptionist is DISABLED for business ${businessId}`);
      // Return a message indicating the service is unavailable
      if (message.type === 'function-call') {
        return {
          result: {
            error: "I'm sorry, the AI receptionist service is currently unavailable. Please try calling back later or leave a voicemail."
          }
        };
      }
      return null;
    }
  }

  // Handle different message types
  switch (message.type) {
    case 'function-call':
      return handleFunctionCall(message.functionCall!, businessId, message.call?.customer?.number);

    case 'end-of-call-report':
      return handleEndOfCall(message, businessId);

    case 'status-update':
      console.log('Call status update:', message);
      return null;

    case 'transcript':
      console.log('Transcript update:', message.transcript);
      return null;

    default:
      console.log('Unknown webhook type:', message.type);
      return null;
  }
}

/**
 * Handle function calls from the AI
 */
async function handleFunctionCall(
  functionCall: { name: string; parameters: Record<string, any> },
  businessId: number | null,
  callerPhone?: string
): Promise<FunctionResult | { error: string }> {
  const { name, parameters } = functionCall;

  if (!businessId) {
    console.error('CRITICAL: Business ID not found in Vapi webhook request!');
    console.error('This means the assistant metadata is not being passed correctly.');
    console.error('Full function call:', JSON.stringify(functionCall));
    return {
      result: {
        error: "I'm having a technical issue right now. Please call back in a few minutes or press 0 to speak with someone directly.",
        technicalError: 'Business ID not found in webhook metadata'
      }
    };
  }

  console.log(`Function call: ${name}`, JSON.stringify(parameters, null, 2));
  console.log(`Business ID: ${businessId}, Caller Phone: ${callerPhone}`);

  try {
    switch (name) {
      case 'checkAvailability':
        // Validate parameters
        if (!parameters.date) {
          console.warn('checkAvailability called without date parameter');
          return {
            result: {
              available: false,
              error: 'I need to know what day you\'d like to check. What date works best for you?'
            }
          };
        }
        console.log(`Executing checkAvailability for business ${businessId}, date: ${parameters.date}`);
        try {
          const availResult = await checkAvailability(businessId, parameters.date, parameters.serviceId, parameters.staffId, parameters.staffName);
          console.log(`checkAvailability completed successfully:`, JSON.stringify(availResult).substring(0, 500));
          return availResult;
        } catch (err) {
          console.error(`checkAvailability FAILED for business ${businessId}:`, err);
          return {
            result: {
              available: false,
              error: 'Technical error checking availability',
              message: "I'm having trouble checking our schedule right now. Let me take your information and have someone call you back to schedule. What's a good number to reach you?"
            }
          };
        }

      case 'bookAppointment':
        return await bookAppointment(businessId, parameters as any, callerPhone);

      case 'getCustomerInfo':
        return await getCustomerInfo(businessId, parameters.phoneNumber || callerPhone);

      case 'getServices':
        console.log(`Executing getServices for business ${businessId}`);
        try {
          const servicesResult = await getServices(businessId);
          console.log(`getServices completed successfully:`, JSON.stringify(servicesResult));
          return servicesResult;
        } catch (err) {
          console.error(`getServices FAILED for business ${businessId}:`, err);
          return {
            result: {
              services: [],
              error: 'Technical error fetching services',
              message: "I'm having trouble accessing our services right now. I can still help you schedule a general appointment. What day works best for you?"
            }
          };
        }

      case 'getStaffMembers':
        console.log(`Executing getStaffMembers for business ${businessId}`);
        try {
          const staffResult = await getStaffMembers(businessId);
          console.log(`getStaffMembers completed successfully:`, JSON.stringify(staffResult));
          return staffResult;
        } catch (err) {
          console.error(`getStaffMembers FAILED for business ${businessId}:`, err);
          return {
            result: {
              staff: [],
              error: 'Technical error fetching staff',
              message: "I'm having trouble accessing our team information right now, but I can still help you schedule an appointment."
            }
          };
        }

      case 'getStaffSchedule':
        console.log(`Executing getStaffSchedule for business ${businessId}, staffName: ${parameters.staffName}`);
        try {
          const scheduleResult = await getStaffSchedule(businessId, parameters.staffName, parameters.staffId);
          console.log(`getStaffSchedule completed:`, JSON.stringify(scheduleResult));
          return scheduleResult;
        } catch (err) {
          console.error(`getStaffSchedule FAILED:`, err);
          return {
            result: {
              error: 'Technical error fetching schedule',
              message: "I'm having trouble accessing their schedule right now. Would you like me to check their availability for a specific day instead?"
            }
          };
        }

      case 'createCustomer':
        return await createCustomer(businessId, parameters as any);

      case 'rescheduleAppointment':
        return await rescheduleAppointment(businessId, parameters as any, callerPhone);

      case 'cancelAppointment':
        return await cancelAppointment(businessId, parameters as any, callerPhone);

      case 'getBusinessHours':
        return await getBusinessHours(businessId);

      case 'getEstimate':
        return await getEstimate(businessId, parameters as any);

      case 'transferToHuman':
        return await transferToHuman(businessId, parameters as any, callerPhone);

      case 'leaveMessage':
        return await leaveMessage(businessId, parameters as any, callerPhone);

      case 'getUpcomingAppointments':
        return await getUpcomingAppointments(businessId, callerPhone);

      case 'scheduleCallback':
        return await scheduleCallback(businessId, parameters as any, callerPhone);

      case 'recognizeCaller':
        return await recognizeCaller(businessId, callerPhone);

      case 'getDirections':
        return await getDirections(businessId);

      case 'checkWaitTime':
        return await checkWaitTime(businessId);

      case 'confirmAppointment':
        return await confirmAppointment(businessId, parameters as any, callerPhone);

      case 'getServiceDetails':
        return await getServiceDetails(businessId, parameters.serviceName);

      // ========== Restaurant Ordering Functions (Clover POS) ==========
      case 'getMenu':
        return await handleGetMenu(businessId);

      case 'getMenuCategory':
        return await handleGetMenuCategory(businessId, parameters.categoryName);

      case 'createOrder':
        return await handleCreateOrder(businessId, parameters as any, callerPhone);

      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (error) {
    console.error(`Error handling function ${name}:`, error);
    return { error: String(error) };
  }
}

/**
 * Check if the date string represents a range request (like "next week")
 */
function isDateRangeRequest(dateStr: string): boolean {
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
async function getAvailableSlotsForDay(
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

  console.log(`\n========== getAvailableSlotsForDay ==========`);
  console.log(`Date: ${date.toDateString()}, Day: ${dayName}, Duration: ${duration}min`);
  console.log(`Staff hours provided: ${staffHours ? staffHours.length : 0} entries`);
  if (staffHours && staffHours.length > 0) {
    console.log(`Staff hours data:`, JSON.stringify(staffHours));
  }
  console.log(`==============================================\n`);

  // If staff hours are provided, use them instead of business hours
  const useStaffHours = staffHours && staffHours.length > 0;

  let openTime: string;
  let closeTime: string;
  let isClosed = false;

  if (useStaffHours) {
    // Use staff-specific hours
    const staffDayHours = staffHours.find(h => h.day === daysMap[dayOfWeek]);
    console.log(`getAvailableSlotsForDay: ${dayName} (${date.toDateString()}) - Checking STAFF hours`);
    console.log(`  - staffDayHours found: ${!!staffDayHours}`, staffDayHours ? `start: ${staffDayHours.startTime}, end: ${staffDayHours.endTime}, isOff: ${staffDayHours.isOff}` : 'no entry for this day');

    // Staff explicitly marked as off this day
    if (staffDayHours?.isOff === true) {
      console.log(`  - Staff is explicitly off on ${dayName}`);
      return { slots: [], isClosed: true, dayName };
    }

    // If staff has hours configured for this day, use them
    if (staffDayHours && (staffDayHours.startTime || staffDayHours.endTime)) {
      openTime = staffDayHours.startTime || '09:00';
      closeTime = staffDayHours.endTime || '17:00';
      console.log(`  - Using staff hours: ${openTime} - ${closeTime}`);
    } else {
      // No staff hours for this day - fall back to business hours
      console.log(`  - No staff hours for ${dayName}, falling back to business hours`);
      const dayHours = businessHours.find(h => h.day === daysMap[dayOfWeek]);
      if (dayHours?.isClosed === true || !dayHours || (!dayHours.open && !dayHours.close)) {
        console.log(`  - Business is closed on ${dayName}`);
        return { slots: [], isClosed: true, dayName };
      }
      openTime = dayHours.open || '09:00';
      closeTime = dayHours.close || '17:00';
      console.log(`  - Using business hours: ${openTime} - ${closeTime}`);
    }
  } else {
    // Use business hours
    const dayHours = businessHours.find(h => h.day === daysMap[dayOfWeek]);
    console.log(`getAvailableSlotsForDay: ${dayName} (${date.toDateString()}) - Using BUSINESS hours`);
    console.log(`  - dayHours found: ${!!dayHours}`, dayHours ? `open: ${dayHours.open}, close: ${dayHours.close}, isClosed: ${dayHours.isClosed}` : 'NO HOURS FOUND');
    console.log(`  - businessHours array length: ${businessHours.length}`);

    // Check if closed - handle both explicit isClosed and missing hours (no entry = closed)
    if (dayHours?.isClosed === true) {
      console.log(`  - Day is explicitly marked as closed`);
      return { slots: [], isClosed: true, dayName };
    }

    // If no hours found for this day, treat as closed (safer default)
    if (!dayHours || (!dayHours.open && !dayHours.close)) {
      console.log(`  - No hours configured for ${dayName}, treating as closed`);
      return { slots: [], isClosed: true, dayName };
    }

    // Set open/close times from business hours
    openTime = dayHours.open || '09:00';
    closeTime = dayHours.close || '17:00';
  }

  console.log(`  - Using hours: ${openTime} - ${closeTime}`);

  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Get appointments for that day
  const dayAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.startDate);
    return aptDate.toDateString() === date.toDateString() && apt.status !== 'cancelled';
  });

  console.log(`  - Found ${dayAppointments.length} appointments for this day`);

  // Store both start and end times for proper overlap detection
  // IMPORTANT: Use local time consistently since business hours are in local time
  const bookedRanges = dayAppointments.map(apt => {
    const start = new Date(apt.startDate);
    // Use local time (getHours/getMinutes) since business hours are in local time
    const startMinutes = start.getHours() * 60 + start.getMinutes();

    let endMinutes: number;
    if (apt.endDate) {
      const end = new Date(apt.endDate);
      const calculatedEndMinutes = end.getHours() * 60 + end.getMinutes();
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

    console.log(`  - Apt ${apt.id}: raw startDate=${apt.startDate}, local hours=${start.getHours()}, startMinutes=${startMinutes}, endMinutes=${endMinutes}`);
    return { start: startMinutes, end: endMinutes, aptId: apt.id };
  });

  console.log(`  - Booked ranges for ${dayAppointments.length} appointments:`, bookedRanges.map(r => `apt${r.aptId}: ${Math.floor(r.start/60)}:${(r.start%60).toString().padStart(2,'0')}-${Math.floor(r.end/60)}:${(r.end%60).toString().padStart(2,'0')}`));

  // Generate available slots
  const availableSlots: string[] = [];

  // Check if date is today (in business timezone) - skip past times
  const now = getNowInTimezone(timezone);
  const isToday = date.toDateString() === now.toDateString();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  console.log(`  - isToday: ${isToday}, currentMinutes: ${currentMinutes}, slotInterval: ${slotIntervalMinutes}min`);

  // Generate slots based on configurable interval
  for (let slotStart = openMinutes; slotStart < closeMinutes; slotStart += slotIntervalMinutes) {
    const endTimeInMinutes = slotStart + duration;

    // Skip if appointment would end after business hours
    if (endTimeInMinutes > closeMinutes) continue;
    // Skip if in the past (today only)
    if (isToday && slotStart <= currentMinutes) continue;

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

  console.log(`  - Generated ${availableSlots.length} available slots for ${dayName}`);
  if (availableSlots.length > 0) {
    console.log(`  - First few slots: ${availableSlots.slice(0, 3).join(', ')}`);
  }

  return { slots: availableSlots, isClosed: false, dayName };
}

/**
 * Check available appointment slots for a date or date range
 * Now supports filtering by staff member for salons/barbershops
 */
async function checkAvailability(
  businessId: number,
  dateStr: string,
  serviceId?: number,
  staffId?: number,
  staffName?: string
): Promise<FunctionResult> {
  console.log(`checkAvailability called for business ${businessId}, date: "${dateStr}", serviceId: ${serviceId}, staffId: ${staffId}, staffName: ${staffName}`);

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
      s.active &&
      (s.firstName.toLowerCase() === staffName.toLowerCase() ||
       `${s.firstName} ${s.lastName}`.toLowerCase() === staffName.toLowerCase())
    );
    if (matchedStaff) {
      resolvedStaffId = matchedStaff.id;
      staffMember = matchedStaff;
      console.log(`Resolved staff name "${staffName}" to ID ${resolvedStaffId}`);
    } else {
      // Staff member not found by name
      const staffNames = allStaff.filter(s => s.active).map(s => s.firstName).join(', ');
      return {
        result: {
          available: false,
          staffNotFound: true,
          message: `I don't have anyone by that name. Our team includes ${staffNames}. Would you like to book with one of them?`,
          availableStaff: allStaff.filter(s => s.active).map(s => ({
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

  // Get service duration if specified
  // If no service specified, get the shortest service duration for this business
  // This ensures we show all possible slots that could fit any service
  let duration: number;
  let serviceName: string | null = null;

  if (serviceId) {
    const service = await storage.getService(serviceId);
    if (service) {
      duration = service.duration || 30;
      serviceName = service.name;
      console.log(`Using service "${service.name}" duration: ${duration} min`);
    } else {
      duration = 30;
    }
  } else {
    // No service specified - get the shortest service duration for this business
    // This way we show all slots that could potentially fit any service
    const allServices = await storage.getServices(businessId);
    if (allServices.length > 0) {
      const shortestDuration = Math.min(...allServices.map(s => s.duration || 30));
      duration = shortestDuration;
      console.log(`No service specified, using shortest service duration: ${duration} min`);
    } else {
      duration = 30; // Fallback if no services configured
      console.log(`No services configured, using fallback duration: ${duration} min`);
    }
  }

  const businessHours = await getCachedBusinessHours(businessId);
  // Get slot interval from business settings (default 30 min)
  const slotIntervalMinutes = business.bookingSlotIntervalMinutes || 30;
  console.log(`checkAvailability: Business ${businessId} has ${businessHours.length} days of hours configured, slot interval: ${slotIntervalMinutes}min`);
  if (businessHours.length > 0) {
    console.log('Business hours:', businessHours.map(h => `${h.day}: ${h.isClosed ? 'CLOSED' : h.open + '-' + h.close}`).join(', '));
  }

  // If no business hours are configured, ask for callback instead
  if (businessHours.length === 0) {
    console.log('No business hours configured for business', businessId, '- offering callback');
    return {
      result: {
        available: false,
        noHoursConfigured: true,
        message: "I don't have our current schedule in the system yet. Let me take your information and have someone call you back to schedule an appointment. What's a good number to reach you?"
      }
    };
  }

  // Get appointments - filter by staff if specified (optimized with date range limit)
  let appointments;
  if (resolvedStaffId) {
    appointments = await getAppointmentsOptimized(businessId, { staffId: resolvedStaffId });
    console.log(`Found ${appointments.length} appointments for staff member ${resolvedStaffId}`);
  } else {
    appointments = await getAppointmentsOptimized(businessId);
    console.log(`Found ${appointments.length} total appointments for business`);
  }

  // Get staff-specific hours if a staff member is selected
  let staffHoursData: any[] = [];
  if (resolvedStaffId) {
    staffHoursData = await getCachedStaffHours(resolvedStaffId, businessId);
    console.log(`Found ${staffHoursData.length} staff hours entries for staff member ${resolvedStaffId}`);
    if (staffHoursData.length > 0) {
      console.log('Staff hours data:', JSON.stringify(staffHoursData.map(h => ({ day: h.day, start: h.startTime, end: h.endTime, isOff: h.isOff }))));
    }
  }

  const staffLabel = staffMember ? staffMember.firstName : null;

  const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Use business timezone for all date calculations
  const businessTimezone = business.timezone || 'America/New_York';

  // Check if this is a range request (like "next week")
  if (isDateRangeRequest(dateStr)) {
    console.log('Processing as date range request');

    // Get availability for the next 7 business days (in business timezone)
    const today = getTodayInTimezone(businessTimezone);

    const availableDays: { day: string, date: string, slots: string[] }[] = [];
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
        // Get representative slots from different times of day
        const allSlots = result.slots;
        const sampleSlots: string[] = [];

        // Get first morning slot (before noon)
        const morningSlot = allSlots.find(s => {
          const hour = parseInt(s.split(':')[0]);
          const isPM = s.toLowerCase().includes('pm');
          return !isPM || hour === 12;
        });
        if (morningSlot) sampleSlots.push(morningSlot);

        // Get first afternoon slot (12-5 PM)
        const afternoonSlot = allSlots.find(s => {
          const hour = parseInt(s.split(':')[0]);
          const isPM = s.toLowerCase().includes('pm');
          const hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
          return hour24 >= 12 && hour24 < 17;
        });
        if (afternoonSlot && !sampleSlots.includes(afternoonSlot)) sampleSlots.push(afternoonSlot);

        availableDays.push({
          day: result.dayName,
          date: dateDisplay,
          slots: sampleSlots.length > 0 ? sampleSlots : result.slots.slice(0, 2)
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
      daysChecked++;
    }

    if (availableDays.length === 0) {
      const noAvailMsg = staffLabel
        ? `I'm sorry, ${staffLabel} doesn't have any availability in the next two weeks. Would you like to check further out, or try a different team member?`
        : "I'm sorry, we don't have any availability in the next two weeks. Would you like me to check further out, or would you prefer to leave your number for a callback?";
      return {
        result: {
          available: false,
          staffId: resolvedStaffId,
          staffName: staffLabel,
          message: noAvailMsg
        }
      };
    }

    // Format the response with multiple days
    const firstDay = availableDays[0];
    const daysList = availableDays.map(d => d.day).join(', ');

    const multiDayMsg = staffLabel
      ? `${staffLabel} has availability on ${daysList}. The soonest opening is ${firstDay.date} at ${firstDay.slots[0]}. Would that work for you?`
      : `We have availability on ${daysList}. The soonest opening is ${firstDay.date} at ${firstDay.slots[0]}. Would that work for you, or would you prefer a different day?`;

    return {
      result: {
        available: true,
        isMultipleDays: true,
        staffId: resolvedStaffId,
        staffName: staffLabel,
        availableDays: availableDays,
        message: multiDayMsg,
        suggestion: {
          date: firstDay.date,
          time: firstDay.slots[0]
        }
      }
    };
  }

  // Single date request - original logic with improvements
  const date = parseNaturalDate(dateStr, businessTimezone);
  console.log(`Parsed date "${dateStr}" to: ${date.toISOString()} (timezone: ${businessTimezone})`);

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

  const result = await getAvailableSlotsForDay(businessId, date, businessHours, appointments, duration, staffHoursData.length > 0 ? staffHoursData : undefined, slotIntervalMinutes, businessTimezone);

  // Format date for display
  const displayDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

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

    const closedMsg = staffLabel
      ? `${staffLabel} doesn't work on ${result.dayName}s. Would ${nextOpenDay} work for you instead?`
      : `We're closed on ${result.dayName}s. Would ${nextOpenDay} work for you instead?`;

    return {
      result: {
        available: false,
        isClosed: true,
        staffId: resolvedStaffId,
        staffName: staffLabel,
        message: closedMsg,
        suggestedDay: nextOpenDay
      }
    };
  }

  const availableSlots = result.slots;

  // Build message with staff name if applicable
  // Group slots by time of day to give a better overview
  const morningSlots = availableSlots.filter(s => {
    const hour = parseInt(s.split(':')[0]);
    const isPM = s.toLowerCase().includes('pm');
    const hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
    return hour24 < 12;
  });
  const afternoonSlots = availableSlots.filter(s => {
    const hour = parseInt(s.split(':')[0]);
    const isPM = s.toLowerCase().includes('pm');
    const hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
    return hour24 >= 12 && hour24 < 17;
  });
  const eveningSlots = availableSlots.filter(s => {
    const hour = parseInt(s.split(':')[0]);
    const isPM = s.toLowerCase().includes('pm');
    const hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
    return hour24 >= 17;
  });

  // Build a descriptive message that covers all time periods
  let timeDescription: string;
  const parts: string[] = [];

  if (morningSlots.length > 0) {
    parts.push(`morning starting at ${morningSlots[0]}`);
  }
  if (afternoonSlots.length > 0) {
    parts.push(`afternoon starting at ${afternoonSlots[0]}`);
  }
  if (eveningSlots.length > 0) {
    parts.push(`evening starting at ${eveningSlots[0]}`);
  }

  if (parts.length === 1) {
    timeDescription = parts[0];
  } else if (parts.length === 2) {
    timeDescription = `${parts[0]} or ${parts[1]}`;
  } else {
    timeDescription = `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
  }

  let availableMsg: string;
  let bookedMsg: string;

  if (staffLabel) {
    availableMsg = `${staffLabel} has openings on ${displayDate} in the ${timeDescription}. What time works best for you?`;
    bookedMsg = `${staffLabel} is fully booked on ${displayDate}. Would you like to check a different day, or would another team member work for you?`;
  } else {
    availableMsg = `We have openings on ${displayDate} in the ${timeDescription}. What time works best for you?`;
    bookedMsg = `We're fully booked on ${displayDate}. Would you like to check a different day?`;
  }

  // Return ALL available slots - let the AI decide how to present them to the customer
  // The AI will naturally offer a few options and can provide more if asked

  return {
    result: {
      available: availableSlots.length > 0,
      date: displayDate,
      staffId: resolvedStaffId,
      staffName: staffLabel,
      availableSlots: availableSlots, // Return all available slots
      totalAvailable: availableSlots.length,
      message: availableSlots.length > 0 ? availableMsg : bookedMsg
    }
  };
}

/**
 * Book an appointment
 */
async function bookAppointment(
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

    // Try to find existing customer
    customer = await storage.getCustomerByPhone(phone, businessId);

    if (!customer) {
      // Create new customer
      const nameParts = (params.customerName || 'New Customer').split(' ');
      try {
        console.log('Creating new customer for booking:', {
          businessId,
          firstName: nameParts[0] || 'New',
          lastName: nameParts.slice(1).join(' ') || 'Customer',
          phone
        });
        customer = await storage.createCustomer({
          businessId,
          firstName: nameParts[0] || 'New',
          lastName: nameParts.slice(1).join(' ') || 'Customer',
          phone: phone,
          email: params.customerEmail || '',
          address: '',
          notes: 'Created via AI phone receptionist'
        });
        console.log('Customer created successfully:', customer.id);
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
      console.log(`Matched service "${params.serviceName}" to ID ${serviceId} for business ${businessId}`);
    } else {
      console.warn(`Could not find service matching "${params.serviceName}" for business ${businessId}`);
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
  console.log(`Booking: ${params.date} at ${params.time} → parsed as ${appointmentDate.toISOString()} (${businessTimezone})`);

  // Calculate duration: prefer DB service duration, then AI estimate, then default 60min
  let duration = 60;
  if (serviceId) {
    const matchedService = services.find(s => s.id === serviceId);
    if (matchedService?.duration) {
      duration = matchedService.duration;
      console.log(`Using service "${matchedService.name}" duration from DB: ${duration} minutes`);
    }
  }
  if (!serviceId && params.estimatedDuration && params.estimatedDuration > 0) {
    duration = Math.min(params.estimatedDuration, 480); // Cap at 8 hours
    console.log(`No service matched, using AI estimated duration: ${duration} minutes`);
  }
  const endTime = new Date(appointmentDate);
  endTime.setMinutes(endTime.getMinutes() + duration);

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

  // Create the appointment
  try {
    const appointment = await storage.createAppointment({
      businessId,
      customerId,
      serviceId: serviceId || null,
      staffId: resolvedStaffId || null,
      startDate: appointmentDate,
      endDate: endTime,
      status: 'scheduled',
      notes: params.notes || ''
    });

    // Invalidate appointments cache after creating new appointment
    dataCache.invalidate(businessId, 'appointments');

    // Format confirmation message (using business timezone for display)
    const dateStr = appointmentDate.toLocaleDateString('en-US', {
      timeZone: businessTimezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
      timeZone: businessTimezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Build confirmation message with staff name if applicable
    const staffLabel = staffMember ? staffMember.firstName : null;
    const withStaff = staffLabel ? ` with ${staffLabel}` : '';

    // Send SMS confirmation
    const customerPhone = params.customerPhone || callerPhone;
    if (customerPhone) {
      try {
        await twilioService.sendSms(
          customerPhone,
          `Your appointment${withStaff} at ${business.name} is confirmed for ${dateStr} at ${timeStr}. Reply HELP for assistance or CANCEL to cancel.`
        );
      } catch (smsError) {
        console.error('Failed to send SMS confirmation:', smsError);
      }
    }

    const confirmationMsg = staffLabel
      ? `Your appointment with ${staffLabel} has been booked for ${dateStr} at ${timeStr}. You'll receive a text confirmation shortly.`
      : `Your appointment has been booked for ${dateStr} at ${timeStr}. You'll receive a text confirmation shortly.`;

    return {
      result: {
        success: true,
        appointmentId: appointment.id,
        staffId: resolvedStaffId,
        staffName: staffLabel,
        confirmationMessage: confirmationMsg,
        date: dateStr,
        time: timeStr,
        service: params.serviceName || 'General appointment'
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
 * Get customer information by phone number
 */
async function getCustomerInfo(
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
 * Get services offered by the business
 */
async function getServices(businessId: number): Promise<FunctionResult> {
  console.log(`getServices called for business ${businessId}`);

  try {
    const services = await getCachedServices(businessId);
    console.log(`Found ${services.length} services for business ${businessId}`);

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

      console.log(`Business ${business.name} has no services configured`);
      return {
        result: {
          services: [],
          message: 'This business has not listed specific services yet. I can help you book a general appointment, or I can take your information and have someone call you back with our service offerings.'
        }
      };
    }

    // Filter to only active services if the field exists
    const activeServices = services.filter(s => s.active !== false);
    console.log(`${activeServices.length} active services out of ${services.length} total`);

    const serviceList = activeServices.map(s => ({
      id: s.id,
      name: s.name,
      price: s.price,
      duration: s.duration,
      description: s.description
    }));

    // Create a natural spoken list
    const spokenList = activeServices.length <= 3
      ? activeServices.map(s => `${s.name} for $${s.price}`).join(', ')
      : activeServices.slice(0, 3).map(s => `${s.name} for $${s.price}`).join(', ') + `, and ${activeServices.length - 3} more`;

    return {
      result: {
        services: serviceList,
        count: activeServices.length,
        message: `We offer: ${spokenList}. Would you like more details on any of these services, or would you like to schedule an appointment?`
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
async function getStaffMembers(businessId: number): Promise<FunctionResult> {
  console.log(`getStaffMembers called for business ${businessId}`);

  try {
    const staffList = await getCachedStaff(businessId);
    console.log(`Found ${staffList.length} staff members for business ${businessId}`);

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

    const staffDetails = activeStaff.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      firstName: s.firstName,
      specialty: s.specialty || null,
      bio: s.bio || null
    }));

    // Create natural spoken list
    let spokenList: string;
    if (activeStaff.length === 1) {
      const s = activeStaff[0];
      spokenList = s.specialty ? `${s.firstName}, our ${s.specialty}` : s.firstName;
    } else if (activeStaff.length <= 3) {
      spokenList = activeStaff.map(s => s.firstName).join(', ');
    } else {
      spokenList = activeStaff.slice(0, 3).map(s => s.firstName).join(', ') + `, and ${activeStaff.length - 3} more`;
    }

    return {
      result: {
        staff: staffDetails,
        count: activeStaff.length,
        message: `Our team includes ${spokenList}. Do you have someone you usually see, or would you like me to check who's available at your preferred time?`
      }
    };
  } catch (error) {
    console.error(`Error fetching staff for business ${businessId}:`, error);
    return {
      result: {
        staff: [],
        error: 'Failed to fetch staff members',
        message: "I can still help you book an appointment. What day and time works for you?"
      }
    };
  }
}

/**
 * Get a staff member's working schedule/hours
 */
async function getStaffSchedule(
  businessId: number,
  staffName?: string,
  staffId?: number
): Promise<FunctionResult> {
  console.log(`getStaffSchedule called for business ${businessId}, staffName: ${staffName}, staffId: ${staffId}`);

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
          message: `I don't have anyone by that name. Our team includes ${staffNames}. Who would you like to know about?`
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
          message: `${staffMember.firstName} works during our regular business hours: ${workingDays.join(', ')}. Would you like to schedule an appointment with ${staffMember.firstName}?`
        }
      };
    }

    // Format staff-specific hours
    const sortedHours = [...staffHours].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
    const workingDays: string[] = [];
    const schedule: string[] = [];

    for (const h of sortedHours) {
      const dayName = h.day.charAt(0).toUpperCase() + h.day.slice(1);
      if (h.isOff) {
        // Don't include off days in working days
      } else {
        workingDays.push(dayName);
        const formatTime = (time: string) => {
          if (!time) return '';
          const [hourStr, minStr] = time.split(':');
          const hour = parseInt(hourStr);
          const min = parseInt(minStr || '0');
          const period = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
          return min > 0 ? `${hour12}:${minStr} ${period}` : `${hour12} ${period}`;
        };
        schedule.push(`${dayName}: ${formatTime(h.startTime)} - ${formatTime(h.endTime)}`);
      }
    }

    const daysOff = sortedHours.filter(h => h.isOff).map(h => h.day.charAt(0).toUpperCase() + h.day.slice(1));

    let message = `${staffMember.firstName} works ${workingDays.join(', ')}.`;
    if (daysOff.length > 0) {
      message += ` ${staffMember.firstName} is off on ${daysOff.join(' and ')}.`;
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
        message: message
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
 * Create a new customer
 */
async function createCustomer(
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
 * Reschedule an existing appointment
 */
async function rescheduleAppointment(
  businessId: number,
  params: {
    appointmentId?: number;
    newDate: string;
    newTime: string;
    reason?: string;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  // Find the appointment - either by ID or by customer phone
  let appointment;
  if (params.appointmentId) {
    appointment = await storage.getAppointment(params.appointmentId);
  } else if (callerPhone) {
    const customer = await storage.getCustomerByPhone(callerPhone, businessId);
    if (customer) {
      const appointments = await storage.getAppointmentsByCustomerId(customer.id);
      // Get the next upcoming appointment
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

  // Update the appointment
  try {
    await storage.updateAppointment(appointment.id, {
      startDate: newDateTime,
      endDate: newEndTime,
      notes: `${appointment.notes || ''}\n[Rescheduled from ${oldDateStr}${params.reason ? `: ${params.reason}` : ''}]`.trim()
    });

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
          `Your appointment with ${business.name} has been rescheduled to ${newDateStr} at ${newTimeStr}.`
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
async function cancelAppointment(
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
      appointment = appointments
        .filter(apt => new Date(apt.startDate) > now && apt.status === 'scheduled')
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
    }
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

    // Send SMS confirmation
    if (callerPhone) {
      try {
        await twilioService.sendSms(
          callerPhone,
          `Your appointment with ${business.name} on ${dateStr} at ${timeStr} has been cancelled. Call us anytime to reschedule.`
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
 * Get business hours
 */
async function getBusinessHours(businessId: number): Promise<FunctionResult> {
  const business = await getCachedBusiness(businessId);
  if (!business) {
    return { result: { error: 'Business not found' } };
  }

  const hours = await getCachedBusinessHours(businessId);

  if (hours.length === 0) {
    return {
      result: {
        hours: 'Monday through Friday, 9 AM to 5 PM',
        message: 'We are typically open Monday through Friday from 9 AM to 5 PM.'
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

  const hoursText = sortedHours.map(h => {
    const day = h.day.charAt(0).toUpperCase() + h.day.slice(1);
    if (h.isClosed) {
      return `${day}: Closed`;
    }
    return `${day}: ${formatTime(h.open || '09:00')} to ${formatTime(h.close || '17:00')}`;
  }).join(', ');

  // Check if business is currently open
  const now = new Date();
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
      message: `${statusMessage} Our regular hours are: ${hoursText}`
    }
  };
}

/**
 * Get an estimate for services
 */
async function getEstimate(
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
        totalEstimate += match.price || 0;
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
          totalEstimate += service.price || 0;
          totalDuration += service.duration || 60;
          break;
        }
      }
    }
  }

  if (matchedServices.length === 0) {
    return {
      result: {
        estimateAvailable: false,
        services: services.map(s => ({ name: s.name, price: s.price })),
        message: `I can give you pricing for our standard services. We offer: ${services.slice(0, 5).map(s => `${s.name} at $${s.price}`).join(', ')}. What service are you interested in?`
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
      message: `Based on what you've described, the estimate would be around $${totalEstimate}. That includes: ${serviceList}. The work typically takes about ${totalDuration} minutes. Would you like to schedule an appointment?`
    }
  };
}

/**
 * Transfer call to a human
 */
async function transferToHuman(
  businessId: number,
  params: {
    reason?: string;
    urgent?: boolean;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  // Get the receptionist config for transfer numbers
  const config = await storage.getReceptionistConfig(businessId);
  const transferNumbers: string[] = Array.isArray(config?.transferPhoneNumbers)
    ? config.transferPhoneNumbers
    : [];

  if (transferNumbers.length === 0 && business.phone) {
    transferNumbers.push(business.phone);
  }

  if (transferNumbers.length === 0) {
    // No transfer number available, take a message instead
    return {
      result: {
        canTransfer: false,
        message: "I apologize, but I'm not able to transfer you right now. Can I take a message and have someone call you back as soon as possible?"
      }
    };
  }

  // Log the transfer request
  if (callerPhone) {
    try {
      await storage.createCallLog({
        businessId,
        callerId: callerPhone,
        callerName: '',
        transcript: `Transfer requested: ${params.reason || 'Customer requested to speak with someone'}`,
        intentDetected: params.urgent ? 'urgent-transfer' : 'transfer-request',
        isEmergency: params.urgent || false,
        callDuration: 0,
        recordingUrl: null,
        status: 'transferring',
        callTime: new Date()
      });
    } catch (error) {
      console.error('Error logging transfer request:', error);
    }
  }

  // Note: The actual call transfer is handled by VAPI's native transferCall tool.
  // This function serves as a logging/tracking mechanism for transfer requests.
  return {
    result: {
      logged: true,
      transferNumber: transferNumbers[0],
      message: params.urgent
        ? "Transfer request logged as urgent. The native transferCall tool will handle the actual transfer."
        : "Transfer request logged. The native transferCall tool will handle the actual transfer.",
      reason: params.reason || 'Customer requested to speak with someone'
    }
  };
}

/**
 * Leave a message/voicemail
 */
async function leaveMessage(
  businessId: number,
  params: {
    message: string;
    urgent?: boolean;
    callbackRequested?: boolean;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  try {
    // Create a call log with the message
    await storage.createCallLog({
      businessId,
      callerId: callerPhone || 'Unknown',
      callerName: '',
      transcript: `MESSAGE: ${params.message}`,
      intentDetected: params.urgent ? 'urgent-message' : 'voicemail',
      isEmergency: params.urgent || false,
      callDuration: 0,
      recordingUrl: null,
      status: params.callbackRequested ? 'callback-requested' : 'message-left',
      callTime: new Date()
    });

    // If urgent, send SMS to business owner
    if (params.urgent && business.phone) {
      try {
        await twilioService.sendSms(
          business.phone,
          `URGENT MESSAGE from ${callerPhone || 'Unknown'}: ${params.message.substring(0, 140)}...`
        );
      } catch (smsError) {
        console.error('Failed to send urgent message SMS:', smsError);
      }
    }

    return {
      result: {
        success: true,
        message: params.callbackRequested
          ? "I've recorded your message and someone will call you back as soon as possible. Is there anything else I can help with before we hang up?"
          : "Your message has been recorded. Thank you for calling. Is there anything else I can help with?"
      }
    };
  } catch (error) {
    console.error('Error saving message:', error);
    return {
      result: {
        success: false,
        error: "I'm having trouble saving your message. Could you please call back or try again?"
      }
    };
  }
}

/**
 * Get customer's upcoming appointments
 */
async function getUpcomingAppointments(
  businessId: number,
  callerPhone?: string
): Promise<FunctionResult> {
  if (!callerPhone) {
    return {
      result: {
        found: false,
        message: "I need your phone number to look up your appointments. What phone number is your appointment under?"
      }
    };
  }

  const customer = await storage.getCustomerByPhone(callerPhone, businessId);

  if (!customer) {
    return {
      result: {
        found: false,
        appointments: [],
        message: "I don't see any appointments under this phone number. Would you like to schedule one?"
      }
    };
  }

  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const now = new Date();
  const upcoming = appointments
    .filter(apt => new Date(apt.startDate) > now && apt.status === 'scheduled')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5);

  if (upcoming.length === 0) {
    return {
      result: {
        found: true,
        customerName: `${customer.firstName} ${customer.lastName}`,
        appointments: [],
        message: `Hi ${customer.firstName}! I don't see any upcoming appointments for you. Would you like to schedule one?`
      }
    };
  }

  const custBusiness = await getCachedBusiness(businessId);
  const custTimezone = custBusiness?.timezone || 'America/New_York';
  const appointmentList = upcoming.map(apt => {
    const date = new Date(apt.startDate);
    return {
      id: apt.id,
      date: date.toLocaleDateString('en-US', { timeZone: custTimezone, weekday: 'long', month: 'long', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { timeZone: custTimezone, hour: 'numeric', minute: '2-digit', hour12: true }),
      notes: apt.notes
    };
  });

  const nextApt = appointmentList[0];

  return {
    result: {
      found: true,
      customerName: `${customer.firstName} ${customer.lastName}`,
      appointments: appointmentList,
      message: upcoming.length === 1
        ? `Hi ${customer.firstName}! You have an appointment scheduled for ${nextApt.date} at ${nextApt.time}. Is there anything you'd like to change about that appointment?`
        : `Hi ${customer.firstName}! Your next appointment is ${nextApt.date} at ${nextApt.time}. You have ${upcoming.length} total upcoming appointments. Would you like details on any of them?`
    }
  };
}

/**
 * Schedule a callback for the customer
 */
async function scheduleCallback(
  businessId: number,
  params: {
    preferredTime?: string;
    preferredDate?: string;
    reason?: string;
    urgent?: boolean;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  if (!callerPhone) {
    return {
      result: {
        success: false,
        error: 'I need your phone number to schedule a callback. What number should we call you back at?'
      }
    };
  }

  // Parse preferred callback time
  // Format times directly to avoid UTC/timezone offset issues on Railway
  const formatTime12h = (h: number, m: number) => {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const amPm = h < 12 ? 'AM' : 'PM';
    return `${hour12}:${m.toString().padStart(2, '0')} ${amPm}`;
  };

  let callbackTime = 'as soon as possible';
  if (params.preferredDate && params.preferredTime) {
    const date = parseNaturalDate(params.preferredDate);
    const time = parseNaturalTime(params.preferredTime);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const [h, m] = time.split(':').map(Number);
    callbackTime = `${dateStr} around ${formatTime12h(h, m)}`;
  } else if (params.preferredTime) {
    const time = parseNaturalTime(params.preferredTime);
    const [h, m] = time.split(':').map(Number);
    callbackTime = `around ${formatTime12h(h, m)}`;
  }

  try {
    // Log the callback request
    await storage.createCallLog({
      businessId,
      callerId: callerPhone,
      callerName: '',
      transcript: `CALLBACK REQUESTED: ${params.reason || 'Customer requested callback'}\nPreferred time: ${callbackTime}`,
      intentDetected: params.urgent ? 'urgent-callback' : 'callback-request',
      isEmergency: params.urgent || false,
      callDuration: 0,
      recordingUrl: null,
      status: 'callback-scheduled',
      callTime: new Date()
    });

    // Send SMS to business
    if (business.phone) {
      try {
        const urgentPrefix = params.urgent ? 'URGENT ' : '';
        await twilioService.sendSms(
          business.phone,
          `${urgentPrefix}CALLBACK REQUEST from ${callerPhone}: ${params.reason || 'No reason specified'}. Preferred time: ${callbackTime}`
        );
      } catch (smsError) {
        console.error('Failed to send callback SMS:', smsError);
      }
    }

    // Send confirmation to customer
    try {
      await twilioService.sendSms(
        callerPhone,
        `${business.name} has received your callback request. We'll call you back ${callbackTime}. Thank you!`
      );
    } catch (smsError) {
      console.error('Failed to send customer callback confirmation:', smsError);
    }

    return {
      result: {
        success: true,
        callbackTime,
        message: `I've scheduled a callback for you ${callbackTime}. You'll receive a text confirmation. Is there anything else I can help with?`
      }
    };
  } catch (error) {
    console.error('Error scheduling callback:', error);
    return {
      result: {
        success: false,
        error: 'I had trouble scheduling the callback. Let me take your information and have someone call you back.'
      }
    };
  }
}

/**
 * Recognize the caller at the start of the call
 */
async function recognizeCaller(
  businessId: number,
  callerPhone?: string
): Promise<FunctionResult> {
  if (!callerPhone) {
    return {
      result: {
        recognized: false,
        message: 'How can I help you today?'
      }
    };
  }

  const customer = await storage.getCustomerByPhone(callerPhone, businessId);

  if (!customer) {
    return {
      result: {
        recognized: false,
        isNewCaller: true,
        message: 'How can I help you today?'
      }
    };
  }

  // Get their appointment history
  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const now = new Date();

  // Find upcoming appointments
  const upcoming = appointments
    .filter(apt => new Date(apt.startDate) > now && apt.status === 'scheduled')
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

  let greeting = `Hi ${customer.firstName}! Great to hear from you.`;
  let context = '';

  const recogBusiness = await getCachedBusiness(businessId);
  const recogTimezone = recogBusiness?.timezone || 'America/New_York';

  if (upcoming.length > 0) {
    const nextApt = upcoming[0];
    const aptDate = new Date(nextApt.startDate);
    const dateStr = aptDate.toLocaleDateString('en-US', { timeZone: recogTimezone, weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = aptDate.toLocaleTimeString('en-US', { timeZone: recogTimezone, hour: 'numeric', minute: '2-digit', hour12: true });

    // Check if appointment is today
    if (aptDate.toDateString() === now.toDateString()) {
      greeting = `Hi ${customer.firstName}! I see you have an appointment with us today at ${timeStr}.`;
      context = 'appointment_today';
    } else if (aptDate.toDateString() === new Date(now.getTime() + 86400000).toDateString()) {
      greeting = `Hi ${customer.firstName}! I see you have an appointment tomorrow at ${timeStr}.`;
      context = 'appointment_tomorrow';
    } else {
      greeting = `Hi ${customer.firstName}! I see your next appointment is ${dateStr} at ${timeStr}.`;
      context = 'has_upcoming';
    }
  } else if (recent.length > 0) {
    greeting = `Hi ${customer.firstName}! Welcome back.`;
    context = 'returning_customer';
  }

  return {
    result: {
      recognized: true,
      customerId: customer.id,
      customerName: `${customer.firstName} ${customer.lastName}`,
      firstName: customer.firstName,
      upcomingAppointments: upcoming.length,
      recentAppointments: recent.length,
      context,
      greeting,
      message: `${greeting} How can I help you today?`
    }
  };
}

/**
 * Get directions to the business
 */
async function getDirections(businessId: number): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { error: 'Business not found' } };
  }

  const address = [business.address, business.city, business.state, business.zip]
    .filter(Boolean)
    .join(', ');

  if (!address) {
    return {
      result: {
        hasAddress: false,
        message: "I don't have the exact address on file. Would you like me to have someone call you with directions?"
      }
    };
  }

  // Create Google Maps link
  const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;

  return {
    result: {
      hasAddress: true,
      address,
      mapsUrl,
      message: `We're located at ${address}. I can text you a link to get directions on your phone. Would you like that?`
    }
  };
}

/**
 * Check current wait time or next available appointment
 */
async function checkWaitTime(businessId: number): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { error: 'Business not found' } };
  }

  // Get today's appointments
  const appointments = await storage.getAppointmentsByBusinessId(businessId);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
        message: "We're closed today, but I'd be happy to schedule you for our next available opening."
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
        message: "We've closed for today. Would you like to schedule an appointment for tomorrow?"
      }
    };
  }

  // Calculate next available slot
  let nextAvailable = new Date(now);
  nextAvailable.setMinutes(Math.ceil(nextAvailable.getMinutes() / 30) * 30, 0, 0); // Round to next 30 min

  const bookedTimes = todayAppointments.map(apt => {
    const start = new Date(apt.startDate);
    return start.getHours() * 60 + start.getMinutes();
  });

  // Find first open slot
  while (nextAvailable.getHours() * 60 + nextAvailable.getMinutes() < closeTime) {
    const slotTime = nextAvailable.getHours() * 60 + nextAvailable.getMinutes();
    if (!bookedTimes.some(bt => Math.abs(bt - slotTime) < 60)) {
      break;
    }
    nextAvailable.setMinutes(nextAvailable.getMinutes() + 30);
  }

  const waitTimezone = business?.timezone || 'America/New_York';
  const nextTimeStr = nextAvailable.toLocaleTimeString('en-US', { timeZone: waitTimezone, hour: 'numeric', minute: '2-digit', hour12: true });
  const waitMinutes = Math.round((nextAvailable.getTime() - now.getTime()) / 60000);

  return {
    result: {
      isOpen: true,
      nextAvailable: nextTimeStr,
      waitMinutes,
      appointmentsToday: todayAppointments.length,
      message: waitMinutes <= 30
        ? `We have availability right now! Our next open slot is at ${nextTimeStr}.`
        : `Our next available slot is at ${nextTimeStr}, about ${Math.round(waitMinutes / 30) * 30} minutes from now. Would you like to book that?`
    }
  };
}

/**
 * Confirm an upcoming appointment (reminder confirmation)
 */
async function confirmAppointment(
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
          message: `Your appointment for ${dateStr} at ${timeStr} is confirmed. We'll see you then! Is there anything else I can help with?`
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
          message: `No problem. Your current appointment is ${dateStr} at ${timeStr}. What day would work better for you?`
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

/**
 * Get detailed information about a specific service
 */
async function getServiceDetails(
  businessId: number,
  serviceName: string
): Promise<FunctionResult> {
  console.log(`getServiceDetails called for business ${businessId}, serviceName: "${serviceName}"`);

  try {
    const services = await getCachedServices(businessId);
    console.log(`Found ${services.length} services for search`);

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
    console.log(`Search terms: ${searchTerms.join(', ')}`);

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

      console.log(`Service "${service.name}" scored ${score}`);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = service;
      }
    }

    if (bestMatch && bestScore > 0) {
      console.log(`Best match: "${bestMatch.name}" with score ${bestScore}`);
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
          message: `${bestMatch.name} is $${bestMatch.price}${durationText}. ${bestMatch.description || ''} Would you like to schedule this service?`
        }
      };
    }

    // Didn't find a match, list available services
    console.log('No matching service found');
    const serviceList = activeServices.slice(0, 4).map(s => s.name).join(', ');
    return {
      result: {
        found: false,
        availableServices: activeServices.map(s => ({ name: s.name, price: s.price })),
        message: `I'm not sure about that specific service. We offer: ${serviceList}. Which one were you interested in?`
      }
    };
  } catch (error) {
    console.error(`Error in getServiceDetails:`, error);
    return {
      result: {
        found: false,
        error: 'Failed to fetch service details',
        message: "I'm having trouble looking up that service. Would you like me to have someone call you back with more information?"
      }
    };
  }
}

/**
 * Handle end of call report
 */
async function handleEndOfCall(
  message: any,
  businessId: number | null
): Promise<null> {
  console.log('Call ended:', {
    businessId,
    reason: message.endedReason,
    duration: message.call?.duration,
    transcript: message.transcript
  });

  // Log the call in the database
  if (businessId && message.call) {
    const callerPhone = message.call.customer?.number || null;

    try {
      await storage.createCallLog({
        businessId,
        callerId: callerPhone || 'Unknown',
        callerName: '',
        transcript: message.transcript || null,
        intentDetected: 'vapi-ai-call',
        isEmergency: false,
        callDuration: message.call.duration || 0,
        recordingUrl: message.call.recordingUrl || null,
        status: message.endedReason === 'customer-ended-call' ? 'completed' : message.endedReason,
        callTime: new Date()
      });
    } catch (error) {
      console.error('Error logging call:', error);
    }

    // Auto-create customer record for every caller so they appear in the CRM
    // (bookAppointment already does this, but voicemails/inquiries/hangups don't)
    if (callerPhone && callerPhone !== 'Unknown') {
      try {
        const existingCustomer = await storage.getCustomerByPhone(callerPhone, businessId);
        if (!existingCustomer) {
          await storage.createCustomer({
            businessId,
            firstName: 'Caller',
            lastName: callerPhone.replace(/\D/g, '').slice(-4), // Last 4 digits as placeholder
            phone: callerPhone,
            email: '',
            address: '',
            notes: 'Auto-created from phone call — update name after follow-up'
          });
          console.log(`Auto-created customer record for caller ${callerPhone} (business ${businessId})`);
        }
      } catch (error) {
        console.error('Error auto-creating customer from call:', error);
      }
    }
  }

  return null;
}

// ========== Restaurant Ordering Handler Functions (POS Integration) ==========

/**
 * Detect which POS system a business uses and return the cached menu.
 * Checks Square first (newer), then Clover.
 */
async function getPOSCachedMenu(businessId: number): Promise<CachedMenu | null> {
  const business = await storage.getBusiness(businessId);
  if (!business) return null;

  if (business.squareAccessToken) {
    return getSquareCachedMenu(businessId);
  }
  if (business.cloverAccessToken) {
    return getCloverCachedMenu(businessId);
  }
  return null;
}

/**
 * Detect which POS system a business uses: 'square', 'clover', or null
 */
async function detectPOSType(businessId: number): Promise<'square' | 'clover' | null> {
  const business = await storage.getBusiness(businessId);
  if (!business) return null;
  if (business.squareAccessToken) return 'square';
  if (business.cloverAccessToken) return 'clover';
  return null;
}

/**
 * Handle getMenu function call — returns the full cached menu formatted for voice
 */
async function handleGetMenu(businessId: number): Promise<any> {
  try {
    const menu = await getPOSCachedMenu(businessId);
    if (!menu) {
      return {
        result: {
          error: 'Menu not available',
          message: "I'm sorry, I don't have the menu loaded right now. Let me transfer you to someone who can help with your order.",
          shouldTransfer: true
        }
      };
    }

    // Format menu for voice — organize by category
    const menuSummary = menu.categories.map(cat => {
      const items = cat.items.map(item => {
        let itemStr = `${item.name} - ${item.priceFormatted}`;
        if (item.modifierGroups.length > 0) {
          const modInfo = item.modifierGroups.map(g => {
            const options = g.modifiers.map(m => m.name).join(', ');
            return `${g.name}: ${options}`;
          }).join('; ');
          itemStr += ` (Options: ${modInfo})`;
        }
        return itemStr;
      }).join('\n    ');

      return `  ${cat.name}:\n    ${items}`;
    }).join('\n\n');

    return {
      result: {
        menu: menuSummary,
        categories: menu.categories.map(c => c.name),
        totalItems: menu.categories.reduce((sum, c) => sum + c.items.length, 0),
        // Include structured item data with IDs so createOrder can reference real POS item IDs
        itemDetails: menu.categories.flatMap(cat =>
          cat.items.map(item => ({
            id: item.id,
            name: item.name,
            category: cat.name,
            price: item.price,
            priceFormatted: item.priceFormatted,
            modifierGroups: item.modifierGroups
          }))
        ),
        message: `Here's our menu. We have ${menu.categories.length} categories: ${menu.categories.map(c => c.name).join(', ')}. What would you like to hear about?`
      }
    };
  } catch (error) {
    console.error(`Error getting menu for business ${businessId}:`, error);
    return {
      result: {
        error: 'Failed to load menu',
        message: "I'm having trouble loading the menu right now. Would you like me to transfer you to someone who can help?"
      }
    };
  }
}

/**
 * Handle getMenuCategory function call — returns items in a specific category
 */
async function handleGetMenuCategory(businessId: number, categoryName: string): Promise<any> {
  try {
    const menu = await getPOSCachedMenu(businessId);
    if (!menu) {
      return {
        result: {
          error: 'Menu not available',
          message: "I'm sorry, I don't have the menu loaded right now."
        }
      };
    }

    // Find the category (fuzzy match)
    const searchName = (categoryName || '').toLowerCase();
    const category = menu.categories.find(c =>
      c.name.toLowerCase().includes(searchName) ||
      searchName.includes(c.name.toLowerCase())
    );

    if (!category) {
      const availableCategories = menu.categories.map(c => c.name).join(', ');
      return {
        result: {
          error: 'Category not found',
          availableCategories,
          message: `I don't see a "${categoryName}" category. Our menu categories are: ${availableCategories}. Which would you like to hear about?`
        }
      };
    }

    const items = category.items.map(item => {
      let itemStr = `${item.name} - ${item.priceFormatted}`;
      if (item.modifierGroups.length > 0) {
        const modInfo = item.modifierGroups.map(g => {
          const required = g.minRequired && g.minRequired > 0 ? ' (required)' : '';
          const options = g.modifiers.map(m =>
            m.price > 0 ? `${m.name} ${m.priceFormatted}` : m.name
          ).join(', ');
          return `${g.name}${required}: ${options}`;
        }).join('; ');
        itemStr += ` | Options: ${modInfo}`;
      }
      return itemStr;
    });

    return {
      result: {
        categoryName: category.name,
        items: items,
        itemCount: items.length,
        // Also include structured data for order creation
        itemDetails: category.items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          priceFormatted: item.priceFormatted,
          modifierGroups: item.modifierGroups
        })),
        message: `In our ${category.name} section, we have ${items.length} items: ${items.join('. ')}. What would you like?`
      }
    };
  } catch (error) {
    console.error(`Error getting menu category for business ${businessId}:`, error);
    return {
      result: {
        error: 'Failed to load menu category',
        message: "I'm having trouble loading that part of the menu. Would you like to try a different category?"
      }
    };
  }
}

/**
 * Handle createOrder function call — creates an order in the connected POS (Clover or Square)
 */
async function handleCreateOrder(
  businessId: number,
  parameters: {
    items: Array<{
      itemId?: string;
      cloverItemId?: string; // Legacy field — kept for backward compatibility
      quantity: number;
      modifiers?: Array<{ modifierId?: string; cloverId?: string }>;
      notes?: string;
    }>;
    callerPhone?: string;
    callerName?: string;
    orderType?: string;
    orderNotes?: string;
  },
  callerPhone?: string
): Promise<any> {
  try {
    // Validate we have items
    if (!parameters.items || parameters.items.length === 0) {
      return {
        result: {
          error: 'No items in order',
          message: "It seems like the order is empty. What would you like to order?"
        }
      };
    }

    // Always prefer the real caller ID from VAPI over whatever the AI puts in the function args
    // The AI sometimes passes the business phone number or a wrong number in callerPhone
    const phone = callerPhone || parameters.callerPhone;
    const posType = await detectPOSType(businessId);

    // Validate order type against business settings — default to first enabled type
    const business = await storage.getBusiness(businessId);
    const pickupEnabled = business?.restaurantPickupEnabled ?? true;
    const deliveryEnabled = business?.restaurantDeliveryEnabled ?? false;
    let orderType = (parameters.orderType || 'pickup') as string;
    if (orderType === 'delivery' && !deliveryEnabled) {
      console.log(`Delivery not enabled for business ${businessId}, defaulting to pickup`);
      orderType = 'pickup';
    } else if (orderType === 'pickup' && !pickupEnabled && deliveryEnabled) {
      console.log(`Pickup not enabled for business ${businessId}, defaulting to delivery`);
      orderType = 'delivery';
    }

    console.log(`Creating ${posType} order for business ${businessId}:`, JSON.stringify(parameters));

    // Resolve item names to real POS IDs if the AI passed names instead of IDs
    const menu = await getPOSCachedMenu(businessId);
    const allMenuItems = menu?.categories.flatMap(cat => cat.items) || [];

    console.log(`Menu has ${allMenuItems.length} items: ${allMenuItems.map(mi => mi.name).join(', ')}`);

    const resolvedItems = parameters.items.map(item => {
      const rawId = item.itemId || item.cloverItemId || '';
      // Check if this looks like a real POS ID (alphanumeric, typically 13+ chars)
      const looksLikeRealId = /^[A-Z0-9]{10,}$/.test(rawId);
      if (looksLikeRealId) {
        return item; // Already a real ID
      }

      // Try fuzzy name match against menu items (progressively looser matching)
      const searchName = rawId.toLowerCase().replace(/[_-]/g, ' ').trim();
      const searchWords = searchName.split(/\s+/);

      // 1. Exact match
      let matched = allMenuItems.find(mi => mi.name.toLowerCase() === searchName);

      // 2. Contains match (either direction)
      if (!matched) {
        matched = allMenuItems.find(mi =>
          mi.name.toLowerCase().includes(searchName) ||
          searchName.includes(mi.name.toLowerCase())
        );
      }

      // 3. Word overlap — any word from the search appears in the item name or vice versa
      if (!matched) {
        matched = allMenuItems.find(mi => {
          const itemWords = mi.name.toLowerCase().split(/\s+/);
          return searchWords.some(sw => sw.length > 2 && itemWords.some(iw => iw.includes(sw) || sw.includes(iw)));
        });
      }

      // 4. Singular/plural — try adding/removing trailing 's'
      if (!matched) {
        const variants = searchWords.map(w => w.endsWith('s') ? w.slice(0, -1) : w + 's');
        matched = allMenuItems.find(mi => {
          const itemLower = mi.name.toLowerCase();
          return variants.some(v => itemLower.includes(v));
        });
      }

      if (matched) {
        console.log(`Resolved item name "${rawId}" to POS ID "${matched.id}" (${matched.name})`);
        return { ...item, itemId: matched.id, cloverItemId: matched.id };
      }

      // Check if the AI accidentally passed a category name instead of an item name
      const categoryNames = menu?.categories.map(c => c.name.toLowerCase()) || [];
      if (categoryNames.includes(searchName)) {
        console.warn(`AI passed category name "${rawId}" instead of an item name — will fail on POS`);
      } else {
        console.warn(`Could not resolve item "${rawId}" to any of ${allMenuItems.length} menu items — passing through as-is`);
      }
      return item;
    });

    let result: { success: boolean; orderId?: string; orderTotal?: number; error?: string };

    if (posType === 'square') {
      result = await createSquareOrder(businessId, {
        items: resolvedItems.map(item => ({
          itemId: item.itemId || item.cloverItemId || '',
          quantity: item.quantity,
          modifiers: item.modifiers?.map(m => ({ modifierId: m.modifierId || m.cloverId || '' })),
          notes: item.notes,
        })),
        callerPhone: phone,
        callerName: parameters.callerName,
        orderType: orderType as 'pickup' | 'delivery' | 'dine_in',
        orderNotes: parameters.orderNotes,
      });
    } else {
      // Default to Clover
      result = await createCloverOrder(businessId, {
        items: resolvedItems.map(item => ({
          cloverItemId: item.cloverItemId || item.itemId || '',
          quantity: item.quantity,
          modifiers: item.modifiers?.map(m => ({ cloverId: m.cloverId || m.modifierId || '' })),
          notes: item.notes,
        })),
        callerPhone: phone,
        callerName: parameters.callerName,
        orderType: orderType as 'pickup' | 'delivery' | 'dine_in',
        orderNotes: parameters.orderNotes,
      });
    }

    if (result.success) {
      const totalFormatted = result.orderTotal ? `$${(result.orderTotal / 100).toFixed(2)}` : 'calculated at pickup';

      // Send order confirmation SMS to the caller (fire and forget — don't block the AI response)
      if (phone) {
        try {
          // Build readable item list from menu cache
          const itemLines = resolvedItems.map(item => {
            const id = item.itemId || item.cloverItemId || '';
            const menuItem = allMenuItems.find(mi => mi.id === id);
            const name = menuItem?.name || id;
            const qty = item.quantity > 1 ? `${item.quantity}x ` : '';
            return `${qty}${name}`;
          });

          const businessName = business?.name || 'the restaurant';
          const smsBody = `Order confirmed from ${businessName}!\n\n` +
            `${itemLines.join('\n')}\n` +
            `Total: ${totalFormatted}\n` +
            `Type: ${orderType === 'delivery' ? 'Delivery' : 'Pickup'}\n\n` +
            `Thank you${parameters.callerName ? ', ' + parameters.callerName : ''}!`;

          // Use the default Twilio number (TWILIO_PHONE_NUMBER env var) for SMS.
          // The business's twilioPhoneNumber is imported into VAPI for voice and may
          // not be registered for A2P 10DLC SMS, causing carrier rejections (error 30034).
          twilioService.sendSms(phone, smsBody).catch(err => {
            console.error(`Failed to send order confirmation SMS to ${phone}:`, err);
          });
        } catch (smsError) {
          console.error('Error building order confirmation SMS:', smsError);
        }
      }

      return {
        result: {
          success: true,
          orderId: result.orderId,
          total: totalFormatted,
          message: `Great news! Your order has been placed successfully. Your order total is ${totalFormatted}. ${
            orderType === 'pickup'
              ? "It'll be ready for pickup shortly. We'll have it waiting for you!"
              : orderType === 'delivery'
              ? "Your delivery is being prepared. You'll receive it soon!"
              : "Your order has been sent to the kitchen!"
          } Is there anything else I can help you with?`
        }
      };
    } else {
      console.error(`POS order failed for business ${businessId}:`, result.error);
      return {
        result: {
          success: false,
          error: result.error,
          message: "I'm sorry, I had trouble placing your order in our system. Would you like me to transfer you to someone who can take your order directly?"
        }
      };
    }
  } catch (error) {
    console.error(`Error creating order for business ${businessId}:`, error);
    return {
      result: {
        error: 'Order creation failed',
        message: "I'm sorry, there was an issue placing your order. Let me transfer you to a staff member who can help. One moment please."
      }
    };
  }
}

export default {
  handleVapiWebhook
};
