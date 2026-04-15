import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, User, ArrowLeft, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ServiceInfo, StaffInfo } from "./bookingHelpers";
import { canStaffDoService } from "./bookingHelpers";

interface BookingServiceStepProps {
  services: ServiceInfo[];
  staff: StaffInfo[];
  staffServices?: Record<string, number[]>;
  selectedService: number | null;
  selectedStaff: number | null;
  isEmbed: boolean;
  onSelectService: (serviceId: number) => void;
  onSelectStaff: (staffId: number | null) => void;
  onBack: () => void;
  onNext: () => void;
}

export function BookingServiceStep({
  services,
  staff,
  staffServices,
  selectedService,
  selectedStaff,
  isEmbed,
  onSelectService,
  onSelectStaff,
  onBack,
  onNext,
}: BookingServiceStepProps) {
  const filteredStaff = staff.filter((s) =>
    canStaffDoService(staffServices, s.id, selectedService)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select a Service</CardTitle>
        <CardDescription>Choose the service you would like to book</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.map((service) => (
          <div
            key={service.id}
            className={`relative p-4 border rounded-lg cursor-pointer transition-all ${
              selectedService === service.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                : "border-border hover:border-primary/30 hover:shadow-sm"
            }`}
            onClick={() => onSelectService(service.id)}
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
                  <Badge variant="secondary" className="text-xs">
                    Contact for price
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredStaff.length > 1 && (
          <div className="mt-6 pt-4 border-t">
            <Label className="text-sm font-medium mb-3 block">Staff Preference (Optional)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div
                className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                  selectedStaff === null
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30"
                }`}
                onClick={() => onSelectStaff(null)}
              >
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Any Available</p>
              </div>
              {filteredStaff.map((sm) => (
                <div
                  key={sm.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                    selectedStaff === sm.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => onSelectStaff(sm.id)}
                >
                  {sm.photoUrl ? (
                    <img
                      src={sm.photoUrl}
                      alt={sm.firstName}
                      className="w-12 h-12 mx-auto mb-2 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-lg font-medium text-muted-foreground">
                        {sm.firstName[0]}
                        {sm.lastName[0]}
                      </span>
                    </div>
                  )}
                  <p className="text-sm font-medium">{sm.firstName}</p>
                  {sm.specialty && (
                    <p className="text-xs text-muted-foreground mt-0.5">{sm.specialty}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          {!isEmbed && (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          )}
          <Button
            onClick={onNext}
            disabled={!selectedService}
            className={isEmbed ? "ml-auto" : ""}
          >
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
