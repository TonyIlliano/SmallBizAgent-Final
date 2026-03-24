import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, MessageSquare } from 'lucide-react';

interface SmsVibeProps {
  onNext: () => void;
}

const VIBE_OPTIONS = [
  {
    value: 'casual_friendly',
    title: 'Casual & Friendly',
    description: 'Laid-back and personable, like texting a friend who happens to run a great business.',
    example: "Hey Marcus! Just wanted to say thanks for coming in today. Your fade is looking clean! See you in a couple weeks?",
  },
  {
    value: 'professional_sharp',
    title: 'Professional & Sharp',
    description: 'Polished and to the point. Conveys competence and reliability.',
    example: "Hi Marcus, thank you for your visit today. We hope you enjoyed your service. Your next appointment can be scheduled at your convenience.",
  },
  {
    value: 'warm_welcoming',
    title: 'Warm & Welcoming',
    description: 'Genuinely caring tone that makes customers feel like family.',
    example: "Hi Marcus! It was so great seeing you today. We always love having you in the chair. Take care and we'll see you soon!",
  },
  {
    value: 'quick_direct',
    title: 'Quick & Direct',
    description: 'Short and efficient. Respects the customer\'s time with no fluff.',
    example: "Thanks for coming in, Marcus. Next opening is in 2 weeks. Want me to book you?",
  },
];

export default function SmsVibe({ onNext }: SmsVibeProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>('');

  const saveMutation = useMutation({
    mutationFn: async (vibeChoice: string) => {
      const res = await apiRequest('PUT', '/api/sms-profile', { vibeChoice });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Vibe saved!' });
      onNext();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving vibe',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <MessageSquare className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">What's your business vibe?</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          This sets the tone for every automated text your AI sends to customers.
          Pick the one that sounds most like you.
        </p>
      </div>

      <RadioGroup value={selected} onValueChange={setSelected} className="grid gap-4">
        {VIBE_OPTIONS.map((option) => (
          <Card
            key={option.value}
            className={`cursor-pointer transition-all ${
              selected === option.value
                ? 'border-primary ring-2 ring-primary/20 shadow-md'
                : 'hover:border-primary/40'
            }`}
            onClick={() => setSelected(option.value)}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor={option.value} className="text-base font-semibold cursor-pointer">
                    {option.title}
                  </Label>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                  <div className="mt-3 rounded-lg bg-muted/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Example SMS:</p>
                    <p className="text-sm italic">"{option.example}"</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </RadioGroup>

      <div className="flex justify-end pt-2">
        <Button
          onClick={() => saveMutation.mutate(selected)}
          disabled={!selected || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  );
}
