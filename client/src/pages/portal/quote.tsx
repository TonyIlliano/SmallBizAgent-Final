import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  FileText,
  Building,
  User,
  Calendar,
  Clock,
  Loader2,
  AlertTriangle
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QuoteData {
  id: number;
  quoteNumber: string;
  amount: number;
  tax: number;
  total: number;
  status: string;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  } | null;
  business: {
    name: string;
    address: string;
    phone: string;
    email: string;
  } | null;
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
}

export default function PortalQuote() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { toast } = useToast();

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    fetchQuote();
  }, [token]);

  const fetchQuote = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/portal/quote/${token}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Quote not found");
      }
      const data = await res.json();
      setQuote(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResponse = async (response: "accepted" | "declined") => {
    try {
      setIsResponding(true);
      const res = await fetch(`/api/portal/quote/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to respond to quote");
      }

      toast({
        title: response === "accepted" ? "Quote Accepted!" : "Quote Declined",
        description: data.message,
      });

      // Refresh quote data
      fetchQuote();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsResponding(false);
      setConfirmDialog(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600">Pending Response</Badge>;
      case "accepted":
        return <Badge className="bg-green-500 hover:bg-green-600">Accepted</Badge>;
      case "declined":
        return <Badge variant="destructive">Declined</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      case "converted":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Converted to Invoice</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isExpired = quote?.validUntil && new Date(quote.validUntil) < new Date();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading quote...</p>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
            <CardTitle>Quote Not Found</CardTitle>
            <CardDescription>
              {error || "This quote link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>If you believe this is an error, please contact the business directly.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <FileText className="h-6 w-6" />
                  Quote #{quote.quoteNumber}
                </CardTitle>
                <CardDescription className="mt-1">
                  From {quote.business?.name || "Business"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(quote.status)}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Expired Warning */}
        {isExpired && quote.status === "pending" && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">This quote has expired</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    The valid date was {formatDate(quote.validUntil!)}. Please contact the business for an updated quote.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Business & Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building className="h-5 w-5" />
                From
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quote.business && (
                <div className="space-y-1">
                  <p className="font-semibold">{quote.business.name}</p>
                  {quote.business.address && <p className="text-sm text-muted-foreground">{quote.business.address}</p>}
                  {quote.business.phone && (
                    <p className="text-sm">
                      <a href={`tel:${quote.business.phone}`} className="text-primary hover:underline">
                        {quote.business.phone}
                      </a>
                    </p>
                  )}
                  {quote.business.email && (
                    <p className="text-sm">
                      <a href={`mailto:${quote.business.email}`} className="text-primary hover:underline">
                        {quote.business.email}
                      </a>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                To
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quote.customer && (
                <div className="space-y-1">
                  <p className="font-semibold">{quote.customer.firstName} {quote.customer.lastName}</p>
                  {quote.customer.email && (
                    <p className="text-sm text-muted-foreground">{quote.customer.email}</p>
                  )}
                  {quote.customer.phone && (
                    <p className="text-sm text-muted-foreground">{quote.customer.phone}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quote Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Quote Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Quote Date</p>
                <p className="font-medium">{formatDate(quote.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valid Until</p>
                <p className={`font-medium ${isExpired ? 'text-red-500' : ''}`}>
                  {quote.validUntil ? formatDate(quote.validUntil) : "No expiry"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="mt-1">{getStatusBadge(quote.status)}</div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="font-bold text-xl">{formatCurrency(quote.total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Items & Services</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right">Subtotal</TableCell>
                  <TableCell className="text-right">{formatCurrency(quote.amount)}</TableCell>
                </TableRow>
                {quote.tax > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-right">Tax</TableCell>
                    <TableCell className="text-right">{formatCurrency(quote.tax)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold text-lg">{formatCurrency(quote.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Notes */}
        {quote.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes & Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons - Only show for pending quotes */}
        {quote.status === "pending" && !isExpired && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => setConfirmDialog("accept")}
                  disabled={isResponding}
                >
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Accept Quote
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmDialog("decline")}
                  disabled={isResponding}
                >
                  <XCircle className="mr-2 h-5 w-5" />
                  Decline Quote
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                By accepting this quote, you agree to the services and pricing listed above.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Accepted Message */}
        {quote.status === "accepted" && (
          <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div className="text-center">
                  <p className="font-medium text-green-800 dark:text-green-200">Quote Accepted</p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Thank you! The business will be in touch to schedule your service.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Declined Message */}
        {quote.status === "declined" && (
          <Card className="border-gray-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 justify-center">
                <XCircle className="h-6 w-6 text-gray-500" />
                <div className="text-center">
                  <p className="font-medium">Quote Declined</p>
                  <p className="text-sm text-muted-foreground">
                    This quote was declined. Contact the business if you'd like to discuss other options.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pb-8">
          <p>Powered by SmallBizAgent</p>
        </div>
      </div>

      {/* Accept Confirmation Dialog */}
      <Dialog open={confirmDialog === "accept"} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Quote</DialogTitle>
            <DialogDescription>
              Are you sure you want to accept this quote for {formatCurrency(quote.total)}?
              The business will be notified and will contact you to proceed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)} disabled={isResponding}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => handleResponse("accepted")}
              disabled={isResponding}
            >
              {isResponding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Accept Quote"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Confirmation Dialog */}
      <Dialog open={confirmDialog === "decline"} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Quote</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline this quote? You can always contact the business
              if you'd like to discuss different options.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)} disabled={isResponding}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleResponse("declined")}
              disabled={isResponding}
            >
              {isResponding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Decline Quote"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
