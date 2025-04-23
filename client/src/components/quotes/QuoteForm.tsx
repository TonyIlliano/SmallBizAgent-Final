import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { CreateCustomerDialog } from "@/components/customers/CreateCustomerDialog";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatCurrency, formatDate, generateInvoiceNumber } from "@/lib/utils";
import { CalendarIcon, Plus, Trash } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const quoteItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
});

const quoteSchema = z.object({
  customerId: z.number().min(1, "Customer is required"),
  jobId: z.number().optional().nullable(),
  quoteNumber: z.string().min(1, "Quote number is required"),
  items: z.array(quoteItemSchema).min(1, "At least one item is required"),
  validUntil: z.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type QuoteFormValues = z.infer<typeof quoteSchema>;

interface QuoteFormProps {
  defaultValues?: Partial<QuoteFormValues>;
  quoteId?: number;
}

export function QuoteForm({ defaultValues, quoteId }: QuoteFormProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!quoteId;

  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ["/api/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      // Make sure we send businessId with the data for the demo
      const quoteData = {
        ...data,
        businessId: 1 // Default business ID for demo
      };
      
      console.log("Creating quote with data:", quoteData);
      
      const res = await apiRequest("POST", "/api/quotes", quoteData);
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || "Failed to create quote";
        } catch (e) {
          errorMessage = errorText || "Failed to create quote";
        }
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote Created",
        description: "The quote has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      navigate("/quotes");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      // Make sure we send businessId with the data for the demo
      const quoteData = {
        ...data,
        businessId: 1 // Default business ID for demo
      };
      
      console.log("Updating quote with data:", quoteData);
      
      const res = await apiRequest("PATCH", `/api/quotes/${quoteId}`, quoteData);
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || "Failed to update quote";
        } catch (e) {
          errorMessage = errorText || "Failed to update quote";
        }
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote Updated",
        description: "The quote has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId] });
      navigate("/quotes");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update form schema to allow initial 0 customerId for the form
  const formSchema = quoteSchema.extend({
    customerId: z.number().gte(0, "Customer is required"),
  });
  
  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: defaultValues?.customerId || 0,
      jobId: defaultValues?.jobId || null,
      quoteNumber: defaultValues?.quoteNumber || `QUO-${Date.now()}`,
      items: defaultValues?.items || [
        { description: "", quantity: 1, unitPrice: 0 },
      ],
      validUntil: defaultValues?.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      notes: defaultValues?.notes || "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Calculate subtotal, tax, and total
  const [summary, setSummary] = useState({
    subtotal: 0,
    tax: 0, // Default tax rate
    total: 0,
  });

  // Watch for changes in items for real-time calculation
  const watchedItems = form.watch("items");
  
  // Update summary whenever items change
  useEffect(() => {
    if (!watchedItems) return;
    
    const items = watchedItems || [];
    
    // Calculate subtotal from items
    const recalculateTotal = () => {
      const subtotal = items.reduce((acc, item) => {
        // Ensure we're working with numbers by using parseFloat
        const quantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity as any) || 0;
        const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice as any) || 0;
        return acc + quantity * unitPrice;
      }, 0);
      
      const tax = subtotal * 0.0; // No tax by default for quotes
      const total = subtotal + tax;
      
      setSummary({ subtotal, tax, total });
    };
    
    // Calculate immediately
    recalculateTotal();
    
    // Also set up a small delay to catch any typing updates
    const timer = setTimeout(recalculateTotal, 100);
    
    return () => clearTimeout(timer);
  }, [watchedItems]);

  const onSubmit = (data: QuoteFormValues) => {
    // Verify that a customer has been selected before submission
    if (data.customerId === 0) {
      toast({
        title: "Customer Required",
        description: "Please select a customer for this quote",
        variant: "destructive",
      });
      return;
    }
    
    // Calculate the amounts for each item and the total
    const itemsWithAmount = data.items.map((item) => ({
      ...item,
      amount: item.quantity * item.unitPrice,
    }));

    const submitData = {
      ...data,
      items: itemsWithAmount,
      amount: summary.subtotal,
      tax: summary.tax,
      total: summary.total,
    };

    console.log("Submitting data:", submitData);

    if (isEditing) {
      updateQuoteMutation.mutate(submitData);
    } else {
      createQuoteMutation.mutate(submitData);
    }
  };

  const addItem = () => {
    append({ description: "", quantity: 1, unitPrice: 0 });
  };

  const isPending = createQuoteMutation.isPending || updateQuoteMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <div className="space-y-2">
                      <Select
                        value={field.value ? field.value.toString() : ""}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        disabled={isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers?.map((customer: any) => (
                            <SelectItem key={customer.id} value={customer.id.toString()}>
                              {customer.firstName} {customer.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-end">
                        <CreateCustomerDialog 
                          onCreate={(customer: any) => {
                            form.setValue("customerId", customer.id);
                          }} 
                        />
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jobId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related Job (Optional)</FormLabel>
                    <Select
                      value={field.value ? field.value.toString() : ""}
                      onValueChange={(value) => 
                        field.onChange(value && value !== "0" ? parseInt(value) : null)
                      }
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a job" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">None</SelectItem>
                        {jobs?.map((job: any) => (
                          <SelectItem key={job.id} value={job.id.toString()}>
                            {job.title || `Job #${job.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optionally connect this quote to a job
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quoteNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quote Number</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validUntil"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Valid Until</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isPending}
                          >
                            {field.value ? (
                              formatDate(field.value)
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date() || date > new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      The date until this quote is valid
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quote Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Item {index + 1}</h4>
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        disabled={isPending}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name={`items.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min="1"
                              step="1"
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.unitPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit Price</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {index < fields.length - 1 && <Separator className="my-4" />}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={addItem}
                disabled={isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </CardContent>
            <CardFooter className="flex flex-col items-end">
              <div className="space-y-1 text-right">
                <div className="text-sm">
                  Subtotal: {formatCurrency(summary.subtotal)}
                </div>
                <div className="text-sm">
                  Tax: {formatCurrency(summary.tax)}
                </div>
                <div className="text-lg font-semibold">
                  Total: {formatCurrency(summary.total)}
                </div>
              </div>
            </CardFooter>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any additional information or terms..."
                      className="min-h-[100px]"
                      {...field}
                      value={field.value || ""}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    Include any special terms, conditions, or notes for this quote
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/quotes")}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? "Update Quote" : "Create Quote"}
          </Button>
        </div>
      </form>
    </Form>
  );
}