import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles } from 'lucide-react';

interface SmsUniqueProps {
  onNext: () => void;
}

export default function SmsUnique({ onNext }: SmsUniqueProps) {
  const { toast } = useToast();
  const [uniqueThing, setUniqueThing] = useState('');

  const saveMutation = useMutation({
    mutationFn: async (oneThingCustomersShouldKnow: string) => {
      const res = await apiRequest('PUT', '/api/sms-profile', { oneThingCustomersShouldKnow });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Saved!' });
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
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">One thing customers should know about you</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          What makes you different? Your AI will weave this into messages naturally --
          it could be your speed, your quality, your personality, anything.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 pb-6 space-y-3">
          <Label htmlFor="unique-thing" className="text-base font-semibold">
            What sets you apart?
          </Label>
          <Textarea
            id="unique-thing"
            value={uniqueThing}
            onChange={(e) => setUniqueThing(e.target.value)}
            placeholder="We always run on time and never rush a cut"
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            One sentence is all it takes. Think about what your happiest customers would say about you.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          onClick={() => saveMutation.mutate(uniqueThing)}
          disabled={saveMutation.isPending}
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
