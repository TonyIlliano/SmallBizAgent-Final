import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AppointmentDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const appointmentId = params.id;
  const isNew = appointmentId === "new";
  const numericId = parseInt(appointmentId || "0");

  // Fetch appointment data if editing existing appointment
  const { data: appointment, isLoading, error } = useQuery<any>({
    queryKey: [`/api/appointments/${numericId}`],
    enabled: !isNew && !!appointmentId && numericId > 0,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/appointments/${numericId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Appointment Deleted",
        description: "The appointment has been cancelled and removed.",
      });
      navigate("/appointments");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete appointment",
        variant: "destructive",
      });
    },
  });

  // Handle loading state
  if (!isNew && isLoading) {
    return (
      <PageLayout title="Appointment Details">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            className="mr-4"
            onClick={() => navigate("/appointments")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Loading Appointment...</h1>
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
      <PageLayout title="Appointment Details">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            className="mr-4"
            onClick={() => navigate("/appointments")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Error Loading Appointment</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load appointment. It may have been deleted or you may not have access to it.</p>
          <Button
            className="mt-4"
            onClick={() => navigate("/appointments")}
          >
            Return to Appointments
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={isNew ? "New Appointment" : "Edit Appointment"}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            className="mr-4"
            onClick={() => navigate("/appointments")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">
            {isNew ? "Schedule New Appointment" : "Edit Appointment"}
          </h1>
        </div>

        {!isNew && appointment && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Appointment
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Appointment?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this appointment. This action cannot be undone.
                  {appointment.customer && (
                    <span className="block mt-2 font-medium">
                      Customer: {appointment.customer.firstName} {appointment.customer.lastName}
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="max-w-2xl">
        <AppointmentForm
          appointment={appointment}
          isEdit={!isNew && !!appointment}
        />
      </div>
    </PageLayout>
  );
}
