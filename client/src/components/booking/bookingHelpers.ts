// Types, constants, and helper functions for the public booking page

// ========================================
// TYPES
// ========================================

export interface BusinessInfo {
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
  brandColor: string | null;
  accentColor: string | null;
  timezone: string;
  timezoneAbbr: string;
  industry: string | null;
  description: string | null;
  bookingLeadTimeHours: number;
  bookingBufferMinutes: number;
}

export interface ServiceInfo {
  id: number;
  name: string;
  description: string | null;
  price: number | null;
  duration: number | null;
}

export interface StaffInfo {
  id: number;
  firstName: string;
  lastName: string;
  specialty: string | null;
  bio: string | null;
  photoUrl: string | null;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  staffAvailable: number[];
}

export interface ReservationSlot {
  time: string;
  available: boolean;
  remainingSeats: number;
}

export interface BusinessHourInfo {
  day: string;
  open: string | null;
  close: string | null;
  isClosed: boolean;
}

export interface BookingData {
  business: BusinessInfo;
  services: ServiceInfo[];
  staff: StaffInfo[];
  businessHours: BusinessHourInfo[];
  staffServices?: Record<string, number[]>; // staffId -> serviceId[] (empty/missing = all)
  reservation?: {
    enabled: boolean;
    maxPartySize: number;
    slotDurationMinutes: number;
    maxCapacityPerSlot: number;
    leadTimeHours: number;
    maxDaysAhead: number;
  } | null;
}

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface StepDefinition {
  num: number;
  label: string;
}

// ========================================
// CONSTANTS
// ========================================

export const STEPS: StepDefinition[] = [
  { num: 1, label: "Service" },
  { num: 2, label: "Date & Time" },
  { num: 3, label: "Details" },
];

export const RESERVATION_STEPS: StepDefinition[] = [
  { num: 1, label: "Party & Date" },
  { num: 2, label: "Time" },
  { num: 3, label: "Details" },
];

export const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/** Format a phone number string into (xxx) xxx-xxxx */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/** Format 24h time string "HH:MM" to 12h "h:MM AM/PM" */
export function formatTime12(time: string): string {
  const [hour, min] = time.split(":").map(Number);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min.toString().padStart(2, "0")} ${ampm}`;
}

/** Format open/close hours range for display */
export function formatHoursRange(open: string | null, close: string | null): string {
  if (!open || !close) return "Closed";
  return `${formatTime12(open)} \u2013 ${formatTime12(close)}`;
}

/** Basic email validation */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate customer form and return error map */
export function validateCustomerForm(info: CustomerInfo): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!info.firstName.trim()) errors.firstName = "First name is required";
  if (!info.lastName.trim()) errors.lastName = "Last name is required";
  if (!info.email.trim()) errors.email = "Email is required";
  else if (!isValidEmail(info.email)) errors.email = "Please enter a valid email address";
  if (!info.phone.trim()) errors.phone = "Phone number is required";
  else if (info.phone.replace(/\D/g, "").length < 10) errors.phone = "Please enter a valid 10-digit phone number";
  return errors;
}

/** Check if a staff member can perform a given service */
export function canStaffDoService(
  staffServices: Record<string, number[]> | undefined,
  staffId: number,
  serviceId: number | null
): boolean {
  if (!serviceId || !staffServices) return true;
  const assignedServices = staffServices[String(staffId)];
  // No assignments = can do all services
  if (!assignedServices || assignedServices.length === 0) return true;
  return assignedServices.includes(serviceId);
}

/** Check if a calendar date should be disabled for appointment booking */
export function isDateDisabled(date: Date, bookingData: BookingData): boolean {
  const now = new Date();
  const leadTimeHours = bookingData.business.bookingLeadTimeHours || 24;
  const minDate = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
  if (date < minDate) return true;
  const maxDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  if (date > maxDate) return true;
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const dayHours = bookingData.businessHours.find((h) => h.day.toLowerCase() === dayName);
  if (dayHours?.isClosed || !dayHours?.open) return true;
  return false;
}

/** Check if a calendar date should be disabled for reservation booking */
export function isReservationDateDisabled(date: Date, bookingData: BookingData): boolean {
  const now = new Date();
  const leadTimeHours = bookingData.reservation?.leadTimeHours || 2;
  const maxDaysAhead = bookingData.reservation?.maxDaysAhead || 30;
  const minDate = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
  if (date < minDate) return true;
  const maxDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);
  if (date > maxDate) return true;
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const dayHours = bookingData.businessHours.find((h) => h.day.toLowerCase() === dayName);
  if (dayHours?.isClosed || !dayHours?.open) return true;
  return false;
}

/** Build a Google Maps search link from business address parts */
export function getGoogleMapsLink(business: BusinessInfo): string | null {
  const parts = [business.address, business.city, business.state, business.zip].filter(Boolean).join(", ");
  return parts ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}` : null;
}

