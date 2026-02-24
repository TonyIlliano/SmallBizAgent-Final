import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Edit2, DollarSign, Package, Wrench, Clock } from "lucide-react";

interface JobLineItem {
  id: number;
  jobId: number;
  type: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxable: boolean;
  createdAt: string;
}

interface JobLineItemsProps {
  jobId: number;
  readOnly?: boolean;
}

const LINE_ITEM_TYPES = [
  { value: "labor", label: "Labor", icon: Clock },
  { value: "parts", label: "Parts", icon: Package },
  { value: "materials", label: "Materials", icon: Wrench },
  { value: "service", label: "Service", icon: DollarSign },
];

export function JobLineItems({ jobId, readOnly = false }: JobLineItemsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<JobLineItem | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    type: "labor",
    description: "",
    quantity: 1,
    unitPrice: 0,
    taxable: true,
  });

  // Fetch line items
  const { data: lineItems = [], isLoading } = useQuery<JobLineItem[]>({
    queryKey: [`/api/jobs/${jobId}/line-items`],
    enabled: !!jobId,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiRequest("POST", `/api/jobs/${jobId}/line-items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}/line-items`] });
      toast({ title: "Success", description: "Line item added" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add line item", variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: typeof formData & { id: number }) =>
      apiRequest("PUT", `/api/jobs/${jobId}/line-items/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}/line-items`] });
      toast({ title: "Success", description: "Line item updated" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update line item", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/jobs/${jobId}/line-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}/line-items`] });
      toast({ title: "Success", description: "Line item removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove line item", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      type: "labor",
      description: "",
      quantity: 1,
      unitPrice: 0,
      taxable: true,
    });
    setEditingItem(null);
  };

  const handleOpenDialog = (item?: JobLineItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxable: item.taxable,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.description || formData.unitPrice <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in description and unit price",
        variant: "destructive"
      });
      return;
    }

    if (editingItem) {
      updateMutation.mutate({ ...formData, id: editingItem.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to remove this line item?")) {
      deleteMutation.mutate(id);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getTypeIcon = (type: string) => {
    const typeInfo = LINE_ITEM_TYPES.find(t => t.value === type);
    if (typeInfo) {
      const Icon = typeInfo.icon;
      return <Icon className="h-4 w-4" />;
    }
    return null;
  };

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const taxableAmount = lineItems
    .filter(item => item.taxable)
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  const estimatedTax = taxableAmount * 0.08; // 8% estimate

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-medium">
          Line Items (Labor, Parts & Materials)
        </CardTitle>
        {!readOnly && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? "Edit Line Item" : "Add Line Item"}
                </DialogTitle>
                <DialogDescription>
                  Add labor hours, parts, materials, or services to this job.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_ITEM_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g., Replaced water heater element"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="unitPrice">Unit Price ($)</Label>
                    <Input
                      id="unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.unitPrice}
                      onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="taxable"
                    checked={formData.taxable}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, taxable: checked as boolean })
                    }
                  />
                  <Label htmlFor="taxable" className="text-sm font-normal">
                    Taxable item
                  </Label>
                </div>

                <div className="text-right text-lg font-semibold">
                  Amount: {formatCurrency(formData.quantity * formData.unitPrice)}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingItem ? "Update" : "Add"} Item
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary rounded-full border-t-transparent" />
          </div>
        ) : lineItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>No line items yet.</p>
            <p className="text-sm">Add labor, parts, or materials to track job costs.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Tax</TableHead>
                  {!readOnly && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 capitalize">
                        {getTypeIcon(item.type)}
                        {item.type}
                      </div>
                    </TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.taxable ? "Yes" : "No"}
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(item)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Totals */}
            <div className="mt-4 border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Est. Tax (8%):</span>
                <span>{formatCurrency(estimatedTax)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold border-t pt-2">
                <span>Estimated Total:</span>
                <span>{formatCurrency(subtotal + estimatedTax)}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
