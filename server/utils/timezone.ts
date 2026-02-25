/**
 * Timezone utility functions for creating dates in specific timezones.
 *
 * On cloud servers (Railway, etc.) the server runs in UTC. Using `new Date(year, month, day, hour, min)`
 * creates dates in UTC, which is wrong for business-local times.
 *
 * Example: createDateInTimezone(2026, 2, 12, 13, 0, 'America/New_York')
 *  → Returns Date representing 2026-03-12T17:00:00.000Z (1pm ET = 5pm UTC)
 */

/**
 * Create a Date object that represents a specific local time in a given timezone.
 * The returned Date stores the correct UTC instant so that when displayed in the
 * target timezone, it shows the intended hours and minutes.
 *
 * @param year - Full year (e.g., 2026)
 * @param month - 0-indexed month (0 = January, 2 = March)
 * @param day - Day of month
 * @param hours - Hours in 24h format (0-23)
 * @param minutes - Minutes (0-59)
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns Date object with correct UTC time
 */
export function createDateInTimezone(
  year: number, month: number, day: number,
  hours: number, minutes: number, timezone: string
): Date {
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
 * Get the local hours and minutes for a UTC date in a specific timezone.
 * Useful for displaying times in the business's local timezone.
 *
 * @param utcDate - Date object (UTC)
 * @param timezone - IANA timezone string
 * @returns Object with hours (0-23) and minutes (0-59) in local time
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
    return { hours: utcDate.getHours(), minutes: utcDate.getMinutes() };
  }
}
