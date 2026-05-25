/**
 * Owner-facing GPS Live Dispatch settings panel.
 *
 * Sections:
 *   1. Master toggle (gpsTrackingEnabled)
 *   2. Retention slider (1h–maxRetentionHours from plan tier)
 *   3. Customer share toggle + default TTL
 *   4. Disclosure editor (with version bump + "Reset to default" + warning)
 *   5. Tech consent table (per-tech status + revoke)
 *
 * Gated server-side via requireGpsPlanForSettings. If the API returns 402/403,
 * we show a clean upgrade nudge instead of the panel.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle, ShieldCheck, MapPin, RotateCcw, ExternalLink } from "lucide-react";

interface GpsSettingsResponse {
  settings: {
    gpsTrackingEnabled: boolean;
    gpsRetentionHours: number;
    gpsDisclosureCopy: string;
    gpsDisclosureVersion: string;
    gpsDisclosureIsCustom: boolean;
    gpsCustomerShareEnabled: boolean;
    gpsCustomerShareMode: 'auto' | 'manual' | 'off';
    gpsCustomerShareDefaultMinutes: number;
  };
  planTier: string | null;
  maxRetentionHours: number;
  techs: TechRow[];
}

interface TechRow {
  staffId: number;
  name: string;
  email: string | null;
  consentAcceptedAt: string | null;
  consentVersion: string | null;
  paused: boolean;
  needsReacceptance: boolean;
  reacceptanceReason: 'version_mismatch' | 'expired_90_days' | 'never_accepted' | null;
}

const SHARE_TTL_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours (default)' },
  { value: 480, label: '8 hours' },
  { value: 1440, label: '24 hours' },
];

export default function GpsTrackingSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [draftCopy, setDraftCopy] = useState<string | null>(null);
  const [draftRetention, setDraftRetention] = useState<number | null>(null);

  const { data, isLoading, isError, error } = useQuery<GpsSettingsResponse>({
    queryKey: ['gps-settings'],
    queryFn: async () => {
      const r = await apiRequest('GET', '/api/gps/settings');
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    retry: false,
  });

  // Sync draft state with server data
  useEffect(() => {
    if (data) {
      setDraftCopy(data.settings.gpsDisclosureCopy);
      setDraftRetention(data.settings.gpsRetentionHours);
    }
  }, [data?.settings.gpsDisclosureVersion]); // re-sync only when version changes

  const updateSettings = useMutation({
    mutationFn: async (body: Partial<GpsSettingsResponse['settings']>) => {
      const r = await apiRequest('PUT', '/api/gps/settings', body);
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gps-settings'] });
      toast({ title: 'Settings saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    },
  });

  const updateDisclosure = useMutation({
    mutationFn: async (copy: string | null) => {
      const r = await apiRequest('PUT', '/api/gps/disclosure', { copy });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    onSuccess: (res: { version: string }) => {
      qc.invalidateQueries({ queryKey: ['gps-settings'] });
      toast({
        title: 'Disclosure updated',
        description: `New version: ${res.version}. All techs will be prompted to re-accept.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not update disclosure', description: err.message, variant: 'destructive' });
    },
  });

  const revokeConsent = useMutation({
    mutationFn: async (staffId: number) => {
      const r = await apiRequest('POST', `/api/gps/staff/${staffId}/revoke-consent`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gps-settings'] });
      toast({ title: 'Consent revoked', description: 'Tech will need to re-accept on next session.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not revoke consent', description: err.message, variant: 'destructive' });
    },
  });

  // ── Loading / error / ineligible states ─────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error)?.message ?? '';
    // The plan gate returns clear codes — try to detect them in the error message
    const isUpgrade = msg.toLowerCase().includes('growth') || msg.toLowerCase().includes('plan');
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
          <p className="font-medium">Live Dispatch is not available for this account</p>
          <p className="text-sm text-muted-foreground">{msg}</p>
          {isUpgrade && (
            <Button variant="outline" onClick={() => (window.location.href = '/settings?tab=subscription')}>
              Upgrade Plan
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { settings, maxRetentionHours, techs, planTier } = data;
  const currentRetention = draftRetention ?? settings.gpsRetentionHours;
  const isRetentionDirty = draftRetention != null && draftRetention !== settings.gpsRetentionHours;
  const isDisclosureDirty = draftCopy != null && draftCopy !== settings.gpsDisclosureCopy;

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Live Dispatch
          </CardTitle>
          <CardDescription>
            Real-time GPS tracking for field techs + customer "where's my tech" link.
            Plan tier: <Badge variant="secondary" className="capitalize">{planTier || 'unknown'}</Badge>
            {' '}· Max retention: {maxRetentionHours}h
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Live Dispatch</Label>
              <p className="text-sm text-muted-foreground">
                When off, the Dispatch tab is hidden, mobile won't ask techs to start sessions,
                and any active sessions will end on save.
              </p>
            </div>
            <Switch
              checked={settings.gpsTrackingEnabled}
              onCheckedChange={(v) => updateSettings.mutate({ gpsTrackingEnabled: v })}
              disabled={updateSettings.isPending}
              data-testid="gps-master-toggle"
            />
          </div>
        </CardContent>
      </Card>

      {settings.gpsTrackingEnabled && (
        <>
          {/* Retention */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Retention</CardTitle>
              <CardDescription>
                GPS pings older than this are automatically deleted by the hourly sweeper.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Retention period</Label>
                  <span className="text-sm font-medium">
                    {currentRetention}h ({Math.round((currentRetention / 24) * 10) / 10} days)
                  </span>
                </div>
                <Slider
                  value={[currentRetention]}
                  min={1}
                  max={maxRetentionHours}
                  step={1}
                  onValueChange={(v) => setDraftRetention(v[0])}
                  data-testid="gps-retention-slider"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Range: 1h – {maxRetentionHours}h.
                  {maxRetentionHours < 168 && ' Upgrade to Pro for 7-day retention.'}
                </p>
                {currentRetention < 8 && (
                  <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Short retention may cause dispatcher to lose today's breadcrumb.
                  </p>
                )}
              </div>
              {isRetentionDirty && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDraftRetention(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => updateSettings.mutate({ gpsRetentionHours: currentRetention })}
                    disabled={updateSettings.isPending}
                  >
                    Save
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer share */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Sharing</CardTitle>
              <CardDescription>
                Lets customers track your tech's live location during an active job.
                Matches the "where's my tech" experience customers expect from Uber, Amazon, etc.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Allow customer tracking links</Label>
                  <p className="text-sm text-muted-foreground">
                    Master switch. When off, NO tracking links are ever sent regardless of mode below.
                  </p>
                </div>
                <Switch
                  checked={settings.gpsCustomerShareEnabled}
                  onCheckedChange={(v) => updateSettings.mutate({ gpsCustomerShareEnabled: v })}
                  disabled={updateSettings.isPending}
                  data-testid="gps-share-toggle"
                />
              </div>

              {settings.gpsCustomerShareEnabled && (
                <>
                  <div className="space-y-2">
                    <Label>How the tracking link reaches the customer</Label>
                    <Select
                      value={settings.gpsCustomerShareMode || 'auto'}
                      onValueChange={(v) => updateSettings.mutate({ gpsCustomerShareMode: v as 'auto' | 'manual' | 'off' })}
                    >
                      <SelectTrigger className="w-full" data-testid="gps-share-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          Automatic — bundled into the "on my way" SMS (recommended)
                        </SelectItem>
                        <SelectItem value="manual">
                          Manual — tech taps "Send tracking link" per job
                        </SelectItem>
                        <SelectItem value="off">
                          Off — never send tracking links to customers
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {settings.gpsCustomerShareMode === 'auto' && (
                        <>
                          Matches Housecall Pro / ServiceTitan default behavior.
                          Customer gets the link automatically when the tech taps "On My Way".
                        </>
                      )}
                      {settings.gpsCustomerShareMode === 'manual' && (
                        <>
                          Tech decides per job. Cleanest privacy story but easy to forget.
                        </>
                      )}
                      {settings.gpsCustomerShareMode === 'off' && (
                        <>
                          Customers never receive a tracking link. The dispatcher map still works.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Default link expiry</Label>
                    <Select
                      value={String(settings.gpsCustomerShareDefaultMinutes)}
                      onValueChange={(v) => updateSettings.mutate({ gpsCustomerShareDefaultMinutes: parseInt(v, 10) })}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHARE_TTL_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Disclosure */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Tech Disclosure
              </CardTitle>
              <CardDescription>
                Shown to techs before each tracking session. Saving a change bumps the version
                and forces all techs to re-accept on their next session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <div>
                  Current version: <Badge variant="secondary">{settings.gpsDisclosureVersion}</Badge>
                  {' '}
                  {settings.gpsDisclosureIsCustom ? (
                    <Badge variant="outline">Customized</Badge>
                  ) : (
                    <Badge variant="outline">Default</Badge>
                  )}
                </div>
                {settings.gpsDisclosureIsCustom && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Reset to default
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset disclosure to default?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will bump the version and require all techs to re-accept.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setDraftCopy(null); updateDisclosure.mutate(null); }}>
                          Reset
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              <Textarea
                value={draftCopy ?? settings.gpsDisclosureCopy}
                onChange={(e) => setDraftCopy(e.target.value)}
                rows={14}
                className="font-mono text-xs"
                data-testid="gps-disclosure-textarea"
              />
              <p className="text-xs text-muted-foreground">
                Placeholders: <code>{'{businessName}'}</code> and <code>{'{retentionHours}'}</code>{' '}
                are substituted when shown to techs.
              </p>

              {isDisclosureDirty && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-amber-900">Saving will require all techs to re-accept</p>
                    <p className="text-xs text-amber-800 mt-1">
                      They'll see the new copy on their next tracking session.
                    </p>
                  </div>
                </div>
              )}

              {isDisclosureDirty && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDraftCopy(null)}>
                    Cancel
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm">Save &amp; bump version</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Bump disclosure version?</AlertDialogTitle>
                        <AlertDialogDescription>
                          All techs will need to re-accept the disclosure on their next tracking session.
                          The new version will be stamped with today's date.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => draftCopy != null && updateDisclosure.mutate(draftCopy)}>
                          Save &amp; bump
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tech consent table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tech Consent Status</CardTitle>
              <CardDescription>
                Per-tech status against the current disclosure version. Revoke forces re-acceptance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {techs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No techs on this business.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tech</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Accepted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {techs.map(t => (
                      <TableRow key={t.staffId} data-testid={`gps-tech-row-${t.staffId}`}>
                        <TableCell>
                          <div className="font-medium">{t.name}</div>
                          {t.email && <div className="text-xs text-muted-foreground">{t.email}</div>}
                        </TableCell>
                        <TableCell>
                          {t.needsReacceptance ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                              {t.reacceptanceReason === 'never_accepted' && 'Never accepted'}
                              {t.reacceptanceReason === 'version_mismatch' && 'Needs re-accept'}
                              {t.reacceptanceReason === 'expired_90_days' && '90+ days old'}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              Up to date
                            </Badge>
                          )}
                          {t.paused && <Badge variant="outline" className="ml-1">Paused</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.consentAcceptedAt ? new Date(t.consentAcceptedAt).toLocaleDateString() : '—'}
                          {t.consentVersion && <div>v{t.consentVersion}</div>}
                        </TableCell>
                        <TableCell className="text-right">
                          {!t.needsReacceptance && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">Revoke</Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke consent for {t.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    They'll be required to re-accept the disclosure on their next tracking session.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => revokeConsent.mutate(t.staffId)}>
                                    Revoke
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Quick link to dispatcher */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/dispatch')}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open Dispatch Map
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
