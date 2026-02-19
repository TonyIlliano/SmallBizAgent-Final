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
import { Plus, X, AlertTriangle, Volume2, VolumeX, Loader2 } from "lucide-react";

/** Curated ElevenLabs voices available for VAPI assistants (must match server VOICE_OPTIONS) */
const VOICE_OPTIONS = [
  { id: 'paula', name: 'Paula', gender: 'Female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/dff5d82d-d16d-45b9-ae73-be2ad8850855.mp3' }, // Paula uses Rachel's voice model
  { id: 'rachel', name: 'Rachel', gender: 'Female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/dff5d82d-d16d-45b9-ae73-be2ad8850855.mp3' },
  { id: 'domi', name: 'Domi', gender: 'Female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/53bd2f5f-bb59-4146-9922-245b2a466c80.mp3' },
  { id: 'bella', name: 'Bella', gender: 'Female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/53bd2f5f-bb59-4146-8822-245b2a466c80.mp3' },
  { id: 'elli', name: 'Elli', gender: 'Female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/bea2dc16-9abf-4162-b011-66531458e022.mp3' },
  { id: 'adam', name: 'Adam', gender: 'Male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3' },
  { id: 'antoni', name: 'Antoni', gender: 'Male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/53bd2f5f-bb59-1111-8822-225b2a466c80.mp3' },
  { id: 'josh', name: 'Josh', gender: 'Male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/bdc4303c-a20d-4cec-97eb-dca625044eac.mp3' },
  { id: 'arnold', name: 'Arnold', gender: 'Male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/2c4395e7-91b1-44cd-8f0f-e4aebd292461.mp3' },
  { id: 'sam', name: 'Sam', gender: 'Male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/yoZ06aMxZJJ28mfd3POQ/1c4d417c-ba80-4de8-874a-a1c57987ea63.mp3' },
];
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play/stop voice preview
  const toggleVoicePreview = async (voiceId: string) => {
    const voice = VOICE_OPTIONS.find(v => v.id === voiceId);
    if (!voice?.previewUrl) return;

    // If same voice is playing, stop it
    if (playingVoice === voiceId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingVoice(null);
      setAudioLoading(false);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setAudioLoading(true);
    setPlayingVoice(null);

    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener('ended', () => {
      setPlayingVoice(null);
      audioRef.current = null;
    });

    audio.addEventListener('error', () => {
      setAudioLoading(false);
      setPlayingVoice(null);
      audioRef.current = null;
      toast({
        title: "Preview unavailable",
        description: "Could not load voice preview. Try selecting the voice and making a test call.",
        variant: "destructive",
      });
    });

    // Set source and wait for it to load before playing
    audio.src = voice.previewUrl;
    audio.load();

    try {
      await audio.play();
      setAudioLoading(false);
      setPlayingVoice(voiceId);
    } catch {
      setAudioLoading(false);
      setPlayingVoice(null);
      audioRef.current = null;
      toast({
        title: "Preview unavailable",
        description: "Your browser blocked audio playback. Click the button again to retry.",
        variant: "destructive",
      });
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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
        greeting: "Thank you for calling. How may I help you today?",
        afterHoursMessage: "I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.",
        customInstructions: "",
        voicemailEnabled: true,
        callRecordingEnabled: false,
        transcriptionEnabled: true,
        maxCallLengthMinutes: 15,
        transferPhoneNumbers: []
      };
    }

    return {
      businessId: safeBusinessId,
      assistantName: config.assistantName || "Alex",
      voiceId: config.voiceId || "paula",
      greeting: config.greeting || "Thank you for calling. How may I help you today?",
      afterHoursMessage: config.afterHoursMessage || "I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.",
      customInstructions: config.customInstructions || "",
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
                    <FormLabel>Assistant Name</FormLabel>
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
                    <FormLabel>Voice</FormLabel>
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
                              {voice.name} ({voice.gender})
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
            
            <FormField
              control={form.control}
              name="customInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Instructions</FormLabel>
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
