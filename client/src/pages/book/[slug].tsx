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
  Globe,
  Scissors,
  Star,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTheme } from "next-themes";

interface BusinessInfo {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  timezone: string;
  timezoneAbbr: string;
  industry: string | null;
  description: string | null;
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

interface BusinessHourInfo {
  day: string;
  open: string | null;
  close: string | null;
  isClosed: boolean;
}

interface BookingData {
  business: BusinessInfo;
  services: ServiceInfo[];
  staff: StaffInfo[];
  businessHours: BusinessHourInfo[];
  staffServices?: Record<string, number[]>; // staffId → serviceId[] (empty/missing = all)
}

const STEPS = [
  { num: 1, label: "Service" },
  { num: 2, label: "Date & Time" },
  { num: 3, label: "Details" },
];

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

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
  const [slotsTimezoneAbbr, setSlotsTimezoneAbbr] = useState<string>("");
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Form steps: 0 = landing page, 1-3 = booking flow
  const [step, setStep] = useState(isEmbed ? 1 : 0);

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

  // Force light mode on public booking page (dark mode makes hero/buttons invisible)
  const { setTheme, theme: currentTheme } = useTheme();
  useEffect(() => {
    const previousTheme = currentTheme;
    setTheme("light");
    return () => {
      if (previousTheme && previousTheme !== "light") setTheme(previousTheme);
    };
  }, []);

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
      if (selectedStaff) url += `&staffId=${selectedStaff}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load time slots");
      }
      const data = await res.json();
      setSlots(data.slots || []);
      if (data.timezoneAbbr) setSlotsTimezoneAbbr(data.timezoneAbbr);
      setSelectedTime(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
      if (!res.ok) throw new Error(data.error || "Failed to create booking");
      setConfirmationData(data);
      setBookingConfirmed(true);
      setStep(4);
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

  const isDateDisabled = (date: Date) => {
    const now = new Date();
    const leadTimeHours = bookingData?.business.bookingLeadTimeHours || 24;
    const minDate = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
    if (date < minDate) return true;
    const maxDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    if (date > maxDate) return true;
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const dayHours = bookingData?.businessHours.find((h) => h.day.toLowerCase() === dayName);
    if (dayHours?.isClosed || !dayHours?.open) return true;
    return false;
  };

  const getSelectedService = () => bookingData?.services.find((s) => s.id === selectedService);
  const getSelectedStaffMember = () => bookingData?.staff.find((s) => s.id === selectedStaff);
  const tzLabel = slotsTimezoneAbbr || bookingData?.business.timezoneAbbr || "";

  // Filter staff by selected service (staff with no assignments = can do all)
  const canStaffDoService = (staffId: number, serviceId: number | null) => {
    if (!serviceId || !bookingData?.staffServices) return true;
    const assignedServices = bookingData.staffServices[String(staffId)];
    // No assignments = can do all services
    if (!assignedServices || assignedServices.length === 0) return true;
    return assignedServices.includes(serviceId);
  };

  const filteredStaff = bookingData?.staff.filter(s => canStaffDoService(s.id, selectedService)) || [];

  const generateIcsFile = () => {
    if (!confirmationData?.appointment) return;
    const service = getSelectedService();
    const staffMember = getSelectedStaffMember();
    const start = new Date(confirmationData.appointment.startDate);
    const end = new Date(confirmationData.appointment.endDate);
    const now = new Date();
    const fmtIcs = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    // Escape special characters for iCal text fields
    const escIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    const location = [bookingData?.business.address, bookingData?.business.city, bookingData?.business.state].filter(Boolean).join(", ");
    const summary = `${service?.name || "Appointment"} at ${bookingData?.business.name || ""}`;
    const descParts = [
      `Booking #${confirmationData.appointment.id}`,
      service?.name ? `Service: ${service.name}` : "",
      staffMember ? `With: ${staffMember.firstName} ${staffMember.lastName}` : "",
      bookingData?.business.phone ? `Phone: ${bookingData.business.phone}` : "",
      confirmationData.manageUrl ? `Manage appointment: https://www.smallbizagent.ai${confirmationData.manageUrl}` : "",
    ].filter(Boolean).join("\\n");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SmallBizAgent//Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:sba-apt-${confirmationData.appointment.id}@smallbizagent.ai`,
      `DTSTAMP:${fmtIcs(now)}`,
      `DTSTART:${fmtIcs(start)}`,
      `DTEND:${fmtIcs(end)}`,
      `SUMMARY:${escIcs(summary)}`,
      location ? `LOCATION:${escIcs(location)}` : "",
      `DESCRIPTION:${escIcs(descParts)}`,
      `STATUS:CONFIRMED`,
      `BEGIN:VALARM`,
      `TRIGGER:-PT30M`,
      `ACTION:DISPLAY`,
      `DESCRIPTION:Reminder: ${escIcs(summary)}`,
      `END:VALARM`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `appointment-${confirmationData.appointment.id}.ics`; a.click();
    URL.revokeObjectURL(url);
  };

  const SBALogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
      <rect x="47" y="5" width="6" height="10" rx="3" />
      <circle cx="50" cy="5" r="4" />
      <rect x="25" y="18" width="50" height="40" rx="12" />
      <rect x="30" y="28" width="40" height="15" rx="7" fill="black" />
      <circle cx="40" cy="35" r="5" fill="white" />
      <circle cx="60" cy="35" r="5" fill="white" />
      <path d="M 38 48 Q 50 55 62 48" stroke="black" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 32 58 L 32 75 Q 32 82 39 82 L 61 82 Q 68 82 68 75 L 68 58" />
      <path d="M 42 62 L 50 68 L 58 62" stroke="black" strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="65" rx="8" ry="12" />
      <ellipse cx="80" cy="65" rx="8" ry="12" />
      <circle cx="20" cy="78" r="5" />
      <circle cx="80" cy="78" r="5" />
      <rect x="36" y="82" width="10" height="12" rx="3" />
      <rect x="54" y="82" width="10" height="12" rx="3" />
    </svg>
  );

  const PoweredByFooter = () => (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
      <span>Powered by</span>
      <a href="https://www.smallbizagent.ai" target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 font-medium text-foreground/70 hover:text-foreground transition-colors">
        <SBALogo className="h-5 w-5 text-primary" />
        SmallBizAgent
      </a>
    </div>
  );

  // Helper: format business hours for display
  const formatHoursRange = (open: string | null, close: string | null) => {
    if (!open || !close) return "Closed";
    return `${formatTime12(open)} – ${formatTime12(close)}`;
  };

  // Build Google Maps link
  const getGoogleMapsLink = () => {
    const parts = [bookingData?.business.address, bookingData?.business.city,
      bookingData?.business.state, bookingData?.business.zip].filter(Boolean).join(", ");
    return parts ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}` : null;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isEmbed ? "bg-transparent" : "bg-muted/30"}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
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
            <CardDescription>{error || "This booking page is not available."}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>Please contact the business directly to schedule an appointment.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const businessLocation = [
    bookingData.business.address, bookingData.business.city, bookingData.business.state,
  ].filter(Boolean).join(", ");

  const fullAddress = [
    bookingData.business.address, bookingData.business.city,
    bookingData.business.state, bookingData.business.zip,
  ].filter(Boolean).join(", ");

  const mapsLink = getGoogleMapsLink();

  // Sorted business hours
  const sortedHours = [...bookingData.businessHours].sort(
    (a, b) => DAY_ORDER.indexOf(a.day.toLowerCase()) - DAY_ORDER.indexOf(b.day.toLowerCase())
  );

  // ========================================
  // STEP 0: LANDING PAGE / MINI WEBSITE
  // ========================================
  if (step === 0 && !bookingConfirmed) {
    return (
      <div ref={containerRef} className="min-h-screen bg-muted/30">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 sm:py-16">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
              {bookingData.business.logoUrl ? (
                <img
                  src={bookingData.business.logoUrl}
                  alt={bookingData.business.name}
                  className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl object-contain bg-white/20 backdrop-blur-sm p-3 shadow-lg"
                />
              ) : (
                <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <span className="text-4xl font-bold text-primary-foreground">
                    {bookingData.business.name[0]}
                  </span>
                </div>
              )}
              <div className="text-primary-foreground">
                {bookingData.business.industry && (
                  <Badge className="bg-white/20 text-primary-foreground border-0 mb-2 text-xs">
                    {bookingData.business.industry}
                  </Badge>
                )}
                <h1 className="text-2xl sm:text-3xl font-bold">{bookingData.business.name}</h1>
                {bookingData.business.description && (
                  <p className="text-primary-foreground/80 mt-2 text-sm sm:text-base max-w-lg">
                    {bookingData.business.description}
                  </p>
                )}
                {businessLocation && (
                  <p className="text-primary-foreground/60 flex items-center gap-1.5 mt-3 text-sm justify-center sm:justify-start">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    {businessLocation}
                  </p>
                )}
                <div className="mt-5">
                  <Button
                    size="lg"
                    onClick={() => setStep(1)}
                    className="bg-white text-primary hover:bg-white/90 font-semibold shadow-lg px-8"
                  >
                    <CalendarIcon className="mr-2 h-5 w-5" />
                    Book Appointment
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

          {/* Services */}
          {bookingData.services.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Scissors className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Services</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {bookingData.services.map((service) => (
                    <div key={service.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className="font-medium text-sm">{service.name}</h4>
                        {service.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{service.description}</p>
                        )}
                        {service.duration && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />{service.duration} min
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {service.price ? (
                          <span className="font-semibold">{formatCurrency(service.price)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Contact</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Button className="w-full mt-4" onClick={() => setStep(1)}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  Book Now
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Team / Staff */}
          {bookingData.staff.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Our Team</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {bookingData.staff.map((staffMember) => (
                    <div key={staffMember.id} className="text-center">
                      {staffMember.photoUrl ? (
                        <img
                          src={staffMember.photoUrl}
                          alt={`${staffMember.firstName} ${staffMember.lastName}`}
                          className="w-20 h-20 mx-auto rounded-full object-cover shadow-sm"
                        />
                      ) : (
                        <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
                          <span className="text-2xl font-medium text-muted-foreground">
                            {staffMember.firstName[0]}{staffMember.lastName[0]}
                          </span>
                        </div>
                      )}
                      <h4 className="font-medium text-sm mt-2">
                        {staffMember.firstName} {staffMember.lastName}
                      </h4>
                      {staffMember.specialty && (
                        <p className="text-xs text-muted-foreground">{staffMember.specialty}</p>
                      )}
                      {staffMember.bio && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{staffMember.bio}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Business Hours & Contact - Side by Side */}
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Business Hours */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Hours{bookingData.business.timezoneAbbr ? ` (${bookingData.business.timezoneAbbr})` : ""}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {sortedHours.map((h) => {
                    const dayKey = h.day.toLowerCase();
                    const label = DAY_LABELS[dayKey] || h.day;
                    const today = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
                    const isToday = dayKey === today;
                    return (
                      <div
                        key={h.day}
                        className={`flex justify-between text-sm py-1 px-2 rounded ${
                          isToday ? "bg-primary/5 font-medium" : ""
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {label}
                          {isToday && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Today</Badge>
                          )}
                        </span>
                        <span className={h.isClosed || !h.open ? "text-muted-foreground" : ""}>
                          {h.isClosed || !h.open ? "Closed" : formatHoursRange(h.open, h.close)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Contact</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {bookingData.business.phone && (
                  <a href={`tel:${bookingData.business.phone}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Call Us</p>
                      <p className="text-xs text-muted-foreground">{bookingData.business.phone}</p>
                    </div>
                  </a>
                )}
                {bookingData.business.email && (
                  <a href={`mailto:${bookingData.business.email}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-xs text-muted-foreground">{bookingData.business.email}</p>
                    </div>
                  </a>
                )}
                {fullAddress && mapsLink && (
                  <a href={mapsLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Directions</p>
                      <p className="text-xs text-muted-foreground">{fullAddress}</p>
                    </div>
                  </a>
                )}
                {bookingData.business.website && (
                  <a href={bookingData.business.website.startsWith("http") ? bookingData.business.website : `https://${bookingData.business.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Globe className="h-4 w-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Website</p>
                      <p className="text-xs text-muted-foreground">{bookingData.business.website}</p>
                    </div>
                  </a>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom CTA */}
          <div className="text-center py-4">
            <Button size="lg" onClick={() => setStep(1)} className="px-10 shadow-md">
              <CalendarIcon className="mr-2 h-5 w-5" />
              Book an Appointment
            </Button>
          </div>

          <PoweredByFooter />
        </div>
      </div>
    );
  }

  // ========================================
  // CONFIRMATION SCREEN
  // ========================================
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
                      weekday: "long", month: "long", day: "numeric", year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{selectedTime && formatTime12(selectedTime)}{tzLabel ? ` ${tzLabel}` : ""}</span>
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

              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                <p className="text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  A confirmation has been sent to <strong>{customerInfo.email}</strong> and <strong>{customerInfo.phone}</strong>.
                </p>
              </div>

              <Button variant="outline" className="w-full" onClick={generateIcsFile}>
                <Download className="mr-2 h-4 w-4" /> Add to Calendar
              </Button>

              {confirmationData.manageUrl && (
                <a href={confirmationData.manageUrl} className="block">
                  <Button variant="outline" className="w-full">
                    <CalendarIcon className="mr-2 h-4 w-4" /> Manage / Reschedule Appointment
                  </Button>
                </a>
              )}

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">{bookingData.business.name}</h4>
                {businessLocation && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 flex-shrink-0" />{businessLocation}
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

  // ========================================
  // BOOKING FLOW (Steps 1-3)
  // ========================================
  return (
    <div ref={containerRef} className={`min-h-screen ${isEmbed ? "bg-transparent py-2 px-1" : "bg-muted/30 py-8 px-4"}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Hero Header with Business Branding */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary to-primary/80 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="relative z-10 px-6 py-8">
            <div className="flex items-center gap-4">
              {bookingData.business.logoUrl ? (
                <img src={bookingData.business.logoUrl} alt={bookingData.business.name}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl object-contain bg-white/20 backdrop-blur-sm p-2" />
              ) : (
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary-foreground">{bookingData.business.name[0]}</span>
                </div>
              )}
              <div className="text-primary-foreground">
                <h1 className="text-xl sm:text-2xl font-bold">{bookingData.business.name}</h1>
                <p className="text-primary-foreground/80 text-sm sm:text-base">Book an appointment online</p>
                {businessLocation && (
                  <p className="text-sm text-primary-foreground/60 flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />{businessLocation}
                  </p>
                )}
                {bookingData.business.phone && (
                  <p className="text-sm text-primary-foreground/60 flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3" />{bookingData.business.phone}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                  step > s.num ? "bg-primary text-primary-foreground"
                    : step === s.num ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {step > s.num ? <CheckCircle className="h-5 w-5" /> : s.num}
                </div>
                <span className={`text-xs font-medium ${step >= s.num ? "text-primary" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 sm:w-16 h-0.5 mx-2 mb-5 transition-colors ${step > s.num ? "bg-primary" : "bg-muted"}`} />
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
                <div key={service.id}
                  className={`relative p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedService === service.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                      : "border-border hover:border-primary/30 hover:shadow-sm"
                  }`}
                  onClick={() => {
                    setSelectedService(service.id);
                    // Clear selected staff if they can't do the new service
                    if (selectedStaff && !canStaffDoService(selectedStaff, service.id)) {
                      setSelectedStaff(null);
                    }
                  }}>
                  {selectedService === service.id && (
                    <div className="absolute top-3 right-3"><CheckCircle className="h-5 w-5 text-primary" /></div>
                  )}
                  <div className="flex justify-between items-start pr-6">
                    <div>
                      <h4 className="font-medium">{service.name}</h4>
                      {service.description && <p className="text-sm text-muted-foreground mt-1">{service.description}</p>}
                      {service.duration && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /><span>{service.duration} min</span>
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

              {filteredStaff.length > 1 && (
                <div className="mt-6 pt-4 border-t">
                  <Label className="text-sm font-medium mb-3 block">Staff Preference (Optional)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                      selectedStaff === null ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30"
                    }`} onClick={() => setSelectedStaff(null)}>
                      <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Any Available</p>
                    </div>
                    {filteredStaff.map((sm) => (
                      <div key={sm.id} className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                        selectedStaff === sm.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30"
                      }`} onClick={() => setSelectedStaff(sm.id)}>
                        {sm.photoUrl ? (
                          <img src={sm.photoUrl} alt={sm.firstName} className="w-12 h-12 mx-auto mb-2 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-lg font-medium text-muted-foreground">{sm.firstName[0]}{sm.lastName[0]}</span>
                          </div>
                        )}
                        <p className="text-sm font-medium">{sm.firstName}</p>
                        {sm.specialty && <p className="text-xs text-muted-foreground mt-0.5">{sm.specialty}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                {!isEmbed && (
                  <Button variant="outline" onClick={() => setStep(0)}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                )}
                <Button onClick={() => setStep(2)} disabled={!selectedService} className={isEmbed ? "ml-auto" : ""}>
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
                <div>
                  <Label className="text-sm font-medium mb-2 block">Date</Label>
                  <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate}
                    disabled={isDateDisabled} className="rounded-md border" />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    Available Times{tzLabel ? ` (${tzLabel})` : ""}
                  </Label>
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
                      {slots.filter((s) => s.available).map((slot) => (
                        <Button key={slot.time} variant={selectedTime === slot.time ? "default" : "outline"}
                          size="sm" onClick={() => setSelectedTime(slot.time)} className="text-sm">
                          {formatTime12(slot.time)}
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
              <CardDescription>Enter your contact information to complete the booking</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                      <span className="font-medium">{getSelectedStaffMember()?.firstName} {getSelectedStaffMember()?.lastName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">{selectedDate?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">{selectedTime && formatTime12(selectedTime)}{tzLabel ? ` ${tzLabel}` : ""}</span>
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
                  <Input id="firstName" value={customerInfo.firstName}
                    onChange={(e) => setCustomerInfo((p) => ({ ...p, firstName: e.target.value }))} placeholder="John" required />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" value={customerInfo.lastName}
                    onChange={(e) => setCustomerInfo((p) => ({ ...p, lastName: e.target.value }))} placeholder="Smith" required />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={customerInfo.email}
                  onChange={(e) => setCustomerInfo((p) => ({ ...p, email: e.target.value }))} placeholder="john@example.com" required />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input id="phone" type="tel" value={customerInfo.phone}
                  onChange={(e) => setCustomerInfo((p) => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" required />
              </div>
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requests or information..." rows={3} />
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleSubmit}
                  disabled={isSubmitting || !customerInfo.firstName || !customerInfo.lastName || !customerInfo.email || !customerInfo.phone}>
                  {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking...</>) : "Confirm Booking"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <PoweredByFooter />
      </div>
    </div>
  );
}
