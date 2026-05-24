import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Car, CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';

interface OnMyWayCardProps {
  jobId: number;
  status: string | null | undefined;
  enRouteAt?: string | Date | null;
  etaMinutes?: number | null;
}

const ETA_OPTIONS = [15, 30, 45, 60];

/**
 * Tech-facing dispatch controls for the job detail page.
 *
 * - When status === 'pending': shows "On My Way" with ETA picker dialog.
 *   On submit: PUT /api/jobs/:id { status: 'en_route', etaMinutes } → server
 *   stamps enRouteAt, queues the ETA SMS to the customer.
 *
 * - When status === 'en_route': shows ETA summary + "I've Arrived" button
 *   which transitions to in_progress (existing flow).
 *
 * - Hidden for any other status — once the job is in_progress, completed,
 *   etc., dispatch is no longer relevant.
 */
export function OnMyWayCard({ jobId, status, enRouteAt, etaMinutes }: OnMyWayCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEta, setSelectedEta] = useState<number>(30);

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest('PUT', `/api/jobs/${jobId}`, payload);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
      if ((variables as any).status === 'en_route') {
        toast({
          title: "You're on the way",
          description: 'Customer notified — ETA SMS sent.',
        });
      } else if ((variables as any).status === 'in_progress') {
        toast({ title: 'Marked as arrived', description: 'Job started.' });
      }
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({
        title: 'Update failed',
        description: err.message || 'Could not update job status.',
        variant: 'destructive',
      });
    },
  });

  if (status === 'completed' || status === 'cancelled') return null;
  if (status !== 'pending' && status !== 'en_route') return null;

  if (status === 'pending') {
    return (
      <>
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Ready to head out?</p>
              <p className="text-xs text-muted-foreground">
                Tap to notify the customer with an ETA.
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="job-on-my-way"
            >
              <Car className="mr-2 h-4 w-4" />
              On My Way
            </Button>
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>On the way to the job</DialogTitle>
              <DialogDescription>
                The customer will receive an SMS with your name and arrival time.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Label>How long until you arrive?</Label>
              <div className="grid grid-cols-4 gap-2">
                {ETA_OPTIONS.map(min => (
                  <Button
                    key={min}
                    type="button"
                    variant={selectedEta === min ? 'default' : 'outline'}
                    onClick={() => setSelectedEta(min)}
                    data-testid={`eta-${min}`}
                  >
                    {min} min
                  </Button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateMutation.mutate({ status: 'en_route', etaMinutes: selectedEta })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Notifying…
                  </>
                ) : (
                  <>Send "On My Way" SMS</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // status === 'en_route'
  const departureTime = enRouteAt ? new Date(enRouteAt) : null;
  const minutes = etaMinutes && etaMinutes > 0 ? etaMinutes : 30;
  const arrival = departureTime
    ? new Date(departureTime.getTime() + minutes * 60 * 1000)
    : null;
  const arrivalLabel = arrival
    ? arrival.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;

  return (
    <Card className="border-orange-200 bg-orange-50/40">
      <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-medium text-sm flex items-center gap-2">
            <Car className="h-4 w-4 text-orange-600" />
            On the way
          </p>
          <p className="text-xs text-muted-foreground">
            ETA {minutes} min{arrivalLabel ? ` · arriving around ${arrivalLabel}` : ''}
          </p>
        </div>
        <Button
          onClick={() => updateMutation.mutate({ status: 'in_progress' })}
          disabled={updateMutation.isPending}
          data-testid="job-arrived"
        >
          {updateMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          I've Arrived
        </Button>
      </CardContent>
    </Card>
  );
}
