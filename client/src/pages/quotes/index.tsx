import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileEdit, MoreHorizontal, Trash, PlusCircle, ReceiptIcon, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function QuotesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteQuoteId, setDeleteQuoteId] = useState<number | null>(null);
  const [convertQuoteId, setConvertQuoteId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const { data: quotes, isLoading, isError } = useQuery({
    queryKey: ["/api/quotes"],
    queryFn: async () => {
      const res = await fetch("/api/quotes");
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/quotes/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete quote");
      }
      return res;
    },
    onSuccess: () => {
      toast({
        title: "Quote Deleted",
        description: "The quote has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      setDeleteQuoteId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const convertQuoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/quotes/${id}/convert`);
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
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setConvertQuoteId(null);
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

  // Filtered quotes based on status and search term
  const filteredQuotes = quotes
    ? quotes.filter((quote: any) => {
        const matchesStatus = filter === "all" || quote.status === filter;
        const customerName = customers?.find((c: any) => c.id === quote.customerId)
          ? `${customers.find((c: any) => c.id === quote.customerId).firstName} ${
              customers.find((c: any) => c.id === quote.customerId).lastName
            }`
          : "";
        const matchesSearch =
          !searchTerm ||
          quote.quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customerName.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
      })
    : [];

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

  const getCustomerName = (customerId: number) => {
    if (!customers) return "Loading...";
    const customer = customers.find((c: any) => c.id === customerId);
    return customer
      ? `${customer.firstName} ${customer.lastName}`
      : "Unknown Customer";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">
            Manage your quotes and convert them to invoices
          </p>
        </div>
        <Button onClick={() => navigate("/quotes/create")}>
          <PlusCircle className="h-4 w-4 mr-2" />
          New Quote
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Quotes</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-auto">
          <Input
            placeholder="Search quotes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-[250px]"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quote List</CardTitle>
          <CardDescription>
            Manage and track all your customer quotes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : isError ? (
            <div className="flex justify-center items-center h-64">
              <p className="text-red-500">
                Error loading quotes. Please try again.
              </p>
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-64 space-y-4">
              <ReceiptIcon className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No quotes found</p>
              <Button onClick={() => navigate("/quotes/create")}>
                Create a Quote
              </Button>
            </div>
          ) : (
            <Table>
              <TableCaption>A list of your quotes</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote: any) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">
                      <Link href={`/quotes/${quote.id}`} className="text-blue-600 hover:underline">
                        {quote.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{getCustomerName(quote.customerId)}</TableCell>
                    <TableCell>{formatDate(quote.createdAt)}</TableCell>
                    <TableCell>{quote.validUntil ? formatDate(quote.validUntil) : "N/A"}</TableCell>
                    <TableCell>{formatCurrency(quote.total)}</TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/quotes/${quote.id}`)}>
                            View Details
                          </DropdownMenuItem>
                          {quote.status !== "converted" && (
                            <>
                              <DropdownMenuItem onClick={() => navigate(`/quotes/${quote.id}/edit`)}>
                                <FileEdit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConvertQuoteId(quote.id)}>
                                <Send className="h-4 w-4 mr-2" />
                                Convert to Invoice
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem 
                            onClick={() => setDeleteQuoteId(quote.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteQuoteId !== null}
        onOpenChange={(open) => !open && setDeleteQuoteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              quote and all its items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteQuoteId && deleteQuoteMutation.mutate(deleteQuoteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteQuoteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert Confirmation Dialog */}
      <AlertDialog
        open={convertQuoteId !== null}
        onOpenChange={(open) => !open && setConvertQuoteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert Quote to Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new invoice based on this quote. The quote will be
              marked as converted and linked to the new invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => convertQuoteId && convertQuoteMutation.mutate(convertQuoteId)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {convertQuoteMutation.isPending ? "Converting..." : "Convert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}