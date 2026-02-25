import { useState, useEffect, useRef } from "react";
import { useParams, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
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
  ArrowLeft,
  ArrowRight,
  Download,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface BusinessInfo {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  timezone: string;
  bookingLeadTimeHours: number;
  bookingBufferMinutes: number;
}

interface ServiceInfo {
  id: number;
  name: string;
  description: string | null;
  price: number | null;
  duration: number | null;
}

interface StaffInfo {
  id: number;
  firstName: string;
  lastName: string;
  specialty: string | null;
  bio: string | null;
  photoUrl: string | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
  staffAvailable: number[];
}

interface BookingData {
  business: BusinessInfo;
  services: ServiceInfo[];
  staff: StaffInfo[];
  businessHours: Array<{
    day: string;
    open: string | null;
    close: string | null;
    isClosed: boolean;
  }>;
}

const STEPS = [
  { num: 1, label: "Service" },
  { num: 2, label: "Date & Time" },
  { num: 3, label: "Details" },
];

export default function PublicBooking() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isEmbed = searchParams.get("embed") === "true";
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Form steps
  const [step, setStep] = useState(1);

  // Form state
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [notes, setNotes] = useState("");

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmationData, setConfirmationData] = useState<any>(null);

  // Embed: notify parent of height changes
  useEffect(() => {
    if (!isEmbed || !containerRef.current) return;
    const observer = new ResizeObserver(() => {
      const height = containerRef.current?.scrollHeight || 0;
      window.parent.postMessage({ type: "sba-booking-resize", height }, "*");
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isEmbed, step, bookingConfirmed]);

  // Embed: notify parent on booking success
  useEffect(() => {
    if (isEmbed && bookingConfirmed && confirmationData) {
      window.parent.postMessage({
        type: "sba-booking-success",
        appointment: confirmationData.appointment,
      }, "*");
    }
  }, [isEmbed, bookingConfirmed, confirmationData]);

  // Fetch business data on mount
  useEffect(() => {
    fetchBookingData();
  }, [slug]);

  // Fetch time slots when date changes
  useEffect(() => {
    if (selectedDate && selectedService) {
      fetchTimeSlots();
    }
  }, [selectedDate, selectedService, selectedStaff]);

  const fetchBookingData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/book/${slug}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load booking page");
      }
      const data = await res.json();
      setBookingData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTimeSlots = async () => {
    if (!selectedDate || !selectedService) return;

    try {
      setIsLoadingSlots(true);
      const dateStr = selectedDate.toISOString().split("T")[0];
      let url = `/api/book/${slug}/slots?date=${dateStr}&serviceId=${selectedService}`;
      if (selectedStaff) {
        url += `&staffId=${selectedStaff}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load time slots");
      }
      const data = await res.json();
      setSlots(data.slots || []);
      setSelectedTime(null);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedService || !selectedDate || !selectedTime) return;

    try {
      setIsSubmitting(true);

      const res = await fetch(`/api/book/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService,
          staffId: selectedStaff,
          date: selectedDate.toISOString().split("T")[0],
          time: selectedTime,
          customer: customerInfo,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create booking");
      }

      setConfirmationData(data);
      setBookingConfirmed(true);
      setStep(4);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${min.toString().padStart(2, "0")} ${ampm}`;
  };

  const isDateDisabled = (date: Date) => {
    const now = new Date();
    const leadTimeHours = bookingData?.business.bookingLeadTimeHours || 24;
    const minDate = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
    if (date < minDate) return true;
    const maxDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    if (date > maxDate) return true;
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const dayHours = bookingData?.businessHours.find(
      (h) => h.day.toLowerCase() === dayName
    );
    if (dayHours?.isClosed || !dayHours?.open) return true;
    return false;
  };

  const getSelectedService = () =>
    bookingData?.services.find((s) => s.id === selectedService);

  const getSelectedStaffMember = () =>
    bookingData?.staff.find((s) => s.id === selectedStaff);

  const generateIcsFile = () => {
    if (!confirmationData?.appointment) return;
    const service = getSelectedService();
    const start = new Date(confirmationData.appointment.startDate);
    const end = new Date(confirmationData.appointment.endDate);
    const formatIcsDate = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SmallBizAgent//Booking//EN",
      "BEGIN:VEVENT",
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${service?.name || "Appointment"} at ${bookingData?.business.name || ""}`,
      `LOCATION:${bookingData?.business.address || ""}${bookingData?.business.city ? `, ${bookingData.business.city}` : ""}`,
      `DESCRIPTION:Booking #${confirmationData.appointment.id}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "appointment.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Powered by SmallBizAgent footer
  const PoweredByFooter = () => (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
      <span>Powered by</span>
      <a
        href="https://www.smallbizagent.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 font-medium text-foreground/70 hover:text-foreground transition-colors"
      >
        <img src="/icons/icon-32x32.png" alt="SmallBizAgent" className="h-5 w-5 rounded" />
        SmallBizAgent
      </a>
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isEmbed ? "bg-transparent" : "bg-muted/30"}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading booking page...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !bookingData) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isEmbed ? "bg-transparent" : "bg-muted/30"} p-4`}>
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
            <CardTitle>Booking Not Available</CardTitle>
            <CardDescription>
              {error || "This booking page is not available."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>Please contact the business directly to schedule an appointment.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build the business location string
  const businessLocation = [
    bookingData.business.address,
    bookingData.business.city,
    bookingData.business.state,
  ].filter(Boolean).join(", ");

  // Confirmation screen
  if (bookingConfirmed && confirmationData) {
    return (
      <div ref={containerRef} className={`min-h-screen ${isEmbed ? "bg-transparent py-2 px-1" : "bg-muted/30 py-8 px-4"}`}>
        <div className="max-w-lg mx-auto">
          <Card className="overflow-hidden">
            <CardHeader className="text-center pb-4 bg-gradient-to-b from-green-50 to-transparent dark:from-green-950/20">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl">You're All Set!</CardTitle>
              <CardDescription className="text-base">
                Booking reference: <strong>#{confirmationData.appointment?.id}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">
                    {selectedDate?.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{selectedTime && formatTime(selectedTime)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{confirmationData.appointment?.serviceName}</span>
                  {getSelectedService()?.duration && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {getSelectedService()!.duration} min
                    </Badge>
                  )}
                </div>
                {getSelectedStaffMember() && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>with {getSelectedStaffMember()?.firstName} {getSelectedStaffMember()?.lastName}</span>
                  </div>
                )}
                {getSelectedService()?.price && (
                  <div className="flex items-center gap-3 pt-1 border-t">
                    <span className="font-medium">Total</span>
                    <span className="ml-auto font-semibold text-lg">
                      {formatCurrency(getSelectedService()!.price!)}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirmation notification */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                <p className="text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  A confirmation has been sent to <strong>{customerInfo.email}</strong> and <strong>{customerInfo.phone}</strong>.
                </p>
              </div>

              {/* Add to Calendar */}
              <Button variant="outline" className="w-full" onClick={generateIcsFile}>
                <Download className="mr-2 h-4 w-4" /> Add to Calendar
              </Button>

              {/* Business info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">{bookingData.business.name}</h4>
                {businessLocation && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    {businessLocation}
                  </p>
                )}
                {bookingData.business.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <a href={`tel:${bookingData.business.phone}`} className="text-primary hover:underline">
                      {bookingData.business.phone}
                    </a>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <PoweredByFooter />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`min-h-screen ${isEmbed ? "bg-transparent py-2 px-1" : "bg-muted/30 py-8 px-4"}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Hero Header with Business Branding */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary to-primary/80 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="relative z-10 px-6 py-8">
            <div className="flex items-center gap-4">
              {bookingData.business.logoUrl && (
                <img
                  src={bookingData.business.logoUrl}
                  alt={bookingData.business.name}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl object-contain bg-white/20 backdrop-blur-sm p-2"
                />
              )}
              <div className="text-primary-foreground">
                <h1 className="text-xl sm:text-2xl font-bold">{bookingData.business.name}</h1>
                <p className="text-primary-foreground/80 text-sm sm:text-base">Book an appointment online</p>
                {businessLocation && (
                  <p className="text-sm text-primary-foreground/60 flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />
                    {businessLocation}
                  </p>
                )}
                {bookingData.business.phone && (
                  <p className="text-sm text-primary-foreground/60 flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3" />
                    {bookingData.business.phone}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Step Indicator with Labels */}
        <div className="flex items-center justify-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                    step > s.num
                      ? "bg-primary text-primary-foreground"
                      : step === s.num
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s.num ? <CheckCircle className="h-5 w-5" /> : s.num}
                </div>
                <span
                  className={`text-xs font-medium ${
                    step >= s.num ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-12 sm:w-16 h-0.5 mx-2 mb-5 transition-colors ${
                    step > s.num ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Select Service */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select a Service</CardTitle>
              <CardDescription>Choose the service you would like to book</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bookingData.services.map((service) => (
                <div
                  key={service.id}
                  className={`relative p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedService === service.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                      : "border-border hover:border-primary/30 hover:shadow-sm"
                  }`}
                  onClick={() => setSelectedService(service.id)}
                >
                  {selectedService === service.id && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex justify-between items-start pr-6">
                    <div>
                      <h4 className="font-medium">{service.name}</h4>
                      {service.description && (
                        <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                      )}
                      {service.duration && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{service.duration} min</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      {service.price ? (
                        <p className="font-semibold text-lg">{formatCurrency(service.price)}</p>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Contact for price</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Staff Selection as Visual Cards */}
              {bookingData.staff.length > 1 && (
                <div className="mt-6 pt-4 border-t">
                  <Label className="text-sm font-medium mb-3 block">Staff Preference (Optional)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* "Any Available" card */}
                    <div
                      className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                        selectedStaff === null
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/30"
                      }`}
                      onClick={() => setSelectedStaff(null)}
                    >
                      <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Any Available</p>
                    </div>
                    {/* Staff member cards */}
                    {bookingData.staff.map((staffMember) => (
                      <div
                        key={staffMember.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                          selectedStaff === staffMember.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:border-primary/30"
                        }`}
                        onClick={() => setSelectedStaff(staffMember.id)}
                      >
                        {staffMember.photoUrl ? (
                          <img
                            src={staffMember.photoUrl}
                            alt={staffMember.firstName}
                            className="w-12 h-12 mx-auto mb-2 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-lg font-medium text-muted-foreground">
                              {staffMember.firstName[0]}
                              {staffMember.lastName[0]}
                            </span>
                          </div>
                        )}
                        <p className="text-sm font-medium">{staffMember.firstName}</p>
                        {staffMember.specialty && (
                          <p className="text-xs text-muted-foreground mt-0.5">{staffMember.specialty}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button onClick={() => setStep(2)} disabled={!selectedService}>
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Select Date & Time */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Date & Time</CardTitle>
              <CardDescription>Pick a date and available time slot</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Calendar */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Date</Label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={isDateDisabled}
                    className="rounded-md border"
                  />
                </div>

                {/* Time Slots */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Available Times</Label>
                  {!selectedDate ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CalendarIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">Select a date to see available times</p>
                    </div>
                  ) : isLoadingSlots ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : slots.filter((s) => s.available).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No available times on this date</p>
                      <p className="text-xs text-muted-foreground mt-1">Try selecting a different date</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {slots
                        .filter((slot) => slot.available)
                        .map((slot) => (
                          <Button
                            key={slot.time}
                            variant={selectedTime === slot.time ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedTime(slot.time)}
                            className="text-sm"
                          >
                            {formatTime(slot.time)}
                          </Button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-6">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!selectedDate || !selectedTime}>
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Customer Details */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Details</CardTitle>
              <CardDescription>
                Enter your contact information to complete the booking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Booking Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 mb-2">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Booking Summary</h4>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service</span>
                    <span className="font-medium">{getSelectedService()?.name}</span>
                  </div>
                  {getSelectedStaffMember() && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">With</span>
                      <span className="font-medium">
                        {getSelectedStaffMember()?.firstName} {getSelectedStaffMember()?.lastName}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">
                      {selectedDate?.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">{selectedTime && formatTime(selectedTime)}</span>
                  </div>
                  {getSelectedService()?.duration && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">{getSelectedService()!.duration} min</span>
                    </div>
                  )}
                  {getSelectedService()?.price && (
                    <div className="flex justify-between pt-1.5 border-t font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(getSelectedService()!.price!)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={customerInfo.firstName}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={customerInfo.lastName}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    placeholder="Smith"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={customerInfo.email}
                  onChange={(e) =>
                    setCustomerInfo((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="john@example.com"
                  required
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={customerInfo.phone}
                  onChange={(e) =>
                    setCustomerInfo((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="(555) 123-4567"
                  required
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requests or information..."
                  rows={3}
                />
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    !customerInfo.firstName ||
                    !customerInfo.lastName ||
                    !customerInfo.email ||
                    !customerInfo.phone
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    "Confirm Booking"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <PoweredByFooter />
      </div>
    </div>
  );
}
