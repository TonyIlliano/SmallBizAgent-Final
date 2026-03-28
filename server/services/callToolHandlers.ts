/**
 * Call Tool Handlers (Provider-Agnostic)
 *
 * Contains all business logic for AI receptionist tool calls:
 * availability checking, appointment booking, customer management,
 * CRM integration, POS ordering, and end-of-call processing.
 *
 * This module is provider-agnostic — it works with any voice AI platform
 * (Retell AI, Vapi, etc.) via the dispatchToolCall() and processEndOfCall() interfaces.
 */

import { storage } from '../storage';
import { db } from '../db';
import { recurringSchedules } from '@shared/schema';
import twilioService from './twilioService';
import { getCachedMenu as getCloverCachedMenu, createOrder as createCloverOrder, formatMenuForPrompt, type CachedMenu } from './cloverService';
import { getCachedMenu as getSquareCachedMenu, createOrder as createSquareOrder } from './squareService';
import { getCachedMenu as getHeartlandCachedMenu, createOrder as createHeartlandOrder } from './heartlandService';
import { canBusinessAcceptCalls } from './usageService';
import { fireEvent } from './webhookService';
import { getTimezoneAbbreviation } from '../utils/timezone';
// Pre-import intelligence services to avoid dynamic import latency during calls
import { getLatestCustomerIntelligence } from './callIntelligenceService';
import { searchMemory } from './mem0Service';


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
  private readonly MAX_SIZE = 500; // Maximum cache entries to prevent unbounded growth

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

    // Evict oldest 10% of entries if cache exceeds MAX_SIZE
    if (this.cache.size > this.MAX_SIZE) {
      const entriesToEvict = Math.ceil(this.MAX_SIZE * 0.1);
      const iterator = this.cache.keys();
      for (let i = 0; i < entriesToEvict; i++) {
        const oldest = iterator.next();
        if (!oldest.done) {
          this.cache.delete(oldest.value);
        }
      }
      console.log(`[BusinessDataCache] Evicted ${entriesToEvict} oldest entries (size was ${this.cache.size + entriesToEvict})`);
    }
  }

  // Invalidate cache for a business (call after writes)
  // Keys are formatted as "type:businessId" or "type:businessId:extra"
  invalidate(businessId: number, type?: string): void {
    if (type) {
      // Specific type: match "type:businessId" and "type:businessId:*"
      const prefix = `${type}:${businessId}`;
      for (const key of Array.from(this.cache.keys())) {
        if (key === prefix || key.startsWith(prefix + ':')) {
          this.cache.delete(key);
        }
      }
    } else {
      // All types: match any key containing ":businessId" as the businessId segment
      for (const key of Array.from(this.cache.keys())) {
        // Key format: "type:businessId" or "type:businessId:extra"
        const parts = key.split(':');
        if (parts.length >= 2 && parts[1] === String(businessId)) {
          this.cache.delete(key);
        }
      }
    }
  }

  // Remove all expired entries from cache
  cleanup(): void {
    let removed = 0;
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[BusinessDataCache] Cleanup removed ${removed} expired entries`);
    }
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

// Periodic cleanup of expired cache entries every 15 minutes
setInterval(() => {
  dataCache.cleanup();
}, 15 * 60 * 1000);

/**
 * Cached data fetchers - wrap storage calls with caching
 */
async function getCachedBusinessHours(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('hours', businessId);
  if (cached) {
    return cached;
  }

  const hours = await storage.getBusinessHours(businessId);
  dataCache.set('hours', businessId, hours);
  return hours;
}

async function getCachedServices(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('services', businessId);
  if (cached) {
    return cached;
  }

  const services = await storage.getServices(businessId);
  dataCache.set('services', businessId, services);
  return services;
}

async function getCachedStaff(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('staff', businessId);
  if (cached) {
    return cached;
  }

  const staff = await storage.getStaff(businessId);
  dataCache.set('staff', businessId, staff);
  return staff;
}

async function getCachedStaffHours(staffId: number, businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('staffHours', businessId, `staff${staffId}`);
  if (cached) {
    return cached;
  }

  const hours = await storage.getStaffHours(staffId);
  dataCache.set('staffHours', businessId, hours, `staff${staffId}`);
  return hours;
}

async function getCachedBusiness(businessId: number): Promise<any | undefined> {
  const cached = dataCache.get<any>('business', businessId);
  if (cached) {
    return cached;
  }

  const business = await storage.getBusiness(businessId);
  if (business) {
    dataCache.set('business', businessId, business);
  }
  return business;
}

/**
 * Batch-fetch staff-service mappings for all active staff in a business.
 * Returns a Map<staffId, serviceId[]>. Cached for 5 minutes.
 * Replaces the N+1 pattern of calling getStaffServices(s.id) in a loop.
 */
async function getCachedStaffServiceMap(businessId: number): Promise<Map<number, number[]>> {
  const cached = dataCache.get<Map<number, number[]>>('staffServiceMap', businessId);
  if (cached) return cached;

  const staff = await getCachedStaff(businessId);
  const activeStaff = staff.filter((s: any) => s.active !== false);

  // Fetch all staff-service mappings in parallel (one query per staff, but all at once)
  const results = await Promise.all(
    activeStaff.map(async (s: any) => ({
      staffId: s.id,
      serviceIds: await storage.getStaffServices(s.id),
    }))
  );

  const map = new Map<number, number[]>();
  for (const { staffId, serviceIds } of results) {
    map.set(staffId, serviceIds);
  }

  dataCache.set('staffServiceMap', businessId, map);
  return map;
}

/**
 * Check if a staff member has time off on a specific date.
 * Returns true if they have an all-day time-off entry covering that date.
 */
async function isStaffOffOnDate(staffId: number, date: Date): Promise<boolean> {
  const entries = await storage.getStaffTimeOffForDate(staffId, date);
  return entries.some(t => t.allDay !== false);
}

/**
 * Get all time-off entries for a staff member (for schedule display).
 * Returns upcoming entries only (from today forward).
 */
async function getUpcomingTimeOff(staffId: number): Promise<any[]> {
  const allEntries = await storage.getStaffTimeOff(staffId);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return allEntries.filter(e => new Date(e.endDate) >= now);
}

/**
 * Group consecutive days into natural speech ranges.
 * ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] → "Monday through Friday"
 * ["Monday", "Tuesday", "Saturday"] → "Monday and Tuesday, Saturday"
 * ["Wednesday"] → "Wednesday"
 */
function groupConsecutiveDays(days: string[]): string {
  if (days.length === 0) return '';
  if (days.length === 1) return days[0];

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const indices = days.map(d => dayOrder.indexOf(d)).filter(i => i !== -1).sort((a, b) => a - b);

  if (indices.length === 0) return days.join(', ');

  // Group consecutive indices
  const groups: number[][] = [];
  let current = [indices[0]];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === current[current.length - 1] + 1) {
      current.push(indices[i]);
    } else {
      groups.push(current);
      current = [indices[i]];
    }
  }
  groups.push(current);

  return groups.map(g => {
    if (g.length > 2) {
      return `${dayOrder[g[0]]} through ${dayOrder[g[g.length - 1]]}`;
    } else if (g.length === 2) {
      return `${dayOrder[g[0]]} and ${dayOrder[g[1]]}`;
    }
    return dayOrder[g[0]];
  }).join(', ');
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
    // Filter cached data by date range (in case cache has wider range)
    return cached.filter(apt => {
      const aptDate = new Date(apt.startDate);
      return aptDate >= startDate && aptDate <= endDate;
    });
  }

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
 * Format a date for voice output with ordinal suffix (e.g., "Friday, March 27th").
 * Uses explicit ordinals so TTS doesn't mispronounce "27" as "20 seventh".
 */
function formatDateForVoice(date: Date, timezone?: string): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  if (timezone) opts.timeZone = timezone;
  // Return plain "Saturday, March 28" — NO ordinal suffixes.
  // ElevenLabs TTS reads "28th" as "20 eighth" and "31st" as "30 first".
  // Plain numbers are pronounced correctly by all TTS engines.
  return date.toLocaleDateString('en-US', opts);
}

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
 * Get local hours and minutes from a UTC date in a specific timezone.
 * Avoids the getHours() bug where Railway (UTC server) returns UTC hours instead of local.
 */
function getLocalTimeInTimezone(utcDate: Date, timezone: string): { hours: number; minutes: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(utcDate);
    const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    return { hours, minutes };
  } catch {
    // Fallback: use getHours() (wrong on UTC servers but better than crashing)
    return { hours: utcDate.getHours(), minutes: utcDate.getMinutes() };
  }
}

/**
 * Get a date string (e.g. "2/25/2026") in a specific timezone.
 * Fixes the toDateString() bug where UTC dates near midnight show the wrong day.
 * Example: 10pm ET on Feb 25 = 3am UTC Feb 26 → toDateString() says "Feb 26" (wrong)
 *          but toLocaleDateString('en-US', { timeZone: 'America/New_York' }) says "2/25/2026" (correct)
 */
function getLocalDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', { timeZone: timezone });
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
export function createDateInTimezone(year: number, month: number, day: number, hours: number, minutes: number, timezone: string): Date {
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
export function parseNaturalDate(dateStr: string, timezone: string = 'America/New_York'): Date {
  const now = getNowInTimezone(timezone);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const input = dateStr.toLowerCase().trim();

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // ── NATURAL LANGUAGE ALWAYS WINS ──
  // If the input contains a day name, relative word, or natural phrase,
  // parse that FIRST — even if a YYYY-MM-DD is also present.
  // This is a safety net: if the AI converts "this Friday" to "2026-04-03, this Friday",
  // we ignore the wrong date and use the natural language.

  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

  // ── SPECIFIC DATES ALWAYS WIN OVER RELATIVE WORDS ──
  // If the input contains a month name + day number (e.g., "April 7", "Tuesday April seventh"),
  // parse the specific date FIRST — it's more precise than relative day name parsing.
  for (let m = 0; m < monthNames.length; m++) {
    // Match "April 7", "April 7th", "April seventh", "april 07"
    const monthRegex = new RegExp(`${monthNames[m]}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`);
    const monthMatch = input.match(monthRegex);
    if (monthMatch) {
      const day = parseInt(monthMatch[1]);
      const yearMatch = input.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : now.getFullYear();
      const result = new Date(year, m, day);
      console.log(`[parseNaturalDate] Parsed "${dateStr}" as specific date: ${monthNames[m]} ${day}, ${year}`);
      return result;
    }
  }

  // ── YYYY-MM-DD format (from a previous tool response or AI-calculated) ──
  // Check this BEFORE natural language so "2026-04-07" from checkAvailability is trusted
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const parsed = new Date(input + 'T12:00:00');
    const daysOut = (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOut > 90) {
      console.warn(`[parseNaturalDate] AI passed far-future date "${dateStr}" (${Math.round(daysOut)} days out)`);
    }
    console.log(`[parseNaturalDate] Parsed "${dateStr}" as YYYY-MM-DD`);
    return parsed;
  }

  // Strip out any YYYY-MM-DD the AI may have mixed in with natural language
  const naturalInput = input.replace(/\d{4}-\d{2}-\d{2}/g, '').trim();
  const parseInput = naturalInput || input;

  // "today"
  if (parseInput === 'today' || parseInput.includes('today')) {
    return today;
  }

  // "tomorrow"
  if (parseInput === 'tomorrow' || parseInput.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // "day after tomorrow"
  if (parseInput.includes('day after tomorrow')) {
    const dat = new Date(today);
    dat.setDate(dat.getDate() + 2);
    return dat;
  }

  // "in X days"
  const inDaysMatch = parseInput.match(/in (\d+) days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1]);
    const future = new Date(today);
    future.setDate(future.getDate() + days);
    return future;
  }

  // "next week" (next Monday)
  if (parseInput === 'next week') {
    const nextWeek = new Date(today);
    const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
    nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
    return nextWeek;
  }

  // Day names: "this friday", "next tuesday", "friday", etc.
  // Only use this if NO month was mentioned (handled above)
  for (let i = 0; i < daysOfWeek.length; i++) {
    const day = daysOfWeek[i];
    if (parseInput.includes(day)) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysToAdd = targetDay - currentDay;

      // If "next" is specified or the day has passed, go to next week
      if (parseInput.includes('next') || daysToAdd <= 0) {
        daysToAdd += 7;
      }

      const result = new Date(today);
      result.setDate(result.getDate() + daysToAdd);
      return result;
    }
  }

  // "end of week" (Friday)
  if (parseInput.includes('end of') && parseInput.includes('week')) {
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
  console.warn(`[parseNaturalDate] Could not parse date: "${dateStr}", defaulting to today`);
  return today;
}

/**
 * Parse natural language time expressions
 * Handles: "2pm", "2:30", "afternoon", "morning", etc.
 */
export function parseNaturalTime(timeStr: string): string {
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

/**
 * Provider-agnostic end-of-call data interface.
 * Each voice AI provider's webhook handler normalizes its payload into this shape.
 */
export interface EndOfCallData {
  businessId: number;
  callerPhone: string | null;
  transcript: string | null;
  callDurationSeconds: number;
  endedReason: string;
  recordingUrl: string | null;
  callStartedAt: string | null;
  callEndedAt: string | null;
  calledNumber: string | null;
}

export interface FunctionResult {
  result: any;
}

// Legacy interface kept for backward compatibility during migration
interface _LegacyVapiWebhookRequest {
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

// FunctionResult already defined above — removed duplicate

/**
 * Central tool dispatcher — maps function names to handler implementations.
 * Called by provider-specific webhook handlers (retellWebhookHandler, etc.).
 */
export async function dispatchToolCall(
  name: string,
  businessId: number,
  parameters: Record<string, any>,
  callerPhone?: string
): Promise<FunctionResult | { error: string }> {
  // Log function calls with caller info for debugging recognition issues
  if (name === 'recognizeCaller') {
    console.log(`[dispatchToolCall] recognizeCaller called with callerPhone=${callerPhone || 'MISSING'}, businessId=${businessId}`);
  }

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
        try {
          const availResult = await checkAvailability(businessId, parameters.date, parameters.serviceId, parameters.staffId, parameters.staffName);
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

      case 'bookRecurringAppointment':
        return await bookRecurringAppointment(businessId, parameters as any, callerPhone);

      case 'getCustomerInfo':
        return await getCustomerInfo(businessId, parameters.phoneNumber || callerPhone);

      case 'getServices':
        try {
          const servicesResult = await getServices(businessId);
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
        try {
          const staffResult = await getStaffMembers(businessId);
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
        try {
          const scheduleResult = await getStaffSchedule(businessId, parameters.staffName, parameters.staffId);
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

      case 'updateCustomerInfo':
        return await updateCustomerInfo(businessId, parameters as any, callerPhone);

      case 'getDirections':
        return await getDirections(businessId, callerPhone, parameters?.sendSms);

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

      // ========== Restaurant Reservation Functions ==========
      case 'checkReservationAvailability':
        return await handleCheckReservationAvailability(businessId, parameters as any);

      case 'makeReservation':
        return await handleMakeReservation(businessId, parameters as any, callerPhone || '');

      case 'cancelReservation':
        return await handleCancelReservation(businessId, parameters as any, callerPhone || '');

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
 * Extract caller name from a Vapi transcript when the AI asked for it.
 * Looks for patterns like "My name is John Smith", "It's John", "This is Tony Illiano", etc.
 * Returns null if no name can be confidently extracted.
 */
function extractCallerNameFromTranscript(transcript: string): { firstName: string; lastName: string } | null {
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
 * Parse a time slot string (e.g., "9:00 AM", "2:30 PM") into a 24-hour integer.
 */
function parseSlotHour(slot: string): number {
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
function pickBestSlots(slots: string[], maxSlots: number = 5): string[] {
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
async function checkAvailability(
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
          servicePrice: serviceInfo.price ? `$${(serviceInfo.price / 100).toFixed(2)}` : null,
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
        servicePrice: serviceInfo.price ? `$${(serviceInfo.price / 100).toFixed(2)}` : null,
        serviceDuration: `${serviceInfo.duration || 30} minutes`,
        serviceName: serviceInfo.name,
      }),
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
        import('./notificationService').then(ns => {
          ns.sendSmsOptInWelcome(customer!.id, businessId).catch(() => {});
        }).catch(() => {});
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
        import('./notificationService').then(ns => {
          ns.sendSmsOptInWelcome(customer!.id, businessId).catch(() => {});
        }).catch(() => {});
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

  // Create the appointment
  try {
    const appointment = await storage.createAppointment({
      businessId,
      customerId: customerId!,
      serviceId: serviceId || null,
      staffId: resolvedStaffId || null,
      startDate: appointmentDate,
      endDate: endTime,
      status: 'scheduled',
      notes: params.notes || ''
    });

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
      const { CalendarService } = await import("./calendarService");
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

    // Send SMS confirmation
    const customerPhone = params.customerPhone || callerPhone;
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
        service: params.serviceName || 'General appointment',
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
async function getStaffMembers(businessId: number): Promise<FunctionResult> {
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
async function getStaffSchedule(
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
 * Book a recurring appointment series.
 * Creates a recurring_schedule record and books the first appointment.
 * The scheduler service handles future occurrences automatically.
 */
async function bookRecurringAppointment(
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

        const aptResult = (result as any)?.result;
        if (aptResult?.success) {
          bookedDates.push(aptDisplayDate);
        } else {
          failedCount++;
          console.warn(`[bookRecurringAppointment] Failed to book occurrence ${i + 1}: ${aptResult?.error}`);
        }
      } catch (err) {
        failedCount++;
        console.error(`[bookRecurringAppointment] Error booking occurrence ${i + 1}:`, (err as any).message);
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
async function rescheduleAppointment(
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
      const upcoming = appointments
        .filter(apt => new Date(apt.startDate) > now && apt.status === 'scheduled')
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
        error: (jobUpdateErr as any).message
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
      const cancelTimezoneForLookup = business?.timezone || 'America/New_York';
      const upcoming = appointments
        .filter(apt => new Date(apt.startDate) > now && apt.status === 'scheduled')
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
        error: (jobCancelErr as any).message
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
  const upcomingStatuses = ['scheduled', 'confirmed', 'pending'];
  const upcoming = appointments
    .filter(apt => new Date(apt.startDate) > now && apt.status && upcomingStatuses.includes(apt.status))
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
        `${business.name} has received your callback request. We'll call you back ${callbackTime}. Thank you!`,
        undefined,
        businessId || undefined
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
 * Parse a time string like "9:00 AM", "9am", "14:00" into minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!match) return 0;
  let hour = parseInt(match[1]);
  const min = parseInt(match[2] || '0');
  const period = match[3];
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return hour * 60 + min;
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
 * Recognize the caller at the start of the call
 */
