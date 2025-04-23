import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { useQuery } from "@tanstack/react-query";

export default function Customers() {
  // We use a default business ID for demo purposes
  const businessId = 1;
  
  return (
    <PageLayout title="Customers">
      <div className="space-y-6">
        <CustomerTable businessId={businessId} />
      </div>
    </PageLayout>
  );
}
