import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Smile } from 'lucide-react';

interface SmsStyleProps {
  onNext: () => void;
}

export default function SmsStyle({ onNext }: SmsStyleProps) {
  const { toast } = useToast();
  const [useEmoji, setUseEmoji] = useState(true);
  const [signOffName, setSignOffName] = useState('');

  const saveMutation = useMutation({
    mutationFn: async (data: { useEmoji: boolean; signOffName: string }) => {
      const res = await apiRequest('PUT', '/api/sms-profile', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Style preferences saved!' });
      onNext();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving style',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <Smile className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">A couple quick style picks</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          These small details make your messages feel like they're really coming from you.
        </p>
      </div>

      {/* Emoji toggle */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="emoji-toggle" className="text-base font-semibold">
                Should messages use emoji?
              </Label>
              <p className="text-sm text-muted-foreground">
                {useEmoji
                  ? 'Yes -- messages will include emoji where it feels natural.'
                  : 'No -- messages will be text only, no emoji.'}
              </p>
            </div>
            <Switch
              id="emoji-toggle"
              checked={useEmoji}
              onCheckedChange={setUseEmoji}
            />
          </div>
          <div className="mt-4 rounded-lg bg-muted/60 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Preview:</p>
            <p className="text-sm">
              {useEmoji
                ? '"Thanks for coming in today! Your fade is looking great. See you next time!"'
                : '"Thanks for coming in today. Your fade is looking great. See you next time."'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sign-off name */}
      <Card>
        <CardContent className="pt-6 pb-6 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sign-off-name" className="text-base font-semibold">
              Who should messages come from?
            </Label>
            <p className="text-sm text-muted-foreground">
              This name appears at the end of automated texts so customers know who's reaching out.
            </p>
          </div>
          <Input
            id="sign-off-name"
            value={signOffName}
            onChange={(e) => setSignOffName(e.target.value)}
            placeholder='Marcus, "The Fresh Cutz Team", etc.'
            className="max-w-sm"
          />
          {signOffName && (
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Preview:</p>
              <p className="text-sm">
                "Thanks for visiting! We'd love to see you again soon. -- {signOffName}"
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          onClick={() => saveMutation.mutate({ useEmoji, signOffName })}
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