async function recognizeCaller(
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

  const [appointments, recogBusiness, allServices, intelligenceResult, insightsResult, conversationalContext] = await Promise.all([
    storage.getAppointmentsByCustomerId(customer.id),
    getCachedBusiness(businessId),
    getCachedServices(businessId),
    getLatestCustomerIntelligence(customer.id, businessId).catch(() => null),
    storage.getCustomerInsights(customer.id, businessId).catch(() => null),
    Promise.race([mem0Promise, mem0Timeout]),
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
async function updateCustomerInfo(
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
 * Expand common address abbreviations for TTS (text-to-speech) readability.
 * "123 Canton BLVD" → "123 Canton Boulevard"
 */
function expandAddressAbbreviations(address: string): string {
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
async function getDirections(businessId: number, callerPhone?: string, sendSms?: boolean): Promise<FunctionResult> {
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
      console.error('[getDirections] Failed to send SMS:', (err as any).message);
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
async function checkWaitTime(businessId: number): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { error: 'Business not found' } };
  }

  // Get today's appointments using business timezone
  const waitTimezone = business?.timezone || 'America/New_York';
  const now = getNowInTimezone(waitTimezone);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const appointments = await storage.getAppointmentsByBusinessId(businessId);

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

/**
 * Get detailed information about a specific service
 */
async function getServiceDetails(
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
      import('./unansweredQuestionService').then(({ analyzeTranscriptForUnansweredQuestions }) => {
        analyzeTranscriptForUnansweredQuestions(businessId, callLogId!, transcript, callerPhone || undefined)
          .catch(err => console.error('Error analyzing transcript for unanswered questions:', err));
      }).catch(err => console.error('Error importing unanswered question service:', err));

      // Extract structured intelligence from transcript (fire-and-forget — doesn't delay webhook response)
      import('./callIntelligenceService').then(({ analyzeCallIntelligence }) => {
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
  if (business.heartlandApiKey) {
    return getHeartlandCachedMenu(businessId);
  }
  return null;
}

/**
 * Detect which POS system a business uses: 'square', 'clover', or null
 */
async function detectPOSType(businessId: number): Promise<'square' | 'clover' | 'heartland' | null> {
  const business = await storage.getBusiness(businessId);
  if (!business) return null;
  if (business.squareAccessToken) return 'square';
  if (business.cloverAccessToken) return 'clover';
  if (business.heartlandApiKey) return 'heartland';
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
      orderType = 'pickup';
    } else if (orderType === 'pickup' && !pickupEnabled && deliveryEnabled) {
      orderType = 'delivery';
    }


    // Resolve item names to real POS IDs if the AI passed names instead of IDs
    const menu = await getPOSCachedMenu(businessId);
    const allMenuItems = menu?.categories.flatMap(cat => cat.items) || [];


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
    } else if (posType === 'heartland') {
      result = await createHeartlandOrder(businessId, {
        items: resolvedItems.map(item => ({
          itemId: item.itemId || item.cloverItemId || '',
          quantity: item.quantity,
          modifiers: item.modifiers?.map((m: any) => ({ modifierId: m.modifierId || m.cloverId || '' })),
          notes: item.notes,
        })),
        callerPhone: phone,
        callerName: parameters.callerName,
        orderType: orderType as any,
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

      // Save/update customer in our database for marketing purposes
      if (phone) {
        try {
          let customer = await storage.getCustomerByPhone(phone, businessId);
          if (!customer) {
            // Parse caller name into first/last
            const nameParts = (parameters.callerName || '').trim().split(/\s+/);
            const firstName = nameParts[0] || 'Customer';
            const lastName = nameParts.slice(1).join(' ') || '';

            customer = await storage.createCustomer({
              businessId,
              firstName,
              lastName,
              phone,
              email: '',
            });
          } else if (parameters.callerName && customer.firstName === 'Caller') {
            // Update generic name if we now have a real name
            const nameParts = parameters.callerName.trim().split(/\s+/);
            await storage.updateCustomer(customer.id, {
              firstName: nameParts[0],
              lastName: nameParts.slice(1).join(' ') || customer.lastName,
            });
          }
        } catch (custError) {
          console.error('Error saving customer from order:', custError);
          // Don't fail the order response — customer save is non-critical
        }
      }

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
          twilioService.sendSms(phone, smsBody, undefined, businessId || undefined).catch(err => {
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

// ========================================
// RESTAURANT RESERVATION HANDLERS
// ========================================

/**
 * Check available reservation times for a given date and party size.
 */
async function handleCheckReservationAvailability(
  businessId: number,
  params: { date: string; partySize: number }
): Promise<any> {
  try {
    const business = await getCachedBusiness(businessId);
    if (!business) return { error: 'Business not found' };

    if (!business.reservationEnabled) {
      return { result: { available: false, message: "I'm sorry, we're not currently accepting reservations online. Please call us directly." } };
    }

    const businessTimezone = business.timezone || 'America/New_York';
    const slotDuration = business.reservationSlotDurationMinutes || 90;
    const slotInterval = business.bookingSlotIntervalMinutes || 30;
    const maxPartySize = business.reservationMaxPartySize || 10;
    const maxDaysAhead = business.reservationMaxDaysAhead || 30;
    const leadTimeHours = business.reservationLeadTimeHours || 2;

    if (params.partySize > maxPartySize) {
      return {
        result: {
          available: false,
          message: `I'm sorry, our maximum party size for online reservations is ${maxPartySize}. For larger groups, I can transfer you to a manager who can help arrange that.`
        }
      };
    }

    // Parse the date
    const parsedDate = parseNaturalDate(params.date, businessTimezone);
    const dateStr = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if date is too far ahead
    const now = new Date();
    const maxFutureDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);
    if (parsedDate > maxFutureDate) {
      return {
        result: {
          available: false,
          message: `I'm sorry, we can only take reservations up to ${maxDaysAhead} days in advance. Would you like to try a closer date?`
        }
      };
    }

    // Get business hours for that day
    const businessHours = await getCachedBusinessHours(businessId);
    const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = daysMap[parsedDate.getDay()];
    const dayHours = businessHours.find((h: any) => h.day.toLowerCase() === dayName);

    if (!dayHours || dayHours.isClosed) {
      const friendlyDate = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone });
      return {
        result: {
          available: false,
          date: dateStr,
          friendlyDate,
          message: `I'm sorry, we're closed on ${friendlyDate}. Would you like to try a different date?`
        }
      };
    }

    // Parse open/close hours
    const [openHour, openMin] = (dayHours.open || '09:00').split(':').map(Number);
    const [closeHour, closeMin] = (dayHours.close || '21:00').split(':').map(Number);

    // Minimum booking time (lead time from now)
    const leadTimeMs = leadTimeHours * 60 * 60 * 1000;
    const minBookingTime = new Date(now.getTime() + leadTimeMs);

    // Generate available time slots
    const availableTimes: string[] = [];
    let currentHour = openHour;
    let currentMin = openMin;

    while (true) {
      const slotEndMinutes = currentHour * 60 + currentMin + slotDuration;
      const closeMinutes = closeHour * 60 + closeMin;
      if (slotEndMinutes > closeMinutes) break;

      const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      // Check if past lead time
      const [year, month, day] = dateStr.split('-').map(Number);
      const slotDateTime = createDateInTimezone(year, month - 1, day, currentHour, currentMin, businessTimezone);

      if (slotDateTime > minBookingTime) {
        // Check capacity
        const capacity = await storage.getReservationSlotCapacity(businessId, dateStr, timeStr, slotDuration);
        if (capacity.remainingSeats >= params.partySize) {
          // Format for voice: "6:30 PM"
          const hour12 = currentHour % 12 || 12;
          const ampm = currentHour >= 12 ? 'PM' : 'AM';
          const minStr = currentMin > 0 ? `:${String(currentMin).padStart(2, '0')}` : '';
          availableTimes.push(`${hour12}${minStr} ${ampm}`);
        }
      }

      // Advance by slot interval
      currentMin += slotInterval;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }

    const friendlyDate = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone });
    const tzAbbr = getTimezoneAbbreviation(businessTimezone, parsedDate);

    if (availableTimes.length === 0) {
      return {
        result: {
          available: false,
          date: dateStr,
          friendlyDate,
          message: `I'm sorry, we don't have availability for a party of ${params.partySize} on ${friendlyDate}. Would you like to try a different date or a smaller party size?`
        }
      };
    }

    return {
      result: {
        available: true,
        date: dateStr,
        friendlyDate,
        partySize: params.partySize,
        availableTimes,
        timezone: tzAbbr,
        message: `We have ${availableTimes.length} time${availableTimes.length > 1 ? 's' : ''} available on ${friendlyDate} for a party of ${params.partySize}: ${availableTimes.slice(0, 5).join(', ')}${availableTimes.length > 5 ? ` and ${availableTimes.length - 5} more` : ''}.`
      }
    };
  } catch (error) {
    console.error(`Error checking reservation availability for business ${businessId}:`, error);
    return { error: 'Failed to check reservation availability' };
  }
}

/**
 * Make a reservation after the customer confirms all details.
 */
async function handleMakeReservation(
  businessId: number,
  params: { date: string; time: string; partySize: number; customerName: string; specialRequests?: string },
  callerPhone: string
): Promise<any> {
  try {
    const business = await getCachedBusiness(businessId);
    if (!business) return { error: 'Business not found' };

    if (!business.reservationEnabled) {
      return { result: { success: false, message: "I'm sorry, we're not currently accepting reservations." } };
    }

    const businessTimezone = business.timezone || 'America/New_York';
    const slotDuration = business.reservationSlotDurationMinutes || 90;

    // Normalize time format — AI might send "6:30 PM" or "18:30" or "6:30pm"
    let normalizedTime = params.time;
    const timeMatch = params.time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const min = parseInt(timeMatch[2] || '0');
      const ampm = (timeMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      normalizedTime = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    // Parse date
    let dateStr = params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parsed = parseNaturalDate(dateStr, businessTimezone);
      dateStr = parsed.toISOString().split('T')[0];
    }

    // Re-verify capacity (race condition prevention)
    const capacity = await storage.getReservationSlotCapacity(businessId, dateStr, normalizedTime, slotDuration);
    if (capacity.remainingSeats < params.partySize) {
      return {
        result: {
          success: false,
          message: "I'm sorry, that time slot just filled up. Would you like me to check for another available time?"
        }
      };
    }

    // Find or create customer by phone
    const phone = callerPhone || '';
    let customer = phone ? await storage.getCustomerByPhone(phone, businessId) : null;

    // Parse customer name
    const nameParts = params.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Guest';
    const lastName = nameParts.slice(1).join(' ') || '';

    if (!customer && phone) {
      customer = await storage.createCustomer({
        businessId,
        firstName,
        lastName,
        phone,
        email: null,
      });
    } else if (customer) {
      // Update name if provided
      if (firstName !== 'Guest') {
        customer = await storage.updateCustomer(customer.id, { firstName, lastName });
      }
    }

    if (!customer) {
      return {
        result: {
          success: false,
          message: "I'm sorry, I wasn't able to save your information. Could you give me your phone number?"
        }
      };
    }

    // Check for duplicate reservation
    const existingReservations = await storage.getRestaurantReservations(businessId, {
      date: dateStr,
      customerId: customer.id,
    });
    const activeDuplicate = existingReservations.find(r => r.status !== 'cancelled' && r.status !== 'no_show');
    if (activeDuplicate) {
      return {
        result: {
          success: false,
          message: `It looks like you already have a reservation on this date. Would you like me to modify it instead?`
        }
      };
    }

    // Calculate start/end dates
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, min] = normalizedTime.split(':').map(Number);
    const startDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
    const endDate = new Date(startDate.getTime() + slotDuration * 60 * 1000);

    // Create reservation
    const crypto = await import('crypto');
    const manageToken = crypto.randomBytes(24).toString('hex');

    const reservation = await storage.createRestaurantReservation({
      businessId,
      customerId: customer.id,
      partySize: params.partySize,
      reservationDate: dateStr,
      reservationTime: normalizedTime,
      startDate,
      endDate,
      status: 'confirmed',
      specialRequests: params.specialRequests || null,
      manageToken,
      source: 'phone',
    });

    // Fire webhook
    fireEvent(businessId, 'reservation.created', { reservation }).catch(() => {});

    // Send SMS confirmation (fire-and-forget)
    if (phone) {
      try {
        const friendlyDate = startDate.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone
        });
        const friendlyTime = startDate.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true, timeZone: businessTimezone
        });
        const manageUrl = business.bookingSlug
          ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}/manage-reservation/${manageToken}`
          : null;
        const smsMessage = manageUrl
          ? `Your reservation for ${params.partySize} at ${business.name} is confirmed for ${friendlyDate} at ${friendlyTime}. Manage: ${manageUrl}`
          : `Your reservation for ${params.partySize} at ${business.name} is confirmed for ${friendlyDate} at ${friendlyTime}.`;
        twilioService.sendSms(phone, smsMessage, undefined, businessId || undefined).catch(e =>
          console.error('Failed to send reservation SMS:', e));
      } catch (e) {
        console.error('Error building reservation SMS:', e);
      }
    }

    const friendlyDate = startDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone
    });
    const friendlyTime = startDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: businessTimezone
    });

    return {
      result: {
        success: true,
        reservationId: reservation.id,
        date: friendlyDate,
        time: friendlyTime,
        partySize: params.partySize,
        customerName: params.customerName,
        message: `Your reservation for ${params.partySize} on ${friendlyDate} at ${friendlyTime} is confirmed. You'll receive a text confirmation shortly.`
      }
    };
  } catch (error) {
    console.error(`Error making reservation for business ${businessId}:`, error);
    return {
      result: {
        success: false,
        message: "I'm sorry, I had trouble making your reservation. Would you like me to try again?"
      }
    };
  }
}

