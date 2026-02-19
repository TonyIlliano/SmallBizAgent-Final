import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Briefcase,
  Loader2,
} from "lucide-react";

interface StaffProfile {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  specialty?: string;
  bio?: string;
  businessName: string;
  hours: Array<{
    day: string;
    startTime?: string;
    endTime?: string;
    isOff: boolean;
  }>;
}

interface Appointment {
  id: number;
  startDate: string;
  endDate: string;
  status: string;
  notes?: string;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  } | null;
  service: {
    name: string;
    duration: number;
    price: number;
  } | null;
}

const DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function StaffDashboard() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Fetch staff profile
  const { data: profile, isLoading: profileLoading } = useQuery<StaffProfile>({
    queryKey: ["/api/staff/me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/staff/me");
      return res.json();
    },
  });

  // Fetch appointments for selected date
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/staff/me/appointments", selectedDate.toISOString().split("T")[0]],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/staff/me/appointments?startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}`
      );
      return res.json();
    },
  });

  // Fetch all upcoming appointments
  const { data: upcomingAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/staff/me/appointments", "upcoming"],
    queryFn: async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead
      const res = await apiRequest(
        "GET",
        `/api/staff/me/appointments?startDate=${now.toISOString()}&endDate=${futureDate.toISOString()}`
      );
      return res.json();
    },
  });

  const navigateDay = (offset: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + offset);
    setSelectedDate(newDate);
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "scheduled":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "completed":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getDayName = () => {
    return selectedDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  };

  const todaySchedule = profile?.hours?.find((h) => h.day === getDayName());

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-black text-white border-b border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">
              {profile?.firstName} {profile?.lastName}
            </h1>
            <p className="text-xs text-neutral-400">
              {profile?.specialty || "Team Member"} — {profile?.businessName}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-neutral-400 hover:text-white"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="h-4 w-4 mr-1" />
            Logout
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{appointments.length}</div>
              <p className="text-sm text-muted-foreground">Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">
                {upcomingAppointments.filter((a) => a.status === "confirmed").length}
              </div>
              <p className="text-sm text-muted-foreground">Confirmed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{upcomingAppointments.length}</div>
              <p className="text-sm text-muted-foreground">This Month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm font-medium">
                {todaySchedule?.isOff
                  ? "Day Off"
                  : todaySchedule
                  ? `${todaySchedule.startTime} - ${todaySchedule.endTime}`
                  : "No schedule"}
              </div>
              <p className="text-sm text-muted-foreground">Today's Hours</p>
            </CardContent>
          </Card>
        </div>

        {/* Date Navigator */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Appointments
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateDay(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant={isToday ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDate(new Date())}
                >
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigateDay(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardDescription>{formatDate(selectedDate)}</CardDescription>
          </CardHeader>
          <CardContent>
            {appointmentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No appointments</p>
                <p className="text-sm">
                  {isToday ? "You're free today!" : "Nothing scheduled for this day."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {appointments
                  .sort(
                    (a, b) =>
                      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                  )
                  .map((apt) => (
                    <div
                      key={apt.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {formatTime(apt.startDate)} — {formatTime(apt.endDate)}
                            </span>
                            <Badge className={getStatusColor(apt.status)}>
                              {apt.status}
                            </Badge>
                          </div>

                          {apt.service && (
                            <div className="flex items-center gap-2 text-sm">
                              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                {apt.service.name} ({apt.service.duration} min)
                              </span>
                            </div>
                          )}

                          {apt.customer && (
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                {apt.customer.firstName} {apt.customer.lastName}
                              </span>
                              {apt.customer.phone && (
                                <>
                                  <Phone className="h-3.5 w-3.5 text-muted-foreground ml-2" />
                                  <a
                                    href={`tel:${apt.customer.phone}`}
                                    className="text-primary underline"
                                  >
                                    {apt.customer.phone}
                                  </a>
                                </>
                              )}
                            </div>
                          )}

                          {apt.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Notes: {apt.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              My Schedule
            </CardTitle>
            <CardDescription>Your regular working hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {DAYS_ORDER.map((day) => {
                const dayHours = profile?.hours?.find((h) => h.day === day);
                const isCurrentDay = getDayName() === day;
                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isCurrentDay ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="font-medium capitalize w-28">{day}</span>
                    {dayHours?.isOff ? (
                      <Badge variant="secondary">Day Off</Badge>
                    ) : dayHours ? (
                      <span className="text-sm">
                        {dayHours.startTime} — {dayHours.endTime}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not set</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
                  {profile?.firstName?.[0]}
                  {profile?.lastName?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {profile?.firstName} {profile?.lastName}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {profile?.specialty || "Team Member"}
                  </p>
                </div>
              </div>
              {profile?.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {profile.email}
                </div>
              )}
              {profile?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {profile.phone}
                </div>
              )}
              {profile?.bio && (
                <p className="text-sm text-muted-foreground mt-2">{profile.bio}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
