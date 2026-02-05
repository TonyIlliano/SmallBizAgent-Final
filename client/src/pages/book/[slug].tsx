import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function PublicBooking() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { toast } = useToast();

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Form steps
  const [step, setStep] = useState(1); // 1: service, 2: date/time, 3: details, 4: confirmation

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
      setSelectedTime(null); // Reset selected time when slots change
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

  // Determine which days should be disabled in the calendar
  const isDateDisabled = (date: Date) => {
    const now = new Date();
    const leadTimeHours = bookingData?.business.bookingLeadTimeHours || 24;
    const minDate = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);

    // Disable dates before minimum booking time
    if (date < minDate) return true;

    // Disable dates more than 60 days in the future
    const maxDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    if (date > maxDate) return true;

    // Check if business is closed on this day
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const dayHours = bookingData?.businessHours.find(
      (h) => h.day.toLowerCase() === dayName
    );
    if (dayHours?.isClosed || !dayHours?.open) return true;

    return false;
  };

  const getSelectedService = () => {
    return bookingData?.services.find((s) => s.id === selectedService);
  };

  const getSelectedStaffMember = () => {
    return bookingData?.staff.find((s) => s.id === selectedStaff);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
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
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
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

  // Confirmation screen
  if (bookingConfirmed && confirmationData) {
    return (
      <div className="min-h-screen bg-muted/30 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <Card>
            <CardHeader className="text-center">
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
              <CardTitle className="text-2xl">Booking Confirmed!</CardTitle>
              <CardDescription>{confirmationData.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {selectedDate?.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedTime && formatTime(selectedTime)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{confirmationData.appointment?.serviceName}</span>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">{bookingData.business.name}</h4>
                {bookingData.business.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {bookingData.business.address}
                    {bookingData.business.city && `, ${bookingData.business.city}`}
                    {bookingData.business.state && ` ${bookingData.business.state}`}
                  </p>
                )}
                {bookingData.business.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${bookingData.business.phone}`} className="text-primary hover:underline">
                      {bookingData.business.phone}
                    </a>
                  </p>
                )}
              </div>

              <p className="text-sm text-muted-foreground text-center">
                A confirmation has been sent to your email.
              </p>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground mt-8">
            <p>Powered by SmallBizAgent</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              {bookingData.business.logoUrl && (
                <img
                  src={bookingData.business.logoUrl}
                  alt={bookingData.business.name}
                  className="h-16 w-16 rounded-lg object-contain"
                />
              )}
              <div>
                <CardTitle className="text-2xl">{bookingData.business.name}</CardTitle>
                <CardDescription>Book an appointment online</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 h-1 ${
                    step > s ? "bg-primary" : "bg-muted"
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
              <CardDescription>
                Choose the service you would like to book
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bookingData.services.map((service) => (
                <div
                  key={service.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedService === service.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedService(service.id)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{service.name}</h4>
                      {service.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {service.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {service.price && (
                        <p className="font-medium">{formatCurrency(service.price)}</p>
                      )}
                      {service.duration && (
                        <p className="text-sm text-muted-foreground">
                          {service.duration} min
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Optional: Select staff preference */}
              {bookingData.staff.length > 1 && (
                <div className="mt-6 pt-4 border-t">
                  <Label className="text-sm text-muted-foreground">
                    Staff Preference (Optional)
                  </Label>
                  <Select
                    value={selectedStaff?.toString() || "any"}
                    onValueChange={(v) =>
                      setSelectedStaff(v === "any" ? null : parseInt(v))
                    }
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="No preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">No preference</SelectItem>
                      {bookingData.staff.map((staff) => (
                        <SelectItem key={staff.id} value={staff.id.toString()}>
                          {staff.firstName} {staff.lastName}
                          {staff.specialty && ` - ${staff.specialty}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedService}
                >
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
              <CardDescription>
                Pick a date and available time slot
              </CardDescription>
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
                  <Label className="text-sm font-medium mb-2 block">
                    Available Times
                  </Label>
                  {!selectedDate ? (
                    <p className="text-sm text-muted-foreground">
                      Select a date to see available times
                    </p>
                  ) : isLoadingSlots ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No available times on this date
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                      {slots.map((slot) => (
                        <Button
                          key={slot.time}
                          variant={
                            selectedTime === slot.time ? "default" : "outline"
                          }
                          size="sm"
                          disabled={!slot.available}
                          onClick={() => setSelectedTime(slot.time)}
                          className="text-xs"
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
                <Button
                  onClick={() => setStep(3)}
                  disabled={!selectedDate || !selectedTime}
                >
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
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 mb-6">
                <h4 className="font-medium">Booking Summary</h4>
                <div className="text-sm space-y-1">
                  <p>
                    <strong>Service:</strong> {getSelectedService()?.name}
                  </p>
                  {getSelectedStaffMember() && (
                    <p>
                      <strong>With:</strong> {getSelectedStaffMember()?.firstName}{" "}
                      {getSelectedStaffMember()?.lastName}
                    </p>
                  )}
                  <p>
                    <strong>Date:</strong>{" "}
                    {selectedDate?.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p>
                    <strong>Time:</strong> {selectedTime && formatTime(selectedTime)}
                  </p>
                  {getSelectedService()?.price && (
                    <p>
                      <strong>Price:</strong>{" "}
                      {formatCurrency(getSelectedService()!.price!)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={customerInfo.firstName}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({
                        ...prev,
                        firstName: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={customerInfo.lastName}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
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
                    setCustomerInfo((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
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
                    setCustomerInfo((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
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
        <div className="text-center text-sm text-muted-foreground pb-8">
          <p>Powered by SmallBizAgent</p>
        </div>
      </div>
    </div>
  );
}
