import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Calendar,
  Download,
  Edit,
  FileText,
  MoreHorizontal,
  Send,
  User,
  Link,
  Copy,
  Mail,
  Check,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export default function QuoteDetail() {
  const [match, params] = useRoute("/quotes/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const quoteId = params?.id ? parseInt(params.id) : 0;
  const [confirmDialog, setConfirmDialog] = useState("");

  const { data: quote, isLoading } = useQuery({
    queryKey: ["/api/quotes", quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!quoteId,
  });

  const updateQuoteStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      const res = await apiRequest("PATCH", `/api/quotes/${quoteId}/status`, { status });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update quote status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId] });
      toast({
        title: "Quote updated",
        description: "The quote status has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/quotes/${quoteId}/convert`, {});
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to convert quote to invoice");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId] });
      toast({
        title: "Quote converted",
        description: "The quote has been converted to an invoice successfully",
      });
      navigate(`/invoices/${data.invoiceId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const generateQuoteLink = async () => {
    try {
      setIsGeneratingLink(true);
      const res = await apiRequest("POST", `/api/quotes/${quoteId}/generate-link`, {});
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate link");
      }
      const data = await res.json();
      setQuoteLink(data.url);
      setConfirmDialog("send");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyToClipboard = async () => {
    if (quoteLink) {
      await navigator.clipboard.writeText(quoteLink);
      setLinkCopied(true);
      toast({
        title: "Link copied",
        description: "Quote link copied to clipboard",
      });
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Quote not found</h1>
          <p className="text-muted-foreground mt-2">
            The quote you're looking for doesn't exist or you don't have
            permission to view it.
          </p>
          <Button onClick={() => navigate("/quotes")} className="mt-4">
            Back to Quotes
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      case "accepted":
        return <Badge className="bg-green-500 hover:bg-green-600">Accepted</Badge>;
      case "declined":
        return <Badge variant="destructive">Declined</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      case "converted":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Converted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleAccept = () => {
    updateQuoteStatusMutation.mutate({ status: "accepted" });
    setConfirmDialog("");
  };

  const handleDecline = () => {
    updateQuoteStatusMutation.mutate({ status: "declined" });
    setConfirmDialog("");
  };

  const handleConvertToInvoice = () => {
    convertToInvoiceMutation.mutate();
    setConfirmDialog("");
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button variant="outline" onClick={() => navigate("/quotes")} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quote #{quote.quoteNumber}</h1>
            <div className="flex items-center mt-1 space-x-4">
              <div className="text-muted-foreground">
                {formatDate(quote.createdAt)}
              </div>
              {getStatusBadge(quote.status)}
            </div>
          </div>
        </div>
        <div className="flex space-x-2">
          {quote.status !== "converted" && (
            <Button
              variant="outline"
              onClick={() => navigate(`/quotes/${quoteId}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                <MoreHorizontal className="h-4 w-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Quote Actions</DropdownMenuLabel>
              {quote.status === "pending" && (
                <>
                  <DropdownMenuItem onClick={() => setConfirmDialog("accept")}>
                    <Badge className="bg-green-500 hover:bg-green-600 mr-2">
                      Accept
                    </Badge>
                    Mark as Accepted
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setConfirmDialog("decline")}>
                    <Badge variant="destructive" className="mr-2">
                      Decline
                    </Badge>
                    Mark as Declined
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {quote.status === "accepted" && (
                <>
                  <DropdownMenuItem onClick={() => setConfirmDialog("convert")}>
                    <Send className="h-4 w-4 mr-2" />
                    Convert to Invoice
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {quote.status === "pending" && (
                <>
                  <DropdownMenuItem onClick={generateQuoteLink} disabled={isGeneratingLink}>
                    <Link className="h-4 w-4 mr-2" />
                    {isGeneratingLink ? "Generating..." : "Send to Customer"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="mr-2 h-5 w-5" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quote.customer && (
              <div className="space-y-2">
                <div className="font-semibold">
                  {quote.customer.firstName} {quote.customer.lastName}
                </div>
                {quote.customer.company && (
                  <div>{quote.customer.company}</div>
                )}
                {quote.customer.email && (
                  <div>
                    <a href={`mailto:${quote.customer.email}`} className="text-primary hover:underline">
                      {quote.customer.email}
                    </a>
                  </div>
                )}
                {quote.customer.phone && (
                  <div>
                    <a href={`tel:${quote.customer.phone}`} className="text-primary hover:underline">
                      {quote.customer.phone}
                    </a>
                  </div>
                )}
                {quote.customer.address && (
                  <div className="text-muted-foreground">
                    {quote.customer.address}
                    {quote.customer.city && `, ${quote.customer.city}`}
                    {quote.customer.state && `, ${quote.customer.state}`}
                    {quote.customer.zip && ` ${quote.customer.zip}`}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5" />
              Quote Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quote Number:</span>
                <span className="font-medium">{quote.quoteNumber}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">{formatDate(quote.createdAt)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valid Until:</span>
                <span className="font-medium">
                  {quote.validUntil ? formatDate(quote.validUntil) : "N/A"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span>{getStatusBadge(quote.status)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {quote.job && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="mr-2 h-5 w-5" />
                Related Job
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="font-semibold">{quote.job.title}</div>
                {quote.job.description && (
                  <div className="text-muted-foreground">{quote.job.description}</div>
                )}
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/jobs/${quote.job.id}`)}
                  >
                    View Job
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {quote.convertedToInvoiceId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Converted to Invoice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="font-semibold">
                  This quote has been converted to an invoice.
                </div>
                <div className="pt-2">
                  <Button
                    onClick={() => navigate(`/invoices/${quote.convertedToInvoiceId}`)}
                  >
                    View Invoice
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quote Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.items?.map((item: any, index: number) => (
                <TableRow key={index}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">Subtotal</TableCell>
                <TableCell className="text-right">{formatCurrency(quote.amount)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">Tax</TableCell>
                <TableCell className="text-right">{formatCurrency(quote.tax || 0)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(quote.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap">{quote.notes}</div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialogs */}
      <Dialog open={confirmDialog === "accept"} onOpenChange={() => setConfirmDialog("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Quote</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this quote as accepted? This will indicate that the customer has agreed to the terms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog("")}>Cancel</Button>
            <Button onClick={handleAccept}>Accept Quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog === "decline"} onOpenChange={() => setConfirmDialog("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Quote</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this quote as declined? This will indicate that the customer has rejected the terms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog("")}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline}>Decline Quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog === "convert"} onOpenChange={() => setConfirmDialog("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to convert this quote to an invoice? This will create a new invoice with the same items and amounts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog("")}>Cancel</Button>
            <Button onClick={handleConvertToInvoice}>Convert to Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog === "send"} onOpenChange={() => setConfirmDialog("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Quote to Customer</DialogTitle>
            <DialogDescription>
              Share this link with your customer so they can view, accept, or decline the quote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {quoteLink && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={quoteLink}
                  className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyToClipboard}
                >
                  {linkCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
            {quote?.customer?.email && (
              <div className="pt-2">
                <p className="text-sm text-muted-foreground mb-2">
                  Or send directly via email:
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const subject = encodeURIComponent(`Quote #${quote.quoteNumber} from ${quote.business?.name || 'Your Business'}`);
                    const body = encodeURIComponent(`Hi ${quote.customer?.firstName},\n\nPlease review the quote we prepared for you:\n\n${quoteLink}\n\nLet us know if you have any questions!\n\nBest regards`);
                    window.open(`mailto:${quote.customer?.email}?subject=${subject}&body=${body}`, '_blank');
                  }}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send via Email
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setConfirmDialog("")}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}