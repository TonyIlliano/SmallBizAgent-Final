import { PageLayout } from "@/components/layout/PageLayout";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { useAuth } from "@/hooks/use-auth";

export default function Customers() {
  const { user } = useAuth();
  const businessId = user?.businessId;

  return (
    <PageLayout title="Customers">
      <div className="space-y-6">
        <CustomerTable businessId={businessId} />
      </div>
    </PageLayout>
  );
}
