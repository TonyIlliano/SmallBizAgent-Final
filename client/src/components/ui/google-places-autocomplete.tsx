import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Loader2 } from "lucide-react";

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
  placeholder?: string;
  className?: string;
}

// Load Google Maps script once
let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded) {
      resolve();
      return;
    }

    loadCallbacks.push(resolve);

    if (googleMapsLoading) return;
    googleMapsLoading = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => {
      googleMapsLoaded = true;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

export default function GooglePlacesAutocomplete({
  onPlaceSelected,
  placeholder = "Search for your business...",
  className,
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!GOOGLE_PLACES_API_KEY) {
      console.warn("VITE_GOOGLE_PLACES_API_KEY not set — Google Places disabled");
      return;
    }

    setLoading(true);
    loadGoogleMaps().then(() => {
      setLoading(false);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

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
  }, [ready, onPlaceSelected]);

  // If no API key, don't render anything
  if (!GOOGLE_PLACES_API_KEY) {
    return null;
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
