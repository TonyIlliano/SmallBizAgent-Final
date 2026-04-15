import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  User,
  Download,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BusinessInfo, ServiceInfo, StaffInfo, CustomerInfo } from "./bookingHelpers";
import {
  formatTime12,
  generateIcsFile,
  generateReservationIcsFile,
} from "./bookingHelpers";

interface BookingConfirmationProps {
  business: BusinessInfo;
  isReservationMode: boolean;
  confirmationData: any;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  selectedService: ServiceInfo | undefined;
  selectedStaff: StaffInfo | undefined;
  customerInfo: CustomerInfo;
  tzLabel: string;
  isEmbed: boolean;
}

export function BookingConfirmation({
  business,
  isReservationMode,
  confirmationData,
  selectedDate,
  selectedTime,
  selectedService,
  selectedStaff,
  customerInfo,
  tzLabel,
  isEmbed,
}: BookingConfirmationProps) {
  const businessLocation = [business.address, business.city, business.state]
    .filter(Boolean)
    .join(", ");

  const handleDownloadIcs = () => {
    if (isReservationMode) {
      generateReservationIcsFile(confirmationData, business);
    } else {
      generateIcsFile(confirmationData, selectedService, selectedStaff, business);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <Card className="overflow-hidden">
        <CardHeader className="text-center pb-4 bg-gradient-to-b from-green-50 to-transparent dark:from-green-950/20">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl">You're All Set!</CardTitle>
          <CardDescription className="text-base">
            {isReservationMode ? (
              <>
                Reservation reference: <strong>#{confirmationData.reservation?.id}</strong>
              </>
            ) : (
              <>
                Booking reference: <strong>#{confirmationData.appointment?.id}</strong>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {isReservationMode ? (
            <ReservationSummary
              confirmationData={confirmationData}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              tzLabel={tzLabel}
            />
          ) : (
            <AppointmentSummary
              confirmationData={confirmationData}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              selectedService={selectedService}
              selectedStaff={selectedStaff}
              tzLabel={tzLabel}
            />
          )}

          {/* Confirmation email notice */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
            <p className="text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
              <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
              A confirmation has been sent to <strong>{customerInfo.email}</strong>
              {customerInfo.phone ? (
                <>
                  {" "}
                  and <strong>{customerInfo.phone}</strong>
                </>
              ) : (
                ""
              )}
              .
            </p>
          </div>

          {/* Add to Calendar */}
          <Button variant="outline" className="w-full" onClick={handleDownloadIcs}>
            <Download className="mr-2 h-4 w-4" /> Add to Calendar
          </Button>

          {/* Manage link */}
          {confirmationData.manageUrl && (
            <a href={confirmationData.manageUrl} className="block">
              <Button variant="outline" className="w-full">
                <CalendarIcon className="mr-2 h-4 w-4" />{" "}
                {isReservationMode
                  ? "Manage Reservation"
                  : "Manage / Reschedule Appointment"}
              </Button>
            </a>
          )}

          {/* Business info footer */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">{business.name}</h4>
            {businessLocation && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                {businessLocation}
              </p>
            )}
            {business.phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <a
                  href={`tel:${business.phone}`}
                  className="text-primary hover:underline"
                >
                  {business.phone}
                </a>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========================================
// RESERVATION SUMMARY (inside confirmation)
// ========================================

function ReservationSummary({
  confirmationData,
  selectedDate,
  selectedTime,
  tzLabel,
}: {
  confirmationData: any;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  tzLabel: string;
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="font-medium">Party of {confirmationData.reservation?.partySize}</span>
      </div>
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
        <span className="font-medium">
          {selectedTime && formatTime12(selectedTime)}
          {tzLabel ? ` ${tzLabel}` : ""}
        </span>
      </div>
      {confirmationData.reservation?.specialRequests && (
        <div className="flex items-start gap-3 pt-1 border-t">
          <span className="text-sm text-muted-foreground">
            Special requests: {confirmationData.reservation.specialRequests}
          </span>
        </div>
      )}
    </div>
  );
}

// ========================================
// APPOINTMENT SUMMARY (inside confirmation)
// ========================================

function AppointmentSummary({
  confirmationData,
  selectedDate,
  selectedTime,
  selectedService,
  selectedStaff,
  tzLabel,
}: {
  confirmationData: any;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  selectedService: ServiceInfo | undefined;
  selectedStaff: StaffInfo | undefined;
  tzLabel: string;
}) {
  return (
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
        <span className="font-medium">
          {selectedTime && formatTime12(selectedTime)}
          {tzLabel ? ` ${tzLabel}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span>{confirmationData.appointment?.serviceName}</span>
        {selectedService?.duration && (
          <Badge variant="secondary" className="text-xs ml-auto">
            {selectedService.duration} min
          </Badge>
        )}
      </div>
      {selectedStaff && (
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span>
            with {selectedStaff.firstName} {selectedStaff.lastName}
          </span>
        </div>
      )}
      {selectedService?.price && (
        <div className="flex items-center gap-3 pt-1 border-t">
          <span className="font-medium">Total</span>
          <span className="ml-auto font-semibold text-lg">
            {formatCurrency(selectedService.price)}
          </span>
        </div>
      )}
    </div>
  );
}
