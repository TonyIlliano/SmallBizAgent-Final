/**
 * Customer Equipment Card (Step 3 of HVAC roadmap)
 *
 * Self-contained card for the customer detail page. Lists the customer's
 * known equipment with add/edit/delete. Industry-config gated by the caller
 * (don't render this component for industries where
 * tracksCustomerEquipment is false).
 *
 * The card title uses the industry-appropriate label ("Equipment" for HVAC,
 * "Vehicle" for automotive, "Pet" for vet) via the `label` prop.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Wrench,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  MapPin,
} from "lucide-react";

// Mirror of the pgEnum in shared/schema.ts. Kept in sync manually — see
// shared/schema.ts CustomerEquipmentType.
const EQUIPMENT_TYPES: { value: string; label: string }[] = [
  { value: "furnace", label: "Furnace" },
  { value: "ac", label: "Air Conditioner" },
  { value: "heat_pump", label: "Heat Pump" },
  { value: "mini_split", label: "Mini-Split" },
  { value: "boiler", label: "Boiler" },
  { value: "water_heater", label: "Water Heater" },
  { value: "thermostat", label: "Thermostat" },
  { value: "vehicle", label: "Vehicle" },
  { value: "pet", label: "Pet" },
  { value: "other", label: "Other" },
];

interface EquipmentRow {
  id: number;
  businessId: number;
  customerId: number;
  equipmentType: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  installDate: string | null;
  lastServiceDate: string | null;
  warrantyExpiry: string | null;
  location: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  equipmentType: string;
  make: string;
  model: string;
  serialNumber: string;
  installDate: string;
  lastServiceDate: string;
  warrantyExpiry: string;
  location: string;
  notes: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  equipmentType: "furnace",
  make: "",
  model: "",
  serialNumber: "",
  installDate: "",
  lastServiceDate: "",
  warrantyExpiry: "",
  location: "",
  notes: "",
  active: true,
};

interface EquipmentCardProps {
  customerId: number;
  /** Industry-aware label: "Equipment" / "Vehicle" / "Pet". Comes from
   *  getIndustryConfig(business.industry).equipmentLabel — the parent
   *  component owns the lookup. */
  label: string;
}

