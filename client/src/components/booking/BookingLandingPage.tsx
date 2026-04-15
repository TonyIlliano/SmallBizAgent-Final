import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  MapPin,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  Globe,
  Scissors,
  Star,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BookingData } from "./bookingHelpers";
import {
  DAY_ORDER,
  DAY_LABELS,
  formatTime12,
  formatHoursRange,
  getGoogleMapsLink,
} from "./bookingHelpers";
import { PoweredByFooter } from "./BookingShared";

interface BookingLandingPageProps {
  bookingData: BookingData;
  isReservationMode: boolean;
  onStartBooking: () => void;
}

export function BookingLandingPage({
  bookingData,
  isReservationMode,
  onStartBooking,
}: BookingLandingPageProps) {
  const businessLocation = [
    bookingData.business.address,
    bookingData.business.city,
    bookingData.business.state,
  ]
    .filter(Boolean)
    .join(", ");

  const fullAddress = [
    bookingData.business.address,
    bookingData.business.city,
    bookingData.business.state,
    bookingData.business.zip,
  ]
    .filter(Boolean)
    .join(", ");

  const mapsLink = getGoogleMapsLink(bookingData.business);

  const sortedHours = [...bookingData.businessHours].sort(
    (a, b) => DAY_ORDER.indexOf(a.day.toLowerCase()) - DAY_ORDER.indexOf(b.day.toLowerCase())
  );

  return (
    <>
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
                  onClick={onStartBooking}
                  className="bg-white text-primary hover:bg-white/90 font-semibold shadow-lg px-8"
                >
                  <CalendarIcon className="mr-2 h-5 w-5" />
                  {isReservationMode ? "Make a Reservation" : "Book Appointment"}
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
                  <div
                    key={service.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm">{service.name}</h4>
                      {service.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {service.description}
                        </p>
                      )}
                      {service.duration && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          {service.duration} min
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
              <Button className="w-full mt-4" onClick={onStartBooking}>
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
                          {staffMember.firstName[0]}
                          {staffMember.lastName[0]}
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
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {staffMember.bio}
                      </p>
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
                <CardTitle className="text-lg">
                  Hours
                  {bookingData.business.timezoneAbbr
                    ? ` (${bookingData.business.timezoneAbbr})`
                    : ""}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {sortedHours.map((h) => {
                  const dayKey = h.day.toLowerCase();
                  const label = DAY_LABELS[dayKey] || h.day;
                  const today = new Date()
                    .toLocaleDateString("en-US", { weekday: "long" })
                    .toLowerCase();
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
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Today
                          </Badge>
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
                <a
                  href={`tel:${bookingData.business.phone}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Call Us</p>
                    <p className="text-xs text-muted-foreground">{bookingData.business.phone}</p>
                  </div>
                </a>
              )}
              {bookingData.business.email && (
                <a
                  href={`mailto:${bookingData.business.email}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">{bookingData.business.email}</p>
                  </div>
                </a>
              )}
              {fullAddress && mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Directions</p>
                    <p className="text-xs text-muted-foreground">{fullAddress}</p>
                  </div>
                </a>
              )}
              {bookingData.business.website && (
                <a
                  href={
                    bookingData.business.website.startsWith("http")
                      ? bookingData.business.website
                      : `https://${bookingData.business.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
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
          <Button size="lg" onClick={onStartBooking} className="px-10 shadow-md">
            <CalendarIcon className="mr-2 h-5 w-5" />
            {isReservationMode ? "Make a Reservation" : "Book an Appointment"}
          </Button>
        </div>

        <PoweredByFooter />
      </div>
    </>
  );
}
