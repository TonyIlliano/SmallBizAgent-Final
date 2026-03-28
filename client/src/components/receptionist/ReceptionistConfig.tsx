import { useState, useEffect, useRef } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, AlertTriangle, Volume2, VolumeX, Loader2, Sparkles } from "lucide-react";

/** Available voices for AI receptionist (ElevenLabs, Cartesia, OpenAI via Retell AI) */
const VOICE_OPTIONS = [
  // ElevenLabs voices
  { id: '11labs-Adrian', name: 'Adrian', gender: 'Male', provider: 'ElevenLabs' },
  { id: '11labs-Myra', name: 'Myra', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-Brian', name: 'Brian', gender: 'Male', provider: 'ElevenLabs' },
  { id: '11labs-Aria', name: 'Aria', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-Sarah', name: 'Sarah', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-Roger', name: 'Roger', gender: 'Male', provider: 'ElevenLabs' },
  { id: '11labs-Laura', name: 'Laura', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-George', name: 'George', gender: 'Male', provider: 'ElevenLabs' },
  // Cartesia voices
  { id: 'Tina', name: 'Tina', gender: 'Female', provider: 'Cartesia' },
  { id: 'Marissa', name: 'Marissa', gender: 'Female', provider: 'Cartesia' },
  { id: 'Nathan', name: 'Nathan', gender: 'Male', provider: 'Cartesia' },
  { id: 'Ryan', name: 'Ryan', gender: 'Male', provider: 'Cartesia' },
  { id: 'Paola', name: 'Paola', gender: 'Female', provider: 'Cartesia' },
  { id: 'Kian', name: 'Kian', gender: 'Male', provider: 'Cartesia' },
  // OpenAI voices
  { id: 'openai-alloy', name: 'Alloy', gender: 'Neutral', provider: 'OpenAI' },
  { id: 'openai-echo', name: 'Echo', gender: 'Male', provider: 'OpenAI' },
  { id: 'openai-fable', name: 'Fable', gender: 'Male', provider: 'OpenAI' },
  { id: 'openai-onyx', name: 'Onyx', gender: 'Male', provider: 'OpenAI' },
  { id: 'openai-nova', name: 'Nova', gender: 'Female', provider: 'OpenAI' },
  { id: 'openai-shimmer', name: 'Shimmer', gender: 'Female', provider: 'OpenAI' },
];
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HelpTooltip } from "@/components/ui/help-tooltip";

// Recording disclosure keywords (must match server-side check)
const DISCLOSURE_KEYWORDS = ['recorded', 'recording', 'monitored', 'monitor'];

function hasRecordingDisclosure(greeting: string | null | undefined): boolean {
  if (!greeting) return false;
  const lower = greeting.toLowerCase();
  return DISCLOSURE_KEYWORDS.some(kw => lower.includes(kw));
}

// Zod schema for form validation
const receptionistConfigSchema = z.object({
  businessId: z.number(),
  assistantName: z.string().min(1, "Assistant name is required").max(30, "Name cannot exceed 30 characters").default("Alex"),
  voiceId: z.string().default("paula"),
  greeting: z.string().min(10, "Greeting must be at least 10 characters"),
  afterHoursMessage: z.string().min(10, "After hours message must be at least 10 characters"),
  customInstructions: z.string().max(2000, "Custom instructions cannot exceed 2000 characters").optional().default(""),
  voicemailEnabled: z.boolean().default(true),
  callRecordingEnabled: z.boolean().default(false),
  transcriptionEnabled: z.boolean().default(true),
  aiInsightsEnabled: z.boolean().default(false),
  maxCallLengthMinutes: z.number().min(1, "Max call length must be at least 1 minute").max(60, "Max call length cannot exceed 60 minutes"),
  transferPhoneNumbers: z.array(z.string()).optional(),
});

type ReceptionistConfigFormData = z.infer<typeof receptionistConfigSchema>;

export function ReceptionistConfig({ businessId }: { businessId?: number | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const playingVoiceRef = useRef<string | null>(null);

  // Set up persistent audio element event listeners once
  useEffect(() => {
    const audio = audioRef.current;

    const handleEnded = () => {
      setPlayingVoice(null);
      playingVoiceRef.current = null;
    };

    const handleError = () => {
      setAudioLoading(false);
      setPlayingVoice(null);
      playingVoiceRef.current = null;
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Play/stop voice preview — uses server proxy for reliable same-origin audio playback
  const toggleVoicePreview = (voiceId: string) => {
    const audio = audioRef.current;

    // If same voice is playing, stop it
    if (playingVoiceRef.current === voiceId) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingVoice(null);
      setAudioLoading(false);
      playingVoiceRef.current = null;
      return;
    }

    // Stop any current playback
    audio.pause();
    audio.currentTime = 0;

    // Set new source via server proxy and play
    setAudioLoading(true);
    setPlayingVoice(null);
    playingVoiceRef.current = null;

    audio.src = `/api/voice-preview/${voiceId}`;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setAudioLoading(false);
          setPlayingVoice(voiceId);
          playingVoiceRef.current = voiceId;
        })
        .catch(() => {
          setAudioLoading(false);
          setPlayingVoice(null);
          playingVoiceRef.current = null;
          toast({
            title: "Preview unavailable",
            description: "Could not play audio. Please try again.",
            variant: "destructive",
          });
        });
    }
  };

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
        assistantName: "Alex",
        voiceId: "paula",
        greeting: "Hi, thanks for calling! Just so you know, this call may be recorded to make sure we're giving you the best service possible. How can I help you today?",
        afterHoursMessage: "I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.",
        customInstructions: "",
        voicemailEnabled: true,
        callRecordingEnabled: false,
        transcriptionEnabled: true,
        aiInsightsEnabled: false,
        maxCallLengthMinutes: 15,
        transferPhoneNumbers: []
      };
    }

    return {
      businessId: safeBusinessId,
      assistantName: config.assistantName || "Alex",
      voiceId: config.voiceId || "paula",
      greeting: config.greeting || "Hi, thanks for calling! Just so you know, this call may be recorded to make sure we're giving you the best service possible. How can I help you today?",
      afterHoursMessage: config.afterHoursMessage || "I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.",
      customInstructions: config.customInstructions || "",
      voicemailEnabled: config.voicemailEnabled,
      callRecordingEnabled: config.callRecordingEnabled,
      transcriptionEnabled: config.transcriptionEnabled,
      aiInsightsEnabled: config.aiInsightsEnabled ?? false,
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

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form.formState.isDirty]);

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="assistantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">Assistant Name <HelpTooltip content="The name your AI introduces itself as on calls. Callers will hear 'Hi, this is [name]'." /></FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Alex"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The name your AI receptionist introduces itself as
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="voiceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">Voice <HelpTooltip content="Choose the voice callers will hear. Click the speaker icon to preview each voice." /></FormLabel>
                    <div className="flex gap-2">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a voice" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {VOICE_OPTIONS.map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>
                              {voice.name} ({voice.gender}) — {voice.provider}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant={playingVoice === field.value ? "destructive" : "outline"}
                        size="icon"
                        className="shrink-0"
                        onClick={() => toggleVoicePreview(field.value)}
                        disabled={audioLoading}
                        title={playingVoice === field.value ? "Stop preview" : "Preview voice"}
                      >
                        {audioLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : playingVoice === field.value ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <FormDescription>
                      Choose the voice for your AI receptionist — click the speaker icon to preview
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="greeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">Greeting Message <HelpTooltip content="First thing callers hear when the AI answers. Keep it warm and natural. Recording disclosure is added automatically if Call Recording is on." /></FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Hi, thanks for calling! Just so you know, this call may be recorded to make sure we're giving you the best service possible. How can I help you today?" 
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
                  <FormLabel className="flex items-center gap-1.5">After Hours Message <HelpTooltip content="What callers hear outside business hours. The AI can still book appointments and answer questions when closed." /></FormLabel>
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
            
            <FormField
              control={form.control}
              name="customInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">Custom Instructions <HelpTooltip content="Special rules for your AI — promotions, emergency handling, upsells, restrictions, or anything specific to your business." /></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={"Examples:\n• Always mention our 10% new customer discount\n• If someone mentions a water leak or gas smell, transfer to a human immediately\n• We deliver within 5 miles — let callers know\n• Never book appointments on Sundays\n• Try to upsell our premium package on every call"}
                      className="min-h-[120px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Tell your AI receptionist what to say, how to behave, or when to take action. These rules are followed on every call — use them for promotions, emergency handling, upsells, restrictions, or anything specific to your business.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
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
                name="aiInsightsEnabled"
                render={({ field }) => {
                  const recordingOn = form.watch("callRecordingEnabled");
                  return (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-amber-500" />
                          AI Insights
                        </FormLabel>
                        <FormDescription>
                          Weekly AI analysis of calls to suggest improvements
                        </FormDescription>
                        {!recordingOn && (
                          <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            Requires Call Recording to be enabled
                          </p>
                        )}
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            if (checked && !recordingOn) {
                              toast({
                                title: "Call Recording required",
                                description: "Enable Call Recording to use AI Insights. The recording disclosure will be added to your greeting automatically.",
                                variant: "destructive",
                              });
                              return;
                            }
                            field.onChange(checked);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="maxCallLengthMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">Max Call Length (minutes) <HelpTooltip content="Calls automatically end after this limit. Most calls complete in 2-5 minutes." /></FormLabel>
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
              <FormLabel className="flex items-center gap-1.5">Call Transfer Numbers <HelpTooltip content="Numbers the AI can transfer callers to when they insist on speaking with a person. Use a cell phone or direct line — not your main business number." /></FormLabel>
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
            
            {form.formState.isDirty && (
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 flex items-center justify-between">
                  <span>You have unsaved changes. Click Save Configuration to apply them.</span>
                  <Button type="submit" size="sm" disabled={isSubmitting} className="ml-4 shrink-0">
                    {isSubmitting ? "Saving..." : "Save Now"}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

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
