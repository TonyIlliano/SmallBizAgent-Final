import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';

interface SmsPreviewProps {
  onNext: () => void;
}

interface PreviewMessage {
  label: string;
  body: string;
}

export default function SmsPreview({ onNext }: SmsPreviewProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<PreviewMessage[]>([]);

  // Fetch preview messages
  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/sms-profile/preview', {});
      return res.json();
    },
    onSuccess: (data: { messages: PreviewMessage[] }) => {
      setMessages(data.messages || []);
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not generate previews',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Complete the SMS personality setup
  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/sms-profile/complete', {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'SMS personality is all set!' });
      onNext();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error completing setup',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Load previews on first render
  const hasFetched = useRef(false);
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <MessageCircle className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Preview your AI messages</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Here's how your automated texts will sound based on everything you told us.
          These are real examples of what your customers would receive.
        </p>
      </div>

      {/* Loading state */}
      {previewMutation.isPending && messages.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating sample messages...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SMS bubble mockups */}
      {messages.length > 0 && (
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground px-1">{msg.label}</p>
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 shadow-sm">
                  <p className="text-sm leading-relaxed">{msg.body}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Regenerate button */}
          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Generate new samples
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {previewMutation.isError && messages.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                We couldn't generate previews right now. You can still continue --
                your AI will use the preferences you already set.
              </p>
              <Button variant="outline" size="sm" onClick={() => previewMutation.mutate()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end pt-2">
        <Button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          size="lg"
        >
          {completeMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finishing up...
            </>
          ) : (
            "These look great -- let's go!"
          )}
        </Button>
      </div>
    </div>
  );
}
