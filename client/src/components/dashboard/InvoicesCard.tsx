import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface InvoicesCardProps {
  businessId?: number;
  limit?: number;
}

export function InvoicesCard({ businessId = 1, limit = 3 }: InvoicesCardProps) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['/api/invoices', { businessId }],
  });

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

  const limitedInvoices = limit && invoices ? invoices.slice(0, limit) : invoices;

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Recent Invoices</h3>
        <p className="text-sm text-gray-500 mt-1">Invoices from the past 7 days</p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-sm text-gray-500 mt-2">Loading invoices...</p>
          </div>
        ) : limitedInvoices && limitedInvoices.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {limitedInvoices.map((invoice: any) => (
              <li key={invoice.id}>
                <div className="px-4 py-4 flex items-center sm:px-6">
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center">
                        <p className="font-medium text-primary-600 truncate">
                          {invoice.invoiceNumber}
                        </p>
                        <div className="ml-2 flex-shrink-0 flex">
                          {getStatusBadge(invoice.status)}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center">
                        <p className="text-sm text-gray-500">
                          {invoice.customer?.firstName} {invoice.customer?.lastName} • 
                          {invoice.job?.title || 'Service'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                      <p className="font-medium text-gray-900">{formatCurrency(invoice.total)}</p>
                    </div>
                  </div>
                  <div className="ml-5 flex-shrink-0">
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No recent invoices found.</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-gray-50 px-4 py-4 sm:px-6 border-t border-gray-200">
        <div className="flex justify-between w-full">
          <Link href="/invoices" className="text-sm font-medium text-primary-600 hover:text-primary-700">
            View all invoices →
          </Link>
          <Link href="/invoices/create">
            <Button size="sm">Create Invoice</Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
