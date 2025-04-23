import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { PlusCircle, FileText, Download, Edit, Printer } from "lucide-react";
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
  
  // Build query parameters
  const queryParams: any = { businessId: 1 };
  if (statusFilter) {
    queryParams.status = statusFilter;
  }
  
  // Fetch invoices
  const { data: invoices, isLoading } = useQuery({
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
          <Button 
            variant="ghost" 
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              // Handle download
              window.alert('Download invoice feature would go here');
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              // Handle print
              window.alert('Print invoice feature would go here');
            }}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              // Navigate to edit page
              navigate(`/invoices/${invoice.id}`);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
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
                <SelectItem value="">All Invoices</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent"></div>
          </div>
        ) : invoices && invoices.length > 0 ? (
          <DataTable
            columns={columns}
            data={invoices}
            onRowClick={(invoice) => {
              // View invoice details
              window.alert(`View invoice ${invoice.invoiceNumber} details`);
            }}
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
