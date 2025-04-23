import { PageLayout } from "@/components/layout/PageLayout";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function CreateInvoice() {
  const [, navigate] = useLocation();
  
  return (
    <PageLayout title="Create Invoice">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          className="mr-4"
          onClick={() => navigate("/invoices")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Create New Invoice</h1>
      </div>
      
      <InvoiceForm />
    </PageLayout>
  );
}
