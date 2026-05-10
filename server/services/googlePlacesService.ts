/**
 * Google Places API (New v1) — server-side wrapper.
 *
 * Used by leadDiscoveryService to scan businesses by industry + zip code.
 * NOT to be confused with the client-side autocomplete widget that lives in
 * `client/src/components/ui/google-places-autocomplete.tsx`.
 *
 * Key resolution:
 *   1. GOOGLE_PLACES_API_KEY (preferred — server-side, separate key)
 *   2. VITE_GOOGLE_PLACES_API_KEY (fallback — same key as the client widget,
 *      requires "Application restrictions: None" or IP-restricted to work
 *      from server-side calls since there's no Referer header)
 *   3. None — service throws on first call, surfaces clearly to the admin UI
 *
 * Cost model (Places API New, late-2025 pricing):
 *   - searchText: $0.032 per request (returns up to 20 results)
 *   - getPlace (details): $0.017 per request
 *
 * Both costs are tracked by the caller (leadDiscoveryService) and persisted
 * to lead_discovery_runs for budget enforcement.
 */

const BASE_URL = 'https://places.googleapis.com/v1';

function getApiKey(): { key: string; source: 'server' | 'fallback' } | null {
  const serverKey = process.env.GOOGLE_PLACES_API_KEY;
  if (serverKey) return { key: serverKey, source: 'server' };

  const fallback = process.env.VITE_GOOGLE_PLACES_API_KEY;
  if (fallback) {
    // Loud warning every time we fall back — keeps it impossible to forget.
    console.warn(
      '[GooglePlaces] Using VITE_GOOGLE_PLACES_API_KEY as fallback. ' +
      'For production stability, provision a server-side GOOGLE_PLACES_API_KEY ' +
      'with IP restrictions (or no application restriction) in Google Cloud Console.',
    );
    return { key: fallback, source: 'fallback' };
  }
  return null;
}

// ─── Throttle ────────────────────────────────────────────────────────────────
// Google's QPS limit is generous (~600/min for Places API New) but we throttle
// to 5 req/sec just to be polite and avoid bursting.

let lastCallAt = 0;
const MIN_GAP_MS = 200;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < MIN_GAP_MS) {
    await new Promise(r => setTimeout(r, MIN_GAP_MS - elapsed));
  }
  lastCallAt = Date.now();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface PlaceSummary {
  placeId: string;
  name: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;       // 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  types?: string[];
  internationalPhoneNumber?: string; // sometimes available on search results
  websiteUri?: string;               // sometimes available on search results
}

export interface PlaceDetails {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  types?: string[];
  regularOpeningHours?: any;        // raw structure from Google
  location?: { latitude: number; longitude: number };
  addressComponents?: any[];
}

export class GooglePlacesError extends Error {
  constructor(public status: number, message: string, public details?: any) {
    super(message);
    this.name = 'GooglePlacesError';
  }
}

/**
 * Text Search — single query, returns up to 20 results.
 * Cost: $0.032 per call.
 *
 * For Maryland HVAC scan, call this with query="HVAC contractor near 21201, MD"
 * (or use locationBias for tighter geographic targeting).
 */
