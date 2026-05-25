/**
 * Singleton Google Maps script loader.
 *
 * Used by:
 *   - GooglePlacesAutocomplete (existing — needs `places` library)
 *   - GPS dispatcher + customer track page (needs `marker` library)
 *
 * Loading the script twice with different `libraries` parameters causes the
 * second load to silently fail. This module ensures one script tag with the
 * UNION of all needed libraries.
 *
 * The existing GooglePlacesAutocomplete has its own loader that pre-dates this
 * one — it's left in place for backward compatibility. New consumers should
 * use this module via `loadGoogleMapsScript()`.
 */

const BUILD_TIME_KEY: string | undefined = (import.meta as any).env?.VITE_GOOGLE_PLACES_API_KEY
  || (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

let runtimeKeyPromise: Promise<string | null> | null = null;
let scriptLoadPromise: Promise<void> | null = null;
let loadedLibraries = new Set<string>();

const DEFAULT_LIBRARIES = ['places', 'marker'];

/**
 * Resolve the Google Maps API key. Tries build-time env first, then a runtime
 * fetch from /api/config/public. Returns null if neither yields a key.
 */
async function resolveApiKey(): Promise<string | null> {
  if (BUILD_TIME_KEY) return BUILD_TIME_KEY;
  if (runtimeKeyPromise) return runtimeKeyPromise;
  runtimeKeyPromise = (async () => {
    try {
      const res = await fetch('/api/config/public', { credentials: 'include' });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.googleMapsApiKey || json?.googlePlacesApiKey || null;
    } catch (err) {
      console.error('[GoogleMaps] runtime key fetch failed:', err);
      return null;
    }
  })();
  return runtimeKeyPromise;
}

/**
 * Load the Google Maps JavaScript API. Idempotent — repeat calls share the
 * same script tag + Promise. `libraries` defaults to ['places', 'marker'].
 *
 * Returns the loaded `google.maps` namespace, or null if the API key is
 * missing or the script failed to load.
 */
export async function loadGoogleMapsScript(
  libraries: string[] = DEFAULT_LIBRARIES
): Promise<typeof google.maps | null> {
  // If google.maps already exists (e.g., GooglePlacesAutocomplete loaded it first),
  // and our requested libraries are a subset of what's loaded, return immediately.
  if ((window as any).google?.maps) {
    libraries.forEach(l => loadedLibraries.add(l));
    return (window as any).google.maps as typeof google.maps;
  }

  const key = await resolveApiKey();
  if (!key) {
    console.warn('[GoogleMaps] No API key available — map will not load');
    return null;
  }

  if (scriptLoadPromise) {
    await scriptLoadPromise;
    return (window as any).google?.maps ?? null;
  }

  const libList = Array.from(new Set([...libraries, ...DEFAULT_LIBRARIES])).join(',');

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    // Check if some other code already injected a maps script
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existing && (window as any).google?.maps) {
      libraries.forEach(l => loadedLibraries.add(l));
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=${libList}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if ((window as any).google?.maps) {
        libraries.forEach(l => loadedLibraries.add(l));
        resolve();
      } else {
        reject(new Error('Google Maps script loaded but window.google.maps is unavailable'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps script — check API key, billing, and referrer restrictions'));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    console.error('[GoogleMaps] load error:', err);
    scriptLoadPromise = null; // allow retry on next call
    throw err;
  });

  try {
    await scriptLoadPromise;
  } catch {
    return null;
  }
  return (window as any).google?.maps ?? null;
}

/**
 * Synchronous check — does the window.google.maps namespace exist?
 * Used by components that want to bail to a fallback UI without awaiting.
 */
export function isGoogleMapsReady(): boolean {
  return !!(window as any).google?.maps;
}
