import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Trash2 } from "lucide-react";

interface RecurringScheduleFormProps {
  schedule?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

const frequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 Weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const dayOfWeekOptions = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export function RecurringScheduleForm({ schedule, onSuccess, onCancel }: RecurringScheduleFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const businessId = user?.businessId ?? undefined;

  const [frequency, setFrequency] = useState(schedule?.frequency || "monthly");
  const [autoCreateInvoice, setAutoCreateInvoice] = useState(schedule?.autoCreateInvoice ?? true);
  const [lineItems, setLineItems] = useState<LineItem[]>(
    schedule?.items || [{ description: "", quantity: 1, unitPrice: 0, amount: 0 }]
  );

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      name: schedule?.name || "",
      customerId: schedule?.customerId?.toString() || "",
      serviceId: schedule?.serviceId?.toString() || "",
      staffId: schedule?.staffId?.toString() || "",
      frequency: schedule?.frequency || "monthly",
      interval: schedule?.interval || 1,
      dayOfWeek: schedule?.dayOfWeek?.toString() || "",
      dayOfMonth: schedule?.dayOfMonth || 1,
      startDate: schedule?.startDate || new Date().toISOString().split("T")[0],
      endDate: schedule?.endDate || "",
      jobTitle: schedule?.jobTitle || "",
      jobDescription: schedule?.jobDescription || "",
      estimatedDuration: schedule?.estimatedDuration || "",
      invoiceNotes: schedule?.invoiceNotes || "",
    },
  });

  // Fetch customers
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", { businessId }],
  });

  // Fetch services
  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/services", { businessId }],
  });

  // Fetch staff
  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", { businessId }],
  });

  // Calculate totals
  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const tax = subtotal * 0.0825; // 8.25% tax
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };

    // Recalculate amount
    if (field === "quantity" || field === "unitPrice") {
      newItems[index].amount = newItems[index].quantity * newItems[index].unitPrice;
    }

    setLineItems(newItems);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const method = schedule ? "PATCH" : "POST";
      const url = schedule
        ? `/api/recurring-schedules/${schedule.id}`
        : "/api/recurring-schedules";
      return apiRequest(method, url, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      toast({
        title: schedule ? "Schedule updated" : "Schedule created",
        variant: "default",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save schedule",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    const { subtotal, tax, total } = calculateTotals();

    const payload = {
      businessId,
      customerId: parseInt(data.customerId),
      serviceId: data.serviceId ? parseInt(data.serviceId) : undefined,
      staffId: data.staffId ? parseInt(data.staffId) : undefined,
      name: data.name,
      frequency: data.frequency,
      interval: parseInt(data.interval) || 1,
      dayOfWeek: data.dayOfWeek ? parseInt(data.dayOfWeek) : undefined,
      dayOfMonth: data.dayOfMonth ? parseInt(data.dayOfMonth) : undefined,
      startDate: data.startDate,
      endDate: data.endDate || undefined,
      jobTitle: data.jobTitle,
      jobDescription: data.jobDescription || undefined,
      estimatedDuration: data.estimatedDuration ? parseInt(data.estimatedDuration) : undefined,
      autoCreateInvoice,
      invoiceAmount: autoCreateInvoice ? subtotal : undefined,
      invoiceTax: autoCreateInvoice ? tax : undefined,
      invoiceNotes: data.invoiceNotes || undefined,
      items: autoCreateInvoice ? lineItems.filter(item => item.description && item.amount > 0) : undefined,
    };

    createMutation.mutate(payload);
  };

  const { subtotal, tax, total } = calculateTotals();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Schedule Details
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Schedule Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Monthly Pool Cleaning"
              {...register("name", { required: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerId">Customer *</Label>
            <Select
              value={watch("customerId")}
              onValueChange={(v) => setValue("customerId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer: any) => (
                  <SelectItem key={customer.id} value={customer.id.toString()}>
                    {customer.firstName} {customer.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="serviceId">Service (Optional)</Label>
            <Select
              value={watch("serviceId")}
              onValueChange={(v) => setValue("serviceId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((service: any) => (
                  <SelectItem key={service.id} value={service.id.toString()}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="staffId">Assign To (Optional)</Label>
            <Select
              value={watch("staffId")}
              onValueChange={(v) => setValue("staffId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((member: any) => (
                  <SelectItem key={member.id} value={member.id.toString()}>
                    {member.firstName} {member.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Frequency */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Frequency
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="frequency">How Often *</Label>
            <Select
              value={watch("frequency")}
              onValueChange={(v) => {
                setValue("frequency", v);
                setFrequency(v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(frequency === "weekly" || frequency === "biweekly") && (
            <div className="space-y-2">
              <Label htmlFor="dayOfWeek">Day of Week</Label>
              <Select
                value={watch("dayOfWeek")}
                onValueChange={(v) => setValue("dayOfWeek", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {dayOfWeekOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(frequency === "monthly" || frequency === "quarterly") && (
            <div className="space-y-2">
              <Label htmlFor="dayOfMonth">Day of Month</Label>
              <Input
                id="dayOfMonth"
                type="number"
                min={1}
                max={31}
                {...register("dayOfMonth")}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date *</Label>
            <Input
              id="startDate"
              type="date"
              {...register("startDate", { required: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">End Date (Optional)</Label>
            <Input
              id="endDate"
              type="date"
              {...register("endDate")}
            />
          </div>
        </div>
      </div>

      {/* Job Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Job Details
        </h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Job Title *</Label>
            <Input
              id="jobTitle"
              placeholder="e.g., Regular Pool Maintenance"
              {...register("jobTitle", { required: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobDescription">Job Description</Label>
            <Textarea
              id="jobDescription"
              placeholder="Describe the work to be done..."
              {...register("jobDescription")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedDuration">Estimated Duration (minutes)</Label>
            <Input
              id="estimatedDuration"
              type="number"
              placeholder="60"
              {...register("estimatedDuration")}
            />
          </div>
        </div>
      </div>

      {/* Invoice Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Invoice Settings
          </h3>
          <div className="flex items-center gap-2">
            <Switch
              id="autoCreateInvoice"
              checked={autoCreateInvoice}
              onCheckedChange={setAutoCreateInvoice}
            />
            <Label htmlFor="autoCreateInvoice" className="text-sm">
              Auto-create invoice
            </Label>
          </div>
        </div>

        {autoCreateInvoice && (
          <div className="space-y-4">
            {/* Line Items */}
            <div className="space-y-3">
              <Label>Line Items</Label>
              {lineItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, "description", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    value={item.unitPrice}
                    onChange={(e) => updateLineItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                    className="w-24"
                  />
                  <div className="w-24 text-right font-medium">
                    ${item.amount.toFixed(2)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(index)}
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>

            {/* Totals */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax (8.25%)</span>
                <span className="font-medium">${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold pt-2 border-t border-border">
                <span>Total per occurrence</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceNotes">Invoice Notes</Label>
              <Textarea
                id="invoiceNotes"
                placeholder="Notes to include on each invoice..."
                {...register("invoiceNotes")}
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending
            ? "Saving..."
            : schedule
            ? "Update Schedule"
            : "Create Schedule"}
        </Button>
      </div>
    </form>
  );
}
