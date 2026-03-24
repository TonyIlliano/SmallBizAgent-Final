import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, Clock } from 'lucide-react';

interface SmsResponseTimeProps {
  onNext: () => void;
}

const RESPONSE_OPTIONS = [
  {
    value: 'within_hour',
    title: 'Within the hour',
    description: 'Customers can expect a reply quickly. Great for urgent service businesses.',
  },
  {
    value: 'same_day',
    title: 'Same day',
    description: 'Replies come the same business day. A solid standard for most businesses.',
  },
  {
    value: 'next_business_day',
    title: 'Next business day',
    description: 'Replies may take up to the next working day. Sets relaxed expectations.',
  },
];

export default function SmsResponseTime({ onNext }: SmsResponseTimeProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>('');

  const saveMutation = useMutation({
    mutationFn: async (responseTimeExpectation: string) => {
      const res = await apiRequest('PUT', '/api/sms-profile', { responseTimeExpectation });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Response time saved!' });
      onNext();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">How fast do you respond to new requests?</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          This helps your AI set the right expectations when customers reach out.
        </p>
      </div>

      <RadioGroup value={selected} onValueChange={setSelected} className="grid gap-3">
        {RESPONSE_OPTIONS.map((option) => (
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
                <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor={option.value} className="text-base font-semibold cursor-pointer">
                    {option.title}
                  </Label>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
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
