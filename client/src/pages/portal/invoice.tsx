import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle, FileText, Building, User, Calendar, DollarSign } from "lucide-react";

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface InvoiceData {
  id: number;
  invoiceNumber: string;
  amount: string;
  tax: string;
  total: string;
  status: string;
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  business: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
}

// Payment form component for portal
function PortalCheckoutForm({
  token,
  invoice,
  onSuccess
}: {
  token: string;
  invoice: InvoiceData;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + `/portal/invoice/${token}?payment=success`,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message || "An error occurred");
        toast({
          title: "Payment error",
          description: error.message || "Failed to process payment",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment successful",
          description: "Your payment has been processed",
          variant: "default",
        });
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred");
      toast({
        title: "Payment error",
        description: err.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <PaymentElement />

        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">
            {errorMessage}
          </div>
        )}

        <Button
          type="submit"
          disabled={!stripe || isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? "Processing..." : `Pay ${formatCurrency(parseFloat(invoice.total))}`}
        </Button>
      </div>
    </form>
  );
}

export default function PortalInvoice() {
  const params = useParams();
  const token = params.token;
  const [, navigate] = useLocation();

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const { toast } = useToast();

  // Check for payment success from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      setPaymentStatus("success");
    }
  }, []);

  // Fetch invoice by token
  useEffect(() => {
    if (!token) return;

    setIsLoading(true);
    fetch(`/api/portal/invoice/${token}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Invoice not found or has expired');
        }
        return res.json();
      })
      .then(data => {
        setInvoice(data);
        setIsLoading(false);

        // If invoice is unpaid, create payment intent
        if (data.status === 'pending' || data.status === 'overdue') {
          return fetch(`/api/portal/invoice/${token}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })
      .then(res => {
        if (res) return res.json();
      })
      .then(data => {
        if (data?.clientSecret) {
          setClientSecret(data.clientSecret);
        }
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [token]);

  const handlePaymentSuccess = () => {
    setPaymentStatus("success");
    // Refresh invoice data
    if (token) {
      fetch(`/api/portal/invoice/${token}`)
        .then(res => res.json())
        .then(data => setInvoice(data))
        .catch(() => {});
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

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary rounded-full border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Invoice Not Found</CardTitle>
            <CardDescription>
              {error || "The invoice you're looking for could not be found. The link may have expired or been removed."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <p className="text-sm text-gray-500">
              If you believe this is an error, please contact the business directly.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Payment success state
  if (paymentStatus === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center text-green-600">
              <CheckCircle className="mr-2 h-6 w-6" />
              Payment Successful
            </CardTitle>
            <CardDescription>
              Thank you for your payment!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Invoice Number:</span>
                <span className="font-medium">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount Paid:</span>
                <span className="font-medium text-green-600">{formatCurrency(parseFloat(invoice.total))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payment Date:</span>
                <span className="font-medium">{formatDate(new Date())}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-col space-y-2">
            <p className="text-sm text-gray-500 text-center">
              A receipt has been sent to your email address.
            </p>
            <p className="text-sm text-gray-500 text-center">
              Thank you for your business with {invoice.business.name}!
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Business Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-2">
            <Building className="h-8 w-8 text-primary mr-2" />
            <h1 className="text-2xl font-bold">{invoice.business.name}</h1>
          </div>
          {invoice.business.address && (
            <p className="text-gray-600">{invoice.business.address}</p>
          )}
          <p className="text-gray-600">
            {invoice.business.phone && `${invoice.business.phone} | `}
            {invoice.business.email}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Invoice Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Invoice Header Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <FileText className="mr-2 h-5 w-5" />
                      Invoice {invoice.invoiceNumber}
                    </CardTitle>
                    <CardDescription>
                      Issued on {formatDate(new Date(invoice.createdAt))}
                    </CardDescription>
                  </div>
                  {getStatusBadge(invoice.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center text-sm text-gray-500 mb-1">
                      <User className="h-4 w-4 mr-1" />
                      Bill To
                    </div>
                    <div className="font-medium">
                      {invoice.customer.firstName} {invoice.customer.lastName}
                    </div>
                    <div className="text-gray-600 text-sm">{invoice.customer.email}</div>
                    <div className="text-gray-600 text-sm">{invoice.customer.phone}</div>
                  </div>
                  {invoice.dueDate && (
                    <div className="text-right">
                      <div className="flex items-center justify-end text-sm text-gray-500 mb-1">
                        <Calendar className="h-4 w-4 mr-1" />
                        Due Date
                      </div>
                      <div className="font-medium">{formatDate(new Date(invoice.dueDate))}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Line Items Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invoice Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-gray-600 font-medium">Description</th>
                        <th className="text-center py-2 text-gray-600 font-medium">Qty</th>
                        <th className="text-right py-2 text-gray-600 font-medium">Unit Price</th>
                        <th className="text-right py-2 text-gray-600 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="py-3">{item.description}</td>
                          <td className="py-3 text-center">{item.quantity}</td>
                          <td className="py-3 text-right">{formatCurrency(parseFloat(item.unitPrice))}</td>
                          <td className="py-3 text-right">{formatCurrency(parseFloat(item.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-b">
                        <td colSpan={3} className="py-2 text-right text-gray-600">Subtotal</td>
                        <td className="py-2 text-right">{formatCurrency(parseFloat(invoice.amount))}</td>
                      </tr>
                      {parseFloat(invoice.tax) > 0 && (
                        <tr className="border-b">
                          <td colSpan={3} className="py-2 text-right text-gray-600">Tax</td>
                          <td className="py-2 text-right">{formatCurrency(parseFloat(invoice.tax))}</td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={3} className="py-3 text-right font-bold text-lg">Total</td>
                        <td className="py-3 text-right font-bold text-lg text-primary">
                          {formatCurrency(parseFloat(invoice.total))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {invoice.notes && (
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm text-gray-600 font-medium mb-1">Notes</p>
                    <p className="text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payment Card */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="mr-2 h-5 w-5" />
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Amount Due</div>
                  <div className="text-3xl font-bold text-primary">
                    {formatCurrency(parseFloat(invoice.total))}
                  </div>
                </div>

                {invoice.status === 'paid' ? (
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-green-700 font-medium">This invoice has been paid</p>
                    <p className="text-green-600 text-sm">Thank you!</p>
                  </div>
                ) : clientSecret ? (
                  <Elements
                    stripe={stripePromise}
                    options={{ clientSecret }}
                  >
                    <PortalCheckoutForm
                      token={token!}
                      invoice={invoice}
                      onSuccess={handlePaymentSuccess}
                    />
                  </Elements>
                ) : (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <div className="w-full text-center">
                  <div className="flex items-center justify-center text-gray-400 text-xs mb-2">
                    <CreditCard className="h-3 w-3 mr-1" />
                    Secure payment powered by Stripe
                  </div>
                  <p className="text-xs text-gray-400">
                    Questions? Contact {invoice.business.name} at {invoice.business.phone || invoice.business.email}
                  </p>
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
