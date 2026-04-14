import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import PhoneNumbersManager from "@/components/settings/PhoneNumbersManager";
import NotificationSettingsPanel from "@/components/settings/NotificationSettings";
import ReviewSettings from "@/components/reviews/ReviewSettings";

export default function CommunicationSection({ activeTab }: { activeTab: string }) {
  const { user } = useAuth();
  const businessId = user?.businessId;

  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  if (activeTab === "phone-numbers") {
    return (
      <div className="space-y-4">
        {business && <PhoneNumbersManager businessId={business.id} />}
      </div>
    );
  }

  if (activeTab === "notifications") {
    return (
      <div className="space-y-4">
        {businessId && <NotificationSettingsPanel businessId={businessId} />}
      </div>
    );
  }

  if (activeTab === "reviews") {
    return (
      <div className="space-y-4">
        {businessId && <ReviewSettings businessId={businessId} />}
      </div>
    );
  }

  return null;
}
