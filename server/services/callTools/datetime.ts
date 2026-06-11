/**
 * callTools/datetime — timezone-aware date/time parsing + formatting for the
 * voice hot path. Pure functions, no I/O.
 *
 * Extracted from callToolHandlers.ts (audit R1 split). parseNaturalDate /
 * parseNaturalTime / createDateInTimezone are public (used by the SMS reply
 * graph and conversational booking via the callToolHandlers facade).
 */

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
export function formatDateForVoice(date: Date, timezone?: string): string {
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
export function getNowInTimezone(timezone: string): Date {
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
export function getLocalTimeInTimezone(utcDate: Date, timezone: string): { hours: number; minutes: number } {
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
export function getLocalDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', { timeZone: timezone });
}

/**
 * Get today's date at midnight in a specific timezone.
 * Returns a "wall clock" Date (year/month/day match the timezone, but hours are 0).
 */
export function getTodayInTimezone(timezone: string): Date {
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
 * Parse a time string like "9:00 AM", "9am", "14:00" into minutes since midnight
 */
export function parseTimeToMinutes(timeStr: string): number {
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

