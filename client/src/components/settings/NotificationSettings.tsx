import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, MessageSquare, Bell, Calendar, FileText, Briefcase } from "lucide-react";

interface NotificationSettingsData {
  businessId: number;
  appointmentConfirmationEmail: boolean;
  appointmentConfirmationSms: boolean;
  appointmentReminderEmail: boolean;
  appointmentReminderSms: boolean;
  appointmentReminderHours: number;
  invoiceCreatedEmail: boolean;
  invoiceCreatedSms: boolean;
  invoiceReminderEmail: boolean;
  invoiceReminderSms: boolean;
  invoicePaymentConfirmationEmail: boolean;
  jobCompletedEmail: boolean;
  jobCompletedSms: boolean;
}

function NotificationRow({
  label,
  description,
  emailEnabled,
  smsEnabled,
  onEmailChange,
  onSmsChange,
  emailId,
  smsId,
}: {
  label: string;
  description: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  onEmailChange: (checked: boolean) => void;
  onSmsChange: (checked: boolean) => void;
  emailId: string;
  smsId: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <Switch id={emailId} checked={emailEnabled} onCheckedChange={onEmailChange} />
        </div>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <Switch id={smsId} checked={smsEnabled} onCheckedChange={onSmsChange} />
        </div>
      </div>
    </div>
  );
}

function EmailOnlyRow({
  label,
  description,
  emailEnabled,
  onEmailChange,
  emailId,
}: {
  label: string;
  description: string;
  emailEnabled: boolean;
  onEmailChange: (checked: boolean) => void;
  emailId: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <Switch id={emailId} checked={emailEnabled} onCheckedChange={onEmailChange} />
        </div>
        <div className="w-[52px]" /> {/* Spacer to align with rows that have SMS */}
      </div>
    </div>
  );
}

export default function NotificationSettingsPanel({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<NotificationSettingsData>({
    queryKey: ["/api/notification-settings"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<NotificationSettingsData>) => {
      const res = await apiRequest("PUT", "/api/notification-settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-settings"] });
      toast({ title: "Settings saved", description: "Notification preferences updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" });
    },
  });

  const handleToggle = (key: keyof NotificationSettingsData, value: boolean) => {
    if (!settings) return;
    updateMutation.mutate({ ...settings, [key]: value });
  };

  const handleReminderHoursChange = (value: string) => {
    if (!settings) return;
    updateMutation.mutate({ ...settings, appointmentReminderHours: parseInt(value) });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notification Preferences</CardTitle>
          </div>
          <CardDescription>
            Control how and when your customers receive notifications via email and SMS.
          </CardDescription>
          <div className="flex items-center gap-6 pt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </div>
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> SMS
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Appointment Notifications */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <CardTitle className="text-base">Appointment Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <NotificationRow
            label="Appointment Confirmation"
            description="Sent when a new appointment is booked"
            emailEnabled={settings.appointmentConfirmationEmail}
            smsEnabled={settings.appointmentConfirmationSms}
            onEmailChange={(v) => handleToggle("appointmentConfirmationEmail", v)}
            onSmsChange={(v) => handleToggle("appointmentConfirmationSms", v)}
            emailId="apt-confirm-email"
            smsId="apt-confirm-sms"
          />
          <NotificationRow
            label="Appointment Reminder"
            description="Sent before the appointment to reduce no-shows"
            emailEnabled={settings.appointmentReminderEmail}
            smsEnabled={settings.appointmentReminderSms}
            onEmailChange={(v) => handleToggle("appointmentReminderEmail", v)}
            onSmsChange={(v) => handleToggle("appointmentReminderSms", v)}
            emailId="apt-remind-email"
            smsId="apt-remind-sms"
          />
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium">Reminder Timing</p>
              <p className="text-xs text-muted-foreground">How far in advance to send reminders</p>
            </div>
            <Select
              value={String(settings.appointmentReminderHours || 24)}
              onValueChange={handleReminderHoursChange}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hour before</SelectItem>
                <SelectItem value="2">2 hours before</SelectItem>
                <SelectItem value="4">4 hours before</SelectItem>
                <SelectItem value="12">12 hours before</SelectItem>
                <SelectItem value="24">24 hours before</SelectItem>
                <SelectItem value="48">48 hours before</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Notifications */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <CardTitle className="text-base">Invoice Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <NotificationRow
            label="Invoice Created"
            description="Sent when a new invoice is created for a customer"
            emailEnabled={settings.invoiceCreatedEmail}
            smsEnabled={settings.invoiceCreatedSms}
            onEmailChange={(v) => handleToggle("invoiceCreatedEmail", v)}
            onSmsChange={(v) => handleToggle("invoiceCreatedSms", v)}
            emailId="inv-create-email"
            smsId="inv-create-sms"
          />
          <NotificationRow
            label="Payment Reminder"
            description="Sent when an invoice is due or overdue"
            emailEnabled={settings.invoiceReminderEmail}
            smsEnabled={settings.invoiceReminderSms}
            onEmailChange={(v) => handleToggle("invoiceReminderEmail", v)}
            onSmsChange={(v) => handleToggle("invoiceReminderSms", v)}
            emailId="inv-remind-email"
            smsId="inv-remind-sms"
          />
          <EmailOnlyRow
            label="Payment Confirmation"
            description="Sent when a payment is received"
            emailEnabled={settings.invoicePaymentConfirmationEmail}
            onEmailChange={(v) => handleToggle("invoicePaymentConfirmationEmail", v)}
            emailId="inv-paid-email"
          />
        </CardContent>
      </Card>

      {/* Job Notifications */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            <CardTitle className="text-base">Job Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <NotificationRow
            label="Job Completed"
            description="Sent when a job is marked as completed"
            emailEnabled={settings.jobCompletedEmail}
            smsEnabled={settings.jobCompletedSms}
            onEmailChange={(v) => handleToggle("jobCompletedEmail", v)}
            onSmsChange={(v) => handleToggle("jobCompletedSms", v)}
            emailId="job-done-email"
            smsId="job-done-sms"
          />
        </CardContent>
      </Card>
    </div>
  );
}
