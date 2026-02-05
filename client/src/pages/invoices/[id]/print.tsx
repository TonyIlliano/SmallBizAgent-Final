import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function PrintInvoice() {
  const params = useParams();
  const { id } = params;

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: [`/api/invoices/${id}`],
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

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Invoice not found</p>
      </div>
    );
  }

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
          Print Invoice
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Close
        </button>
      </div>

      {/* Invoice Content */}
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">INVOICE</h1>
            <p className="text-gray-600 mt-1">#{invoice.invoiceNumber}</p>
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

        {/* Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To</h3>
            <p className="font-medium text-gray-900">
              {invoice.customer?.firstName} {invoice.customer?.lastName}
            </p>
            {invoice.customer?.email && (
              <p className="text-gray-600">{invoice.customer.email}</p>
            )}
            {invoice.customer?.phone && (
              <p className="text-gray-600">{invoice.customer.phone}</p>
            )}
            {invoice.customer?.address && (
              <p className="text-gray-600">{invoice.customer.address}</p>
            )}
          </div>
          <div className="text-right">
            <div className="mb-2">
              <span className="text-sm font-semibold text-gray-500 uppercase">Invoice Date</span>
              <p className="text-gray-900">{formatDate(invoice.createdAt)}</p>
            </div>
            {invoice.dueDate && (
              <div className="mb-2">
                <span className="text-sm font-semibold text-gray-500 uppercase">Due Date</span>
                <p className="text-gray-900">{formatDate(invoice.dueDate)}</p>
              </div>
            )}
            <div>
              <span className="text-sm font-semibold text-gray-500 uppercase">Status</span>
              <p className={`font-medium ${
                invoice.status === 'paid' ? 'text-green-600' :
                invoice.status === 'overdue' ? 'text-red-600' : 'text-yellow-600'
              }`}>
                {invoice.status?.toUpperCase()}
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
              <th className="text-right py-3 text-sm font-semibold text-gray-600">Rate</th>
              <th className="text-right py-3 text-sm font-semibold text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item: any, index: number) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-3 text-gray-900">{item.description}</td>
                  <td className="py-3 text-right text-gray-600">{item.quantity}</td>
                  <td className="py-3 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-3 text-right text-gray-900">{formatCurrency(item.quantity * item.unitPrice)}</td>
                </tr>
              ))
            ) : (
              <tr className="border-b border-gray-100">
                <td className="py-3 text-gray-900">{invoice.job?.title || "Services Rendered"}</td>
                <td className="py-3 text-right text-gray-600">1</td>
                <td className="py-3 text-right text-gray-600">{formatCurrency(invoice.subtotal || invoice.total)}</td>
                <td className="py-3 text-right text-gray-900">{formatCurrency(invoice.subtotal || invoice.total)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64">
            <div className="flex justify-between py-2">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900">{formatCurrency(invoice.subtotal || invoice.total)}</span>
            </div>
            {invoice.tax > 0 && (
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-900">{formatCurrency(invoice.tax)}</span>
              </div>
            )}
            <div className="flex justify-between py-3 border-t-2 border-gray-200 font-bold">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">{formatCurrency(invoice.total)}</span>
            </div>
            {invoice.status === 'paid' && (
              <div className="flex justify-between py-2 text-green-600">
                <span>Amount Paid</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Notes</h3>
            <p className="text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>Thank you for your business!</p>
        </div>
      </div>
    </div>
  );
}
