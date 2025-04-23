import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileEdit, Printer, ArrowLeft, Send, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const quoteId = parseInt(id);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");

  const { data: quote, isLoading, isError } = useQuery({
    queryKey: ["/api/quotes", quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
  });

  const { data: customer } = useQuery({
    queryKey: ["/api/customers", quote?.customerId],
    queryFn: async () => {
      if (!quote?.customerId) return null;
      const res = await fetch(`/api/customers/${quote.customerId}`);
      if (!res.ok) throw new Error("Failed to fetch customer");
      return res.json();
    },
    enabled: !!quote?.customerId,
  });

  const { data: job } = useQuery({
    queryKey: ["/api/jobs", quote?.jobId],
    queryFn: async () => {
      if (!quote?.jobId) return null;
      const res = await fetch(`/api/jobs/${quote.jobId}`);
      if (!res.ok) throw new Error("Failed to fetch job");
      return res.json();
    },
    enabled: !!quote?.jobId,
  });

  const convertQuoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/quotes/${quoteId}/convert`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to convert quote to invoice");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Quote Converted",
        description: "The quote has been converted to an invoice successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setIsConvertDialogOpen(false);
      // Optionally navigate to the new invoice
      if (data.id) {
        navigate(`/invoices/${data.id}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/quotes/${quoteId}`, { status });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update quote status");
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: `The quote status has been updated to ${newStatus}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId] });
      setIsStatusDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <div className="container mx-auto py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p>Error loading quote. It may have been deleted or you don't have permission to view it.</p>
          <button
            className="text-red-600 hover:text-red-800 underline mt-2"
            onClick={() => navigate("/quotes")}
          >
            Return to Quotes
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      case "accepted":
        return <Badge variant="success">Accepted</Badge>;
      case "declined":
        return <Badge variant="destructive">Declined</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      case "converted":
        return <Badge className="bg-blue-500">Converted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const openUpdateStatus = (status: string) => {
    setNewStatus(status);
    setIsStatusDialogOpen(true);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => navigate("/quotes")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            Quote #{quote.quoteNumber}
          </h1>
          {getStatusBadge(quote.status)}
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {quote.status !== "converted" && (
            <>
              <Button variant="outline" onClick={() => navigate(`/quotes/${quoteId}/edit`)}>
                <FileEdit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button 
                onClick={() => setIsConvertDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Send className="h-4 w-4 mr-2" />
                Convert to Invoice
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <div className="space-y-2">
                <p className="font-semibold">
                  {customer.firstName} {customer.lastName}
                </p>
                {customer.company && <p>{customer.company}</p>}
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>{customer.phone}</p>}
                {customer.address && (
                  <p>
                    {customer.address}
                    {customer.city && `, ${customer.city}`}
                    {customer.state && `, ${customer.state}`}
                    {customer.zip && ` ${customer.zip}`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Customer information not available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quote Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quote #:</span>
                <span>{quote.quoteNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span>{formatDate(quote.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valid Until:</span>
                <span>{quote.validUntil ? formatDate(quote.validUntil) : "N/A"}</span>
              </div>
              {quote.jobId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Related Job:</span>
                  <span>
                    <a
                      href={`/jobs/${quote.jobId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {job?.title || `Job #${quote.jobId}`}
                    </a>
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span>{getStatusBadge(quote.status)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quote.status === "pending" && (
              <>
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => openUpdateStatus("accepted")}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Accepted
                </Button>
                <Button 
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={() => openUpdateStatus("declined")}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Mark as Declined
                </Button>
              </>
            )}
            {quote.status === "accepted" && (
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => setIsConvertDialogOpen(true)}
                disabled={quote.status === "converted"}
              >
                <Send className="h-4 w-4 mr-2" />
                Convert to Invoice
              </Button>
            )}
            {quote.status === "converted" && quote.convertedToInvoiceId && (
              <Button 
                className="w-full"
                onClick={() => navigate(`/invoices/${quote.convertedToInvoiceId}`)}
              >
                View Invoice
              </Button>
            )}
          </CardContent>
        </Card>
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
              {quote.items && quote.items.length > 0 ? (
                quote.items.map((item: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    No items found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex flex-col items-end">
          <div className="space-y-1 text-right">
            <div className="text-sm">
              Subtotal: {formatCurrency(quote.amount)}
            </div>
            <div className="text-sm">
              Tax: {formatCurrency(quote.tax || 0)}
            </div>
            <div className="text-lg font-semibold">
              Total: {formatCurrency(quote.total)}
            </div>
          </div>
        </CardFooter>
      </Card>

      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{quote.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Convert to Invoice Dialog */}
      <AlertDialog
        open={isConvertDialogOpen}
        onOpenChange={setIsConvertDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new invoice based on this quote. The quote status
              will be updated to "converted".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => convertQuoteMutation.mutate()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {convertQuoteMutation.isPending ? "Converting..." : "Convert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Status Dialog */}
      <AlertDialog
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {newStatus === "accepted" ? "Mark Quote as Accepted?" : "Mark Quote as Declined?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {newStatus === "accepted" 
                ? "This indicates the customer has accepted the quote."
                : "This indicates the customer has declined the quote."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => updateStatusMutation.mutate(newStatus)}
              className={newStatus === "accepted" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {updateStatusMutation.isPending ? "Updating..." : `Mark as ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}