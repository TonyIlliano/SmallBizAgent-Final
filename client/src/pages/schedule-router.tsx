/**
 * Schedule Router — redirects /appointments to /jobs for job-category businesses.
 * Appointment-category businesses (salon, barber, dental, etc.) see the normal appointments calendar.
 * Job-category businesses (HVAC, plumbing, electrical, etc.) are redirected to the jobs page.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { isJobCategory } from "@shared/industry-categories";
import { Loader2 } from "lucide-react";

// Lazy-import the real appointments page only when needed
import Appointments from "@/pages/appointments/index";

export default function ScheduleRouter() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: business, isLoading } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!user?.businessId,
  });

  useEffect(() => {
    if (!isLoading && business && isJobCategory(business.industry)) {
      navigate('/jobs', { replace: true });
    }
  }, [business, isLoading, navigate]);

  // Show a quick loading state while we figure out which page to show
  if (isLoading || !business) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If we get here, it's an appointment-category business — show the normal calendar
  if (!isJobCategory(business.industry)) {
    return <Appointments />;
  }

  // Job-category business — we're redirecting, show nothing
  return null;
}
