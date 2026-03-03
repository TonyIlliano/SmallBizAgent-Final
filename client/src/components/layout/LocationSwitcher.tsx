import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Loader2 } from "lucide-react";

interface Location {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  locationLabel: string | null;
  isActive: boolean;
}

export function LocationSwitcher() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locationsData, isLoading } = useQuery<any>({
    queryKey: ["/api/user/locations"],
    enabled: !!user,
  });

  // API returns { locations: [...], activeBusinessId: ... } — extract the array
  const locations: Location[] = locationsData?.locations ?? (Array.isArray(locationsData) ? locationsData : []);

  const switchMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", "/api/user/switch-location", {
        businessId,
      });
      return await res.json();
    },
    onSuccess: () => {
      // Invalidate all cached queries so every page reloads data for the new location
      queryClient.invalidateQueries();
      // Refetch the user to pick up the new businessId
      queryClient.refetchQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Location switched",
        description: "You are now viewing a different location.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to switch location",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Only render if user has access to more than one location
  if (isLoading || !locations || locations.length <= 1) {
    return null;
  }

  const currentLocation = locations.find((loc) => loc.id === user?.businessId);

  const formatLocationLabel = (loc: Location) => {
    const label = loc.locationLabel || loc.name;
    const region =
      loc.city && loc.state
        ? `${loc.city}, ${loc.state}`
        : loc.city || loc.state || "";
    return region ? `${label} - ${region}` : label;
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5 md:hidden lg:flex">
        <MapPin className="h-3 w-3 text-neutral-500" />
        <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
          Location
        </span>
      </div>
      <Select
        value={user?.businessId?.toString() ?? ""}
        onValueChange={(value) => {
          const businessId = parseInt(value, 10);
          if (businessId !== user?.businessId) {
            switchMutation.mutate(businessId);
          }
        }}
        disabled={switchMutation.isPending}
      >
        <SelectTrigger className="h-8 text-xs bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 focus:ring-neutral-600 w-full">
          {switchMutation.isPending ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Switching...</span>
            </div>
          ) : (
            <SelectValue placeholder="Select location">
              {currentLocation
                ? currentLocation.locationLabel || currentLocation.name
                : "Select location"}
            </SelectValue>
          )}
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem
              key={loc.id}
              value={loc.id.toString()}
              disabled={!loc.isActive}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {loc.locationLabel || loc.name}
                </span>
                {(loc.city || loc.state) && (
                  <span className="text-xs text-muted-foreground">
                    {[loc.city, loc.state].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
