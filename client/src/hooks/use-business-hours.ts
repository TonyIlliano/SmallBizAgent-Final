import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { computeCalendarRange, getVerticalLabels } from "@/lib/scheduling-utils";
import type { BusinessHoursEntry, CalendarRange, VerticalLabels } from "@/lib/scheduling-utils";

interface BusinessHoursResult extends CalendarRange {
  industry: string;
  timezone: string;
  isRestaurant: boolean;
  labels: VerticalLabels;
  businessId: number | undefined;
  isLoading: boolean;
}

/**
 * Custom hook that fetches business hours and computes the calendar display range.
 * Also provides vertical-aware labels based on business industry.
 *
 * Usage:
 *   const { hourStart, hourEnd, hours, labels, isRestaurant } = useBusinessHours();
 */
export function useBusinessHours(): BusinessHoursResult {
  const { user } = useAuth();
  const businessId = user?.businessId;

  const { data: business } = useQuery<any>({
    queryKey: ["/api/business"],
    enabled: !!businessId,
  });

  const { data: hoursData = [], isLoading } = useQuery<BusinessHoursEntry[]>({
    queryKey: [`/api/business/${businessId}/hours`],
    enabled: !!businessId,
  });

  const range = computeCalendarRange(hoursData);
  const industry = business?.industry || "";
  const labels = getVerticalLabels(industry);

  return {
    ...range,
    industry,
    timezone: business?.timezone || "America/New_York",
    isRestaurant:
      industry.toLowerCase().includes("restaurant") || false,
    labels,
    businessId: businessId ?? undefined,
    isLoading,
  };
}
