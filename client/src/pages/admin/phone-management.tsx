import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Phone, Search, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";

// Type definitions
type PhoneNumberData = {
  businessId: number;
  businessName: string;
  phoneNumber: string | null;
  phoneNumberSid: string | null;
  dateProvisioned: string | null;
  status: "active" | "not provisioned";
};

type AvailablePhoneNumber = {
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
};

const PhoneManagementPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [areaCode, setAreaCode] = useState("");
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [provisionDialogOpen, setProvisionDialogOpen] = useState(false);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState("");
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);

  // Redirect if not admin
  if (user && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  // Fetch all phone numbers
  const {
    data: phoneNumbers,
    isLoading: isLoadingPhoneNumbers,
    error: phoneNumbersError,
    refetch: refetchPhoneNumbers
  } = useQuery({
    queryKey: ["/api/admin/phone-numbers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/phone-numbers");
      const data = await res.json();
      return data.phoneNumbers;
    },
    enabled: !!user && user.role === "admin"
  });

  // Fetch available phone numbers when area code is provided
  const {
    data: availablePhoneNumbers,
    isLoading: isLoadingAvailableNumbers,
    error: availableNumbersError,
    refetch: refetchAvailableNumbers
  } = useQuery({
    queryKey: ["/api/admin/phone-numbers/available", areaCode],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/phone-numbers/available?areaCode=${areaCode}`);
      const data = await res.json();
      return data.phoneNumbers;
    },
    enabled: !!areaCode && areaCode.length === 3 && searchDialogOpen,
  });

  // Provision a phone number
  const provisionMutation = useMutation({
    mutationFn: async ({ businessId, phoneNumber }: { businessId: number, phoneNumber: string }) => {
      const res = await apiRequest("POST", "/api/admin/phone-numbers/provision", {
        businessId,
        phoneNumber
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Phone number provisioned successfully",
        description: "The business now has an assigned phone number.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/phone-numbers"] });
      setProvisionDialogOpen(false);
      setSelectedPhoneNumber("");
      setSelectedBusinessId(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to provision phone number",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  });

  // Release a phone number
  const releaseMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/phone-numbers/${businessId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Phone number released successfully",
        description: "The phone number has been released and is no longer associated with the business.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/phone-numbers"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to release phone number",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  });

  // Handle area code search
  const handleAreaCodeSearch = () => {
    if (areaCode.length !== 3 || !/^\d{3}$/.test(areaCode)) {
      toast({
        title: "Invalid area code",
        description: "Please enter a valid 3-digit area code",
        variant: "destructive",
      });
      return;
    }
    
    refetchAvailableNumbers();
  };

  // Handle provision phone number for a business
  const handleProvisionPhoneNumber = (businessId: number) => {
    setSelectedBusinessId(businessId);
    setProvisionDialogOpen(true);
  };

  // Handle release phone number
  const handleReleasePhoneNumber = (businessId: number) => {
    if (confirm("Are you sure you want to release this phone number? This action cannot be undone.")) {
      releaseMutation.mutate(businessId);
    }
  };

  // If user is not authenticated or not an admin
  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <PageLayout title="Phone Management">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Phone Number Management</h1>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => refetchPhoneNumbers()} disabled={isLoadingPhoneNumbers}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingPhoneNumbers ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setSearchDialogOpen(true)}>
            <Search className="h-4 w-4 mr-2" />
            Search Available Numbers
          </Button>
        </div>
      </div>

      {phoneNumbersError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load phone numbers. Please try again later.
          </AlertDescription>
        </Alert>
      )}

      {/* Phone numbers table */}
      <Card>
        <CardHeader>
          <CardTitle>Business Phone Numbers</CardTitle>
          <CardDescription>
            Manage phone numbers assigned to businesses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPhoneNumbers ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableCaption>List of businesses and their phone numbers</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Business ID</TableHead>
                  <TableHead>Business Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Provisioned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phoneNumbers && phoneNumbers.length > 0 ? (
                  phoneNumbers.map((phone: PhoneNumberData) => (
                    <TableRow key={phone.businessId}>
                      <TableCell>{phone.businessId}</TableCell>
                      <TableCell>{phone.businessName}</TableCell>
                      <TableCell>
                        {phone.phoneNumber || "Not assigned"}
                      </TableCell>
                      <TableCell>
                        <Badge className={phone.status === "active" ? "bg-green-500 hover:bg-green-600" : ""}
                               variant={phone.status === "active" ? "default" : "secondary"}>
                          {phone.status === "active" ? "Active" : "Not Provisioned"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {phone.dateProvisioned 
                          ? new Date(phone.dateProvisioned).toLocaleDateString() 
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        {phone.status === "active" ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReleasePhoneNumber(phone.businessId)}
                            disabled={releaseMutation.isPending}
                          >
                            {releaseMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            Release
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleProvisionPhoneNumber(phone.businessId)}
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Provision
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      No businesses found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog for searching available phone numbers */}
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Search Available Phone Numbers</DialogTitle>
            <DialogDescription>
              Enter a 3-digit area code to search for available phone numbers.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-end gap-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="areaCode">Area Code</Label>
              <Input
                id="areaCode"
                placeholder="e.g. 212"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                maxLength={3}
                pattern="[0-9]{3}"
              />
            </div>
            <Button type="button" onClick={handleAreaCodeSearch} disabled={isLoadingAvailableNumbers}>
              {isLoadingAvailableNumbers ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </Button>
          </div>

          {availableNumbersError && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to search for available phone numbers. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {availablePhoneNumbers && availablePhoneNumbers.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availablePhoneNumbers.map((phone: AvailablePhoneNumber) => (
                    <TableRow key={phone.phoneNumber}>
                      <TableCell>{phone.phoneNumber}</TableCell>
                      <TableCell>{phone.locality}, {phone.region}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => {
                          setSelectedPhoneNumber(phone.phoneNumber);
                          setSearchDialogOpen(false);
                          setProvisionDialogOpen(true);
                        }}>
                          <Plus className="h-4 w-4 mr-2" />
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {availablePhoneNumbers && availablePhoneNumbers.length === 0 && (
            <Alert>
              <AlertTitle>No phone numbers available</AlertTitle>
              <AlertDescription>
                No phone numbers were found in the selected area code. Please try a different area code.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSearchDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for provisioning a phone number */}
      <Dialog open={provisionDialogOpen} onOpenChange={setProvisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provision Phone Number</DialogTitle>
            <DialogDescription>
              {selectedBusinessId 
                ? `Assign a phone number to business ID ${selectedBusinessId}`
                : "Select a business and phone number to provision"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!selectedBusinessId && (
              <div>
                <Label htmlFor="businessId">Business ID</Label>
                <Input
                  id="businessId"
                  type="number"
                  placeholder="Enter business ID"
                  onChange={(e) => setSelectedBusinessId(parseInt(e.target.value))}
                />
              </div>
            )}

            <div>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                placeholder="e.g. +12125551234"
                value={selectedPhoneNumber}
                onChange={(e) => setSelectedPhoneNumber(e.target.value)}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Enter the full phone number in E.164 format (e.g., +12125551234)
              </p>
            </div>

            <Button 
              type="button" 
              onClick={() => setSearchDialogOpen(true)}
              variant="outline"
              className="w-full"
            >
              <Search className="h-4 w-4 mr-2" />
              Search for Available Numbers
            </Button>

            {!selectedBusinessId || !selectedPhoneNumber && (
              <Alert>
                <AlertDescription>
                  Both a business ID and phone number are required to provision a phone number.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProvisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedBusinessId && selectedPhoneNumber) {
                  provisionMutation.mutate({ 
                    businessId: selectedBusinessId, 
                    phoneNumber: selectedPhoneNumber 
                  });
                }
              }}
              disabled={!selectedBusinessId || !selectedPhoneNumber || provisionMutation.isPending}
            >
              {provisionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Phone className="h-4 w-4 mr-2" />
              )}
              Provision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

export default PhoneManagementPage;