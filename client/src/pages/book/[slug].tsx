import { useState, useEffect, useRef } from "react";
import { useParams, useSearch } from "wouter";
import { ErrorBoundary, PublicErrorFallback } from "@/components/ui/error-boundary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBrandStyles } from "@/lib/brand-colors";
import { useTheme } from "next-themes";
import type { BookingData, CustomerInfo, TimeSlot, ReservationSlot } from "@/components/booking/bookingHelpers";
import { validateCustomerForm, canStaffDoService } from "@/components/booking/bookingHelpers";
import { BookingLandingPage } from "@/components/booking/BookingLandingPage";
import { BookingServiceStep } from "@/components/booking/BookingServiceStep";
import { BookingDateTimeStep, ReservationPartyDateStep, ReservationTimeStep } from "@/components/booking/BookingDateTimeStep";
import { BookingDetailsStep, ReservationDetailsStep } from "@/components/booking/BookingDetailsStep";
import { BookingConfirmation } from "@/components/booking/BookingConfirmation";
import { PoweredByFooter, StepIndicator, BookingFlowHeader } from "@/components/booking/BookingShared";

function PublicBookingInner() {
  const { slug } = useParams<{ slug: string }>();
  const searchString = useSearch();
  const isEmbed = new URLSearchParams(searchString).get("embed") === "true";
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  // Data & loading
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [reservationSlots, setReservationSlots] = useState<ReservationSlot[]>([]);
  const [slotsTimezoneAbbr, setSlotsTimezoneAbbr] = useState("");
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isLoadingReservationSlots, setIsLoadingReservationSlots] = useState(false);

  // Multi-step state: 0=landing, 1-3=flow, 4=confirmed
  const [step, setStep] = useState(isEmbed ? 1 : 0);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ firstName: "", lastName: "", email: "", phone: "" });
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedPartySize, setSelectedPartySize] = useState(2);
  const [specialRequests, setSpecialRequests] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmationData, setConfirmationData] = useState<any>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const isReservationMode = bookingData?.business.industry === "restaurant" && bookingData?.reservation?.enabled;
  const tzLabel = slotsTimezoneAbbr || bookingData?.business.timezoneAbbr || "";
  const getSelectedService = () => bookingData?.services.find((s) => s.id === selectedService);
  const getSelectedStaff = () => bookingData?.staff.find((s) => s.id === selectedStaff);

  // Force light mode on public booking page
  const { setTheme, theme: currentTheme } = useTheme();
  useEffect(() => { const prev = currentTheme; setTheme("light"); return () => { if (prev && prev !== "light") setTheme(prev); }; }, []);

  // Page title
  useEffect(() => {
    if (bookingData?.business.name) document.title = `Book with ${bookingData.business.name} | SmallBizAgent`;
    return () => { document.title = "SmallBizAgent"; };
  }, [bookingData?.business.name]);

  // Embed: resize messages
  useEffect(() => {
    if (!isEmbed || !containerRef.current) return;
    const observer = new ResizeObserver(() => { window.parent.postMessage({ type: "sba-booking-resize", height: containerRef.current?.scrollHeight || 0 }, "*"); });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isEmbed, step, bookingConfirmed]);

  // Embed: booking success message
  useEffect(() => {
    if (isEmbed && bookingConfirmed && confirmationData) window.parent.postMessage({ type: "sba-booking-success", booked: true }, "*");
  }, [isEmbed, bookingConfirmed, confirmationData]);

  // Fetch business data
  useEffect(() => { fetchBookingData(); }, [slug]);
  // Fetch appointment slots when date/service change
  useEffect(() => { if (selectedDate && selectedService) fetchTimeSlots(); }, [selectedDate, selectedService, selectedStaff]);
  // Fetch reservation slots when date/party size change
  useEffect(() => { if (isReservationMode && selectedDate && selectedPartySize) fetchReservationSlots(); }, [selectedDate, selectedPartySize, isReservationMode]);

  const fetchBookingData = async () => {
    try { setIsLoading(true); const res = await fetch(`/api/book/${slug}`); if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to load booking page"); } setBookingData(await res.json()); }
    catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
  };

  const fetchTimeSlots = async () => {
    if (!selectedDate || !selectedService) return;
    try { setIsLoadingSlots(true); let url = `/api/book/${slug}/slots?date=${selectedDate.toISOString().split("T")[0]}&serviceId=${selectedService}`; if (selectedStaff) url += `&staffId=${selectedStaff}`; const res = await fetch(url); if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to load time slots"); } const data = await res.json(); setSlots(data.slots || []); if (data.timezoneAbbr) setSlotsTimezoneAbbr(data.timezoneAbbr); setSelectedTime(null); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); } finally { setIsLoadingSlots(false); }
  };

  const fetchReservationSlots = async () => {
    if (!selectedDate || !selectedPartySize) return;
    try { setIsLoadingReservationSlots(true); const res = await fetch(`/api/book/${slug}/reservation-slots?date=${selectedDate.toISOString().split("T")[0]}&partySize=${selectedPartySize}`); if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to load reservation slots"); } const data = await res.json(); setReservationSlots(data.slots || []); if (data.timezoneAbbr) setSlotsTimezoneAbbr(data.timezoneAbbr); setSelectedTime(null); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); } finally { setIsLoadingReservationSlots(false); }
  };

  const handleSubmit = async () => {
    if (!selectedService || !selectedDate || !selectedTime) return;
    const errors = validateCustomerForm(customerInfo); setFormErrors(errors); if (Object.keys(errors).length > 0) return;
    try { setIsSubmitting(true); const res = await fetch(`/api/book/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId: selectedService, staffId: selectedStaff, date: selectedDate.toISOString().split("T")[0], time: selectedTime, customer: { ...customerInfo, smsOptIn }, notes }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Failed to create booking"); setConfirmationData(data); setBookingConfirmed(true); setStep(4); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); } finally { setIsSubmitting(false); }
  };

  const handleReservationSubmit = async () => {
    if (!selectedDate || !selectedTime) return;
    const errors = validateCustomerForm(customerInfo); setFormErrors(errors); if (Object.keys(errors).length > 0) return;
    try { setIsSubmitting(true); const res = await fetch(`/api/book/${slug}/reserve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partySize: selectedPartySize, date: selectedDate.toISOString().split("T")[0], time: selectedTime, customer: { ...customerInfo, smsOptIn }, specialRequests: specialRequests || undefined }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Failed to create reservation"); setConfirmationData(data); setBookingConfirmed(true); setStep(4); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); } finally { setIsSubmitting(false); }
  };

  const handleSelectService = (serviceId: number) => {
    setSelectedService(serviceId);
    if (selectedStaff && !canStaffDoService(bookingData?.staffServices, selectedStaff, serviceId)) setSelectedStaff(null);
  };

  const handleSelectDate = (date: Date | undefined) => { setSelectedDate(date); setSelectedTime(null); };
  const handleSelectPartySize = (size: number) => { setSelectedPartySize(size); setSelectedTime(null); };
  const handleClearError = (field: string) => setFormErrors((e) => ({ ...e, [field]: "" }));

  // Loading / error states
  if (isLoading) return <div className={`min-h-screen flex items-center justify-center ${isEmbed ? "bg-transparent" : "bg-muted/30"}`}><div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" /><p className="text-muted-foreground">Loading...</p></div></div>;
  if (error || !bookingData) return <div className={`min-h-screen flex items-center justify-center ${isEmbed ? "bg-transparent" : "bg-muted/30"} p-4`}><Card className="max-w-md w-full"><CardHeader className="text-center"><AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" /><CardTitle>Booking Not Available</CardTitle><CardDescription>{error || "This booking page is not available."}</CardDescription></CardHeader><CardContent className="text-center text-sm text-muted-foreground"><p>Please contact the business directly to schedule an appointment.</p></CardContent></Card></div>;

  const brandStyles = getBrandStyles(bookingData.business.brandColor);

  // Step 0: Landing page
  if (step === 0 && !bookingConfirmed) return <div ref={containerRef} className="min-h-screen bg-muted/30" style={brandStyles}><BookingLandingPage bookingData={bookingData} isReservationMode={!!isReservationMode} onStartBooking={() => setStep(1)} /></div>;

  // Confirmation screen
  if (bookingConfirmed && confirmationData) return <div ref={containerRef} className={`min-h-screen ${isEmbed ? "bg-transparent py-2 px-1" : "bg-muted/30 py-8 px-4"}`} style={brandStyles}><BookingConfirmation business={bookingData.business} isReservationMode={!!isReservationMode} confirmationData={confirmationData} selectedDate={selectedDate} selectedTime={selectedTime} selectedService={getSelectedService()} selectedStaff={getSelectedStaff()} customerInfo={customerInfo} tzLabel={tzLabel} isEmbed={isEmbed} /><PoweredByFooter /></div>;

  // Steps 1-3: Booking flow
  return (
    <div ref={containerRef} className={`min-h-screen ${isEmbed ? "bg-transparent py-2 px-1" : "bg-muted/30 py-8 px-4"}`} style={brandStyles}>
      <div className="max-w-2xl mx-auto space-y-6">
        <BookingFlowHeader bookingData={bookingData} isReservationMode={!!isReservationMode} />
        <StepIndicator currentStep={step} isReservationMode={!!isReservationMode} />

        {/* Reservation flow */}
        {isReservationMode && step === 1 && <ReservationPartyDateStep bookingData={bookingData} selectedPartySize={selectedPartySize} selectedDate={selectedDate} onSelectPartySize={handleSelectPartySize} onSelectDate={handleSelectDate} onNext={() => setStep(2)} />}
        {isReservationMode && step === 2 && <ReservationTimeStep selectedPartySize={selectedPartySize} selectedDate={selectedDate} selectedTime={selectedTime} reservationSlots={reservationSlots} isLoadingSlots={isLoadingReservationSlots} tzLabel={tzLabel} onSelectTime={setSelectedTime} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {isReservationMode && step === 3 && <ReservationDetailsStep selectedPartySize={selectedPartySize} selectedDate={selectedDate} selectedTime={selectedTime} tzLabel={tzLabel} customerInfo={customerInfo} smsOptIn={smsOptIn} specialRequests={specialRequests} formErrors={formErrors} isSubmitting={isSubmitting} onCustomerInfoChange={setCustomerInfo} onSmsOptInChange={setSmsOptIn} onSpecialRequestsChange={setSpecialRequests} onClearError={handleClearError} onBack={() => setStep(2)} onSubmit={handleReservationSubmit} />}

        {/* Appointment flow */}
        {!isReservationMode && step === 1 && <BookingServiceStep services={bookingData.services} staff={bookingData.staff} staffServices={bookingData.staffServices} selectedService={selectedService} selectedStaff={selectedStaff} isEmbed={isEmbed} onSelectService={handleSelectService} onSelectStaff={setSelectedStaff} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
        {!isReservationMode && step === 2 && <BookingDateTimeStep bookingData={bookingData} selectedDate={selectedDate} selectedTime={selectedTime} slots={slots} isLoadingSlots={isLoadingSlots} tzLabel={tzLabel} onSelectDate={handleSelectDate} onSelectTime={setSelectedTime} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {!isReservationMode && step === 3 && <BookingDetailsStep selectedService={getSelectedService()} selectedStaff={getSelectedStaff()} selectedDate={selectedDate} selectedTime={selectedTime} tzLabel={tzLabel} customerInfo={customerInfo} smsOptIn={smsOptIn} notes={notes} formErrors={formErrors} isSubmitting={isSubmitting} onCustomerInfoChange={setCustomerInfo} onSmsOptInChange={setSmsOptIn} onNotesChange={setNotes} onClearError={handleClearError} onBack={() => setStep(2)} onSubmit={handleSubmit} />}

        <PoweredByFooter />
      </div>
    </div>
  );
}

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <ErrorBoundary fallback={<PublicErrorFallback />} resetKeys={[slug]}>
      <PublicBookingInner />
    </ErrorBoundary>
  );
}
