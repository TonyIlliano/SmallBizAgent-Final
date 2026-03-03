import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Plus,
  Building2,
  Phone,
  Mail,
  Tag,
  Loader2,
  Info,
} from "lucide-react";

interface Location {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string;
  industry: string | null;
  type: string | null;
  locationLabel: string | null;
  isActive: boolean;
  businessGroupId: number | null;
}

interface AddLocationForm {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
  industry: string;
  type: string;
  locationLabel: string;
}

const emptyForm: AddLocationForm = {
  name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  email: "",
  phone: "",
  industry: "",
  type: "general",
  locationLabel: "",
};

interface LocationsManagerProps {
  business: any;
}

export default function LocationsManager({ business }: LocationsManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AddLocationForm>(emptyForm);

  const groupId = business?.businessGroupId;

  const { data: locationsData, isLoading } = useQuery<any>({
    queryKey: ["/api/user/locations"],
    enabled: !!user,
  });

  // API returns { locations: [...], activeBusinessId: ... } — extract the array
  const locations: Location[] = locationsData?.locations ?? (Array.isArray(locationsData) ? locationsData : []);

  const addLocationMutation = useMutation({
    mutationFn: async (data: AddLocationForm) => {
      if (!groupId) {
        throw new Error(
          "No business group found. Please contact support to enable multi-location."
        );
      }
      const res = await apiRequest(
        "POST",
        `/api/business-groups/${groupId}/add-location`,
        data
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({
        title: "Location added",
        description:
          "Your new location has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add location",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof AddLocationForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast({
        title: "Validation error",
        description: "Name and email are required.",
        variant: "destructive",
      });
      return;
    }
    addLocationMutation.mutate(form);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Locations</h3>
          <p className="text-sm text-muted-foreground">
            Manage all locations in your business group.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Location</DialogTitle>
              <DialogDescription>
                Create a new location under your business group. Each location
                gets its own dashboard, customers, and settings.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="loc-name">Business Name *</Label>
                  <Input
                    id="loc-name"
                    placeholder="e.g., Joe's Pizza - Downtown"
                    value={form.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="loc-label">Location Label</Label>
                  <Input
                    id="loc-label"
                    placeholder='e.g., "Downtown", "North Side"'
                    value={form.locationLabel}
                    onChange={(e) =>
                      handleInputChange("locationLabel", e.target.value)
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="loc-address">Address</Label>
                  <Input
                    id="loc-address"
                    placeholder="123 Main St"
                    value={form.address}
                    onChange={(e) =>
                      handleInputChange("address", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="loc-city">City</Label>
                  <Input
                    id="loc-city"
                    placeholder="New York"
                    value={form.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="loc-state">State</Label>
                  <Input
                    id="loc-state"
                    placeholder="NY"
                    value={form.state}
                    onChange={(e) => handleInputChange("state", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="loc-zip">Zip Code</Label>
                  <Input
                    id="loc-zip"
                    placeholder="10001"
                    value={form.zip}
                    onChange={(e) => handleInputChange("zip", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="loc-phone">Phone</Label>
                  <Input
                    id="loc-phone"
                    placeholder="(555) 123-4567"
                    value={form.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="loc-email">Email *</Label>
                  <Input
                    id="loc-email"
                    type="email"
                    placeholder="downtown@joespizza.com"
                    value={form.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="loc-industry">Industry</Label>
                  <Input
                    id="loc-industry"
                    placeholder="e.g., restaurant, plumbing"
                    value={form.industry}
                    onChange={(e) =>
                      handleInputChange("industry", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="loc-type">Business Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(value) => handleInputChange("type", value)}
                  >
                    <SelectTrigger id="loc-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="plumbing">Plumbing</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="hvac">HVAC</SelectItem>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                      <SelectItem value="medical">Medical</SelectItem>
                      <SelectItem value="salon">Salon</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={addLocationMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addLocationMutation.isPending}>
                  {addLocationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Location"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Multi-location pricing note */}
      {locations.length >= 1 && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Multi-location pricing: businesses with 2 or more locations
              receive a <strong>20% discount</strong> on each location's
              subscription. The discount is applied automatically to your
              consolidated billing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Location Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {locations.map((loc) => (
          <Card
            key={loc.id}
            className={
              loc.id === user?.businessId
                ? "border-primary ring-1 ring-primary/20"
                : ""
            }
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{loc.name}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {loc.id === user?.businessId && (
                    <Badge variant="secondary">Current</Badge>
                  )}
                  <Badge variant={loc.isActive ? "success" : "destructive"}>
                    {loc.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
              {loc.locationLabel && (
                <CardDescription className="flex items-center gap-1.5 mt-1">
                  <Tag className="h-3 w-3" />
                  {loc.locationLabel}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(loc.address || loc.city || loc.state || loc.zip) && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {[
                      loc.address,
                      [loc.city, loc.state].filter(Boolean).join(", "),
                      loc.zip,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              {loc.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{loc.phone}</span>
                </div>
              )}
              {loc.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span>{loc.email}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {locations.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              No locations found. Add your first location to get started.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
