import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { PlusCircle, FileText, Download, Edit, Printer, MessageSquare, Share2, Copy, Check, MoreVertical, ChevronRight as ChevronRightIcon } from "lucide-react";
import { SkeletonTable } from "@/components/ui/skeleton-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Invoices() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const businessId = user?.businessId;

  // Generate shareable link mutation
  const generateLinkMutation = useMutation({
    mutationFn: (invoiceId: number) =>
      apiRequest("POST", `/api/invoices/${invoiceId}/generate-link`),
    onSuccess: async (response: any, invoiceId: number) => {
      const data = await response.json();
      // Copy to clipboard
      await navigator.clipboard.writeText(data.publicUrl);
      setCopiedId(invoiceId);
      setTimeout(() => setCopiedId(null), 2000);

      toast({
        title: "Link Created & Copied!",
        description: "Payment link has been copied to clipboard",
      });

      // Refresh invoices to show link status
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Generate Link",
        description: error?.message || "Could not generate payment link",
        variant: "destructive",
      });
    },
  });

  // Send payment reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: (invoiceId: number) =>
      apiRequest("POST", `/api/invoices/${invoiceId}/send-reminder`),
    onSuccess: () => {
      toast({
        title: "Reminder Sent",
        description: "Payment reminder sent to customer",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send reminder",
        variant: "destructive",
      });
    },
  });

  // Build query parameters
  const queryParams: any = { businessId };
  if (statusFilter) {
    queryParams.status = statusFilter;
  }
  
  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/invoices', queryParams],
  });
  
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
  
  // Table columns
  const columns = [
    {
      header: "Invoice",
      accessorKey: "invoiceNumber",
      cell: (invoice: any) => (
        <div>
          <div className="font-medium text-primary-600">{invoice.invoiceNumber}</div>
          <div className="text-sm text-gray-500">{formatDate(invoice.createdAt)}</div>
        </div>
      ),
    },
    {
      header: "Customer",
      accessorKey: "customer",
      cell: (invoice: any) => (
        <div>
          <div className="font-medium">
            {invoice.customer?.firstName} {invoice.customer?.lastName}
          </div>
          <div className="text-sm text-gray-500">
            {invoice.customer?.phone}
          </div>
        </div>
      ),
    },
    {
      header: "Amount",
      accessorKey: "total",
      cell: (invoice: any) => (
        <div className="font-medium">
          {formatCurrency(invoice.total)}
        </div>
      ),
    },
    {
      header: "Due Date",
      accessorKey: "dueDate",
      cell: (invoice: any) => invoice.dueDate ? formatDate(invoice.dueDate) : 'N/A',
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (invoice: any) => getStatusBadge(invoice.status),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      cell: (invoice: any) => (
        <div className="flex items-center space-x-2">
          {(invoice.status === 'pending' || invoice.status === 'overdue') && (
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/invoices/pay/${invoice.id}`);
              }}
            >
              Pay Now
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(invoice.status === 'pending' || invoice.status === 'overdue') && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    sendReminderMutation.mutate(invoice.id);
                  }}
                  disabled={sendReminderMutation.isPending}
                >
                  <MessageSquare className="h-4 w-4 mr-2" /> Send Reminder
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  generateLinkMutation.mutate(invoice.id);
                }}
              >
                <Share2 className="h-4 w-4 mr-2" /> Copy Payment Link
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`/invoices/${invoice.id}/print`, '_blank');
                }}
              >
                <Download className="h-4 w-4 mr-2" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  const printWindow = window.open(`/invoices/${invoice.id}/print`, '_blank');
                  if (printWindow) {
                    printWindow.onload = () => printWindow.print();
                  }
                }}
              >
                <Printer className="h-4 w-4 mr-2" /> Print
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/invoices/${invoice.id}`);
                }}
              >
                <Edit className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
  
  return (
    <PageLayout title="Invoices">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Invoice Management</h2>
          <p className="text-gray-500">Manage all your invoices and payments</p>
        </div>
        <Link href="/invoices/create">
          <Button className="flex items-center">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </Link>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-medium">All Invoices</h3>
          
          <div className="w-64">
            <Select 
              value={statusFilter} 
              onValueChange={setStatusFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invoices</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : invoices && invoices.length > 0 ? (
          <DataTable
            columns={columns}
            data={invoices}
            onRowClick={(invoice) => {
              navigate(`/invoices/${invoice.id}`);
            }}
            mobileCard={(invoice: any) => (
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{invoice.invoiceNumber}</div>
                    <div className="text-sm text-muted-foreground">
                      {invoice.customer?.firstName} {invoice.customer?.lastName}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="font-semibold">{formatCurrency(invoice.total)}</div>
                    <div className="mt-1">{getStatusBadge(invoice.status)}</div>
                  </div>
                </div>
                {(invoice.status === 'pending' || invoice.status === 'overdue') && (
                  <div className="mt-3">
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/invoices/pay/${invoice.id}`);
                      }}
                    >
                      Pay Now
                    </Button>
                  </div>
                )}
              </div>
            )}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center h-64">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No invoices found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {statusFilter ? 
                `There are no invoices with status "${statusFilter}".` : 
                "There are no invoices in the system yet."}
            </p>
            <Link href="/invoices/create">
              <Button className="mt-4">
                Create Your First Invoice
              </Button>
            </Link>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
