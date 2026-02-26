import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import {
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  User,
  Users,
  XCircle,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";

interface ReservationManageData {
  reservation: {
    id: number;
    partySize: number;
    date: string;
    time: string;
    startDate: string;
    endDate: string;
    status: string;
    specialRequests: string | null;
    source: string | null;
  };
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  } | null;
  business: {
    name: string;
    phone: string;
    email: string;
    address: string | null;
    city: string | null;
    state: string | null;
    timezone: string;
    timezoneAbbr: string;
    logoUrl: string | null;
    bookingSlug: string;
  };
}

export default function ManageReservation() {
  const params = useParams<{ slug: string; token: string }>();
  const { slug, token } = params;
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReservationManageData | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  // Force light mode
  const { setTheme, theme: currentTheme } = useTheme();
  useEffect(() => {
    const previousTheme = currentTheme;
    setTheme("light");
    return () => {
      if (previousTheme && previousTheme !== "light") setTheme(previousTheme);
    };
  }, []);

  useEffect(() => {
    fetchReservation();
  }, [slug, token]);

  const fetchReservation = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/book/${slug}/manage-reservation/${token}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to load reservation");
      }
      const d = await res.json();
      setData(d);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      setIsCancelling(true);
      const res = await fetch(`/api/book/${slug}/manage-reservation/${token}/cancel`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to cancel reservation");
      setCancelled(true);
      toast({ title: "Reservation Cancelled", description: d.message });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const formatTime12 = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${min.toString().padStart(2, "0")} ${ampm}`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <CardTitle>Reservation Not Found</CardTitle>
            <CardDescription>{error || "This link may have expired or is invalid."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { reservation, customer, business } = data;
  const startDate = new Date(reservation.startDate);
  const statusColor: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800",
    seated: "bg-blue-100 text-blue-800",
    completed: "bg-gray-100 text-gray-800",
    cancelled: "bg-red-100 text-red-800",
    no_show: "bg-amber-100 text-amber-800",
  };

  const businessLocation = [business.address, business.city, business.state].filter(Boolean).join(", ");
  const isCancelable = !cancelled && reservation.status !== "cancelled" && reservation.status !== "completed" && reservation.status !== "seated";

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-primary/80 p-6">
            <div className="flex items-center gap-4 text-primary-foreground">
              {business.logoUrl ? (
                <img src={business.logoUrl} alt={business.name}
                  className="h-14 w-14 rounded-xl object-contain bg-white/20 backdrop-blur-sm p-2" />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-xl font-bold">{business.name[0]}</span>
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold">{business.name}</h1>
                <p className="text-primary-foreground/80 text-sm">Manage Your Reservation</p>
              </div>
            </div>
          </div>

          <CardContent className="pt-6 space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Reservation #{reservation.id}</span>
              <Badge className={statusColor[cancelled ? "cancelled" : reservation.status] || "bg-gray-100 text-gray-800"}>
                {cancelled ? "Cancelled" : reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1)}
              </Badge>
            </div>

            {/* Reservation Details */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">Party of {reservation.partySize}</span>
              </div>
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">
                  {startDate.toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric", year: "numeric",
                    timeZone: business.timezone,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">
                  {formatTime12(reservation.time)}{business.timezoneAbbr ? ` ${business.timezoneAbbr}` : ""}
                </span>
              </div>
              {reservation.specialRequests && (
                <div className="flex items-start gap-3 pt-2 border-t">
                  <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Special Requests</p>
                    <p className="text-sm">{reservation.specialRequests}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Customer Info */}
            {customer && (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{customer.firstName} {customer.lastName}</span>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{customer.email}</span>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{customer.phone}</span>
                  </div>
                )}
              </div>
            )}

            {/* Cancelled banner */}
            {(cancelled || reservation.status === "cancelled") && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  This reservation has been cancelled.
                </p>
              </div>
            )}

            {/* Cancel button */}
            {isCancelable && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...</>
                ) : (
                  <><XCircle className="mr-2 h-4 w-4" /> Cancel Reservation</>
                )}
              </Button>
            )}

            {/* Business Info */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">{business.name}</h4>
              {businessLocation && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 flex-shrink-0" />{businessLocation}
                </p>
              )}
              {business.phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <a href={`tel:${business.phone}`} className="hover:underline">{business.phone}</a>
                </p>
              )}
              {business.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <a href={`mailto:${business.email}`} className="hover:underline">{business.email}</a>
                </p>
              )}
            </div>

            {/* Back to booking */}
            <a href={`/book/${slug}`}>
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Booking Page
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Powered by */}
        <div className="text-center">
          <a href="https://www.smallbizagent.ai" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
            Powered by SmallBizAgent
          </a>
        </div>
      </div>
    </div>
  );
}
