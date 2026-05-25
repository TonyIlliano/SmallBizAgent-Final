/**
 * GPS Live Dispatch — tech consent dialog.
 *
 * Shown to a tech BEFORE any tracking session starts. Three trigger conditions:
 *   1. Tech has never accepted
 *   2. Owner bumped disclosure version
 *   3. >90 days since last acceptance (CYA re-prompt)
 *
 * The reason is surfaced in a header note above the disclosure copy. On accept,
 * records consent via POST /api/gps/consent/accept and then the parent component
 * starts the tracking session.
 *
 * Cancel = no session, no penalty. The existing one-shot ETA SMS still works.
 */

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MapPin, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DisclosurePayload {
  copy: string;
  rendered: string;
  version: string;
  isCustom: boolean;
}

interface ReacceptanceCheck {
  required: boolean;
  reason: 'version_mismatch' | 'expired_90_days' | 'never_accepted' | null;
  daysSinceAcceptance?: number;
}

export interface GpsConsentDialogProps {
  open: boolean;
  staffId: number;
  onCancel: () => void;
  /** Called after consent is accepted server-side. Parent should now start the session. */
  onAccepted: (version: string) => void;
}

export function GpsConsentDialog({ open, staffId, onCancel, onAccepted }: GpsConsentDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disclosure, setDisclosure] = useState<DisclosurePayload | null>(null);
  const [check, setCheck] = useState<ReacceptanceCheck | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [discResp, checkResp] = await Promise.all([
          apiRequest('GET', '/api/gps/disclosure'),
          apiRequest('GET', `/api/gps/consent/check/${staffId}`),
        ]);
        const disc: DisclosurePayload = await discResp.json();
        const chk: ReacceptanceCheck = await checkResp.json();
        if (cancelled) return;
        setDisclosure(disc);
        setCheck(chk);
      } catch (err) {
        console.error('[GpsConsentDialog] load error:', err);
        toast({
          title: 'Unable to load disclosure',
          description: 'Please try again or contact your manager.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, staffId, toast]);

  const handleAccept = async () => {
    if (!disclosure) return;
    setSubmitting(true);
    try {
      await apiRequest('POST', '/api/gps/consent/accept', {
        staffId,
        version: disclosure.version,
      });
      onAccepted(disclosure.version);
    } catch (err: any) {
      console.error('[GpsConsentDialog] accept error:', err);
      toast({
        title: 'Could not record consent',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reasonNote = (() => {
    if (!check?.required) return null;
    switch (check.reason) {
      case 'never_accepted':
        return 'Before you can use Live Dispatch, please review and accept the location tracking policy below.';
      case 'version_mismatch':
        return 'Your employer updated the location tracking policy. Please review the changes and re-accept.';
      case 'expired_90_days':
        return `Your last acceptance was ${check.daysSinceAcceptance ?? 90}+ days ago. Please confirm you're still aware of this policy.`;
      default:
        return null;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onCancel(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Location Tracking Notice
          </DialogTitle>
          <DialogDescription>
            Required before starting a Live Dispatch session.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : disclosure ? (
          <div className="space-y-4">
            {reasonNote && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>{reasonNote}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-line leading-relaxed">
              {disclosure.rendered}
            </div>

            <p className="text-xs text-muted-foreground">
              Policy version: {disclosure.version}
              {disclosure.isCustom && ' · customized by your employer'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to load disclosure.</p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={submitting || loading || !disclosure}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept &amp; Start Tracking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