export async function textSearch(opts: {
  query: string;
  locationBias?: { center: { latitude: number; longitude: number }; radiusMeters?: number };
  /** Up to 20 results per call. Default 20 (best $/result ratio). */
  maxResultCount?: number;
}): Promise<PlaceSummary[]> {
  const keyInfo = getApiKey();
  if (!keyInfo) {
    throw new GooglePlacesError(503, 'No Google Places API key configured (GOOGLE_PLACES_API_KEY or VITE_GOOGLE_PLACES_API_KEY)');
  }

  await throttle();

  const body: any = {
    textQuery: opts.query,
    maxResultCount: opts.maxResultCount ?? 20,
  };
  if (opts.locationBias) {
    body.locationBias = {
      circle: {
        center: opts.locationBias.center,
        radius: opts.locationBias.radiusMeters ?? 10000,
      },
    };
  }

  // Field mask determines which fields Google returns + which billing tier we hit.
  // Using basic-tier fields here (id, name, address, rating, types, business_status).
  // Avoiding phone/website in the search step — we'll fetch those via getPlace for
  // only the businesses that pass our rule-based filters (cheaper this way).
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.rating',
    'places.userRatingCount',
    'places.businessStatus',
    'places.types',
  ].join(',');

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': keyInfo.key,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new GooglePlacesError(500, `Network error calling Places searchText: ${err?.message || err}`);
  }

  if (!response.ok) {
    let errBody: any = null;
    try { errBody = await response.json(); } catch { /* swallow */ }
    throw new GooglePlacesError(
      response.status,
      `Places searchText failed: ${response.status} ${response.statusText}`,
      errBody,
    );
  }

  const data: any = await response.json();
  const places = Array.isArray(data?.places) ? data.places : [];

  return places.map((p: any): PlaceSummary => ({
    placeId: p.id,
    name: p.displayName?.text || p.displayName || '',
    formattedAddress: p.formattedAddress,
    rating: p.rating,
    userRatingCount: p.userRatingCount,
    businessStatus: p.businessStatus,
    types: p.types,
  }));
}

/**
 * Place Details — fetch full details for a specific place.
 * Cost: $0.017 per call.
 *
 * Only call this on places that already passed Layer 2 (rule-based) filtering
 * during a scan. This is the second-cheapest API call but the second-most
 * frequent — be selective about who gets here.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const keyInfo = getApiKey();
  if (!keyInfo) {
    throw new GooglePlacesError(503, 'No Google Places API key configured');
  }

  await throttle();

  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'internationalPhoneNumber',
    'nationalPhoneNumber',
    'websiteUri',
    'rating',
    'userRatingCount',
    'businessStatus',
    'types',
    'regularOpeningHours',
    'location',
    'addressComponents',
  ].join(',');

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/places/${encodeURIComponent(placeId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': keyInfo.key,
        'X-Goog-FieldMask': fieldMask,
      },
    });
  } catch (err: any) {
    throw new GooglePlacesError(500, `Network error calling Places getPlace: ${err?.message || err}`);
  }

  if (!response.ok) {
    let errBody: any = null;
    try { errBody = await response.json(); } catch { /* swallow */ }
    throw new GooglePlacesError(
      response.status,
      `Places getPlace failed: ${response.status} ${response.statusText}`,
      errBody,
    );
  }

  const p: any = await response.json();
  return {
    placeId: p.id,
    displayName: p.displayName?.text || p.displayName || '',
    formattedAddress: p.formattedAddress,
    internationalPhoneNumber: p.internationalPhoneNumber,
    nationalPhoneNumber: p.nationalPhoneNumber,
    websiteUri: p.websiteUri,
    rating: p.rating,
    userRatingCount: p.userRatingCount,
    businessStatus: p.businessStatus,
    types: p.types,
    regularOpeningHours: p.regularOpeningHours,
    location: p.location,
    addressComponents: p.addressComponents,
  };
}

/** Cheap helper for testing API key + connectivity. Costs $0.032 (one search). */
export async function pingApi(): Promise<{ ok: boolean; resultCount: number; keySource: 'server' | 'fallback' | 'none' }> {
  const keyInfo = getApiKey();
  if (!keyInfo) return { ok: false, resultCount: 0, keySource: 'none' };
  try {
    const results = await textSearch({ query: 'Starbucks Baltimore Maryland', maxResultCount: 1 });
    return { ok: true, resultCount: results.length, keySource: keyInfo.source };
  } catch (err) {
    console.error('[GooglePlaces] pingApi failed:', err);
    return { ok: false, resultCount: 0, keySource: keyInfo.source };
  }
}
