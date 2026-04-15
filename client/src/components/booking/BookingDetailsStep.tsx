import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Clock, Calendar as CalendarIcon, User, ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ServiceInfo, StaffInfo, CustomerInfo } from "./bookingHelpers";
import { formatTime12, formatPhoneNumber } from "./bookingHelpers";

// ========================================
// APPOINTMENT DETAILS STEP (Step 3)
// ========================================

interface BookingDetailsStepProps {
  selectedService: ServiceInfo | undefined;
  selectedStaff: StaffInfo | undefined;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  tzLabel: string;
  customerInfo: CustomerInfo;
  smsOptIn: boolean;
  notes: string;
  formErrors: Record<string, string>;
  isSubmitting: boolean;
  onCustomerInfoChange: (info: CustomerInfo) => void;
  onSmsOptInChange: (checked: boolean) => void;
  onNotesChange: (notes: string) => void;
  onClearError: (field: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function BookingDetailsStep({
  selectedService,
  selectedStaff,
  selectedDate,
  selectedTime,
  tzLabel,
  customerInfo,
  smsOptIn,
  notes,
  formErrors,
  isSubmitting,
  onCustomerInfoChange,
  onSmsOptInChange,
  onNotesChange,
  onClearError,
  onBack,
  onSubmit,
}: BookingDetailsStepProps) {
  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    onCustomerInfoChange({ ...customerInfo, phone: formatted });
    if (formErrors.phone) onClearError("phone");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Details</CardTitle>
        <CardDescription>Enter your contact information to complete the booking</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Booking Summary */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2 mb-2">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Booking Summary
          </h4>
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium">{selectedService?.name}</span>
            </div>
            {selectedStaff && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">With</span>
                <span className="font-medium">
                  {selectedStaff.firstName} {selectedStaff.lastName}
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
              <span className="font-medium">
                {selectedTime && formatTime12(selectedTime)}
                {tzLabel ? ` ${tzLabel}` : ""}
              </span>
            </div>
            {selectedService?.duration && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{selectedService.duration} min</span>
              </div>
            )}
            {selectedService?.price && (
              <div className="flex justify-between pt-1.5 border-t font-semibold">
                <span>Total</span>
                <span>{formatCurrency(selectedService.price)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Info Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={customerInfo.firstName}
              onChange={(e) => {
                onCustomerInfoChange({ ...customerInfo, firstName: e.target.value });
                if (formErrors.firstName) onClearError("firstName");
              }}
              placeholder="John"
              required
              className={formErrors.firstName ? "border-red-500" : ""}
            />
            {formErrors.firstName && (
              <p className="text-xs text-red-600 mt-1">{formErrors.firstName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={customerInfo.lastName}
              onChange={(e) => {
                onCustomerInfoChange({ ...customerInfo, lastName: e.target.value });
                if (formErrors.lastName) onClearError("lastName");
              }}
              placeholder="Smith"
              required
              className={formErrors.lastName ? "border-red-500" : ""}
            />
            {formErrors.lastName && (
              <p className="text-xs text-red-600 mt-1">{formErrors.lastName}</p>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={customerInfo.email}
            onChange={(e) => {
              onCustomerInfoChange({ ...customerInfo, email: e.target.value });
              if (formErrors.email) onClearError("email");
            }}
            placeholder="john@example.com"
            required
            className={formErrors.email ? "border-red-500" : ""}
          />
          {formErrors.email && (
            <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>
          )}
        </div>
        <div>
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            type="tel"
            value={customerInfo.phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="(555) 123-4567"
            required
            className={formErrors.phone ? "border-red-500" : ""}
          />
          {formErrors.phone && (
            <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>
          )}
        </div>
        <div>
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any special requests or information..."
            rows={3}
          />
        </div>

        <SmsOptInCheckbox
          id="smsOptIn"
          checked={smsOptIn}
          onChange={onSmsOptInChange}
          type="appointment"
        />

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            onClick={onSubmit}
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
  );
}

// ========================================
// RESERVATION DETAILS STEP (Step 3)
// ========================================

interface ReservationDetailsStepProps {
  selectedPartySize: number;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  tzLabel: string;
  customerInfo: CustomerInfo;
  smsOptIn: boolean;
  specialRequests: string;
  formErrors: Record<string, string>;
  isSubmitting: boolean;
  onCustomerInfoChange: (info: CustomerInfo) => void;
  onSmsOptInChange: (checked: boolean) => void;
  onSpecialRequestsChange: (text: string) => void;
  onClearError: (field: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function ReservationDetailsStep({
  selectedPartySize,
  selectedDate,
  selectedTime,
  tzLabel,
  customerInfo,
  smsOptIn,
  specialRequests,
  formErrors,
  isSubmitting,
  onCustomerInfoChange,
  onSmsOptInChange,
  onSpecialRequestsChange,
  onClearError,
  onBack,
  onSubmit,
}: ReservationDetailsStepProps) {
  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    onCustomerInfoChange({ ...customerInfo, phone: formatted });
    if (formErrors.phone) onClearError("phone");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Details</CardTitle>
        <CardDescription>Complete your reservation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reservation Summary */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Party of {selectedPartySize}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span>
              {selectedDate?.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {selectedTime && formatTime12(selectedTime)}
              {tzLabel ? ` ${tzLabel}` : ""}
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="res-firstName">First Name *</Label>
            <Input
              id="res-firstName"
              value={customerInfo.firstName}
              onChange={(e) => {
                onCustomerInfoChange({ ...customerInfo, firstName: e.target.value });
                if (formErrors.firstName) onClearError("firstName");
              }}
              className={formErrors.firstName ? "border-red-500" : ""}
            />
            {formErrors.firstName && (
              <p className="text-xs text-red-600 mt-1">{formErrors.firstName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="res-lastName">Last Name *</Label>
            <Input
              id="res-lastName"
              value={customerInfo.lastName}
              onChange={(e) => {
                onCustomerInfoChange({ ...customerInfo, lastName: e.target.value });
                if (formErrors.lastName) onClearError("lastName");
              }}
              className={formErrors.lastName ? "border-red-500" : ""}
            />
            {formErrors.lastName && (
              <p className="text-xs text-red-600 mt-1">{formErrors.lastName}</p>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="res-email">Email *</Label>
          <Input
            id="res-email"
            type="email"
            value={customerInfo.email}
            onChange={(e) => {
              onCustomerInfoChange({ ...customerInfo, email: e.target.value });
              if (formErrors.email) onClearError("email");
            }}
            className={formErrors.email ? "border-red-500" : ""}
          />
          {formErrors.email && (
            <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>
          )}
        </div>
        <div>
          <Label htmlFor="res-phone">Phone *</Label>
          <Input
            id="res-phone"
            type="tel"
            value={customerInfo.phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="(555) 123-4567"
            className={formErrors.phone ? "border-red-500" : ""}
          />
          {formErrors.phone && (
            <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>
          )}
        </div>
        <div>
          <Label htmlFor="res-special">Special Requests (optional)</Label>
          <Textarea
            id="res-special"
            placeholder="Dietary restrictions, celebrations, seating preferences..."
            value={specialRequests}
            onChange={(e) => onSpecialRequestsChange(e.target.value)}
            rows={3}
          />
        </div>

        <SmsOptInCheckbox
          id="res-smsOptIn"
          checked={smsOptIn}
          onChange={onSmsOptInChange}
          type="reservation"
        />

        <div className="flex justify-between mt-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            disabled={
              isSubmitting ||
              !customerInfo.firstName ||
              !customerInfo.lastName ||
              !customerInfo.email ||
              !customerInfo.phone
            }
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reserving...
              </>
            ) : (
              "Confirm Reservation"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ========================================
// SHARED SMS OPT-IN CHECKBOX
// ========================================

interface SmsOptInCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  type: "appointment" | "reservation";
}

function SmsOptInCheckbox({ id, checked, onChange, type }: SmsOptInCheckboxProps) {
  const label =
    type === "reservation"
      ? "I agree to receive SMS reservation confirmations, reminders, follow-ups, and marketing messages."
      : "I agree to receive SMS appointment reminders, confirmations, follow-ups, and marketing messages.";

  return (
    <div className="flex items-start space-x-2 pt-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300"
      />
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label} Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel, HELP for
        help.{" "}
        <a href="/sms-terms" target="_blank" className="underline hover:text-foreground">
          SMS Terms
        </a>{" "}
        &{" "}
        <a href="/privacy" target="_blank" className="underline hover:text-foreground">
          Privacy Policy
        </a>
        .
      </label>
    </div>
  );
}
