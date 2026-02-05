import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Search, FileText, ArrowRight, Building } from "lucide-react";

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

export default function CustomerPortal() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceResult[] | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email && !phone) {
      toast({
        title: "Search Required",
        description: "Please enter your email or phone number to find your invoices",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSearchPerformed(true);

    try {
      const response = await fetch("/api/portal/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setInvoices(data.invoices || []);

      if (data.invoices?.length === 0) {
        toast({
          title: "No invoices found",
          description: "We couldn't find any invoices matching your information",
        });
      }
    } catch (err: any) {
      toast({
        title: "Search Error",
        description: err.message || "Failed to search for invoices",
        variant: "destructive",
      });
      setInvoices([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Status badge component
  const getStatusBadge = (status: string) => {
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <FileText className="h-10 w-10 text-primary mr-2" />
            <h1 className="text-3xl font-bold">Customer Portal</h1>
          </div>
          <p className="text-gray-600">
            View and pay your invoices online
          </p>
        </div>

        {/* Search Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="mr-2 h-5 w-5" />
              Find Your Invoices
            </CardTitle>
            <CardDescription>
              Enter your email address or phone number to find invoices associated with your account.
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
                    Search Invoices
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        {searchPerformed && invoices && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              {invoices.length > 0
                ? `Found ${invoices.length} invoice${invoices.length > 1 ? 's' : ''}`
                : 'No invoices found'}
            </h2>

            {invoices.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">
                    No invoices found matching your email or phone number.
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    Please double-check your information or contact the business directly.
                  </p>
                </CardContent>
              </Card>
            ) : (
              invoices.map((invoice) => (
                <Card key={invoice.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-lg">{invoice.invoiceNumber}</span>
                          {getStatusBadge(invoice.status)}
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
              ))
            )}
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            Having trouble finding your invoice? Contact the business that sent you the invoice for assistance.
          </p>
          <p className="text-gray-400 text-xs mt-2">
            If you received an invoice link directly, you can use that link to view and pay your invoice.
          </p>
        </div>
      </div>
    </div>
  );
}
