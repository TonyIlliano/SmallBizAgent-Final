import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
  RefreshControl,
} from 'react-native';
import { Text, Card, Button, Divider, IconButton } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRoute, RouteProp } from '@react-navigation/native';
import { getCustomer, Customer } from '../api/customers';
import { getJobs, Job } from '../api/jobs';
import { getAppointments, Appointment } from '../api/appointments';
import { getInvoices, Invoice } from '../api/invoices';
import { StatusChip } from '../components/StatusChip';
import { CustomersStackParamList } from '../navigation/types';
import { theme } from '../theme';

type DetailRoute = RouteProp<CustomersStackParamList, 'CustomerDetail'>;

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CustomerDetailScreen() {
  const route = useRoute<DetailRoute>();
  const { customerId } = route.params;

  const {
    data: customer,
    isLoading: customerLoading,
    refetch: refetchCustomer,
  } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomer(customerId),
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => getJobs(),
  });

  const { data: appointments } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => getAppointments(),
  });

  const { data: invoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices(),
  });

  const customerJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs
      .filter((j) => j.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [jobs, customerId]);

  const customerAppointments = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a) => a.customerId === customerId)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 5);
  }, [appointments, customerId]);

  const customerInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => inv.customerId === customerId);
  }, [invoices, customerId]);

  const stats = useMemo(() => {
    const totalJobs = jobs?.filter((j) => j.customerId === customerId).length || 0;
    const totalInvoices = customerInvoices.length;
    const totalRevenue = customerInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

    // Last visit: most recent appointment or job
    let lastVisit: string | null = null;
    const recentAppt = customerAppointments[0];
    const recentJob = customerJobs[0];
    if (recentAppt && recentJob) {
      lastVisit =
        new Date(recentAppt.startDate) > new Date(recentJob.createdAt)
          ? recentAppt.startDate
          : recentJob.createdAt;
    } else if (recentAppt) {
      lastVisit = recentAppt.startDate;
    } else if (recentJob) {
      lastVisit = recentJob.createdAt;
    }

    return { totalJobs, totalInvoices, totalRevenue, lastVisit };
  }, [jobs, customerInvoices, customerAppointments, customerJobs, customerId]);

  const handleCall = useCallback(() => {
    if (customer?.phone) {
      Linking.openURL(`tel:${customer.phone}`);
    }
  }, [customer]);

  const handleText = useCallback(() => {
    if (customer?.phone) {
      Linking.openURL(`sms:${customer.phone}`);
    }
  }, [customer]);

  const handleEmail = useCallback(() => {
    if (customer?.email) {
      Linking.openURL(`mailto:${customer.email}`);
    }
  }, [customer]);

  if (customerLoading || !customer) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading customer...</Text>
      </View>
    );
  }

  const fullName = `${customer.firstName} ${customer.lastName}`;
  const initials = getInitials(customer.firstName, customer.lastName);
  const address = [customer.address, customer.city, customer.state]
    .filter(Boolean)
    .join(', ');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={customerLoading}
          onRefresh={refetchCustomer}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Profile Header */}
      <Card style={styles.profileCard} mode="elevated">
        <Card.Content style={styles.profileContent}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{initials}</Text>
          </View>
          <Text style={styles.fullName}>{fullName}</Text>

          {customer.phone && (
            <Text style={styles.contactInfo}>{customer.phone}</Text>
          )}
          {customer.email && (
            <Text style={styles.contactInfo}>{customer.email}</Text>
          )}
          {address && (
            <Text style={styles.addressInfo}>{address}</Text>
          )}

          {customer.tags && customer.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {customer.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        {customer.phone && (
          <Button
            mode="contained"
            icon="phone"
            onPress={handleCall}
            style={styles.quickActionButton}
            buttonColor={theme.colors.primary}
            compact
          >
            Call
          </Button>
        )}
        {customer.phone && (
          <Button
            mode="contained"
            icon="message-text-outline"
            onPress={handleText}
            style={styles.quickActionButton}
            buttonColor="#22c55e"
            compact
          >
            Text
          </Button>
        )}
        {customer.email && (
          <Button
            mode="outlined"
            icon="email-outline"
            onPress={handleEmail}
            style={styles.quickActionButton}
            compact
          >
            Email
          </Button>
        )}
      </View>

      {/* Stats */}
      <Card style={styles.statsCard} mode="elevated">
        <Card.Content>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalJobs}</Text>
              <Text style={styles.statLabel}>Jobs</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalInvoices}</Text>
              <Text style={styles.statLabel}>Invoices</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                ${(stats.totalRevenue / 100).toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>Revenue</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {stats.lastVisit ? formatDate(stats.lastVisit) : '--'}
              </Text>
              <Text style={styles.statLabel}>Last Visit</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Recent Appointments */}
      {customerAppointments.length > 0 && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Recent Appointments</Text>
            {customerAppointments.map((appt, index) => (
              <View key={appt.id}>
                <View style={styles.activityRow}>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityTitle} numberOfLines={1}>
                      {appt.service?.name || 'Appointment'}
                    </Text>
                    <Text style={styles.activityDate}>
                      {formatDateTime(appt.startDate)}
                    </Text>
                  </View>
                  <StatusChip status={appt.status} size="small" />
                </View>
                {index < customerAppointments.length - 1 && (
                  <Divider style={styles.activityDivider} />
                )}
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {/* Recent Jobs */}
      {customerJobs.length > 0 && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Recent Jobs</Text>
            {customerJobs.map((job, index) => (
              <View key={job.id}>
                <View style={styles.activityRow}>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityTitle} numberOfLines={1}>
                      {job.title}
                    </Text>
                    <Text style={styles.activityDate}>
                      {formatDate(job.createdAt)}
                    </Text>
                  </View>
                  <StatusChip status={job.status} size="small" />
                </View>
                {index < customerJobs.length - 1 && (
                  <Divider style={styles.activityDivider} />
                )}
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {/* No Activity State */}
      {customerAppointments.length === 0 && customerJobs.length === 0 && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content style={styles.noActivity}>
            <Text style={styles.noActivityText}>
              No recent activity for this customer
            </Text>
          </Card.Content>
        </Card>
      )}

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  profileCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  profileContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarLargeText: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  fullName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onBackground,
    marginBottom: 4,
  },
  contactInfo: {
    fontSize: 15,
    color: '#4b5563',
    marginTop: 2,
  },
  addressInfo: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  tag: {
    backgroundColor: theme.colors.primaryContainer,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 10,
  },
  statsCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onBackground,
  },
  statLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e5e7eb',
  },
  sectionCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onBackground,
    marginBottom: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.onBackground,
  },
  activityDate: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  activityDivider: {
    backgroundColor: '#f3f4f6',
  },
  noActivity: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noActivityText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
