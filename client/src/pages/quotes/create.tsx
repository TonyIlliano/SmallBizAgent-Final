import { useLocation } from "wouter";
import { QuoteForm } from "@/components/quotes/QuoteForm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export default function CreateQuotePage() {
  const [, navigate] = useLocation();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center">
        <Button variant="outline" onClick={() => navigate("/quotes")} className="mr-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Quotes
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Quote</h1>
          <p className="text-muted-foreground">
            Create a new quote for your customer
          </p>
        </div>
      </div>

      <QuoteForm />
    </div>
  );
}