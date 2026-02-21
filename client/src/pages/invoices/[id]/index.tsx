import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLayout } from "@/components/layout/PageLayout";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Edit,
  Printer,
  FileText,
  MoreHorizontal,
  User,
  Link,
  Copy,
  Mail,
  Check,
  DollarSign,
  MessageSquare,
  Loader2,
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
} from "@/components/ui/dialog";

export default function InvoiceDetail() {
  const [match, params] = useRoute("/invoices/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invoiceId = params?.id ? parseInt(params.id) : 0;
  const [confirmDialog, setConfirmDialog] = useState("");

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["/api/invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!invoiceId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      const res = await apiRequest("PUT", `/api/invoices/${invoiceId}`, { status });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });
      toast({
        title: "Invoice updated",
        description: "The invoice status has been updated successfully",
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

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/send-reminder`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send reminder");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Reminder sent",
        description: "Payment reminder sent to customer",
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

  const [invoiceLink, setInvoiceLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const generateInvoiceLink = async () => {
    try {
      setIsGeneratingLink(true);
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/generate-link`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate link");
      }
      const data = await res.json();
      setInvoiceLink(data.publicUrl);
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
    if (invoiceLink) {
      await navigator.clipboard.writeText(invoiceLink);
      setLinkCopied(true);
      toast({
        title: "Link copied",
        description: "Payment link copied to clipboard",
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

  if (!invoice) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Invoice not found</h1>
          <p className="text-muted-foreground mt-2">
            The invoice you're looking for doesn't exist or you don't have
            permission to view it.
          </p>
          <Button onClick={() => navigate("/invoices")} className="mt-4">
            Back to Invoices
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500 hover:bg-green-600">Paid</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>;
      case "overdue":
        return <Badge variant="destructive">Overdue</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleMarkPaid = () => {
    updateStatusMutation.mutate({ status: "paid" });
    setConfirmDialog("");
  };

  return (
    <PageLayout title="Invoice Details">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="outline" onClick={() => navigate("/invoices")} className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Invoices
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Invoice #{invoice.invoiceNumber}</h1>
              <div className="flex items-center mt-1 space-x-4">
                <div className="text-muted-foreground">
                  {formatDate(invoice.createdAt)}
                </div>
                {getStatusBadge(invoice.status)}
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            {invoice.status !== "paid" && (
              <Button
                variant="outline"
                onClick={() => navigate(`/invoices/${invoiceId}/edit`)}
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
                <DropdownMenuLabel>Invoice Actions</DropdownMenuLabel>
                {invoice.status !== "paid" && (
                  <>
                    <DropdownMenuItem onClick={() => setConfirmDialog("markPaid")}>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Mark as Paid
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={generateInvoiceLink} disabled={isGeneratingLink}>
                      <Link className="h-4 w-4 mr-2" />
                      {isGeneratingLink ? "Generating..." : "Send to Customer"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => sendReminderMutation.mutate()}
                      disabled={sendReminderMutation.isPending}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send Payment Reminder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => window.open(`/invoices/${invoiceId}/print`, '_blank')}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Invoice
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
              {invoice.customer && (
                <div className="space-y-2">
                  <div className="font-semibold">
                    {invoice.customer.firstName} {invoice.customer.lastName}
                  </div>
                  {invoice.customer.company && (
                    <div>{invoice.customer.company}</div>
                  )}
                  {invoice.customer.email && (
                    <div>
                      <a href={`mailto:${invoice.customer.email}`} className="text-primary hover:underline">
                        {invoice.customer.email}
                      </a>
                    </div>
                  )}
                  {invoice.customer.phone && (
                    <div>
                      <a href={`tel:${invoice.customer.phone}`} className="text-primary hover:underline">
                        {invoice.customer.phone}
                      </a>
                    </div>
                  )}
                  {invoice.customer.address && (
                    <div className="text-muted-foreground">
                      {invoice.customer.address}
                      {invoice.customer.city && `, ${invoice.customer.city}`}
                      {invoice.customer.state && `, ${invoice.customer.state}`}
                      {invoice.customer.zip && ` ${invoice.customer.zip}`}
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
                Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice Number:</span>
                  <span className="font-medium">{invoice.invoiceNumber}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{formatDate(invoice.createdAt)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due Date:</span>
                  <span className="font-medium">
                    {invoice.dueDate ? formatDate(invoice.dueDate) : "N/A"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span>{getStatusBadge(invoice.status)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="mr-2 h-5 w-5" />
                Payment Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoice.amount || invoice.subtotal || invoice.total)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax:</span>
                  <span className="font-medium">{formatCurrency(invoice.tax || 0)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(invoice.total)}</span>
                </div>
                {invoice.status === "paid" && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Amount Paid:</span>
                      <span>{formatCurrency(invoice.total)}</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
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
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.amount || item.quantity * item.unitPrice)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell>{invoice.job?.title || "Services Rendered"}</TableCell>
                    <TableCell className="text-right">1</TableCell>
                    <TableCell className="text-right">{formatCurrency(invoice.amount || invoice.total)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(invoice.amount || invoice.total)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-medium">Subtotal</TableCell>
                  <TableCell className="text-right">{formatCurrency(invoice.amount || invoice.subtotal || invoice.total)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-medium">Tax</TableCell>
                  <TableCell className="text-right">{formatCurrency(invoice.tax || 0)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(invoice.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap">{invoice.notes}</div>
            </CardContent>
          </Card>
        )}

        {/* Mark as Paid Dialog */}
        <Dialog open={confirmDialog === "markPaid"} onOpenChange={() => setConfirmDialog("")}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark Invoice as Paid</DialogTitle>
              <DialogDescription>
                Are you sure you want to mark invoice #{invoice.invoiceNumber} as paid? This will update the invoice status and notify the customer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialog("")}>Cancel</Button>
              <Button onClick={handleMarkPaid}>Mark as Paid</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send to Customer Dialog */}
        <Dialog open={confirmDialog === "send"} onOpenChange={() => setConfirmDialog("")}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send Invoice to Customer</DialogTitle>
              <DialogDescription>
                Share this payment link with your customer so they can view and pay the invoice online.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {invoiceLink && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={invoiceLink}
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
              {invoice?.customer?.email && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">
                    Or send directly via email:
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const subject = encodeURIComponent(`Invoice #${invoice.invoiceNumber} from ${invoice.business?.name || 'Your Business'}`);
                      const body = encodeURIComponent(`Hi ${invoice.customer?.firstName},\n\nPlease find your invoice below:\n\n${invoiceLink}\n\nYou can view the invoice and make a payment using the link above.\n\nThank you for your business!`);
                      window.open(`mailto:${invoice.customer?.email}?subject=${subject}&body=${body}`, '_blank');
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
    </PageLayout>
  );
}
