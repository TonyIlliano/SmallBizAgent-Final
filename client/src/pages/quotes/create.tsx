import { QuoteForm } from "@/components/quotes/QuoteForm";

export default function CreateQuotePage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Quote</h1>
        <p className="text-muted-foreground">
          Create a new quote for your customer
        </p>
      </div>

      <QuoteForm />
    </div>
  );
}