import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Phone,
  PhoneCall,
  Search,
  Star,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhoneNumber {
  id: number;
  phoneNumber: string;
  label: string | null;
  status: "active" | "inactive" | "pending";
  isPrimary: boolean;
  vapiConnected: boolean;
  dateProvisioned: string | null;
}

interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  isoCountry: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

// ---------------------------------------------------------------------------
// PhoneNumbersManager
// ---------------------------------------------------------------------------

export function PhoneNumbersManager({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editLabelDialogOpen, setEditLabelDialogOpen] = useState(false);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);

  // Form state
  const [areaCode, setAreaCode] = useState("");
  const [selectedNumber, setSelectedNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingPhone, setEditingPhone] = useState<PhoneNumber | null>(null);
  const [releasingPhone, setReleasingPhone] = useState<PhoneNumber | null>(null);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  const {
    data: phoneNumbers,
    isLoading,
    error,
    refetch,
  } = useQuery<PhoneNumber[]>({
    queryKey: [`/api/business/${businessId}/phone-numbers`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/business/${businessId}/phone-numbers`);
      const data = await res.json();
      return data.phoneNumbers ?? data;
    },
    enabled: !!businessId,
  });

  const {
    data: availableNumbers,
    isLoading: isLoadingAvailable,
    refetch: refetchAvailable,
  } = useQuery<AvailablePhoneNumber[]>({
    queryKey: [`/api/business/${businessId}/phone-numbers/available`, areaCode],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/business/${businessId}/phone-numbers/available?areaCode=${areaCode}`,
      );
      const data = await res.json();
      return data.phoneNumbers ?? data;
    },
    enabled: false, // Manual trigger only
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const provisionMutation = useMutation({
    mutationFn: async ({
      specificNumber,
      areaCode: ac,
      label,
    }: {
      specificNumber?: string;
      areaCode?: string;
      label?: string;
    }) => {
      const res = await apiRequest("POST", `/api/business/${businessId}/phone-numbers`, {
        specificNumber,
        areaCode: ac,
        label,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Phone number provisioned",
        description: "The new phone number has been added to your business.",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${businessId}/phone-numbers`],
      });
      resetAddDialog();
    },
    onError: (error) => {
      toast({
        title: "Failed to provision phone number",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      phoneId,
      data,
    }: {
      phoneId: number;
      data: { label?: string; isPrimary?: boolean };
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/business/${businessId}/phone-numbers/${phoneId}`,
        data,
      );
      return res.json();
    },
    onSuccess: (_data, variables) => {
      const action = variables.data.isPrimary ? "set as primary" : "updated";
      toast({
        title: `Phone number ${action}`,
        description: `The phone number has been ${action} successfully.`,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${businessId}/phone-numbers`],
      });
      setEditLabelDialogOpen(false);
      setEditingPhone(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to update phone number",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (phoneId: number) => {
      const res = await apiRequest(
        "DELETE",
        `/api/business/${businessId}/phone-numbers/${phoneId}`,
      );
      // Handle 204 No Content
      if (res.status === 204) return null;
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Phone number released",
        description: "The phone number has been released and is no longer associated with your business.",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${businessId}/phone-numbers`],
      });
      setReleaseDialogOpen(false);
      setReleasingPhone(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to release phone number",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const connectVapiMutation = useMutation({
    mutationFn: async (phoneId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/business/${businessId}/phone-numbers/${phoneId}/connect-vapi`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Connected to AI Assistant",
        description: "The phone number is now connected to your Vapi AI assistant.",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${businessId}/phone-numbers`],
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to connect to AI Assistant",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function resetAddDialog() {
    setAddDialogOpen(false);
    setAreaCode("");
    setSelectedNumber("");
    setNewLabel("");
  }

  function handleAreaCodeSearch() {
    if (!/^\d{3}$/.test(areaCode)) {
      toast({
        title: "Invalid area code",
        description: "Please enter a valid 3-digit area code.",
        variant: "destructive",
      });
      return;
    }
    refetchAvailable();
  }

  function handleSelectAvailableNumber(phoneNumber: string) {
    setSelectedNumber(phoneNumber);
  }

  function handleProvision() {
    if (!selectedNumber) {
      toast({
        title: "No number selected",
        description: "Please search for and select a phone number to provision.",
        variant: "destructive",
      });
      return;
    }
    provisionMutation.mutate({
      specificNumber: selectedNumber,
      areaCode: areaCode || undefined,
      label: newLabel || undefined,
    });
  }

  function handleOpenEditLabel(phone: PhoneNumber) {
    setEditingPhone(phone);
    setNewLabel(phone.label ?? "");
    setEditLabelDialogOpen(true);
  }

  function handleSaveLabel() {
    if (!editingPhone) return;
    updateMutation.mutate({
      phoneId: editingPhone.id,
      data: { label: newLabel },
    });
  }

  function handleSetPrimary(phone: PhoneNumber) {
    updateMutation.mutate({
      phoneId: phone.id,
      data: { isPrimary: true },
    });
  }

  function handleOpenRelease(phone: PhoneNumber) {
    setReleasingPhone(phone);
    setReleaseDialogOpen(true);
  }

  function handleConfirmRelease() {
    if (!releasingPhone) return;
    releaseMutation.mutate(releasingPhone.id);
  }

  function handleConnectVapi(phone: PhoneNumber) {
    connectVapiMutation.mutate(phone.id);
  }

  // -------------------------------------------------------------------------
  // Status badge helpers
  // -------------------------------------------------------------------------

  function statusBadge(status: string) {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30" variant="outline">
            Active
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30" variant="outline">
            Inactive
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30" variant="outline">
            Pending
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Phone Numbers
              </CardTitle>
              <CardDescription>
                Manage phone numbers for your business. Add new numbers, edit labels, and connect to your AI assistant.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Number
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load phone numbers. Please try refreshing.
            </div>
          ) : !phoneNumbers || phoneNumbers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No phone numbers provisioned yet.</p>
              <p className="text-xs mt-1">Click "Add Number" to provision your first phone number.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>Date Provisioned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phoneNumbers.map((phone) => (
                  <TableRow key={phone.id}>
                    <TableCell className="font-mono">
                      {formatPhoneNumber(phone.phoneNumber)}
                    </TableCell>
                    <TableCell>
                      {phone.label ? (
                        <span className="text-sm">{phone.label}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">No label</span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(phone.status)}</TableCell>
                    <TableCell>
                      {phone.isPrimary ? (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30" variant="outline">
                          <Star className="h-3 w-3 mr-1" />
                          Primary
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {phone.dateProvisioned
                        ? new Date(phone.dateProvisioned).toLocaleDateString()
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Edit Label */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditLabel(phone)}
                          title="Edit label"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {/* Set Primary */}
                        {!phone.isPrimary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetPrimary(phone)}
                            disabled={updateMutation.isPending}
                            title="Set as primary"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Connect to Vapi */}
                        {!phone.vapiConnected && phone.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleConnectVapi(phone)}
                            disabled={connectVapiMutation.isPending}
                            title="Connect to AI Assistant"
                          >
                            {connectVapiMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <PhoneCall className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {phone.vapiConnected && (
                          <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                            AI Connected
                          </Badge>
                        )}

                        {/* Release */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleOpenRelease(phone)}
                          disabled={releaseMutation.isPending}
                          title="Release number"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Add Phone Number Dialog                                           */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => !open && resetAddDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
            <DialogDescription>
              Search for available phone numbers by area code, then select one to provision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Area code search */}
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-2">
                <Label htmlFor="search-area-code">Area Code</Label>
                <Input
                  id="search-area-code"
                  placeholder="e.g. 212"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  maxLength={3}
                />
              </div>
              <Button
                type="button"
                onClick={handleAreaCodeSearch}
                disabled={isLoadingAvailable}
              >
                {isLoadingAvailable ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search
              </Button>
            </div>

            {/* Available numbers list */}
            {availableNumbers && availableNumbers.length > 0 && (
              <div className="max-h-60 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableNumbers.map((num) => (
                      <TableRow
                        key={num.phoneNumber}
                        className={
                          selectedNumber === num.phoneNumber
                            ? "bg-primary/10"
                            : ""
                        }
                      >
                        <TableCell className="font-mono text-sm">
                          {num.friendlyName || num.phoneNumber}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {num.locality ? `${num.locality}, ${num.region}` : num.region}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={selectedNumber === num.phoneNumber ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleSelectAvailableNumber(num.phoneNumber)}
                          >
                            {selectedNumber === num.phoneNumber ? "Selected" : "Select"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {availableNumbers && availableNumbers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No phone numbers available for this area code. Try a different one.
              </p>
            )}

            {/* Selected number display */}
            {selectedNumber && (
              <div className="rounded-md border p-3 bg-muted/50">
                <p className="text-sm font-medium">
                  Selected: <span className="font-mono">{selectedNumber}</span>
                </p>
              </div>
            )}

            {/* Optional label */}
            <div className="grid gap-2">
              <Label htmlFor="provision-label">Label (optional)</Label>
              <Input
                id="provision-label"
                placeholder="e.g. Main line, Support, Sales"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetAddDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleProvision}
              disabled={!selectedNumber || provisionMutation.isPending}
            >
              {provisionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Phone className="h-4 w-4 mr-2" />
              )}
              Provision Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Edit Label Dialog                                                 */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={editLabelDialogOpen} onOpenChange={setEditLabelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Label</DialogTitle>
            <DialogDescription>
              Update the label for{" "}
              <span className="font-mono">
                {editingPhone ? formatPhoneNumber(editingPhone.phoneNumber) : ""}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="edit-label">Label</Label>
            <Input
              id="edit-label"
              placeholder="e.g. Main line, Support, Sales"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditLabelDialogOpen(false);
                setEditingPhone(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveLabel} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Pencil className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Release Confirmation Dialog                                       */}
      {/* ----------------------------------------------------------------- */}
      <AlertDialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release Phone Number?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to release{" "}
              <span className="font-mono font-semibold">
                {releasingPhone ? formatPhoneNumber(releasingPhone.phoneNumber) : ""}
              </span>
              {releasingPhone?.label ? ` (${releasingPhone.label})` : ""}? This action cannot be
              undone and the number will no longer be associated with your business.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setReleaseDialogOpen(false);
                setReleasingPhone(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmRelease}
              disabled={releaseMutation.isPending}
            >
              {releaseMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Release Number
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default PhoneNumbersManager;
