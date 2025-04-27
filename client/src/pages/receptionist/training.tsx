import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import PageTitle from "@/components/PageTitle";
import { AppNav } from "@/components/navigation/AppNav";
import TrainingInterface from "@/components/receptionist/TrainingInterface";

export default function TrainingPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Virtual Receptionist Training | SmallBizAgent</title>
      </Helmet>

      <AppNav />

      <div className="container py-6">
        <PageTitle 
          title="Virtual Receptionist Training" 
          description="Train your virtual receptionist to better understand your business and customers"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Receptionist", href: "/receptionist" },
            { label: "Training", href: "/receptionist/training" }
          ]}
        />
        
        <Separator className="my-6" />
        
        <TrainingInterface />
      </div>
    </>
  );
}