export default function EquipmentCard({ customerId, label }: EquipmentCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const equipmentQueryKey = ["/api/customers", customerId, "equipment"];

  const { data: equipment = [], isLoading } = useQuery<EquipmentRow[]>({
    queryKey: equipmentQueryKey,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/customers/${customerId}/equipment`,
      );
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<EquipmentRow> & { equipmentType: string }) => {
      // Normalize empty strings → null so dates / optional fields round-trip
      // correctly. The server's Zod schema accepts null but rejects "" on
      // date fields.
      const normalized: Record<string, any> = { ...payload };
      for (const key of [
        "make",
        "model",
        "serialNumber",
        "installDate",
        "lastServiceDate",
        "warrantyExpiry",
        "location",
        "notes",
      ]) {
        if (normalized[key] === "") normalized[key] = null;
      }

      if (editingId) {
        const res = await apiRequest(
          "PATCH",
          `/api/customers/${customerId}/equipment/${editingId}`,
          normalized,
        );
        return res.json();
      }
      const res = await apiRequest(
        "POST",
        `/api/customers/${customerId}/equipment`,
        normalized,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKey });
      toast({
        title: editingId ? "Equipment updated" : "Equipment added",
      });
      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save equipment",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(
        "DELETE",
        `/api/customers/${customerId}/equipment/${id}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKey });
      toast({ title: "Equipment removed" });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete equipment",
        variant: "destructive",
      });
    },
  });

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: EquipmentRow) {
    setEditingId(row.id);
    setForm({
      equipmentType: row.equipmentType,
      make: row.make ?? "",
      model: row.model ?? "",
      serialNumber: row.serialNumber ?? "",
      installDate: row.installDate ?? "",
      lastServiceDate: row.lastServiceDate ?? "",
      warrantyExpiry: row.warrantyExpiry ?? "",
      location: row.location ?? "",
      notes: row.notes ?? "",
      active: row.active,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    saveMutation.mutate(form);
  }

  const typeLabel = (raw: string) =>
    EQUIPMENT_TYPES.find((t) => t.value === raw)?.label || raw;

  return (
    <Card data-testid="equipment-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            {label}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={openAdd}
            data-testid="equipment-add"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : equipment.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No {label.toLowerCase()} on file. Click Add to track make, model,
            install date, and service history.
          </p>
        ) : (
          equipment.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border p-3 space-y-1"
              data-testid={`equipment-row-${row.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">
                      {typeLabel(row.equipmentType)}
                    </Badge>
                    {row.make || row.model ? (
                      <span className="text-sm font-medium">
                        {[row.make, row.model].filter(Boolean).join(" ")}
                      </span>
                    ) : null}
                    {!row.active && (
                      <Badge variant="outline" className="text-xs">
                        Retired
                      </Badge>
                    )}
                  </div>
                  {(row.location || row.installDate || row.lastServiceDate) && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {row.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {row.location}
                        </span>
                      )}
                      {row.installDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Installed {row.installDate}
                        </span>
                      )}
                      {row.lastServiceDate && (
                        <span className="flex items-center gap-1">
                          Last service {row.lastServiceDate}
                        </span>
                      )}
                    </div>
                  )}
                  {row.serialNumber && (
                    <div className="text-xs text-muted-foreground font-mono">
                      S/N: {row.serialNumber}
                    </div>
                  )}
                  {row.notes && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {row.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(row)}
                    data-testid={`equipment-edit-${row.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`equipment-delete-${row.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this {label.toLowerCase().replace(/s$/, "")}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the record. To keep history
                          but mark it removed, edit and set it to Retired
                          instead.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(row.id)}
                          className="bg-destructive text-destructive-foreground"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? `Edit ${label.toLowerCase().replace(/s$/, "")}` : `Add ${label.toLowerCase().replace(/s$/, "")}`}
            </DialogTitle>
            <DialogDescription>
              Track make, model, install date, and service history so techs
              walk in prepared.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={form.equipmentType}
                onValueChange={(v) => setForm({ ...form, equipmentType: v })}
              >
                <SelectTrigger data-testid="equipment-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Make</label>
                <Input
                  value={form.make}
                  onChange={(e) => setForm({ ...form, make: e.target.value })}
                  placeholder="e.g. Trane"
                  data-testid="equipment-make"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Model</label>
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. XR16"
                  data-testid="equipment-model"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Serial number</label>
              <Input
                value={form.serialNumber}
                onChange={(e) =>
                  setForm({ ...form, serialNumber: e.target.value })
                }
                data-testid="equipment-serial"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Installed</label>
                <Input
                  type="date"
                  value={form.installDate}
                  onChange={(e) =>
                    setForm({ ...form, installDate: e.target.value })
                  }
                  data-testid="equipment-install-date"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Last service</label>
                <Input
                  type="date"
                  value={form.lastServiceDate}
                  onChange={(e) =>
                    setForm({ ...form, lastServiceDate: e.target.value })
                  }
                  data-testid="equipment-last-service"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Warranty</label>
                <Input
                  type="date"
                  value={form.warrantyExpiry}
                  onChange={(e) =>
                    setForm({ ...form, warrantyExpiry: e.target.value })
                  }
                  data-testid="equipment-warranty"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Location</label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. attic, basement, garage"
                data-testid="equipment-location"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Anything the tech should know — quirks, prior issues, access notes."
                data-testid="equipment-notes"
              />
            </div>

            {editingId && (
              <div className="flex items-center gap-2 rounded-md border p-2">
                <input
                  id="equipment-active"
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                  data-testid="equipment-active"
                />
                <label htmlFor="equipment-active" className="text-sm">
                  Active (uncheck to retire while keeping history)
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="equipment-save"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
