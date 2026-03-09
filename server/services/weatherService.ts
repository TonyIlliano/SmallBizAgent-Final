/**
 * Weather Service
 *
 * Fetches weather forecasts from OpenWeatherMap 5-day/3-hour API.
 * Used to add weather alerts to appointment reminders for field service businesses.
 * Gracefully degrades if API key is not configured or API fails.
 *
 * Free tier: 1,000 calls/day. With 3-hour caching per zip code, usage is minimal.
 */

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const isWeatherConfigured = !!OPENWEATHER_API_KEY;

if (!isWeatherConfigured) {
  console.warn('⚠️  OpenWeatherMap API key not configured. Weather alerts in reminders will be disabled.');
  console.warn('   Set OPENWEATHER_API_KEY in your environment to enable.');
}

// ── Types ──

interface WeatherForecast {
  condition: string;     // e.g., "Rain", "Snow", "Thunderstorm", "Clear"
  description: string;   // e.g., "light rain", "heavy snow"
  tempHigh: number;      // Fahrenheit
  tempLow: number;       // Fahrenheit
  isBadWeather: boolean; // true if condition is Rain/Snow/Thunderstorm/Drizzle
}

interface ForecastBlock extends WeatherForecast {
  dt: number; // Timestamp in milliseconds
}

interface CacheEntry {
  data: ForecastBlock[];
  fetchedAt: number;
}

// ── Cache ──

// In-memory cache keyed by 5-digit zip code. TTL = 3 hours (matches API's 3-hour granularity).
const forecastCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ── Bad weather conditions ──

// OpenWeatherMap "main" weather groups that warrant a heads-up for outdoor field service work.
// NOT included: Clouds, Mist, Fog, Clear, Haze, Smoke, Dust, Sand, Ash, Squall, Tornado
const BAD_WEATHER_CONDITIONS = new Set([
  'Rain',
  'Snow',
  'Thunderstorm',
  'Drizzle',
]);

// ── Core function ──

/**
 * Get weather forecast for a US zip code at a target date/time.
 * Returns null if weather API is not configured, zip is invalid, or API call fails.
 * Never throws — always returns null on any failure.
 */
export async function getWeatherForecast(
  zipCode: string,
  targetDate: Date | string,
): Promise<WeatherForecast | null> {
  if (!isWeatherConfigured) return null;

  // Validate 5-digit US zip
  const zip = (zipCode || '').trim();
  if (!/^\d{5}$/.test(zip)) {
    return null;
  }

  // Normalize targetDate to a Date object
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  if (isNaN(target.getTime())) {
    return null;
  }

  try {
    // Check cache first
    const cached = forecastCache.get(zip);
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
      console.log(`[Weather] Cache hit for zip ${zip}`);
      return findClosestForecast(cached.data, target);
    }

    // Fetch from OpenWeatherMap 5-day/3-hour forecast API
    console.log(`[Weather] Fetching forecast for zip ${zip}`);
    const url = `https://api.openweathermap.org/data/2.5/forecast?zip=${zip},US&appid=${OPENWEATHER_API_KEY}&units=imperial`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Weather] API error for zip ${zip}: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!data.list || !Array.isArray(data.list)) {
      console.error(`[Weather] Unexpected API response for zip ${zip}: missing forecast list`);
      return null;
    }

    // Parse forecast blocks
    const forecasts: ForecastBlock[] = data.list.map((entry: any) => {
      const condition = entry.weather?.[0]?.main || 'Unknown';
      return {
        condition,
        description: entry.weather?.[0]?.description || '',
        tempHigh: entry.main?.temp_max ?? 0,
        tempLow: entry.main?.temp_min ?? 0,
        isBadWeather: BAD_WEATHER_CONDITIONS.has(condition),
        dt: (entry.dt || 0) * 1000, // Convert Unix seconds to JS milliseconds
      };
    });

    // Cache the result
    forecastCache.set(zip, { data: forecasts, fetchedAt: Date.now() });
    console.log(`[Weather] Cached ${forecasts.length} forecast blocks for zip ${zip}`);

    return findClosestForecast(forecasts, target);
  } catch (error) {
    console.error(`[Weather] Failed to fetch forecast for zip ${zip}:`, error);
    return null;
  }
}

// ── Helpers ──

/**
 * Find the forecast block closest to the target date/time.
 * The API returns 3-hour blocks, so we find the one whose timestamp
 * is nearest to the appointment time.
 */
function findClosestForecast(
  forecasts: ForecastBlock[],
  targetDate: Date,
): WeatherForecast | null {
  if (forecasts.length === 0) return null;

  const targetMs = targetDate.getTime();
  let closest = forecasts[0];
  let closestDiff = Math.abs(closest.dt - targetMs);

  for (const f of forecasts) {
    const diff = Math.abs(f.dt - targetMs);
    if (diff < closestDiff) {
      closest = f;
      closestDiff = diff;
    }
  }

  return {
    condition: closest.condition,
    description: closest.description,
    tempHigh: closest.tempHigh,
    tempLow: closest.tempLow,
    isBadWeather: closest.isBadWeather,
  };
}

// ── Export ──

export default {
  getWeatherForecast,
};
