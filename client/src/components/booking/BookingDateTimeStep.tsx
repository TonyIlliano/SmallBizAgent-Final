import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Clock, Calendar as CalendarIcon, ArrowLeft, ArrowRight, User } from "lucide-react";
import type { BookingData, TimeSlot, ReservationSlot } from "./bookingHelpers";
import { formatTime12, isDateDisabled, isReservationDateDisabled } from "./bookingHelpers";

// ========================================
// APPOINTMENT DATE/TIME STEP
// ========================================

interface BookingDateTimeStepProps {
  bookingData: BookingData;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  slots: TimeSlot[];
  isLoadingSlots: boolean;
  tzLabel: string;
  onSelectDate: (date: Date | undefined) => void;
  onSelectTime: (time: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function BookingDateTimeStep({
  bookingData,
  selectedDate,
  selectedTime,
  slots,
  isLoadingSlots,
  tzLabel,
  onSelectDate,
  onSelectTime,
  onBack,
  onNext,
}: BookingDateTimeStepProps) {
  const disabledFn = (date: Date) => isDateDisabled(date, bookingData);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Date & Time</CardTitle>
        <CardDescription>Pick a date and available time slot</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <Label className="text-sm font-medium mb-2 block">Date</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={onSelectDate}
              disabled={disabledFn}
              className="rounded-md border"
            />
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
                {slots
                  .filter((s) => s.available)
                  .map((slot) => (
                    <Button
                      key={slot.time}
                      variant={selectedTime === slot.time ? "default" : "outline"}
                      size="sm"
                      onClick={() => onSelectTime(slot.time)}
                      className="text-sm"
                    >
                      {formatTime12(slot.time)}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-between pt-6">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={onNext} disabled={!selectedDate || !selectedTime}>
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ========================================
// RESERVATION PARTY & DATE STEP (Step 1)
// ========================================

interface ReservationPartyDateStepProps {
  bookingData: BookingData;
  selectedPartySize: number;
  selectedDate: Date | undefined;
  onSelectPartySize: (size: number) => void;
  onSelectDate: (date: Date | undefined) => void;
  onNext: () => void;
}

export function ReservationPartyDateStep({
  bookingData,
  selectedPartySize,
  selectedDate,
  onSelectPartySize,
  onSelectDate,
  onNext,
}: ReservationPartyDateStepProps) {
  const disabledFn = (date: Date) => isReservationDateDisabled(date, bookingData);
  const maxPartySize = bookingData.reservation?.maxPartySize || 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Party Size & Date</CardTitle>
        <CardDescription>How many guests and when?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Party Size */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Party Size</Label>
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
            {Array.from({ length: maxPartySize }, (_, i) => i + 1).map((n) => (
              <Button
                key={n}
                variant={selectedPartySize === n ? "default" : "outline"}
                size="sm"
                className="h-10"
                onClick={() => onSelectPartySize(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          {bookingData.reservation?.maxPartySize && (
            <p className="text-xs text-muted-foreground mt-2">
              For parties larger than {bookingData.reservation.maxPartySize}, please call us at{" "}
              {bookingData.business.phone}
            </p>
          )}
        </div>

        {/* Date */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Select Date</Label>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={onSelectDate}
              disabled={disabledFn}
              className="rounded-md border"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={!selectedDate} onClick={onNext}>
            Next <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ========================================
// RESERVATION TIME STEP (Step 2)
// ========================================

interface ReservationTimeStepProps {
  selectedPartySize: number;
  selectedDate: Date | undefined;
  selectedTime: string | null;
  reservationSlots: ReservationSlot[];
  isLoadingSlots: boolean;
  tzLabel: string;
  onSelectTime: (time: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ReservationTimeStep({
  selectedPartySize,
  selectedDate,
  selectedTime,
  reservationSlots,
  isLoadingSlots,
  tzLabel,
  onSelectTime,
  onBack,
  onNext,
}: ReservationTimeStepProps) {
  const availableSlots = reservationSlots.filter((s) => s.available);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Time</CardTitle>
        <CardDescription>
          Available times for {selectedPartySize}{" "}
          {selectedPartySize === 1 ? "guest" : "guests"} on{" "}
          {selectedDate?.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingSlots ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reservationSlots.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No time slots available for this date.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {availableSlots.map((slot) => (
              <Button
                key={slot.time}
                variant={selectedTime === slot.time ? "default" : "outline"}
                size="sm"
                className="h-10"
                onClick={() => onSelectTime(slot.time)}
              >
                {formatTime12(slot.time)}
              </Button>
            ))}
          </div>
        )}
        {reservationSlots.length > 0 && availableSlots.length === 0 && !isLoadingSlots && (
          <p className="text-center text-muted-foreground py-4">
            All time slots are fully booked for this date. Please try another date.
          </p>
        )}
        {tzLabel && availableSlots.length > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            All times shown in {tzLabel}
          </p>
        )}
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button disabled={!selectedTime} onClick={onNext}>
            Next <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
