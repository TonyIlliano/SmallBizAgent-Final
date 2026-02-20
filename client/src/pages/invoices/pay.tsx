import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard, CheckCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// Payment form component
function CheckoutForm({ invoice, onSuccess }: { 
  invoice: any;
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
          return_url: window.location.origin + "/invoices", // Redirect to invoices page after successful payment
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
        >
          {isLoading ? "Processing..." : `Pay ${formatCurrency(invoice.total)}`}
        </Button>
      </div>
    </form>
  );
}

export default function InvoicePayment() {
  const params = useParams();
  const { invoiceId } = params;
  const [, navigate] = useLocation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [paymentBlocked, setPaymentBlocked] = useState(false);

  // Fetch invoice
  const { data: invoice, isLoading: isLoadingInvoice } = useQuery<any>({
    queryKey: [`/api/invoices/${invoiceId}`],
    enabled: !!invoiceId,
  });

  // Create payment intent when invoice is loaded
  useEffect(() => {
    if (invoice && invoiceId) {
      apiRequest("POST", "/api/create-payment-intent", {
        amount: invoice.total,
        invoiceId: parseInt(invoiceId)
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then((data: any) => {
              if (data.code === 'PAYMENT_BLOCKED') {
                setPaymentBlocked(true);
                return null;
              }
              throw new Error(data.message || 'Failed to create payment');
            });
          }
          return res.json();
        })
        .then((data) => {
          if (data?.clientSecret) {
            setClientSecret(data.clientSecret);
          }
        })
        .catch((error) => {
          console.error("Error creating payment intent:", error);
        });
    }
  }, [invoice, invoiceId]);
  
  const handlePaymentSuccess = () => {
    setPaymentStatus("success");
  };
  
  // Loading state
  if (isLoadingInvoice) {
    return (
      <PageLayout title="Invoice Payment">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent"></div>
        </div>
      </PageLayout>
    );
  }
  
  // No invoice found
  if (!invoice) {
    return (
      <PageLayout title="Invoice Payment">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Not Found</CardTitle>
            <CardDescription>
              The requested invoice could not be found.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate("/invoices")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Invoices
            </Button>
          </CardFooter>
        </Card>
      </PageLayout>
    );
  }
  
  // Payment success state
  if (paymentStatus === "success") {
    return (
      <PageLayout title="Payment Complete">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-green-600">
              <CheckCircle className="mr-2 h-5 w-5" />
              Payment Successful
            </CardTitle>
            <CardDescription>
              Your payment for invoice #{invoice.invoiceNumber} has been processed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>Amount:</strong> {formatCurrency(invoice.total)}</p>
              <p><strong>Invoice Number:</strong> {invoice.invoiceNumber}</p>
              <p><strong>Payment Date:</strong> {formatDate(new Date())}</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate("/invoices")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Invoices
            </Button>
          </CardFooter>
        </Card>
      </PageLayout>
    );
  }
  
  return (
    <PageLayout title="Payment Details">
      <Button 
        variant="ghost" 
        className="mb-4"
        onClick={() => navigate("/invoices")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Invoices
      </Button>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Summary</CardTitle>
            <CardDescription>
              Review your invoice details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500">Invoice Number</div>
                <div className="font-medium">{invoice.invoiceNumber}</div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Customer</div>
                <div className="font-medium">
                  {invoice.customer?.firstName} {invoice.customer?.lastName}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Issue Date</div>
                <div className="font-medium">{formatDate(invoice.createdAt)}</div>
              </div>
              
              {invoice.dueDate && (
                <div>
                  <div className="text-sm text-gray-500">Due Date</div>
                  <div className="font-medium">{formatDate(invoice.dueDate)}</div>
                </div>
              )}
              
              <div>
                <div className="text-sm text-gray-500">Amount Due</div>
                <div className="text-xl font-bold text-primary">{formatCurrency(invoice.total)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="mr-2 h-5 w-5" />
              Payment Details
            </CardTitle>
            <CardDescription>
              Complete your payment securely
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paymentBlocked ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Online Payments Not Available</AlertTitle>
                <AlertDescription className="text-amber-700">
                  To accept online payments, connect your Stripe account in{" "}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-amber-800 underline"
                    onClick={() => navigate("/settings?tab=integrations")}
                  >
                    Settings → Integrations → Payments
                  </Button>.
                </AlertDescription>
              </Alert>
            ) : clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret }}
              >
                <CheckoutForm
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
        </Card>
      </div>
    </PageLayout>
  );
}