/** Generate an .ics file and trigger download for appointment confirmation */
export function generateIcsFile(
  confirmationData: any,
  selectedService: ServiceInfo | undefined,
  selectedStaff: StaffInfo | undefined,
  business: BusinessInfo
): void {
  if (!confirmationData?.appointment) return;
  const start = new Date(confirmationData.appointment.startDate);
  const end = new Date(confirmationData.appointment.endDate);
  const now = new Date();
  const fmtIcs = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const escIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const location = [business.address, business.city, business.state].filter(Boolean).join(", ");
  const summary = `${selectedService?.name || "Appointment"} at ${business.name || ""}`;
  const descParts = [
    `Booking #${confirmationData.appointment.id}`,
    selectedService?.name ? `Service: ${selectedService.name}` : "",
    selectedStaff ? `With: ${selectedStaff.firstName} ${selectedStaff.lastName}` : "",
    business.phone ? `Phone: ${business.phone}` : "",
    confirmationData.manageUrl ? `Manage appointment: https://www.smallbizagent.ai${confirmationData.manageUrl}` : "",
  ].filter(Boolean).join("\\n");

  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SmallBizAgent//Booking//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:sba-apt-${confirmationData.appointment.id}@smallbizagent.ai`,
    `DTSTAMP:${fmtIcs(now)}`, `DTSTART:${fmtIcs(start)}`, `DTEND:${fmtIcs(end)}`,
    `SUMMARY:${escIcs(summary)}`, location ? `LOCATION:${escIcs(location)}` : "",
    `DESCRIPTION:${escIcs(descParts)}`, `STATUS:CONFIRMED`,
    `BEGIN:VALARM`, `TRIGGER:-PT30M`, `ACTION:DISPLAY`,
    `DESCRIPTION:Reminder: ${escIcs(summary)}`, `END:VALARM`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  downloadIcsBlob(ics, `appointment-${confirmationData.appointment.id}.ics`);
}

/** Generate an .ics file and trigger download for reservation confirmation */
export function generateReservationIcsFile(
  confirmationData: any,
  business: BusinessInfo
): void {
  if (!confirmationData?.reservation) return;
  const start = new Date(confirmationData.reservation.startDate);
  const end = new Date(confirmationData.reservation.endDate);
  const now = new Date();
  const fmtIcs = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const escIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const location = [business.address, business.city, business.state].filter(Boolean).join(", ");
  const partyStr = `${confirmationData.reservation.partySize} ${confirmationData.reservation.partySize === 1 ? "guest" : "guests"}`;
  const summary = `Reservation at ${business.name || ""} (${partyStr})`;
  const descParts = [
    `Reservation for ${partyStr}`,
    confirmationData.reservation.specialRequests ? `Special requests: ${confirmationData.reservation.specialRequests}` : "",
    business.phone ? `Phone: ${business.phone}` : "",
    confirmationData.manageUrl ? `Manage reservation: https://www.smallbizagent.ai${confirmationData.manageUrl}` : "",
  ].filter(Boolean).join("\\n");

  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SmallBizAgent//Booking//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:sba-res-${confirmationData.reservation.id}@smallbizagent.ai`,
    `DTSTAMP:${fmtIcs(now)}`, `DTSTART:${fmtIcs(start)}`, `DTEND:${fmtIcs(end)}`,
    `SUMMARY:${escIcs(summary)}`, location ? `LOCATION:${escIcs(location)}` : "",
    `DESCRIPTION:${escIcs(descParts)}`, `STATUS:CONFIRMED`,
    `BEGIN:VALARM`, `TRIGGER:-PT60M`, `ACTION:DISPLAY`,
    `DESCRIPTION:Reminder: ${escIcs(summary)}`, `END:VALARM`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  downloadIcsBlob(ics, `reservation-${confirmationData.reservation.id}.ics`);
}

function downloadIcsBlob(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ========================================
// SHARED SUB-COMPONENTS
// ========================================

export const SBALogoPath = `M47,5h6a3,3,0,0,1,0,6H47a3,3,0,0,1,0-6ZM50,1a4,4,0,1,1,0,8A4,4,0,0,1,50,1ZM25,18h50a12,12,0,0,1,0,24V58H25V42a12,12,0,0,1,0-24ZM30,28h40a7,7,0,0,1,0,14H30a7,7,0,0,1,0-14ZM40,30a5,5,0,1,1,0,10A5,5,0,0,1,40,30ZM60,30a5,5,0,1,1,0,10A5,5,0,0,1,60,30ZM38,48Q50,55,62,48M32,58V75Q32,82,39,82H61Q68,82,68,75V58M42,62L50,68L58,62M12,65A8,12,0,1,1,28,65A8,12,0,1,1,12,65ZM72,65A8,12,0,1,1,88,65A8,12,0,1,1,72,65ZM15,78A5,5,0,1,1,25,78A5,5,0,1,1,15,78ZM75,78A5,5,0,1,1,85,78A5,5,0,1,1,75,78ZM36,82h10a3,3,0,0,1,0,6V94a3,3,0,0,1-6,0V88H36a3,3,0,0,1,0-6ZM54,82h10a3,3,0,0,1,0,6V94a3,3,0,0,1-6,0V88H54a3,3,0,0,1,0-6Z`;
