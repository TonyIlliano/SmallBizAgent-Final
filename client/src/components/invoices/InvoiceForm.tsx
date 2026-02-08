import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { useLocation } from "wouter";

import {
  Form,
  FormControl,
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

// Define schemas
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
  invoice?: any;
  isEdit?: boolean;
}

export function InvoiceForm({ invoice, isEdit = false }: InvoiceFormProps) {
  // Hooks
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const businessId = user?.businessId ?? undefined;

  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);
  const isCalculating = useRef(false);
  const TAX_RATE = 0.08; // 8% tax rate
  
  // Fetch data
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/customers'],
  });

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ['/api/jobs'],
  });
  
  const { data: invoiceItems = [] } = useQuery<any[]>({
    queryKey: ['/api/invoice-items', invoice?.id],
    enabled: isEdit && !!invoice?.id,
  });

  // Helper to generate default items
  const generateDefaultItems = () => {
    if (isEdit && invoiceItems.length > 0) {
      return invoiceItems.map((item: any) => ({
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      }));
    }
    return [{ description: "", quantity: "1", unitPrice: "0" }];
  };

  // Form setup
  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      businessId,
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

  // Field array for dynamic items
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Calculate totals
  const calculateTotals = () => {
    if (isCalculating.current) return;
    
    try {
      isCalculating.current = true;
      
      // Get current form values
      const values = form.getValues();
      const items = values.items || [];
      
      // Calculate subtotal
      const calculatedSubtotal = items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity.toString()) || 0;
        const unitPrice = parseFloat(item.unitPrice.toString()) || 0;
        return sum + (quantity * unitPrice);
      }, 0);
      
      // Calculate tax and total
      const calculatedTax = calculatedSubtotal * TAX_RATE;
      const calculatedTotal = calculatedSubtotal + calculatedTax;
      
      // Update state (not form values directly)
      setSubtotal(parseFloat(calculatedSubtotal.toFixed(2)));
      setTax(parseFloat(calculatedTax.toFixed(2)));
      setTotal(parseFloat(calculatedTotal.toFixed(2)));
      
      // Silently update form values without causing a re-render loop
      form.setValue("amount", parseFloat(calculatedSubtotal.toFixed(2)), { 
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false 
      });
      
      form.setValue("tax", parseFloat(calculatedTax.toFixed(2)), { 
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false 
      });
      
      form.setValue("total", parseFloat(calculatedTotal.toFixed(2)), { 
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false 
      });
    } catch (error) {
      console.error("Error calculating totals:", error);
    } finally {
      isCalculating.current = false;
    }
  };

  // Watch for item changes
  useEffect(() => {
    // Create a single form watcher for all fields
    const subscription = form.watch((values, { name }) => {
      // Only recalculate if an item-related field changed
      if (name && name.startsWith('items')) {
        // Use a timeout to avoid excessive calculations
        setTimeout(() => {
          if (!isCalculating.current) {
            calculateTotals();
          }
        }, 100);
      }
    });
    
    // Initial calculation
    calculateTotals();
    
    return () => subscription.unsubscribe();
  }, []);

  // Prepare data for submission
  const prepareDataForSubmission = (data: InvoiceFormData) => {
    const invoiceData = {
      ...data,
      customerId: parseInt(data.customerId),
      jobId: data.jobId && data.jobId !== "0" ? parseInt(data.jobId) : null,
    };
    
    const itemsData = data.items.map(item => ({
      description: item.description,
      quantity: parseFloat(item.quantity.toString()),
      unitPrice: parseFloat(item.unitPrice.toString()),
      amount: parseFloat(item.quantity.toString()) * parseFloat(item.unitPrice.toString()),
    }));
    
    return { invoice: invoiceData, items: itemsData };
  };

  // API mutations
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

  // Handle form submission
  const onSubmit = async (data: InvoiceFormData) => {
    setIsSubmitting(true);
    try {
      // Before submitting, make sure totals are up to date
      data.amount = subtotal;
      data.tax = tax;
      data.total = total;
      
      const { invoice: invoiceData, items } = prepareDataForSubmission(data);
      if (isEdit) {
        await updateMutation.mutateAsync({ invoice: invoiceData, items });
      } else {
        await createMutation.mutateAsync({ invoice: invoiceData, items });
      }
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for adding new item
  const handleAddItem = () => {
    append({ description: "", quantity: 1, unitPrice: 0 });
  };

  // Handler for removing an item
  const handleRemoveItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
      // Recalculate after a brief delay to ensure the form has updated
      setTimeout(calculateTotals, 100);
    }
  };

  // Render the form
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "Edit Invoice" : "Create New Invoice"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Invoice Number */}
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
              
              {/* Customer */}
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
              
              {/* Job */}
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
              
              {/* Due Date */}
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
              
              {/* Status */}
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
            
            {/* Invoice Items */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-4">Invoice Items</h3>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start space-x-4">
                    <div className="flex-grow grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Description */}
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
                      
                      {/* Quantity */}
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
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Unit Price */}
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
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    
                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="mt-8"
                      onClick={() => handleRemoveItem(index)}
                      disabled={fields.length <= 1}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                {/* Add Item Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleAddItem}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>
            </div>
            
            {/* Invoice Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="md:col-span-2"></div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({(TAX_RATE * 100).toFixed(0)}%):</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total:</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
            
            {/* Form Actions */}
            <div className="flex justify-end gap-4 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/invoices")}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
              >
                {isSubmitting 
                  ? "Processing..." 
                  : isEdit 
                    ? "Update Invoice" 
                    : "Create Invoice"
                }
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}