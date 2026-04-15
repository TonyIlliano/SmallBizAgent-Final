import { CheckCircle, MapPin, Phone } from "lucide-react";
import type { BookingData, StepDefinition } from "./bookingHelpers";
import { STEPS, RESERVATION_STEPS } from "./bookingHelpers";

// ========================================
// SBA LOGO (for "Powered by" footer)
// ========================================

function SBALogo({ className }: { className?: string }) {
  return (
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
}

// ========================================
// POWERED BY FOOTER
// ========================================

export function PoweredByFooter() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
      <span>Powered by</span>
      <a
        href="https://www.smallbizagent.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 font-medium text-foreground/70 hover:text-foreground transition-colors"
      >
        <SBALogo className="h-5 w-5 text-primary" />
        SmallBizAgent
      </a>
    </div>
  );
}

// ========================================
// STEP INDICATOR
// ========================================

interface StepIndicatorProps {
  currentStep: number;
  isReservationMode: boolean;
}

export function StepIndicator({ currentStep, isReservationMode }: StepIndicatorProps) {
  const steps = isReservationMode ? RESERVATION_STEPS : STEPS;

  return (
    <div className="flex items-center justify-center gap-1">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                currentStep > s.num
                  ? "bg-primary text-primary-foreground"
                  : currentStep === s.num
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {currentStep > s.num ? <CheckCircle className="h-5 w-5" /> : s.num}
            </div>
            <span
              className={`text-xs font-medium ${
                currentStep >= s.num ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-12 sm:w-16 h-0.5 mx-2 mb-5 transition-colors ${
                currentStep > s.num ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ========================================
// BOOKING FLOW HEADER (branded hero banner)
// ========================================

interface BookingFlowHeaderProps {
  bookingData: BookingData;
  isReservationMode: boolean;
}

export function BookingFlowHeader({ bookingData, isReservationMode }: BookingFlowHeaderProps) {
  const businessLocation = [
    bookingData.business.address,
    bookingData.business.city,
    bookingData.business.state,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary to-primary/80 shadow-lg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
      <div className="relative z-10 px-6 py-8">
        <div className="flex items-center gap-4">
          {bookingData.business.logoUrl ? (
            <img
              src={bookingData.business.logoUrl}
              alt={bookingData.business.name}
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl object-contain bg-white/20 backdrop-blur-sm p-2"
            />
          ) : (
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-2xl font-bold text-primary-foreground">
                {bookingData.business.name[0]}
              </span>
            </div>
          )}
          <div className="text-primary-foreground">
            <h1 className="text-xl sm:text-2xl font-bold">{bookingData.business.name}</h1>
            <p className="text-primary-foreground/80 text-sm sm:text-base">
              {isReservationMode ? "Reserve a table online" : "Book an appointment online"}
            </p>
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
  );
}
