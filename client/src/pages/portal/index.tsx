import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Search, FileText, ArrowRight, Building, Calendar, Clock,
  User, RefreshCw, XCircle, CheckCircle2, AlertCircle
} from "lucide-react";

interface InvoiceResult {
  id: number;
  invoiceNumber: string;
  total: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  accessToken: string;
  businessName: string;
}

interface AppointmentResult {
  id: number;
  startDate: string;
  endDate: string;
  status: string;
  serviceName: string;
  servicePrice: string | null;
  staffName: string | null;
  businessName: string;
  businessSlug: string | null;
  manageToken: string | null;
  canReschedule: boolean;
  canCancel: boolean;
  isFuture: boolean;
}

export default function CustomerPortal() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceResult[] | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<AppointmentResult[]>([]);
  const [pastAppointments, setPastAppointments] = useState<AppointmentResult[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [activeTab, setActiveTab] = useState("appointments");
  const { toast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !phone) {
      toast({
        title: "Both fields required",
        description: "Please enter both your email and phone number for security",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSearchPerformed(true);

    try {
      // Fetch invoices and appointments in parallel
      const [invoiceRes, appointmentRes] = await Promise.all([
        fetch("/api/portal/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, phone }),
        }),
        fetch("/api/portal/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, phone }),
        }),
      ]);

      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json();
        setInvoices(invoiceData.invoices || []);
      } else {
        setInvoices([]);
      }

      if (appointmentRes.ok) {
        const apptData = await appointmentRes.json();
        setUpcomingAppointments(apptData.upcoming || []);
        setPastAppointments(apptData.past || []);
      } else {
        setUpcomingAppointments([]);
        setPastAppointments([]);
      }

      // Auto-select the tab with the most relevant content
      if (invoiceRes.ok && appointmentRes.ok) {
        const invoiceData = await invoiceRes.clone().json().catch(() => ({ invoices: [] }));
        const apptData = await appointmentRes.clone().json().catch(() => ({ upcoming: [], past: [] }));
        if ((apptData.upcoming?.length || 0) + (apptData.past?.length || 0) > 0) {
          setActiveTab("appointments");
        } else if ((invoiceData.invoices?.length || 0) > 0) {
          setActiveTab("invoices");
        }
      }
    } catch (err: any) {
      toast({
        title: "Search Error",
        description: err.message || "Failed to search. Please try again.",
        variant: "destructive",
      });
      setInvoices([]);
      setUpcomingAppointments([]);
      setPastAppointments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Overdue</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getAppointmentStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmed</Badge>;
      case 'scheduled':
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Clock className="h-3 w-3 mr-1" />Scheduled</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      case 'no_show':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><AlertCircle className="h-3 w-3 mr-1" />No Show</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const totalAppointments = upcomingAppointments.length + pastAppointments.length;
  const totalInvoices = invoices?.length || 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <User className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">Customer Portal</h1>
          <p className="text-gray-600 mt-2">
            View your appointments, invoices, and manage bookings
          </p>
        </div>

        {/* Search Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="mr-2 h-5 w-5" />
              Find Your Account
            </CardTitle>
            <CardDescription>
              Enter your email address and phone number to access your account information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white rounded-full border-t-transparent mr-2"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Find My Account
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        {searchPerformed && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="appointments" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Appointments
                {totalAppointments > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{totalAppointments}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="invoices" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Invoices
                {totalInvoices > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{totalInvoices}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Appointments Tab */}
            <TabsContent value="appointments" className="mt-6 space-y-6">
              {totalAppointments === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No appointments found.</p>
                    <p className="text-gray-400 text-sm mt-2">
                      Book an appointment through your service provider to see it here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Upcoming */}
                  {upcomingAppointments.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <Clock className="h-5 w-5 mr-2 text-blue-500" />
                        Upcoming ({upcomingAppointments.length})
                      </h3>
                      <div className="space-y-3">
                        {upcomingAppointments.map((appt) => (
                          <Card key={appt.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
                            <CardContent className="py-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-1">
                                    <span className="font-semibold text-lg">{appt.serviceName}</span>
                                    {getAppointmentStatusBadge(appt.status)}
                                  </div>
                                  <div className="space-y-1 text-sm text-gray-600">
                                    <div className="flex items-center">
                                      <Calendar className="h-4 w-4 mr-2" />
                                      {formatDateShort(appt.startDate)} at {formatTime(appt.startDate)}
                                    </div>
                                    {appt.staffName && (
                                      <div className="flex items-center">
                                        <User className="h-4 w-4 mr-2" />
                                        {appt.staffName}
                                      </div>
                                    )}
                                    <div className="flex items-center">
                                      <Building className="h-4 w-4 mr-2" />
                                      {appt.businessName}
                                    </div>
                                    {appt.servicePrice && (
                                      <div className="text-primary font-medium">
                                        {formatCurrency(parseFloat(appt.servicePrice))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 ml-4">
                                  {appt.canReschedule && appt.manageToken && appt.businessSlug && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => navigate(`/book/${appt.businessSlug}/manage/${appt.manageToken}`)}
                                    >
                                      <RefreshCw className="h-3 w-3 mr-1" />
                                      Reschedule
                                    </Button>
                                  )}
                                  {appt.canCancel && appt.manageToken && appt.businessSlug && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => navigate(`/book/${appt.businessSlug}/manage/${appt.manageToken}`)}
                                    >
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Cancel
                                    </Button>
                                  )}
                                  {appt.businessSlug && (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => navigate(`/book/${appt.businessSlug}`)}
                                    >
                                      Book Again
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Past */}
                  {pastAppointments.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <CheckCircle2 className="h-5 w-5 mr-2 text-gray-400" />
                        Past Appointments ({pastAppointments.length})
                      </h3>
                      <div className="space-y-3">
                        {pastAppointments.map((appt) => (
                          <Card key={appt.id} className="opacity-80 hover:opacity-100 transition-opacity">
                            <CardContent className="py-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-1">
                                    <span className="font-medium">{appt.serviceName}</span>
                                    {getAppointmentStatusBadge(appt.status)}
                                  </div>
                                  <div className="space-y-1 text-sm text-gray-500">
                                    <div className="flex items-center">
                                      <Calendar className="h-4 w-4 mr-2" />
                                      {formatDateShort(appt.startDate)} at {formatTime(appt.startDate)}
                                    </div>
                                    {appt.staffName && (
                                      <div className="flex items-center">
                                        <User className="h-4 w-4 mr-2" />
                                        {appt.staffName}
                                      </div>
                                    )}
                                    <div className="flex items-center">
                                      <Building className="h-4 w-4 mr-2" />
                                      {appt.businessName}
                                    </div>
                                  </div>
                                </div>
                                {appt.businessSlug && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/book/${appt.businessSlug}`)}
                                  >
                                    Book Again
                                    <ArrowRight className="ml-1 h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices" className="mt-6">
              {totalInvoices === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No invoices found.</p>
                    <p className="text-gray-400 text-sm mt-2">
                      Please double-check your information or contact the business directly.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {invoices?.map((invoice) => (
                    <Card key={invoice.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-semibold text-lg">{invoice.invoiceNumber}</span>
                              {getInvoiceStatusBadge(invoice.status)}
                            </div>
                            <div className="flex items-center text-sm text-gray-500">
                              <Building className="h-4 w-4 mr-1" />
                              {invoice.businessName}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              Issued: {formatDate(new Date(invoice.createdAt))}
                              {invoice.dueDate && ` | Due: ${formatDate(new Date(invoice.dueDate))}`}
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <div>
                              <div className="text-sm text-gray-500">Amount</div>
                              <div className="text-xl font-bold text-primary">
                                {formatCurrency(parseFloat(invoice.total))}
                              </div>
                            </div>
                            <Button
                              variant={invoice.status === 'paid' ? 'outline' : 'default'}
                              onClick={() => navigate(`/portal/invoice/${invoice.accessToken}`)}
                            >
                              {invoice.status === 'paid' ? 'View' : 'Pay Now'}
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Help Section */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            Need help? Contact the business that sent you the invoice or booking confirmation.
          </p>
          <p className="text-gray-400 text-xs mt-2">
            If you have a direct link to an invoice or booking, you can use that link directly.
          </p>
        </div>
      </div>
    </div>
  );
}
