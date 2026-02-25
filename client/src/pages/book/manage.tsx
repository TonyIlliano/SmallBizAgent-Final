import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  XCircle,
  ArrowLeft,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ManageData {
  appointment: {
    id: number;
    startDate: string;
    endDate: string;
    status: string;
    notes: string | null;
  };
  service: { name: string; duration: number; price: string | null };
  staff: string | null;
  customer: { firstName: string; lastName: string; email: string; phone: string } | null;
  business: {
    name: string;
    phone: string;
    email: string;
    address: string | null;
    city: string | null;
    state: string | null;
    timezone: string;
    logoUrl: string | null;
    bookingSlug: string;
  };
}

export default function ManageAppointment() {
  const params = useParams<{ slug: string; token: string }>();
  const { slug, token } = params;
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ManageData | null>(null);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isRescheduled, setIsRescheduled] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Force light mode
  const { setTheme, theme: currentTheme } = useTheme();
  useEffect(() => {
    const prev = currentTheme;
    setTheme("light");
    return () => { if (prev && prev !== "light") setTheme(prev); };
  }, []);

  // Fetch appointment data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/book/${slug}/manage/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load appointment");
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [slug, token]);

  // Fetch available slots when date selected (for reschedule)
  useEffect(() => {
    if (!selectedDate || !data) return;
    async function fetchSlots() {
      setIsLoadingSlots(true);
      setSelectedTime(null);
      try {
        const dateStr = selectedDate!.toISOString().split("T")[0];
        const res = await fetch(`/api/book/${slug}/slots?date=${dateStr}&serviceId=${data!.appointment.id}`);
        const json = await res.json();
        setSlots(json.slots || []);
      } catch {
        setSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    }
    fetchSlots();
  }, [selectedDate, slug, data]);

  const handleCancel = async () => {
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/book/${slug}/manage/${token}/cancel`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to cancel");
      setIsCancelled(true);
      toast({ title: "Appointment Cancelled", description: json.message });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      setShowCancelConfirm(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedDate || !selectedTime) return;
    try {
      setIsSubmitting(true);
      const dateStr = selectedDate.toISOString().split("T")[0];
      const res = await fetch(`/api/book/${slug}/manage/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, time: selectedTime }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to reschedule");
      setIsRescheduled(true);
      // Update local data
      if (data) {
        setData({
          ...data,
          appointment: { ...data.appointment, startDate: json.appointment.startDate, endDate: json.appointment.endDate },
        });
      }
      toast({ title: "Appointment Rescheduled", description: json.message });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime12 = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${min.toString().padStart(2, "0")} ${ampm}`;
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTimeFromDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const isDateDisabled = (date: Date) => {
    const now = new Date();
    const leadTimeHours = 24;
    const minDate = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
    return date < minDate;
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading appointment...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
            <CardTitle>Appointment Not Found</CardTitle>
            <CardDescription>{error || "This link may have expired or is invalid."}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>Please contact the business directly for assistance.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const apt = data.appointment;
  const isCancelledStatus = apt.status === "cancelled" || isCancelled;
  const isCompleted = apt.status === "completed";
  const isPast = new Date(apt.startDate) < new Date();

  // Cancelled confirmation
  if (isCancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Appointment Cancelled</CardTitle>
            <CardDescription>Your appointment has been cancelled successfully.</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Need to book again? Visit our booking page.
            </p>
            <Button onClick={() => window.location.href = `/book/${slug}`} className="w-full">
              <CalendarIcon className="mr-2 h-4 w-4" /> Book New Appointment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Rescheduled confirmation
  if (isRescheduled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Appointment Rescheduled</CardTitle>
            <CardDescription>Your appointment has been updated successfully.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatDateTime(apt.startDate)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatTimeFromDate(apt.startDate)}</span>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{data.service.name}{data.staff ? ` with ${data.staff}` : ""}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center mt-4">
              A confirmation has been sent to your email and phone.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          {data.business.logoUrl ? (
            <img src={data.business.logoUrl} alt={data.business.name}
              className="h-16 w-16 mx-auto rounded-xl object-contain bg-muted p-2 mb-3" />
          ) : (
            <div className="h-16 w-16 mx-auto rounded-xl bg-primary flex items-center justify-center mb-3">
              <span className="text-2xl font-bold text-primary-foreground">{data.business.name[0]}</span>
            </div>
          )}
          <h1 className="text-xl font-bold">{data.business.name}</h1>
          <p className="text-sm text-muted-foreground">Manage Your Appointment</p>
        </div>

        {/* Appointment Details Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Appointment Details</CardTitle>
              <Badge variant={isCancelledStatus ? "destructive" : isCompleted ? "secondary" : "default"}>
                {isCancelledStatus ? "Cancelled" : isCompleted ? "Completed" : apt.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">{formatDateTime(apt.startDate)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{formatTimeFromDate(apt.startDate)}</span>
                <Badge variant="outline" className="ml-auto text-xs">{data.service.duration} min</Badge>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{data.service.name}</span>
                {data.service.price && (
                  <span className="ml-auto font-medium">{formatCurrency(parseFloat(data.service.price))}</span>
                )}
              </div>
              {data.staff && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>with {data.staff}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {!isCancelledStatus && !isCompleted && !isPast && !showReschedule && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowReschedule(true)}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" /> Reschedule
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Cancel
                </Button>
              </div>
            )}

            {isPast && !isCancelledStatus && !isCompleted && (
              <p className="text-sm text-muted-foreground text-center">
                This appointment has already passed.
              </p>
            )}

            {/* Cancel confirmation dialog */}
            {showCancelConfirm && (
              <div className="border border-destructive/20 rounded-lg p-4 bg-destructive/5 space-y-3">
                <p className="text-sm font-medium">Are you sure you want to cancel this appointment?</p>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCancelConfirm(false)}>
                    Keep Appointment
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={handleCancel} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Yes, Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reschedule Section */}
        {showReschedule && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Choose New Date & Time</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowReschedule(false); setSelectedDate(undefined); setSelectedTime(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => setSelectedDate(date || undefined)}
                disabled={isDateDisabled}
                className="rounded-md border mx-auto"
              />

              {selectedDate && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Available Times</h4>
                  {isLoadingSlots ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
                    </div>
                  ) : slots.filter(s => s.available).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No available times on this date.</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {slots.filter(s => s.available).map((slot) => (
                        <Button
                          key={slot.time}
                          variant={selectedTime === slot.time ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedTime(slot.time)}
                          className="text-xs"
                        >
                          {formatTime12(slot.time)}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedDate && selectedTime && (
                <Button className="w-full" onClick={handleReschedule} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Confirm Reschedule to {formatTime12(selectedTime)}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Business Contact */}
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-2">Need help? Contact us:</p>
            {data.business.phone && (
              <p className="text-sm flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${data.business.phone}`} className="text-primary hover:underline">{data.business.phone}</a>
              </p>
            )}
            {data.business.email && (
              <p className="text-sm flex items-center gap-2 mt-1">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${data.business.email}`} className="text-primary hover:underline">{data.business.email}</a>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