/**
 * Cancel an existing reservation.
 */
async function handleCancelReservation(
  businessId: number,
  params: { customerName: string; date?: string },
  callerPhone: string
): Promise<any> {
  try {
    const business = await getCachedBusiness(businessId);
    if (!business) return { error: 'Business not found' };

    const businessTimezone = business.timezone || 'America/New_York';

    // Look up by phone number first
    const phone = callerPhone || '';
    let customer = phone ? await storage.getCustomerByPhone(phone, businessId) : null;

    // If phone lookup fails, try finding by customer name
    if (!customer && params.customerName) {
      const allCustomers = await storage.getCustomers(businessId);
      const nameParts = params.customerName.trim().toLowerCase().split(/\s+/);

      // Try exact full name match first
      customer = allCustomers.find(c => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
        return fullName === params.customerName.trim().toLowerCase();
      }) || null;

      // If no exact match, try partial matching (first name or last name)
      if (!customer && nameParts.length >= 1) {
        const matches = allCustomers.filter(c => {
          const first = c.firstName.toLowerCase();
          const last = c.lastName.toLowerCase();
          // Match if any provided name part matches first or last name
          return nameParts.some(part => first === part || last === part);
        });

        if (matches.length === 1) {
          // Only use if there's exactly one match to avoid cancelling wrong person's reservation
          customer = matches[0];
        } else if (matches.length > 1) {
          // Multiple matches — ask for clarification
          const names = matches.map(c => `${c.firstName} ${c.lastName}`).join(', ');
          return {
            result: {
              success: false,
              message: `I found multiple customers with that name: ${names}. Could you provide the full name or the phone number on the reservation?`
            }
          };
        }
      }
    }

    if (!customer) {
      return {
        result: {
          success: false,
          message: "I couldn't find a reservation under that name or phone number. Could you provide the full name on the reservation?"
        }
      };
    }

    // Get upcoming reservations for this customer
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: businessTimezone }); // YYYY-MM-DD

    // If a specific date was given, use that; otherwise look at all upcoming
    let targetDate: string | undefined;
    if (params.date) {
      const parsedDate = parseNaturalDate(params.date, businessTimezone);
      targetDate = parsedDate.toISOString().split('T')[0];
    }

    const reservations = await storage.getRestaurantReservations(businessId, {
      customerId: customer.id,
      date: targetDate,
    });

    // Filter to upcoming, non-cancelled reservations
    const upcomingReservations = reservations.filter(r =>
      r.status !== 'cancelled' &&
      r.status !== 'no_show' &&
      r.status !== 'completed' &&
      r.reservationDate >= todayStr
    );

    if (upcomingReservations.length === 0) {
      return {
        result: {
          success: false,
          message: "I couldn't find any upcoming reservations for you. Is there anything else I can help with?"
        }
      };
    }

    // Cancel the most recent/relevant reservation
    const toCancel = upcomingReservations[0];
    await storage.updateRestaurantReservation(toCancel.id, { status: 'cancelled' });

    fireEvent(businessId, 'reservation.cancelled', { reservation: toCancel }).catch(() => {});

    const friendlyDate = new Date(toCancel.startDate).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone
    });
    const friendlyTime = new Date(toCancel.startDate).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: businessTimezone
    });

    return {
      result: {
        success: true,
        message: `Your reservation for ${toCancel.partySize} on ${friendlyDate} at ${friendlyTime} has been cancelled. Is there anything else I can help with?`
      }
    };
  } catch (error) {
    console.error(`Error cancelling reservation for business ${businessId}:`, error);
    return {
      result: {
        success: false,
        message: "I'm sorry, I had trouble cancelling your reservation. Would you like me to transfer you to a staff member?"
      }
    };
  }
}

// Default export (all named exports are already inline above)
export default {
  dispatchToolCall,
  processEndOfCall,
};
