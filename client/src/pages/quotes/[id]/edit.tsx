import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { QuoteForm } from "@/components/quotes/QuoteForm";

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const quoteId = parseInt(id);

  const { data: quote, isLoading, isError } = useQuery({
    queryKey: ["/api/quotes", quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <div className="container mx-auto py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p>Error loading quote. It may have been deleted or you don't have permission to view it.</p>
          <button
            className="text-red-600 hover:text-red-800 underline mt-2"
            onClick={() => navigate("/quotes")}
          >
            Return to Quotes
          </button>
        </div>
      </div>
    );
  }

  // If quote is already converted, don't allow editing
  if (quote.status === "converted") {
    return (
      <div className="container mx-auto py-6">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
          <p>This quote has already been converted to an invoice and cannot be edited.</p>
          <button
            className="text-yellow-600 hover:text-yellow-800 underline mt-2"
            onClick={() => navigate("/quotes")}
          >
            Return to Quotes
          </button>
        </div>
      </div>
    );
  }

  // Transform items to match form format
  const formattedItems = quote.items.map((item: any) => ({
    ...item,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
  }));

  const defaultValues = {
    ...quote,
    items: formattedItems,
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Quote</h1>
        <p className="text-muted-foreground">
          Update the details for Quote #{quote.quoteNumber}
        </p>
      </div>

      <QuoteForm defaultValues={defaultValues} quoteId={quoteId} />
    </div>
  );
}