import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";

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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Zod schema for form validation
const receptionistConfigSchema = z.object({
  businessId: z.number(),
  greeting: z.string().min(10, "Greeting must be at least 10 characters"),
  afterHoursMessage: z.string().min(10, "After hours message must be at least 10 characters"),
  emergencyKeywords: z.array(z.string()).optional(),
  voicemailEnabled: z.boolean().default(true),
  callRecordingEnabled: z.boolean().default(false),
  transcriptionEnabled: z.boolean().default(true),
  maxCallLengthMinutes: z.number().min(1, "Max call length must be at least 1 minute").max(60, "Max call length cannot exceed 60 minutes"),
  transferPhoneNumbers: z.array(z.string()).optional(),
});

type ReceptionistConfigFormData = z.infer<typeof receptionistConfigSchema>;

export function ReceptionistConfig({ businessId }: { businessId?: number | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");

  // Fetch existing configuration
  const { data: config, isLoading } = useQuery<any>({
    queryKey: [`/api/receptionist-config/${businessId}`],
    enabled: !!businessId,
  });

  // Fetch business data to check for forwarding loop risk
  const { data: business } = useQuery<any>({
    queryKey: [`/api/business/${businessId}`],
    enabled: !!businessId,
  });

  // Convert JSON data to proper form values
  const getDefaultValues = (): ReceptionistConfigFormData => {
    const safeBusinessId = businessId ?? 0;
    if (!config) {
      return {
        businessId: safeBusinessId,
        greeting: "Thank you for calling. How may I help you today?",
        afterHoursMessage: "I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.",
        emergencyKeywords: ["emergency", "urgent", "immediately", "critical", "asap"],
        voicemailEnabled: true,
        callRecordingEnabled: false,
        transcriptionEnabled: true,
        maxCallLengthMinutes: 15,
        transferPhoneNumbers: []
      };
    }

    return {
      businessId: safeBusinessId,
      greeting: config.greeting || "Thank you for calling. How may I help you today?",
      afterHoursMessage: config.afterHoursMessage || "I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.",
      emergencyKeywords: config.emergencyKeywords || [],
      voicemailEnabled: config.voicemailEnabled,
      callRecordingEnabled: config.callRecordingEnabled,
      transcriptionEnabled: config.transcriptionEnabled,
      maxCallLengthMinutes: config.maxCallLengthMinutes || 15,
      transferPhoneNumbers: config.transferPhoneNumbers || []
    };
  };

  const form = useForm<ReceptionistConfigFormData>({
    resolver: zodResolver(receptionistConfigSchema),
    defaultValues: getDefaultValues()
  });

  // Update form when config data is loaded from API
  useEffect(() => {
    if (config) {
      form.reset(getDefaultValues());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Add emergency keyword
  const addEmergencyKeyword = () => {
    if (!newKeyword.trim()) return;
    
    const currentKeywords = form.getValues("emergencyKeywords") || [];
    if (!currentKeywords.includes(newKeyword.trim())) {
      form.setValue("emergencyKeywords", [...currentKeywords, newKeyword.trim()]);
    }
    setNewKeyword("");
  };

  // Remove emergency keyword
  const removeEmergencyKeyword = (keyword: string) => {
    const currentKeywords = form.getValues("emergencyKeywords") || [];
    form.setValue(
      "emergencyKeywords", 
      currentKeywords.filter(k => k !== keyword)
    );
  };

  // Add phone number
  const addPhoneNumber = () => {
    if (!newPhoneNumber.trim()) return;
    
    const currentNumbers = form.getValues("transferPhoneNumbers") || [];
    if (!currentNumbers.includes(newPhoneNumber.trim())) {
      form.setValue("transferPhoneNumbers", [...currentNumbers, newPhoneNumber.trim()]);
    }
    setNewPhoneNumber("");
  };

  // Remove phone number
  const removePhoneNumber = (number: string) => {
    const currentNumbers = form.getValues("transferPhoneNumbers") || [];
    form.setValue(
      "transferPhoneNumbers", 
      currentNumbers.filter(n => n !== number)
    );
  };

  // Update configuration
  const updateMutation = useMutation({
    mutationFn: (data: ReceptionistConfigFormData) => {
      if (config?.id) {
        return apiRequest("PUT", `/api/receptionist-config/${config.id}`, data);
      } else {
        return apiRequest("POST", "/api/receptionist-config", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/receptionist-config/${businessId}`] });
      toast({
        title: "Success",
        description: "Virtual receptionist configuration updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update configuration. Please try again.",
        variant: "destructive",
      });
      console.error("Error updating configuration:", error);
    },
  });

  const onSubmit = async (data: ReceptionistConfigFormData) => {
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center items-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virtual Receptionist Configuration</CardTitle>
        <CardDescription>
          Configure how your virtual receptionist will interact with callers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="greeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Greeting Message</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Thank you for calling. How may I help you today?" 
                      className="min-h-[80px]" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    This is the first message callers will hear when they call your business
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="afterHoursMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>After Hours Message</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff." 
                      className="min-h-[80px]" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    This message plays when someone calls outside of business hours
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormItem>
              <FormLabel>Emergency Keywords</FormLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.watch("emergencyKeywords")?.map((keyword) => (
                  <Badge key={keyword} className="px-3 py-1">
                    {keyword}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2 text-gray-500 hover:text-gray-700"
                      onClick={() => removeEmergencyKeyword(keyword)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
                {(!form.watch("emergencyKeywords") || (form.watch("emergencyKeywords") ?? []).length === 0) && (
                  <span className="text-sm text-gray-500">No emergency keywords added</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add emergency keyword"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={addEmergencyKeyword}
                  disabled={!newKeyword.trim()}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <FormDescription>
                These words will trigger emergency handling if detected in a call
              </FormDescription>
            </FormItem>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="voicemailEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Voicemail Enabled</FormLabel>
                      <FormDescription>
                        Allow callers to leave voicemail messages
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="callRecordingEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Call Recording</FormLabel>
                      <FormDescription>
                        Record calls for quality and training purposes
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="transcriptionEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Call Transcription</FormLabel>
                      <FormDescription>
                        Automatically transcribe calls to text
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="maxCallLengthMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Call Length (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum duration for calls before automatic disconnection
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormItem>
              <FormLabel>Call Transfer Numbers</FormLabel>
              <FormDescription className="mb-2">
                When a caller insists on speaking to a person, the AI will transfer the call to these numbers. Use a cell phone or direct line — <strong>not</strong> your main business number if it forwards to the AI (this would create a loop).
              </FormDescription>
              {/* Forwarding loop warning */}
              {business?.phone && form.watch("transferPhoneNumbers")?.some((num: string) => {
                const normalizeNum = (n: string) => n.replace(/\D/g, '').slice(-10);
                return normalizeNum(num) === normalizeNum(business.phone);
              }) && (
                <Alert variant="destructive" className="mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    One of your transfer numbers matches your business phone number. If your business phone forwards to the AI, this will create an infinite loop. Use a different number like a cell phone.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap gap-2 mb-2">
                {form.watch("transferPhoneNumbers")?.map((number) => (
                  <Badge key={number} className="px-3 py-1">
                    {number}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2 text-gray-500 hover:text-gray-700"
                      onClick={() => removePhoneNumber(number)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
                {(!form.watch("transferPhoneNumbers") || (form.watch("transferPhoneNumbers") ?? []).length === 0) && (
                  <span className="text-sm text-gray-500">No transfer numbers added — AI will offer to take a message instead</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add phone number (555-123-4567)"
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={addPhoneNumber}
                  disabled={!newPhoneNumber.trim()}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
            </FormItem>
            
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
