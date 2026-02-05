import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function CustomerDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const customerId = params.id;
  const isNew = customerId === "new";
  
  // Fetch customer data if editing existing customer
  const { data: customer, isLoading, error } = useQuery<any>({
    queryKey: ['/api/customers', parseInt(customerId || "0")],
    enabled: !isNew && !!customerId,
  });
  
  // Handle loading state
  if (!isNew && isLoading) {
    return (
      <PageLayout title="Customer Details">
        <div className="flex items-center mb-6">
          <Button 
            variant="ghost" 
            className="mr-4"
            onClick={() => navigate("/customers")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Loading Customer...</h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent"></div>
        </div>
      </PageLayout>
    );
  }
  
  // Handle error state
  if (!isNew && error) {
    return (
      <PageLayout title="Customer Details">
        <div className="flex items-center mb-6">
          <Button 
            variant="ghost" 
            className="mr-4"
            onClick={() => navigate("/customers")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Customer Not Found</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800">
          We couldn't find the customer you're looking for. They may have been deleted or you might have followed an invalid link.
        </div>
        <div className="mt-4">
          <Button onClick={() => navigate("/customers")}>
            Return to Customers
          </Button>
        </div>
      </PageLayout>
    );
  }
  
  return (
    <PageLayout title="Customer Details">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          className="mr-4"
          onClick={() => navigate("/customers")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">
          {isNew ? "Add New Customer" : `Edit Customer: ${customer?.firstName} ${customer?.lastName}`}
        </h1>
      </div>
      
      <CustomerForm 
        customer={customer} 
        isEdit={!isNew}
      />
    </PageLayout>
  );
}
