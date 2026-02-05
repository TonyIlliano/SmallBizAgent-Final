import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, ArrowRight, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton-loader";

interface InvoicesCardProps {
  businessId?: number | null;
  limit?: number;
}

export function InvoicesCard({ businessId, limit = 3 }: InvoicesCardProps) {
  const { data: invoices = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/invoices', { businessId }],
    enabled: !!businessId,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs font-medium">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs font-medium">Pending</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs font-medium">Overdue</Badge>;
      default:
        return <Badge className="text-xs font-medium">{status}</Badge>;
    }
  };

  const limitedInvoices = limit && invoices ? invoices.slice(0, limit) : invoices;

  return (
    <Card className="border-border bg-card shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Recent Invoices</h3>
              <p className="text-sm text-muted-foreground">Last 7 days</p>
            </div>
          </div>
          <Link href="/invoices/create">
            <Button size="sm" className="h-9 rounded-lg">
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        ) : limitedInvoices && limitedInvoices.length > 0 ? (
          <ul className="divide-y divide-border">
            {limitedInvoices.map((invoice: any) => (
              <li key={invoice.id}>
                <Link href={`/invoices/${invoice.id}`}>
                  <div className="px-4 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {invoice.invoiceNumber}
                        </p>
                        {getStatusBadge(invoice.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {invoice.customer?.firstName} {invoice.customer?.lastName}
                        {invoice.job?.title && ` • ${invoice.job.title}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-bold text-foreground">{formatCurrency(invoice.total)}</p>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="p-4 rounded-full bg-muted mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No recent invoices</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-[200px]">
              Create your first invoice to get started
            </p>
          </div>
        )}
      </CardContent>
      {invoices && invoices.length > 0 && (
        <CardFooter className="bg-muted/50 px-4 py-3 border-t border-border">
          <Link href="/invoices">
            <Button variant="ghost" size="sm" className="h-9 text-foreground hover:bg-muted group">
              View all invoices
              <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
