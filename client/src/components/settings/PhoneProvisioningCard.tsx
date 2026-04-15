import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Phone,
  PhoneCall,
  Power,
  PowerOff,
  AlertTriangle,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  ArrowRight,
  Info,
} from "lucide-react";

export default function PhoneProvisioningCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const businessId = user?.businessId;

  const [forwardingInfoOpen, setForwardingInfoOpen] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneDialogTab, setPhoneDialogTab] = useState<"new" | "existing">("new");
  const [searchAreaCode, setSearchAreaCode] = useState("");
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch business profile
  const { data: business, isLoading: isLoadingBusiness } = useQuery<any>({
    queryKey: ["/api/business"],
    enabled: !!businessId,
  });

  // Poll provisioning status when it may be in progress
  const { data: provisioningStatus } = useQuery<any>({
    queryKey: [`/api/business/${businessId}/provisioning-status`],
    enabled:
      !!businessId &&
      (!business?.twilioPhoneNumber || (!business?.retellAgentId && !business?.vapiAssistantId)),
    refetchInterval: (query) => {
      const status = query.state.data?.provisioningStatus;
      if (status === "in_progress" || status === "pending") {
        return 5000;
      }
      return false;
    },
  });

  // When provisioning completes, refresh the business data
  useEffect(() => {
    if (provisioningStatus?.provisioningStatus === "completed") {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
    }
  }, [provisioningStatus?.provisioningStatus, queryClient]);

  // Pre-fill area code from business phone
  useEffect(() => {
    if (business?.phone && !searchAreaCode) {
      const digits = business.phone.replace(/\D/g, "");
      if (digits.length >= 3) {
        setSearchAreaCode(digits.substring(0, 3));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.phone]);

  const toggleReceptionistMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest(
        "POST",
        `/api/business/${businessId}/receptionist/toggle`,
        { enabled }
      );
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: data.receptionistEnabled ? "AI Receptionist Enabled" : "AI Receptionist Disabled",
        description: data.receptionistEnabled
          ? "Your AI receptionist is now answering calls"
          : "Your AI receptionist has been paused and will not answer calls",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update receptionist status",
        variant: "destructive",
      });
    },
  });

  const deprovisionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/business/${businessId}/receptionist/deprovision`
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: "AI Receptionist Cancelled",
        description: "Your phone number has been released and the AI assistant has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to deprovision receptionist",
        variant: "destructive",
      });
    },
  });

  const provisionMutation = useMutation({
    mutationFn: async (params?: { phoneNumber?: string; areaCode?: string }) => {
      const body: any = {};
      if (params?.phoneNumber) {
        body.phoneNumber = params.phoneNumber;
      } else if (params?.areaCode) {
        body.areaCode = params.areaCode;
      } else {
        body.areaCode = business?.phone?.replace(/\D/g, "").substring(0, 3) || "212";
      }
      const response = await apiRequest(
        "POST",
        `/api/business/${businessId}/receptionist/provision`,
        body
      );
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      setPhoneDialogOpen(false);
      setAvailableNumbers([]);
      setSelectedPhoneNumber(null);
      toast({
        title: "AI Receptionist Activated!",
        description: `Your new phone number is ${formatPhoneNumber(data.phoneNumber)}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to provision receptionist. Please contact support.",
        variant: "destructive",
      });
    },
  });

  // Search available phone numbers
  const searchNumbers = async () => {
    if (!searchAreaCode || searchAreaCode.length !== 3 || !/^\d{3}$/.test(searchAreaCode)) {
      toast({
        title: "Invalid area code",
        description: "Please enter a 3-digit area code",
        variant: "destructive",
      });
      return;
    }
    setIsSearching(true);
    setSelectedPhoneNumber(null);
    try {
      const response = await apiRequest(
        "GET",
        `/api/business/${businessId}/available-numbers?areaCode=${searchAreaCode}`
      );
      const data = await response.json();
      setAvailableNumbers(data.phoneNumbers || []);
      if ((data.phoneNumbers || []).length === 0) {
        toast({
          title: "No numbers found",
          description: `No phone numbers available in area code ${searchAreaCode}. Try a different area code.`,
        });
      }
    } catch {
      toast({
        title: "Search failed",
        description: "Failed to search for available numbers. Please try again.",
        variant: "destructive",
      });
      setAvailableNumbers([]);
    } finally {
      setIsSearching(false);
    }
  };

  if (!businessId) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <PhoneCall className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Virtual Receptionist Phone Number</CardTitle>
            <CardDescription>
              Your dedicated business phone number for the AI receptionist
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingBusiness ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin w-6 h-6 border-4 border-primary rounded-full border-t-transparent"></div>
          </div>
        ) : business?.twilioPhoneNumber ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <Phone className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <p className="text-2xl font-bold tracking-wide">
                  {formatPhoneNumber(business.twilioPhoneNumber)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Provisioned on{" "}
                  {business.twilioDateProvisioned
                    ? new Date(business.twilioDateProvisioned).toLocaleDateString()
                    : "N/A"}
                </p>
              </div>
              <Badge
                variant="default"
                className={
                  business.receptionistEnabled !== false
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-yellow-500 hover:bg-yellow-600"
                }
              >
                {business.receptionistEnabled !== false ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Customers can call this number to reach your AI-powered virtual receptionist. The
              receptionist will handle calls, answer questions, and book appointments on your behalf.
            </p>

            {/* Toggle and Deprovision Controls */}
            <div className="border-t pt-4 mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">AI Receptionist Status</label>
                  <p className="text-sm text-muted-foreground">
                    {business.receptionistEnabled !== false
                      ? "Your AI receptionist is answering calls"
                      : "Your AI receptionist is paused and not answering calls"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {toggleReceptionistMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {business.receptionistEnabled !== false ? (
                        <Power className="h-4 w-4 text-green-500" />
                      ) : (
                        <PowerOff className="h-4 w-4 text-yellow-500" />
                      )}
                    </>
                  )}
                  <Switch
                    checked={business.receptionistEnabled !== false}
                    onCheckedChange={(checked) => toggleReceptionistMutation.mutate(checked)}
                    disabled={toggleReceptionistMutation.isPending}
                  />
                </div>
              </div>

              {/* Deprovision Option */}
              <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-destructive">
                    Cancel AI Receptionist
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Release your phone number and remove the AI assistant
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      Deprovision
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Cancel AI Receptionist?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>
                            Release your phone number (
                            {formatPhoneNumber(business.twilioPhoneNumber)})
                          </li>
                          <li>Delete your AI assistant configuration</li>
                          <li>Stop all incoming call handling</li>
                        </ul>
                        <p className="mt-3 font-medium">
                          You can re-enable the AI receptionist later, but you will be assigned a new
                          phone number.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Active</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deprovisionMutation.mutate()}
                        disabled={deprovisionMutation.isPending}
                      >
                        {deprovisionMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Deprovisioning...
                          </>
                        ) : (
                          "Yes, Cancel Receptionist"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Call Forwarding Instructions */}
              <Collapsible open={forwardingInfoOpen} onOpenChange={setForwardingInfoOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between" size="sm">
                    <span className="flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Call Forwarding Setup
                    </span>
                    {forwardingInfoOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                    <p className="text-sm font-medium">
                      Want calls to your existing business number to reach this AI receptionist?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Set up call forwarding from your current business phone to this number:
                    </p>
                    <div className="flex items-center gap-2 p-2 bg-white dark:bg-background rounded border font-mono text-lg">
                      <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                      {formatPhoneNumber(business.twilioPhoneNumber)}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">How to set up forwarding:</p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        <li>
                          <strong>Most carriers:</strong> Dial{" "}
                          <code className="bg-muted px-1 rounded">*72</code> followed by{" "}
                          <code className="bg-muted px-1 rounded">
                            {formatPhoneNumber(business.twilioPhoneNumber)}
                          </code>
                        </li>
                        <li>
                          <strong>To disable forwarding:</strong> Dial{" "}
                          <code className="bg-muted px-1 rounded">*73</code>
                        </li>
                        <li>
                          <strong>Alternative:</strong> Contact your phone provider and ask to
                          forward calls to {formatPhoneNumber(business.twilioPhoneNumber)}
                        </li>
                      </ul>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Forwarding codes may vary by carrier. Check with your provider if *72/*73
                      don't work.
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center py-6">
              <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-1">No Phone Number Assigned</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Get a dedicated phone number for your AI receptionist, or forward your existing
                business number.
              </p>

              {(provisioningStatus?.provisioningStatus === "in_progress" ||
                provisionMutation.isPending) && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up your AI receptionist... This may take a minute.
                </div>
              )}

              {provisioningStatus?.provisioningStatus === "failed" &&
                !provisionMutation.isPending && (
                  <div className="text-sm text-destructive mb-4">
                    Provisioning encountered an issue. Click below to try again.
                  </div>
                )}

              <Button
                onClick={() => {
                  setPhoneDialogOpen(true);
                  setPhoneDialogTab("new");
                  setAvailableNumbers([]);
                  setSelectedPhoneNumber(null);
                }}
                disabled={
                  provisionMutation.isPending ||
                  provisioningStatus?.provisioningStatus === "in_progress"
                }
              >
                {provisionMutation.isPending ||
                provisioningStatus?.provisioningStatus === "in_progress" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Provisioning...
                  </>
                ) : (
                  <>
                    <Phone className="mr-2 h-4 w-4" />
                    Enable AI Receptionist
                  </>
                )}
              </Button>
            </div>

            {/* Phone Number Provisioning Dialog */}
            <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
              <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                  <DialogTitle>Set Up Your AI Receptionist Phone</DialogTitle>
                  <DialogDescription>
                    Choose how you'd like to connect your AI receptionist
                  </DialogDescription>
                </DialogHeader>

                <div className="flex gap-2 border-b pb-3">
                  <Button
                    variant={phoneDialogTab === "new" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPhoneDialogTab("new")}
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Get a New Number
                  </Button>
                  <Button
                    variant={phoneDialogTab === "existing" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPhoneDialogTab("existing")}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Use My Existing Number
                  </Button>
                </div>

                {phoneDialogTab === "new" && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Search for a phone number in your preferred area code, or let us pick one for
                      you.
                    </p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Area code (e.g. 443)"
                          value={searchAreaCode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").substring(0, 3);
                            setSearchAreaCode(val);
                          }}
                          maxLength={3}
                        />
                      </div>
                      <Button
                        onClick={searchNumbers}
                        disabled={isSearching || searchAreaCode.length !== 3}
                      >
                        {isSearching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        <span className="ml-2">Search</span>
                      </Button>
                    </div>

                    {availableNumbers.length > 0 && (
                      <div className="max-h-[250px] overflow-y-auto border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Phone Number</TableHead>
                              <TableHead>Location</TableHead>
                              <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {availableNumbers.map((num: any) => (
                              <TableRow
                                key={num.phoneNumber}
                                className={
                                  selectedPhoneNumber === num.phoneNumber ? "bg-primary/10" : ""
                                }
                              >
                                <TableCell className="font-mono">
                                  {formatPhoneNumber(num.phoneNumber)}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {num.locality
                                      ? `${num.locality}, ${num.region}`
                                      : num.region || "US"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant={
                                      selectedPhoneNumber === num.phoneNumber
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => setSelectedPhoneNumber(num.phoneNumber)}
                                  >
                                    {selectedPhoneNumber === num.phoneNumber
                                      ? "Selected"
                                      : "Select"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          provisionMutation.mutate({
                            areaCode: searchAreaCode.length === 3 ? searchAreaCode : undefined,
                          })
                        }
                        disabled={provisionMutation.isPending}
                      >
                        {provisionMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Just Assign Me One
                      </Button>
                      {selectedPhoneNumber && (
                        <Button
                          onClick={() =>
                            provisionMutation.mutate({ phoneNumber: selectedPhoneNumber })
                          }
                          disabled={provisionMutation.isPending}
                        >
                          {provisionMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Phone className="mr-2 h-4 w-4" />
                          )}
                          Use {formatPhoneNumber(selectedPhoneNumber || "")}
                        </Button>
                      )}
                    </DialogFooter>
                  </div>
                )}

                {phoneDialogTab === "existing" && (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium mb-2">How it works:</p>
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            1
                          </span>
                          <p>We'll provision an AI receptionist number for you</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            2
                          </span>
                          <p>
                            Set up call forwarding from your existing business number to the new AI
                            number
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            3
                          </span>
                          <p>
                            Calls to your business number will automatically be answered by your AI
                            receptionist
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Preferred area code (optional)</label>
                      <Input
                        placeholder="Area code (e.g. 443)"
                        value={searchAreaCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").substring(0, 3);
                          setSearchAreaCode(val);
                        }}
                        maxLength={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        We'll try to get a number in this area code. Leave blank for any available
                        number.
                      </p>
                    </div>

                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium mb-1">
                        After setup, you'll forward your existing number:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        <li>
                          <strong>Most carriers:</strong> Dial{" "}
                          <code className="bg-background px-1 rounded">*72</code> + your new AI
                          number
                        </li>
                        <li>
                          <strong>To disable:</strong> Dial{" "}
                          <code className="bg-background px-1 rounded">*73</code>
                        </li>
                        <li>Or contact your phone provider to set up forwarding</li>
                      </ul>
                    </div>

                    <DialogFooter>
                      <Button
                        onClick={() =>
                          provisionMutation.mutate({
                            areaCode: searchAreaCode.length === 3 ? searchAreaCode : undefined,
                          })
                        }
                        disabled={provisionMutation.isPending}
                      >
                        {provisionMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Provisioning...
                          </>
                        ) : (
                          <>
                            <Phone className="mr-2 h-4 w-4" />
                            Provision AI Number
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
