import { PageLayout } from "@/components/layout/PageLayout";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { useAuth } from "@/hooks/use-auth";
import { FeatureTip } from "@/components/ui/feature-tip";
import { Phone } from "lucide-react";

export default function Customers() {
  const { user } = useAuth();
  const businessId = user?.businessId;

  return (
    <PageLayout title="Customers">
      <div className="space-y-6">
        <FeatureTip
          tipId="customers-auto-add"
          title="Customers are added automatically"
          description="When someone calls your AI receptionist or books online, they're automatically added here. You can also add customers manually."
          icon={Phone}
        />
        <CustomerTable businessId={businessId} />
      </div>
    </PageLayout>
  );
}
