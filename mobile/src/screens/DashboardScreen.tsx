import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Text, Card, IconButton } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { theme } from '../theme';

interface UsageData {
  minutesUsed?: number;
  maxMinutes?: number;
  planName?: string;
}

interface CallLog {
  id: number;
  callerId: string;
  callerName?: string;
  createdAt: string;
  callDuration: number | null;
  status: string;
}

interface RecentItem {
  id: string;
  type: 'call' | 'appointment' | 'job';
  title: string;
  subtitle: string;
  time: string;
  icon: string;
  color: string;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DashboardScreen() {
  const dateStr = todayDateString();

  const {
    data: appointments,
    isLoading: loadingAppts,
    refetch: refetchAppts,
  } = useQuery({
    queryKey: ['appointments', dateStr],
    queryFn: () => apiRequest<any[]>('GET', `/api/appointments?date=${dateStr}`),
  });

  const {
    data: jobs,
    isLoading: loadingJobs,
    refetch: refetchJobs,
  } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => apiRequest<any[]>('GET', '/api/jobs'),
  });

  const {
    data: invoices,
    isLoading: loadingInvoices,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => apiRequest<any[]>('GET', '/api/invoices'),
  });

  const {
    data: usage,
    isLoading: loadingUsage,
    refetch: refetchUsage,
  } = useQuery({
    queryKey: ['usage'],
    queryFn: () => apiRequest<UsageData>('GET', '/api/usage'),
  });

  const {
    data: callLogs,
    isLoading: loadingCalls,
    refetch: refetchCalls,
  } = useQuery({
    queryKey: ['call-logs'],
    queryFn: () => apiRequest<CallLog[]>('GET', '/api/call-logs'),
  });

  const isLoading = loadingAppts || loadingJobs || loadingInvoices || loadingUsage || loadingCalls;

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refetchAppts(),
      refetchJobs(),
      refetchInvoices(),
      refetchUsage(),
      refetchCalls(),
    ]);
  }, [refetchAppts, refetchJobs, refetchInvoices, refetchUsage, refetchCalls]);

  // Compute stats
  const todayAppointments = appointments?.length || 0;

  const activeJobs = useMemo(() => {
    if (!jobs) return 0;
    return jobs.filter((j: any) => j.status === 'in_progress').length;
  }, [jobs]);

  const monthlyRevenue = useMemo(() => {
    if (!invoices) return 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return invoices
      .filter(
        (inv: any) =>
          inv.status === 'paid' && new Date(inv.createdAt) >= monthStart
      )
      .reduce((sum: number, inv: any) => sum + (inv.total || inv.amount || 0), 0);
  }, [invoices]);

  const minutesUsed = usage?.minutesUsed || 0;

  const todayCalls = useMemo(() => {
    if (!callLogs) return 0;
    const today = todayDateString();
    return callLogs.filter((c) => c.createdAt?.slice(0, 10) === today).length;
  }, [callLogs]);

  // Recent activity
  const recentActivity = useMemo((): RecentItem[] => {
    const items: RecentItem[] = [];

    if (callLogs) {
      for (const call of callLogs.slice(0, 5)) {
        items.push({
          id: `call-${call.id}`,
          type: 'call',
          title: call.callerName || call.callerId || 'Unknown Caller',
          subtitle: `Call - ${call.status}`,
          time: call.createdAt,
          icon: 'phone',
          color: '#6366f1',
        });
      }
    }

    if (appointments) {
      for (const appt of appointments.slice(0, 3)) {
        const name = appt.customer
          ? `${appt.customer.firstName} ${appt.customer.lastName}`
          : 'Unknown';
        items.push({
          id: `appt-${appt.id}`,
          type: 'appointment',
          title: appt.service?.name || 'Appointment',
          subtitle: name,
          time: appt.startDate || appt.createdAt,
          icon: 'calendar',
          color: theme.colors.primary,
        });
      }
    }

    if (jobs) {
      for (const job of jobs.slice(0, 3)) {
        const name = job.customer
          ? `${job.customer.firstName} ${job.customer.lastName}`
          : 'Unknown';
        items.push({
          id: `job-${job.id}`,
          type: 'job',
          title: job.title,
          subtitle: name,
          time: job.updatedAt || job.createdAt,
          icon: 'wrench',
          color: '#3b82f6',
        });
      }
    }

    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return items.slice(0, 5);
  }, [callLogs, appointments, jobs]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={onRefresh}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <Card style={styles.statCard} mode="elevated">
          <View style={styles.statContent}>
            <View style={[styles.statIconWrap, { backgroundColor: '#e8daf520' }]}>
              <IconButton
                icon="calendar-check"
                size={22}
                iconColor={theme.colors.primary}
                style={styles.statIcon}
              />
            </View>
            <Text style={styles.statNumber}>{todayAppointments}</Text>
            <Text style={styles.statLabel}>Today's Appts</Text>
          </View>
        </Card>

        <Card style={styles.statCard} mode="elevated">
          <View style={styles.statContent}>
            <View style={[styles.statIconWrap, { backgroundColor: '#3b82f620' }]}>
              <IconButton
                icon="briefcase-outline"
                size={22}
                iconColor="#3b82f6"
                style={styles.statIcon}
              />
            </View>
            <Text style={styles.statNumber}>{activeJobs}</Text>
            <Text style={styles.statLabel}>Active Jobs</Text>
          </View>
        </Card>

        <Card style={styles.statCard} mode="elevated">
          <View style={styles.statContent}>
            <View style={[styles.statIconWrap, { backgroundColor: '#22c55e20' }]}>
              <IconButton
                icon="currency-usd"
                size={22}
                iconColor="#22c55e"
                style={styles.statIcon}
              />
            </View>
            <Text style={styles.statNumber}>
              ${(monthlyRevenue / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.statLabel}>Revenue (Mo)</Text>
          </View>
        </Card>

        <Card style={styles.statCard} mode="elevated">
          <View style={styles.statContent}>
            <View style={[styles.statIconWrap, { backgroundColor: '#f59e0b20' }]}>
              <IconButton
                icon="phone-in-talk"
                size={22}
                iconColor="#f59e0b"
                style={styles.statIcon}
              />
            </View>
            <Text style={styles.statNumber}>{minutesUsed}</Text>
            <Text style={styles.statLabel}>Call Minutes</Text>
          </View>
        </Card>
      </View>

      {/* AI Receptionist Status */}
      <Card style={styles.receptionistCard} mode="elevated">
        <View style={styles.receptionistContent}>
          <View style={styles.receptionistLeft}>
            <View style={styles.receptionistHeader}>
              <View style={styles.activeIndicator} />
              <Text style={styles.receptionistTitle}>AI Receptionist</Text>
            </View>
            <Text style={styles.receptionistSubtitle}>
              {todayCalls} call{todayCalls !== 1 ? 's' : ''} today
            </Text>
          </View>
          <View style={styles.receptionistRight}>
            <IconButton
              icon="robot"
              size={28}
              iconColor={theme.colors.primary}
              style={styles.receptionistIcon}
            />
          </View>
        </View>
      </Card>

      {/* Recent Activity */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>

      {recentActivity.length === 0 && !isLoading && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\u26A1'}</Text>
          <Text style={styles.emptyTitle}>No recent activity</Text>
          <Text style={styles.emptySubtitle}>
            Activity from calls, appointments, and jobs will appear here
          </Text>
        </View>
      )}

      {recentActivity.map((item) => (
        <Card key={item.id} style={styles.activityCard} mode="elevated">
          <View style={styles.activityContent}>
            <View style={[styles.activityDot, { backgroundColor: item.color }]}>
              <IconButton
                icon={item.icon}
                size={16}
                iconColor="#ffffff"
                style={styles.activityDotIcon}
              />
            </View>
            <View style={styles.activityDetails}>
              <Text style={styles.activityTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.activitySubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>
            <Text style={styles.activityTime}>{formatTime(item.time)}</Text>
          </View>
        </Card>
      ))}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    width: '47%',
    flexGrow: 1,
  },
  statContent: {
    padding: 16,
    alignItems: 'center',
  },
  statIconWrap: {
    borderRadius: 10,
    marginBottom: 8,
  },
  statIcon: {
    margin: 0,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.onBackground,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  receptionistCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 20,
  },
  receptionistContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  receptionistLeft: {
    flex: 1,
  },
  receptionistRight: {},
  receptionistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  receptionistTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onBackground,
  },
  receptionistSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    marginLeft: 16,
  },
  receptionistIcon: {
    margin: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onBackground,
    marginBottom: 12,
  },
  activityCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  activityContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  activityDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityDotIcon: {
    margin: 0,
  },
  activityDetails: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onBackground,
  },
  activitySubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onBackground,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 6,
  },
});
