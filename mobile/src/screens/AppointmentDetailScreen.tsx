import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Linking,
  RefreshControl,
} from 'react-native';
import { Text, Card, Button, Divider, IconButton } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { getAppointment, updateAppointment, Appointment } from '../api/appointments';
import { StatusChip } from '../components/StatusChip';
import { ScheduleStackParamList } from '../navigation/types';
import { theme } from '../theme';

type DetailRoute = RouteProp<ScheduleStackParamList, 'AppointmentDetail'>;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(startStr: string, endStr: string): string {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} min`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function AppointmentDetailScreen() {
  const route = useRoute<DetailRoute>();
  const queryClient = useQueryClient();
  const { appointmentId } = route.params;

  const {
    data: appointment,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => getAppointment(appointmentId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateAppointment(id, { status }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to update appointment');
    },
  });

  const handleStatusChange = useCallback(
    (newStatus: string, confirmMessage: string) => {
      Alert.alert('Confirm', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            statusMutation.mutate({ id: appointmentId, status: newStatus });
          },
        },
      ]);
    },
    [appointmentId, statusMutation]
  );

  const handleCall = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  if (isLoading || !appointment) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading appointment...</Text>
      </View>
    );
  }

  const customerName = appointment.customer
    ? `${appointment.customer.firstName} ${appointment.customer.lastName}`
    : 'Unknown Customer';

  const serviceName = appointment.service?.name || 'Appointment';
  const staffName = appointment.staff
    ? `${appointment.staff.firstName} ${appointment.staff.lastName}`
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{serviceName}</Text>
        <StatusChip status={appointment.status} />
      </View>

      {/* Date/Time Info */}
      <Card style={styles.sectionCard} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <View style={styles.infoRow}>
            <IconButton
              icon="calendar"
              size={18}
              iconColor={theme.colors.primary}
              style={styles.infoIcon}
            />
            <Text style={styles.infoText}>{formatDate(appointment.startDate)}</Text>
          </View>
          <View style={styles.infoRow}>
            <IconButton
              icon="clock-outline"
              size={18}
              iconColor={theme.colors.primary}
              style={styles.infoIcon}
            />
            <Text style={styles.infoText}>
              {formatTime(appointment.startDate)} - {formatTime(appointment.endDate)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <IconButton
              icon="timer-outline"
              size={18}
              iconColor="#9ca3af"
              style={styles.infoIcon}
            />
            <Text style={styles.infoTextMuted}>
              Duration: {formatDuration(appointment.startDate, appointment.endDate)}
            </Text>
          </View>
          {appointment.service?.price != null && (
            <View style={styles.infoRow}>
              <IconButton
                icon="currency-usd"
                size={18}
                iconColor="#22c55e"
                style={styles.infoIcon}
              />
              <Text style={styles.infoText}>
                ${(appointment.service.price / 100).toFixed(2)}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Customer Card */}
      {appointment.customer && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Customer</Text>
            <Text style={styles.customerName}>{customerName}</Text>

            {appointment.customer.phone && (
              <TouchableOpacity
                onPress={() => handleCall(appointment.customer!.phone)}
                style={styles.contactRow}
              >
                <IconButton
                  icon="phone"
                  size={18}
                  iconColor={theme.colors.primary}
                  style={styles.contactIcon}
                />
                <Text style={styles.contactText}>{appointment.customer.phone}</Text>
              </TouchableOpacity>
            )}

            {appointment.customer.email && (
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(`mailto:${appointment.customer!.email}`)
                }
                style={styles.contactRow}
              >
                <IconButton
                  icon="email-outline"
                  size={18}
                  iconColor={theme.colors.primary}
                  style={styles.contactIcon}
                />
                <Text style={styles.contactText}>{appointment.customer.email}</Text>
              </TouchableOpacity>
            )}
          </Card.Content>
        </Card>
      )}

      {/* Staff Card */}
      {staffName && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Staff</Text>
            <View style={styles.infoRow}>
              <IconButton
                icon="account"
                size={18}
                iconColor={theme.colors.primary}
                style={styles.infoIcon}
              />
              <Text style={styles.infoText}>{staffName}</Text>
            </View>
            {appointment.staff?.specialty && (
              <Text style={styles.specialtyText}>{appointment.staff.specialty}</Text>
            )}
          </Card.Content>
        </Card>
      )}

      {/* Actions */}
      <Card style={styles.actionCard} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionButtons}>
            {(appointment.status === 'scheduled' || appointment.status === 'pending') && (
              <Button
                mode="contained"
                onPress={() =>
                  handleStatusChange('confirmed', 'Confirm this appointment?')
                }
                loading={statusMutation.isPending}
                disabled={statusMutation.isPending}
                icon="check"
                style={styles.actionButton}
                buttonColor="#3b82f6"
              >
                Confirm
              </Button>
            )}

            {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
              <>
                <Button
                  mode="outlined"
                  onPress={() =>
                    handleStatusChange(
                      'cancelled',
                      'Cancel this appointment? The customer will be notified.'
                    )
                  }
                  loading={statusMutation.isPending}
                  disabled={statusMutation.isPending}
                  icon="close"
                  style={styles.actionButton}
                  textColor="#ef4444"
                >
                  Cancel
                </Button>

                <Button
                  mode="outlined"
                  onPress={() =>
                    handleStatusChange(
                      'scheduled',
                      'Reschedule this appointment? The customer will be notified to choose a new time.'
                    )
                  }
                  loading={statusMutation.isPending}
                  disabled={statusMutation.isPending}
                  icon="calendar-clock"
                  style={styles.actionButton}
                  textColor={theme.colors.primary}
                >
                  Reschedule
                </Button>
              </>
            )}

            {appointment.status === 'confirmed' && (
              <Button
                mode="contained"
                onPress={() =>
                  handleStatusChange('completed', 'Mark this appointment as complete?')
                }
                loading={statusMutation.isPending}
                disabled={statusMutation.isPending}
                icon="check-all"
                style={styles.actionButton}
                buttonColor="#22c55e"
              >
                Complete
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>

      {/* Notes */}
      {appointment.notes && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{appointment.notes}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onBackground,
    flex: 1,
  },
  sectionCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  actionCard: {
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
    marginBottom: 2,
  },
  infoIcon: {
    margin: 0,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.onBackground,
    fontWeight: '500',
  },
  infoTextMuted: {
    fontSize: 14,
    color: '#6b7280',
  },
  customerName: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.onBackground,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  contactIcon: {
    margin: 0,
  },
  contactText: {
    fontSize: 14,
    color: theme.colors.primary,
  },
  specialtyText: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 36,
    marginTop: -4,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    borderRadius: 10,
    flex: 1,
    minWidth: 120,
  },
  notesText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
});
