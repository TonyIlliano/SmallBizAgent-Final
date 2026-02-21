import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";

export default function EditInvoice() {
  const [match, params] = useRoute("/invoices/:id/edit");
  const [, navigate] = useLocation();
  const invoiceId = params?.id ? parseInt(params.id) : 0;

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ["/api/invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!invoiceId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invoice) {
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

  if (invoice.status === "paid") {
    navigate(`/invoices/${invoiceId}`);
    return null;
  }

  return (
    <PageLayout title="Edit Invoice">
      <div className="flex items-center mb-6">
        <Button
          variant="ghost"
          className="mr-4"
          onClick={() => navigate(`/invoices/${invoiceId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoice
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Invoice #{invoice.invoiceNumber}</h1>
          <p className="text-muted-foreground">Update the invoice details below.</p>
        </div>
      </div>

      <InvoiceForm invoice={invoice} isEdit={true} />
    </PageLayout>
  );
}
