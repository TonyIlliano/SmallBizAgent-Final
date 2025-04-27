import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Save, Trash2, Zap, MessageCircle, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Intent = {
  intentId?: string;
  intentName?: string;
  name: string;
  description: string;
  sampleUtterances: string[];
};

type TrainingStatus = {
  status: string;
  lastUpdated?: string | Date;
  intents?: Intent[];
  error?: string;
};

const defaultIntent: Intent = {
  name: "",
  description: "",
  sampleUtterances: [""],
};

export default function TrainingInterface() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeIntent, setActiveIntent] = useState<Intent | null>(null);
  const [isNewIntent, setIsNewIntent] = useState(false);
  const [activeTab, setActiveTab] = useState("intents");
  const [testUtterance, setTestUtterance] = useState("");
  const [testUtteranceResult, setTestUtteranceResult] = useState<{ 
    intent: string;
    confidence: number;
    matched: boolean;
  } | null>(null);
  const [isOpenTester, setIsOpenTester] = useState(false);

  // Fetch training status
  const { 
    data: trainingStatus, 
    isLoading: isLoadingStatus,
    error: statusError 
  } = useQuery<TrainingStatus>({
    queryKey: ["/api/training/status"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch intents
  const { 
    data: intents = [], 
    isLoading: isLoadingIntents,
    error: intentsError
  } = useQuery<Intent[]>({
    queryKey: ["/api/training/intents"],
  });

  // Create new intent
  const createIntentMutation = useMutation({
    mutationFn: async (intent: Intent) => {
      try {
        const res = await apiRequest("POST", "/api/training/intents", intent);
        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error creating intent:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/intents"] });
      setActiveIntent(null);
      setIsNewIntent(false);
      toast({
        title: "Intent created",
        description: "The intent was created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Create intent mutation error:", error);
      toast({
        title: "Failed to create intent",
        description: error?.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Update intent
  const updateIntentMutation = useMutation({
    mutationFn: async (intent: Intent) => {
      try {
        if (!intent.intentId) {
          throw new Error("Intent ID is required for updates");
        }
        const res = await apiRequest("PUT", `/api/training/intents/${intent.intentId}`, {
          name: intent.name,
          description: intent.description,
          sampleUtterances: intent.sampleUtterances,
        });
        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error updating intent:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/intents"] });
      setActiveIntent(null);
      toast({
        title: "Intent updated",
        description: "The intent was updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Update intent mutation error:", error);
      toast({
        title: "Failed to update intent",
        description: error?.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Delete intent
  const deleteIntentMutation = useMutation({
    mutationFn: async (intentId: string) => {
      try {
        const res = await apiRequest("DELETE", `/api/training/intents/${intentId}`);
        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error deleting intent:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/intents"] });
      setActiveIntent(null);
      toast({
        title: "Intent deleted",
        description: "The intent was deleted successfully",
      });
    },
    onError: (error: any) => {
      console.error("Delete intent mutation error:", error);
      toast({
        title: "Failed to delete intent",
        description: error?.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Build bot to apply changes
  const buildBotMutation = useMutation({
    mutationFn: async () => {
      try {
        const res = await apiRequest("POST", "/api/training/build");
        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error building bot:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/status"] });
      toast({
        title: "Bot build initiated",
        description: "The virtual receptionist is being updated with your changes",
      });
    },
    onError: (error: any) => {
      console.error("Build bot mutation error:", error);
      toast({
        title: "Failed to build bot",
        description: error?.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });
  
  // Test an utterance against the trained bot
  const testUtteranceMutation = useMutation({
    mutationFn: async (utterance: string) => {
      try {
        const res = await apiRequest("POST", "/api/training/test", { utterance });
        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error testing utterance:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      setTestUtteranceResult({
        intent: data.intent || "Unknown",
        confidence: data.confidence || 0,
        matched: data.confidence > 0.6,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to test utterance",
        description: error?.message || "Please make sure you've built the bot first.",
        variant: "destructive",
      });
      setTestUtteranceResult(null);
    },
  });

  // Handle adding a new sample utterance
  const addUtterance = () => {
    if (!activeIntent) return;
    setActiveIntent({
      ...activeIntent,
      sampleUtterances: [...activeIntent.sampleUtterances, ""],
    });
  };

  // Handle updating a sample utterance
  const updateUtterance = (index: number, value: string) => {
    if (!activeIntent) return;
    const updatedUtterances = [...activeIntent.sampleUtterances];
    updatedUtterances[index] = value;
    setActiveIntent({
      ...activeIntent,
      sampleUtterances: updatedUtterances,
    });
  };

  // Handle removing a sample utterance
  const removeUtterance = (index: number) => {
    if (!activeIntent) return;
    const updatedUtterances = activeIntent.sampleUtterances.filter((_, i) => i !== index);
    setActiveIntent({
      ...activeIntent,
      sampleUtterances: updatedUtterances,
    });
  };

  // Track utterance save status for visual indicators
  const [utteranceSaveStatus, setUtteranceSaveStatus] = useState<{
    saved: boolean;
    timestamp: number;
  }>({ saved: true, timestamp: 0 });

  // Reset save status when utterances change
  useEffect(() => {
    if (activeIntent) {
      setUtteranceSaveStatus({ saved: false, timestamp: Date.now() });
    }
  }, [activeIntent?.sampleUtterances]);

  // Handle saving the intent
  const saveIntent = () => {
    if (!activeIntent) return;
    
    // Validate
    if (!activeIntent.name) {
      toast({
        title: "Validation error",
        description: "Intent name is required",
        variant: "destructive",
      });
      return;
    }
    
    if (!activeIntent.description) {
      toast({
        title: "Validation error",
        description: "Intent description is required",
        variant: "destructive",
      });
      return;
    }
    
    if (activeIntent.sampleUtterances.some(u => !u)) {
      toast({
        title: "Validation error",
        description: "All sample utterances must have text",
        variant: "destructive",
      });
      return;
    }
    
    if (activeIntent.sampleUtterances.length === 0) {
      toast({
        title: "Validation error",
        description: "At least one sample utterance is required",
        variant: "destructive",
      });
      return;
    }
    
    if (isNewIntent) {
      createIntentMutation.mutate(activeIntent);
    } else {
      updateIntentMutation.mutate(activeIntent);
    }
    
    // Mark utterances as saved
    setUtteranceSaveStatus({ saved: true, timestamp: Date.now() });
  };

  // Select an intent to edit
  const selectIntent = (intent: Intent) => {
    setActiveIntent(intent);
    setIsNewIntent(false);
  };

  // Create a new intent
  const newIntent = () => {
    setActiveIntent(defaultIntent);
    setIsNewIntent(true);
  };

  // Format build status
  const formatStatus = (status: string) => {
    switch (status) {
      case "BUILDING":
      case "IN_PROGRESS":
        return <Badge className="bg-yellow-500">Building</Badge>;
      case "READY":
      case "BUILT":
        return <Badge className="bg-green-500">Ready</Badge>;
      case "FAILED":
        return <Badge className="bg-red-500">Failed</Badge>;
      default:
        return <Badge className="bg-slate-500">Unknown</Badge>;
    }
  };

  return (
    <>
      <Tabs defaultValue="intents" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="intents">Intents</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="intents" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Virtual Receptionist Training</h2>
            <div className="flex space-x-2">
              <Button onClick={newIntent} disabled={createIntentMutation.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                New Intent
              </Button>
              
              <Button 
                onClick={() => buildBotMutation.mutate()} 
                disabled={buildBotMutation.isPending || isLoadingStatus || trainingStatus?.status === "BUILDING"}
                variant="outline"
              >
                {buildBotMutation.isPending || trainingStatus?.status === "BUILDING" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Apply Changes
              </Button>
            </div>
          </div>

          {trainingStatus && (
            <Alert>
              <AlertTitle className="flex items-center">
                Bot Status: {formatStatus(trainingStatus.status)}
              </AlertTitle>
              <AlertDescription>
                {trainingStatus.status === "BUILDING" ? (
                  "Your changes are being applied. This may take a few minutes."
                ) : trainingStatus.status === "READY" ? (
                  "The virtual receptionist is ready to handle calls."
                ) : trainingStatus.status === "FAILED" ? (
                  "There was an error applying your changes. Please try again."
                ) : (
                  "The virtual receptionist is being configured."
                )}
                
                {trainingStatus.lastUpdated && (
                  <div className="mt-2 text-sm text-gray-500">
                    Last updated: {new Date(trainingStatus.lastUpdated).toLocaleString()}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {statusError && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to load training status. Please try refreshing the page.
                {statusError instanceof Error && `: ${statusError.message}`}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Intents</CardTitle>
                <CardDescription>
                  Select an intent to edit or create a new one
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingIntents ? (
                  <div className="py-4 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : intentsError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to load intents.
                      {intentsError instanceof Error && `: ${intentsError.message}`}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-2">
                    {intents.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        No intents found. Create your first one.
                      </div>
                    ) : (
                      intents.map((intent: Intent) => {
                        // Handle both name and intentName property
                        const displayName = intent.name || intent.intentName || "Unnamed Intent";
                        return (
                          <Button
                            key={intent.intentId || displayName}
                            variant={activeIntent?.name === displayName ? "default" : "outline"}
                            className="w-full justify-start mb-2"
                            onClick={() => {
                              // Normalize the intent before setting it as active
                              const normalizedIntent: Intent = {
                                ...intent,
                                name: displayName,
                                description: intent.description || "",
                                sampleUtterances: intent.sampleUtterances || []
                              };
                              selectIntent(normalizedIntent);
                            }}
                          >
                            {displayName}
                          </Button>
                        );
                      })
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>
                  {isNewIntent ? "Create New Intent" : activeIntent ? `Edit Intent: ${activeIntent.name}` : "Select an Intent"}
                </CardTitle>
                <CardDescription>
                  {activeIntent
                    ? "Configure how your virtual receptionist should understand this intent"
                    : "Select an intent from the list or create a new one"}
                </CardDescription>
              </CardHeader>
              {activeIntent ? (
                <>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Intent Name</Label>
                      <Input
                        id="name"
                        value={activeIntent.name}
                        onChange={(e) => setActiveIntent({ ...activeIntent, name: e.target.value })}
                        placeholder="Appointment"
                      />
                      <p className="text-xs text-muted-foreground">
                        A clear, concise name for this intent (e.g., Appointment, BusinessHours)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={activeIntent.description}
                        onChange={(e) => setActiveIntent({ ...activeIntent, description: e.target.value })}
                        placeholder="Schedule an appointment or booking"
                        rows={2}
                      />
                      <p className="text-xs text-muted-foreground">
                        A brief description of what this intent represents
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Label>Sample Utterances</Label>
                          {!utteranceSaveStatus.saved && (
                            <span className="text-xs text-amber-500 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Unsaved changes
                            </span>
                          )}
                          {utteranceSaveStatus.saved && utteranceSaveStatus.timestamp > 0 && (
                            <span className="text-xs text-green-500 flex items-center gap-1">
                              <Check className="h-3 w-3" /> Saved
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsOpenTester(true)}
                            type="button"
                            className="text-xs flex items-center"
                          >
                            <MessageCircle className="h-4 w-4 mr-1" /> Test Utterances
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={addUtterance}
                            type="button"
                          >
                            <Plus className="h-4 w-4 mr-1" /> Add Example
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Add examples of how customers might express this intent
                      </p>

                      {activeIntent.sampleUtterances.map((utterance, index) => (
                        <div key={index} className="flex items-center space-x-2 mb-2">
                          <Input
                            value={utterance}
                            onChange={(e) => updateUtterance(index, e.target.value)}
                            placeholder="I need to schedule an appointment"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            type="button"
                            onClick={() => removeUtterance(index)}
                            disabled={activeIntent.sampleUtterances.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setActiveIntent(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={saveIntent}
                        disabled={createIntentMutation.isPending || updateIntentMutation.isPending}
                      >
                        {(createIntentMutation.isPending || updateIntentMutation.isPending) && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        <Save className="mr-2 h-4 w-4" />
                        Save Intent
                      </Button>
                    </div>

                    {!isNewIntent && activeIntent.intentId && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this intent. Your virtual receptionist will no longer recognize this type of customer request.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteIntentMutation.mutate(activeIntent.intentId!)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              {deleteIntentMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                              )}
                              Delete Intent
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </CardFooter>
                </>
              ) : (
                <CardContent>
                  <div className="py-8 text-center text-muted-foreground">
                    Select an intent from the list or create a new one to get started
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <h2 className="text-2xl font-bold">Settings</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Emergency Keywords</CardTitle>
              <CardDescription>
                Define keywords that should be flagged as emergency situations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                The virtual receptionist will immediately transfer any calls containing these keywords to a staff member.
              </p>
              
              <Alert>
                <AlertDescription>
                  This feature is coming soon. In the meantime, you can create an "Emergency" intent with emergency keywords as sample utterances.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Greetings & Messages</CardTitle>
              <CardDescription>
                Customize the messages your virtual receptionist uses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Personalize how your virtual receptionist greets callers and responds to their requests.
              </p>
              
              <Alert>
                <AlertDescription>
                  This feature is coming soon. You'll be able to customize greetings, confirmations, and other messages.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isOpenTester} onOpenChange={setIsOpenTester}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Test Utterances</DialogTitle>
            <DialogDescription>
              Enter a phrase to see how your virtual receptionist would interpret it
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Type a test phrase here..."
                value={testUtterance}
                onChange={(e) => setTestUtterance(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={() => {
                  if (testUtterance.trim()) {
                    testUtteranceMutation.mutate(testUtterance);
                  }
                }}
                disabled={testUtteranceMutation.isPending || !testUtterance.trim()}
              >
                {testUtteranceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4 mr-2" />
                )}
                Test
              </Button>
            </div>
            
            {testUtteranceResult && (
              <div className="border rounded-md p-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Result:</h4>
                  {testUtteranceResult.matched ? (
                    <Badge className="bg-green-500">Matched</Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-500 border-amber-500">
                      Low Confidence
                    </Badge>
                  )}
                </div>
                <p className="text-sm mb-1">
                  <span className="font-medium">Detected Intent:</span> {testUtteranceResult.intent}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Confidence:</span>{" "}
                  {Math.round(testUtteranceResult.confidence * 100)}%
                </p>
                {!testUtteranceResult.matched && (
                  <Alert>
                    <AlertDescription>
                      Low confidence means the bot isn't sure about this intent. Consider adding more example utterances.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-2">
              Note: The test uses the most recently built version of your virtual receptionist.
              Make sure to click "Apply Changes" after making updates to test the latest version.
            </p>
          </div>
          
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsOpenTester(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}