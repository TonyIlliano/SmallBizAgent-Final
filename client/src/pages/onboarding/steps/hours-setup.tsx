import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, CheckCircle2 } from 'lucide-react';

interface HoursSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
}

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

// Time options in 30-minute increments
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    const hour = h.toString().padStart(2, '0');
    const min = m.toString().padStart(2, '0');
    TIME_OPTIONS.push(`${hour}:${min}`);
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

interface DayHours {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

// Default schedule: Mon-Fri 9am-5pm, Sat-Sun closed
const DEFAULT_HOURS: DayHours[] = DAYS.map(d => ({
  day: d.key,
  open: '09:00',
  close: '17:00',
  isClosed: d.key === 'saturday' || d.key === 'sunday',
}));

export default function HoursSetup({ onComplete, onSkip }: HoursSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);
  const [hasExisting, setHasExisting] = useState(false);

  // Fetch existing business hours
  const { data: existingHours, isLoading } = useQuery<any[]>({
    queryKey: [`/api/business/${user?.businessId}/hours`],
    enabled: !!user?.businessId,
  });

  // Populate from existing data
  useEffect(() => {
    if (existingHours && existingHours.length > 0) {
      setHasExisting(true);
      const mapped = DAYS.map(d => {
        const existing = existingHours.find((h: any) => h.day?.toLowerCase() === d.key);
        return {
          day: d.key,
          open: existing?.open || '09:00',
          close: existing?.close || '17:00',
          isClosed: existing?.isClosed ?? (d.key === 'saturday' || d.key === 'sunday'),
        };
      });
      setHours(mapped);
    }
  }, [existingHours]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (hoursData: DayHours[]) => {
      const payload = hoursData.map(h => ({
        day: h.day,
        open: h.open,
        close: h.close,
        isClosed: h.isClosed,
      }));
      await apiRequest('PUT', `/api/business/${user?.businessId}/hours`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${user?.businessId}/hours`] });
      toast({ title: 'Business hours saved!' });
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving hours',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const updateDay = (dayKey: string, field: keyof DayHours, value: string | boolean) => {
    setHours(prev => prev.map(h =>
      h.day === dayKey ? { ...h, [field]: value } : h
    ));
  };

  // Quick presets
  const applyPreset = (preset: 'standard' | 'extended' | 'weekends') => {
    switch (preset) {
      case 'standard':
        setHours(DAYS.map(d => ({
          day: d.key,
          open: '09:00',
          close: '17:00',
          isClosed: d.key === 'saturday' || d.key === 'sunday',
        })));
        break;
      case 'extended':
        setHours(DAYS.map(d => ({
          day: d.key,
          open: '08:00',
          close: '20:00',
          isClosed: d.key === 'sunday',
        })));
        break;
      case 'weekends':
        setHours(DAYS.map(d => ({
          day: d.key,
          open: d.key === 'saturday' || d.key === 'sunday' ? '10:00' : '09:00',
          close: d.key === 'saturday' || d.key === 'sunday' ? '16:00' : '17:00',
          isClosed: false,
        })));
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Set Your Business Hours</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Your AI receptionist uses these hours to schedule appointments and let callers know when you're open.
        </p>
      </div>

      {/* Quick presets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Presets</CardTitle>
          <CardDescription>Start with a template and customize from there</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => applyPreset('standard')}>
              Mon-Fri 9-5
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset('extended')}>
              Mon-Sat Extended
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset('weekends')}>
              7 Days a Week
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Hours grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hours.map(day => {
            const dayInfo = DAYS.find(d => d.key === day.day);
            return (
              <div
                key={day.day}
                className={`flex items-center gap-3 p-3 rounded-lg border ${day.isClosed ? 'bg-muted/50 opacity-60' : ''}`}
              >
                <div className="w-24 font-medium text-sm">
                  {dayInfo?.label}
                </div>
                <Switch
                  checked={!day.isClosed}
                  onCheckedChange={(checked) => updateDay(day.day, 'isClosed', !checked)}
                />
                {!day.isClosed ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Select
                      value={day.open}
                      onValueChange={(val) => updateDay(day.day, 'open', val)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue>{formatTime(day.open)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map(t => (
                          <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-sm">to</span>
                    <Select
                      value={day.close}
                      onValueChange={(val) => updateDay(day.day, 'close', val)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue>{formatTime(day.close)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map(t => (
                          <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Closed</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Info note */}
      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              You can always change these later in Settings. Your AI receptionist will
              automatically adjust scheduling based on these hours.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between pt-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button
          className="ml-auto"
          onClick={() => saveMutation.mutate(hours)}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : hasExisting ? (
            'Update Hours & Continue'
          ) : (
            'Save Hours & Continue'
          )}
        </Button>
      </div>
    </div>
  );
}
