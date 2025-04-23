import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { QuoteForm } from "@/components/quotes/QuoteForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function EditQuote() {
  const [match, params] = useRoute("/quotes/:id/edit");
  const [, navigate] = useLocation();
  const quoteId = params?.id ? parseInt(params.id) : 0;

  const { data: quote, isLoading, error } = useQuery({
    queryKey: ["/api/quotes", quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!quoteId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Quote not found</h1>
          <p className="text-muted-foreground mt-2">
            The quote you're looking for doesn't exist or you don't have
            permission to view it.
          </p>
          <Button onClick={() => navigate("/quotes")} className="mt-4">
            Back to Quotes
          </Button>
        </div>
      </div>
    );
  }

  // If the quote was already converted to an invoice, redirect to view the quote instead of editing
  if (quote.status === "converted") {
    navigate(`/quotes/${quoteId}`);
    return null;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <Button variant="outline" onClick={() => navigate(`/quotes/${quoteId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Quote
        </Button>
      </div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Edit Quote</h1>
        <p className="text-muted-foreground mt-2">
          Update the quote details below.
        </p>
      </div>
      <QuoteForm
        defaultValues={{
          customerId: quote.customerId,
          jobId: quote.jobId,
          quoteNumber: quote.quoteNumber,
          items: quote.items.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          validUntil: quote.validUntil ? new Date(quote.validUntil) : null,
          notes: quote.notes,
        }}
        quoteId={quoteId}
      />
    </div>
  );
}