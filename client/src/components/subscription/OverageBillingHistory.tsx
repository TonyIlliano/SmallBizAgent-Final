import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Clock, FileText } from 'lucide-react';

interface OverageCharge {
  id: number;
  businessId: number;
  periodStart: string;
  periodEnd: string;
  minutesUsed: number;
  minutesIncluded: number;
  overageMinutes: number;
  overageRate: number;
  overageAmount: number;
  stripeInvoiceId: string | null;
  stripeInvoiceUrl: string | null;
  status: string;
  failureReason: string | null;
  planName: string | null;
  planTier: string | null;
  createdAt: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPeriod(start: string, end: string): string {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
    case 'invoiced':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Invoiced</Badge>;
    case 'failed':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>;
    case 'no_overage':
      return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">No Overage</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function OverageBillingHistory({ businessId }: { businessId: number }) {
  const { data, isLoading, error } = useQuery<{ charges: OverageCharge[] }>({
    queryKey: ['/api/subscription/overage-history', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/subscription/overage-history/${businessId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch overage history');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <Clock className="h-4 w-4 animate-spin" />
        Loading billing history...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-500 py-4">
        Failed to load billing history.
      </p>
    );
  }

  const charges = data?.charges || [];

  // Filter out no_overage records for cleaner display
  const billedCharges = charges.filter(c => c.status !== 'no_overage');

  if (billedCharges.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
        <FileText className="h-8 w-8" />
        <p className="text-sm">No overage charges yet.</p>
        <p className="text-xs">
          If you exceed your plan's included minutes, charges will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2 font-medium">Period</th>
            <th className="text-right py-2 font-medium">Used</th>
            <th className="text-right py-2 font-medium">Included</th>
            <th className="text-right py-2 font-medium">Overage</th>
            <th className="text-right py-2 font-medium">Rate</th>
            <th className="text-right py-2 font-medium">Amount</th>
            <th className="text-center py-2 font-medium">Status</th>
            <th className="text-center py-2 font-medium">Invoice</th>
          </tr>
        </thead>
        <tbody>
          {billedCharges.map(charge => (
            <tr key={charge.id} className="border-b last:border-0">
              <td className="py-3 text-left">
                {formatPeriod(charge.periodStart, charge.periodEnd)}
              </td>
              <td className="py-3 text-right">{charge.minutesUsed} min</td>
              <td className="py-3 text-right">{charge.minutesIncluded} min</td>
              <td className="py-3 text-right font-medium text-orange-600">
                {charge.overageMinutes} min
              </td>
              <td className="py-3 text-right">${charge.overageRate.toFixed(2)}/min</td>
              <td className="py-3 text-right font-semibold">
                ${charge.overageAmount.toFixed(2)}
              </td>
              <td className="py-3 text-center">
                <StatusBadge status={charge.status} />
              </td>
              <td className="py-3 text-center">
                {charge.stripeInvoiceUrl ? (
                  <a
                    href={charge.stripeInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
