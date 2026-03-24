import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';

interface SmsCustomerProps {
  onNext: () => void;
}

export default function SmsCustomer({ onNext }: SmsCustomerProps) {
  const { toast } = useToast();
  const [description, setDescription] = useState('');

  const saveMutation = useMutation({
    mutationFn: async (typicalCustomerDescription: string) => {
      const res = await apiRequest('PUT', '/api/sms-profile', { typicalCustomerDescription });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Customer description saved!' });
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
          <Users className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Describe your typical customer</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          The more your AI knows about who you serve, the better it can talk to them.
          Think about age, style, what brings them in, what they care about.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 pb-6 space-y-3">
          <Label htmlFor="customer-desc" className="text-base font-semibold">
            Who walks through your door?
          </Label>
          <Textarea
            id="customer-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Regulars from the neighborhood, mostly guys 20-45 who want a clean fade"
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            A sentence or two is plenty. This helps the AI match the language and tone
            your customers expect.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          onClick={() => saveMutation.mutate(description)}
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
