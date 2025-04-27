import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { useLocation } from "wouter";

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

const invoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.string().transform((val) => parseFloat(val) || 1),
  unitPrice: z.string().transform((val) => parseFloat(val) || 0),
});

const invoiceSchema = z.object({
  businessId: z.number().default(1),
  customerId: z.string().min(1, "Customer is required"),
  jobId: z.string().optional(),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  amount: z.number().min(0, "Amount must be a positive number"),
  tax: z.number().min(0, "Tax must be a positive number"),
  total: z.number().min(0, "Total must be a positive number"),
  dueDate: z.date({
    required_error: "Due date is required",
  }),
  status: z.string().min(1, "Status is required"),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  invoice?: any; // Use the Invoice type from schema.ts
  isEdit?: boolean;
}

export function InvoiceForm({ invoice, isEdit = false }: InvoiceFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taxRate, setTaxRate] = useState(0.08); // 8% tax rate by default

  // Fetch customers and jobs for dropdowns
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/customers', { businessId: 1 }],
  });

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ['/api/jobs', { businessId: 1 }],
  });
  
  // Fetch invoice items if editing
  const { data: invoiceItems = [] } = useQuery<any[]>({
    queryKey: ['/api/invoice-items', invoice?.id],
    enabled: isEdit && !!invoice?.id,
  });

  // Generate default values
  const generateDefaultItems = () => {
    if (isEdit && invoiceItems && invoiceItems.length > 0) {
      return invoiceItems.map((item: any) => ({
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      }));
    }
    return [{ description: "", quantity: "1", unitPrice: "0" }];
  };

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      businessId: 1,
      customerId: invoice?.customerId?.toString() || "",
      jobId: invoice?.jobId?.toString() || "",
      invoiceNumber: invoice?.invoiceNumber || generateInvoiceNumber(),
      amount: invoice?.amount || 0,
      tax: invoice?.tax || 0,
      total: invoice?.total || 0,
      dueDate: invoice?.dueDate 
        ? new Date(invoice.dueDate) 
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      status: invoice?.status || "pending",
      items: generateDefaultItems(),
    },
  });

  // Items field array for dynamic items
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Calculate totals whenever items change
  const calculateTotals = () => {
    const values = form.getValues();
    const items = values.items || [];
    
    // Calculate subtotal from items
    const amount = items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity.toString()) || 0;
      const unitPrice = parseFloat(item.unitPrice.toString()) || 0;
      return sum + (quantity * unitPrice);
    }, 0);
    
    // Calculate tax
    const tax = amount * taxRate;
    
    // Calculate total
    const total = amount + tax;
    
    // Update form values
    form.setValue("amount", parseFloat(amount.toFixed(2)));
    form.setValue("tax", parseFloat(tax.toFixed(2)));
    form.setValue("total", parseFloat(total.toFixed(2)));
  };

  // Recalculate when items change
  useEffect(() => {
    const subscription = form.watch(() => calculateTotals());
    return () => subscription.unsubscribe();
  }, [form.watch]);

  // Convert string IDs to numbers before submitting
  const prepareDataForSubmission = (data: InvoiceFormData) => {
    // Prepare the invoice data
    const invoiceData = {
      ...data,
      customerId: parseInt(data.customerId),
      jobId: data.jobId && data.jobId !== "0" ? parseInt(data.jobId) : undefined,
    };
    
    // Prepare the items data separately
    const itemsData = data.items.map(item => ({
      description: item.description,
      quantity: parseFloat(item.quantity.toString()),
      unitPrice: parseFloat(item.unitPrice.toString()),
      amount: parseFloat(item.quantity.toString()) * parseFloat(item.unitPrice.toString()),
    }));
    
    return { invoice: invoiceData, items: itemsData };
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest("POST", "/api/invoices", {
        ...data.invoice,
        items: data.items,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
      navigate("/invoices");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create invoice. Please try again.",
        variant: "destructive",
      });
      console.error("Error creating invoice:", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest("PUT", `/api/invoices/${invoice.id}`, data.invoice);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/invoices", invoice.id]
      });
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
      navigate("/invoices");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update invoice. Please try again.",
        variant: "destructive",
      });
      console.error("Error updating invoice:", error);
    },
  });

  const onSubmit = async (data: InvoiceFormData) => {
    setIsSubmitting(true);
    try {
      const { invoice: invoiceData, items } = prepareDataForSubmission(data);
      if (isEdit) {
        await updateMutation.mutateAsync({ invoice: invoiceData, items });
      } else {
        await createMutation.mutateAsync({ invoice: invoiceData, items });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "Edit Invoice" : "Create New Invoice"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Number *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers?.map((customer: any) => (
                          <SelectItem 
                            key={customer.id} 
                            value={customer.id.toString()}
                          >
                            {customer.firstName} {customer.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="jobId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related Job</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a job (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">None</SelectItem>
                        {jobs?.map((job: any) => (
                          <SelectItem 
                            key={job.id} 
                            value={job.id.toString()}
                          >
                            {job.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
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
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-4">Invoice Items</h3>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start space-x-4">
                    <div className="flex-grow grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={index !== 0 ? "sr-only" : ""}>
                                Description
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="Item description" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div>
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={index !== 0 ? "sr-only" : ""}>
                                Quantity
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  min="1" 
                                  step="1" 
                                  placeholder="1"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    calculateTotals();
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div>
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitPrice`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={index !== 0 ? "sr-only" : ""}>
                                Unit Price ($)
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  min="0" 
                                  step="0.01" 
                                  placeholder="0.00"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    calculateTotals();
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    <div className="pt-8">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ description: "", quantity: "1", unitPrice: "0" } as any)}
                  className="mt-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
            
            <Separator className="my-6" />
            
            <div className="flex flex-col items-end space-y-2 mb-6">
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">
                  {formatCurrency(form.watch("amount"))}
                </span>
              </div>
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-gray-600">Tax ({(taxRate * 100).toFixed(0)}%):</span>
                <span className="font-medium">
                  {formatCurrency(form.watch("tax"))}
                </span>
              </div>
              <div className="flex justify-between w-full max-w-xs font-bold text-lg">
                <span>Total:</span>
                <span>{formatCurrency(form.watch("total"))}</span>
              </div>
            </div>
            
            <div className="flex justify-end space-x-4 mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/invoices")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : isEdit ? "Update Invoice" : "Create Invoice"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
