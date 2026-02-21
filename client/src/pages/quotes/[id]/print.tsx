import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function PrintQuote() {
  const params = useParams();
  const { id } = params;

  const { data: quote, isLoading } = useQuery<any>({
    queryKey: [`/api/quotes/${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Quote not found</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'text-green-600';
      case 'declined': return 'text-red-600';
      case 'expired': return 'text-gray-500';
      case 'converted': return 'text-blue-600';
      default: return 'text-yellow-600';
    }
  };

  return (
    <div className="min-h-screen bg-white p-8 print:p-0">
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Print Button */}
      <div className="no-print mb-6 flex gap-4">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
        >
          Print Quote
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Back
        </button>
      </div>

      {/* Quote Content */}
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            {business?.logoUrl && (
              <img
                src={business.logoUrl}
                alt={business.name}
                className="h-16 w-auto object-contain mb-3"
              />
            )}
            <h1 className="text-3xl font-bold text-gray-900">QUOTE</h1>
            <p className="text-gray-600 mt-1">#{quote.quoteNumber}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-semibold text-gray-900">{business?.name || "Your Business"}</h2>
            {business?.address && <p className="text-gray-600">{business.address}</p>}
            {business?.city && business?.state && (
              <p className="text-gray-600">{business.city}, {business.state} {business.zip}</p>
            )}
            {business?.phone && <p className="text-gray-600">{business.phone}</p>}
            {business?.email && <p className="text-gray-600">{business.email}</p>}
          </div>
        </div>

        {/* Prepared For */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Prepared For</h3>
            <p className="font-medium text-gray-900">
              {quote.customer?.firstName} {quote.customer?.lastName}
            </p>
            {quote.customer?.email && (
              <p className="text-gray-600">{quote.customer.email}</p>
            )}
            {quote.customer?.phone && (
              <p className="text-gray-600">{quote.customer.phone}</p>
            )}
            {quote.customer?.address && (
              <p className="text-gray-600">
                {quote.customer.address}
                {quote.customer.city && `, ${quote.customer.city}`}
                {quote.customer.state && `, ${quote.customer.state}`}
                {quote.customer.zip && ` ${quote.customer.zip}`}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="mb-2">
              <span className="text-sm font-semibold text-gray-500 uppercase">Quote Date</span>
              <p className="text-gray-900">{formatDate(quote.createdAt)}</p>
            </div>
            {quote.validUntil && (
              <div className="mb-2">
                <span className="text-sm font-semibold text-gray-500 uppercase">Valid Until</span>
                <p className="text-gray-900">{formatDate(quote.validUntil)}</p>
              </div>
            )}
            <div>
              <span className="text-sm font-semibold text-gray-500 uppercase">Status</span>
              <p className={`font-medium ${getStatusColor(quote.status)}`}>
                {quote.status?.toUpperCase()}
              </p>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 text-sm font-semibold text-gray-600">Description</th>
              <th className="text-right py-3 text-sm font-semibold text-gray-600">Qty</th>
              <th className="text-right py-3 text-sm font-semibold text-gray-600">Unit Price</th>
              <th className="text-right py-3 text-sm font-semibold text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.items?.map((item: any, index: number) => (
              <tr key={index} className="border-b border-gray-100">
                <td className="py-3 text-gray-900">{item.description}</td>
                <td className="py-3 text-right text-gray-600">{item.quantity}</td>
                <td className="py-3 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                <td className="py-3 text-right text-gray-900">{formatCurrency(item.amount || item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64">
            <div className="flex justify-between py-2">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900">{formatCurrency(quote.amount || quote.total)}</span>
            </div>
            {(quote.tax || 0) > 0 && (
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-900">{formatCurrency(quote.tax)}</span>
              </div>
            )}
            <div className="flex justify-between py-3 border-t-2 border-gray-200 font-bold">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">{formatCurrency(quote.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Notes</h3>
            <p className="text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>Thank you for considering our services!</p>
        </div>
      </div>
    </div>
  );
}
