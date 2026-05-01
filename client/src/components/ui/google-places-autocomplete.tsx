import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2, AlertCircle } from "lucide-react";

const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

export interface PlaceDetails {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  website: string;
  placeId: string;
}

interface GooglePlacesAutocompleteProps {
  onPlaceSelected: (place: PlaceDetails) => void;
  /** Called when the autocomplete is unavailable (no key, script failed, etc.) so the parent can show a fallback. */
  onUnavailable?: (reason: string) => void;
  placeholder?: string;
  className?: string;
}

// Load Google Maps script once. Promise resolves on success, rejects on failure.
let googleMapsLoaded = false;
let googleMapsLoadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (googleMapsLoaded) return Promise.resolve();
  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    // If the script tag already exists (e.g., from another component), wait for window.google
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existing && (window as any).google?.maps?.places) {
      googleMapsLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if ((window as any).google?.maps?.places) {
        googleMapsLoaded = true;
        resolve();
      } else {
        // Script loaded but the Places library is missing — usually means the
        // key is invalid, the API isn't enabled, or referrer restrictions failed.
        reject(new Error('Google Maps loaded but window.google.maps.places is unavailable'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps script (CSP, network, or invalid key)'));
    };
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

export default function GooglePlacesAutocomplete({
  onPlaceSelected,
  onUnavailable,
  placeholder = "Search for your business...",
  className,
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_PLACES_API_KEY) {
      const reason = 'Google Places API key not configured (VITE_GOOGLE_PLACES_API_KEY missing at build time)';
      console.warn('[GooglePlaces]', reason);
      onUnavailable?.(reason);
      return;
    }

    setLoading(true);
    loadGoogleMaps()
      .then(() => {
        setLoading(false);
        setReady(true);
      })
      .catch((err: Error) => {
        const reason = err.message || 'Unknown Google Maps load error';
        console.error('[GooglePlaces]', reason);
        setLoading(false);
        setErrorMessage(reason);
        onUnavailable?.(reason);
      });
  }, [onUnavailable]);

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

    try {
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        types: ["establishment"],
        componentRestrictions: { country: "us" },
        fields: [
          "name",
          "address_components",
          "formatted_address",
          "formatted_phone_number",
          "website",
          "place_id",
        ],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place || !place.address_components) return;

        const getComponent = (type: string): string => {
          const component = place.address_components?.find((c) =>
            c.types.includes(type)
          );
          return component?.long_name || "";
        };

        const getShortComponent = (type: string): string => {
          const component = place.address_components?.find((c) =>
            c.types.includes(type)
          );
          return component?.short_name || "";
        };

        // Build street address from components
        const streetNumber = getComponent("street_number");
        const route = getComponent("route");
        const address = streetNumber ? `${streetNumber} ${route}` : route;

        const details: PlaceDetails = {
          name: place.name || "",
          address: address || "",
          city: getComponent("locality") || getComponent("sublocality_level_1") || "",
          state: getShortComponent("administrative_area_level_1") || "",
          zipCode: getComponent("postal_code") || "",
          phone: place.formatted_phone_number?.replace(/[^\d]/g, "") || "",
          website: place.website || "",
          placeId: place.place_id || "",
        };

        onPlaceSelected(details);
      });

      autocompleteRef.current = autocomplete;
    } catch (err: any) {
      const reason = err?.message || 'Failed to initialize Places Autocomplete';
      console.error('[GooglePlaces]', reason);
      setErrorMessage(reason);
      onUnavailable?.(reason);
    }
  }, [ready, onPlaceSelected, onUnavailable]);

  // No API key → render nothing (parent handles the fallback via onUnavailable)
  if (!GOOGLE_PLACES_API_KEY) {
    return null;
  }

  // Script load failed → render an inline error so the user sees something happened
  if (errorMessage) {
    return (
      <div className={`text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center gap-2 ${className || ""}`}>
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Business search is unavailable right now. Use manual entry below.</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className || ""}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className="pl-9"
        disabled={loading}
      />
    </div>
  );
}
