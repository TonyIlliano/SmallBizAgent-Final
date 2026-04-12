import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Linking,
  Image,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Text, Card, Button, Divider, IconButton } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { getJob, updateJobStatus, uploadJobPhoto, getJobBriefing, Job, JobBriefing } from '../api/jobs';
import { apiRequest } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { VoiceNotes } from '../components/VoiceNotes';
import { JobsStackParamList } from '../navigation/types';
import { theme } from '../theme';

type DetailRoute = RouteProp<JobsStackParamList, 'JobDetail'>;
type DetailNavigation = NativeStackNavigationProp<JobsStackParamList, 'JobDetail'>;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not scheduled';
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function JobDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<DetailNavigation>();
  const queryClient = useQueryClient();
  const { jobId } = route.params;
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isSendingOmw, setIsSendingOmw] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Job timer
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const formatTimer = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const {
    data: job,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
  });

  // AI Briefing query — only fetches when user taps "Generate", cached per job
  const {
    data: briefing,
    isLoading: briefingLoading,
    isError: briefingError,
    refetch: fetchBriefing,
  } = useQuery<JobBriefing>({
    queryKey: ['job-briefing', jobId],
    queryFn: () => getJobBriefing(jobId),
    enabled: false, // Only fetch on manual trigger
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    retry: 1,
  });

  const handleGenerateBriefing = useCallback(() => {
    fetchBriefing();
    setBriefingExpanded(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [fetchBriefing]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Job['status'] }) =>
      updateJobStatus(id, status),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to update job status');
    },
  });

  const photoMutation = useMutation({
    mutationFn: ({ id, uri }: { id: number; uri: string }) =>
      uploadJobPhoto(id, uri),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to upload photo');
    },
  });

  const handleStatusChange = useCallback(
    (newStatus: Job['status'], confirmMessage: string) => {
      Alert.alert('Confirm', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            statusMutation.mutate({ id: jobId, status: newStatus });
          },
        },
      ]);
    },
    [jobId, statusMutation]
  );

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Camera permission is needed to take photos.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setIsUploadingPhoto(true);
      photoMutation.mutate(
        { id: jobId, uri: result.assets[0].uri },
        { onSettled: () => setIsUploadingPhoto(false) }
      );
    }
  }, [jobId, photoMutation]);

  const handlePickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Photo library access is needed to select photos.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      setIsUploadingPhoto(true);
      photoMutation.mutate(
        { id: jobId, uri: result.assets[0].uri },
        { onSettled: () => setIsUploadingPhoto(false) }
      );
    }
  }, [jobId, photoMutation]);

  const handleCall = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  const handleCreateInvoice = useCallback(() => {
    if (job?.customerId) {
      navigation.navigate('QuickInvoice', {
        jobId: job.id,
        customerId: job.customerId,
      });
    }
  }, [job, navigation]);

  // GPS: Open directions in Maps app
  const handleNavigate = useCallback(() => {
    const address = job?.customer?.address;
    if (!address) {
      Alert.alert('No Address', 'This customer has no address on file.');
      return;
    }
    const encoded = encodeURIComponent(address);
    const url = Platform.OS === 'ios'
      ? `maps:?daddr=${encoded}`
      : `google.navigation:q=${encoded}`;
    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
    });
  }, [job?.customer?.address]);

  // On-my-way text: send SMS to customer
  const handleOnMyWay = useCallback(async () => {
    if (!job?.customer?.phone) {
      Alert.alert('No Phone', 'This customer has no phone number on file.');
      return;
    }
    setIsSendingOmw(true);
    try {
      await apiRequest('POST', `/api/notifications/send-sms`, {
        customerId: job.customerId,
        message: `Hi ${job.customer.firstName || 'there'}! I'm on my way for your ${job.title || 'appointment'}. I should be there shortly.`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sent!', `"On my way" text sent to ${job.customer.firstName || 'customer'}.`);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Send Failed', err.message || 'Could not send text');
    } finally {
      setIsSendingOmw(false);
    }
  }, [job]);

  if (isLoading || !job) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading job...</Text>
      </View>
    );
  }

  const customerName = job.customer
    ? `${job.customer.firstName} ${job.customer.lastName}`
    : 'Unknown Customer';

  const lineItemTotal =
    job.lineItems?.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    ) || 0;

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
        <Text style={styles.jobTitle}>{job.title}</Text>
        <StatusChip status={job.status} />
      </View>

      {job.description && (
        <Text style={styles.description}>{job.description}</Text>
      )}

      <Text style={styles.dateText}>
        Scheduled: {formatDate(job.scheduledDate)}
      </Text>

      {/* AI Briefing Card */}
      <Card style={[styles.sectionCard, styles.briefingCard]} mode="elevated">
        <Card.Content>
          <View style={styles.briefingHeader}>
            <View style={styles.briefingTitleRow}>
              <IconButton
                icon="creation"
                size={20}
                iconColor="#7c3aed"
                style={{ margin: 0, marginRight: 4 }}
              />
              <Text style={styles.briefingTitle}>AI Briefing</Text>
            </View>
            {!briefing && !briefingLoading && (
              <Button
                mode="contained"
                onPress={handleGenerateBriefing}
                compact
                style={{ borderRadius: 8 }}
                buttonColor="#7c3aed"
                icon="creation"
              >
                Generate
              </Button>
            )}
            {briefing && (
              <TouchableOpacity
                onPress={() => {
                  setBriefingExpanded(!briefingExpanded);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <IconButton
                  icon={briefingExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  iconColor="#6b7280"
                  style={{ margin: 0 }}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Loading state */}
          {briefingLoading && (
            <View style={styles.briefingLoading}>
              <ActivityIndicator size="small" color="#7c3aed" />
              <Text style={styles.briefingLoadingText}>
                Analyzing customer history, call transcripts, and insights...
              </Text>
            </View>
          )}

          {/* Error state */}
          {briefingError && !briefingLoading && !briefing && (
            <View style={styles.briefingErrorContainer}>
              <Text style={styles.briefingErrorText}>
                Could not generate briefing. Tap to retry.
              </Text>
              <Button
                mode="text"
                onPress={handleGenerateBriefing}
                compact
                textColor="#7c3aed"
              >
                Retry
              </Button>
            </View>
          )}

          {/* Briefing content */}
          {briefing && !briefingLoading && (
            <>
              {/* Summary always visible */}
              <Text style={styles.briefingSummary}>{briefing.summary}</Text>

              {/* Expandable sections */}
              {briefingExpanded && (
                <View style={styles.briefingSections}>
                  {briefing.customerContext && (
                    <View style={styles.briefingSection}>
                      <Text style={styles.briefingSectionLabel}>Customer Context</Text>
                      <Text style={styles.briefingSectionText}>{briefing.customerContext}</Text>
                    </View>
                  )}

                  {briefing.jobHistory && (
                    <View style={styles.briefingSection}>
                      <Text style={styles.briefingSectionLabel}>Job History</Text>
                      <Text style={styles.briefingSectionText}>{briefing.jobHistory}</Text>
                    </View>
                  )}

                  {briefing.sentiment && (
                    <View style={styles.briefingSection}>
                      <Text style={styles.briefingSectionLabel}>Sentiment</Text>
                      <Text style={styles.briefingSectionText}>{briefing.sentiment}</Text>
                    </View>
                  )}

                  {briefing.suggestedApproach && (
                    <View style={styles.briefingSection}>
                      <Text style={styles.briefingSectionLabel}>Suggested Approach</Text>
                      <Text style={styles.briefingSectionText}>{briefing.suggestedApproach}</Text>
                    </View>
                  )}

                  {briefing.followUpOpportunities && briefing.followUpOpportunities.length > 0 && (
                    <View style={styles.briefingSection}>
                      <Text style={styles.briefingSectionLabel}>Follow-Up Opportunities</Text>
                      {briefing.followUpOpportunities.map((opp, i) => (
                        <View key={i} style={styles.briefingBulletRow}>
                          <Text style={styles.briefingBullet}>{'\u2022'}</Text>
                          <Text style={styles.briefingSectionText}>{opp}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.briefingTimestamp}>
                    Generated {new Date(briefing.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>

                  {/* Regenerate button */}
                  <Button
                    mode="text"
                    onPress={handleGenerateBriefing}
                    compact
                    icon="refresh"
                    textColor="#7c3aed"
                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  >
                    Regenerate
                  </Button>
                </View>
              )}
            </>
          )}
        </Card.Content>
      </Card>

      {/* Job Timer */}
      {(job.status === 'in_progress' || job.status === 'waiting_parts' || timerSeconds > 0) && (
        <Card style={[styles.sectionCard, { borderLeftWidth: 4, borderLeftColor: timerRunning ? '#22c55e' : '#9ca3af' }]} mode="elevated">
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>JOB TIMER</Text>
                <Text style={{ fontSize: 32, fontWeight: '700', color: timerRunning ? '#22c55e' : theme.colors.onBackground, fontVariant: ['tabular-nums'] }}>
                  {formatTimer(timerSeconds)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  mode={timerRunning ? 'outlined' : 'contained'}
                  onPress={() => {
                    setTimerRunning(!timerRunning);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  icon={timerRunning ? 'pause' : 'play'}
                  compact
                  style={{ borderRadius: 8 }}
                  buttonColor={timerRunning ? undefined : '#22c55e'}
                  textColor={timerRunning ? '#f59e0b' : '#ffffff'}
                >
                  {timerRunning ? 'Pause' : 'Start'}
                </Button>
                {timerSeconds > 0 && !timerRunning && (
                  <Button
                    mode="text"
                    onPress={() => {
                      Alert.alert('Reset Timer', 'Reset the timer to 0:00?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Reset', onPress: () => setTimerSeconds(0) },
                      ]);
                    }}
                    compact
                    textColor="#9ca3af"
                  >
                    Reset
                  </Button>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Status Action Buttons */}
      <Card style={styles.actionCard} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionButtons}>
            {job.status === 'pending' && (
              <Button
                mode="contained"
                onPress={() =>
                  handleStatusChange('in_progress', 'Start this job now?')
                }
                loading={statusMutation.isPending}
                disabled={statusMutation.isPending}
                icon="play"
                style={styles.actionButton}
                buttonColor="#3b82f6"
              >
                Start Job
              </Button>
            )}

            {job.status === 'in_progress' && (
              <>
                <Button
                  mode="outlined"
                  onPress={() =>
                    handleStatusChange(
                      'waiting_parts',
                      'Mark as waiting for parts?'
                    )
                  }
                  loading={statusMutation.isPending}
                  disabled={statusMutation.isPending}
                  icon="clock-outline"
                  style={styles.actionButton}
                  textColor="#f59e0b"
                >
                  Waiting Parts
                </Button>
                <Button
                  mode="contained"
                  onPress={() =>
                    handleStatusChange('completed', 'Mark this job as complete?')
                  }
                  loading={statusMutation.isPending}
                  disabled={statusMutation.isPending}
                  icon="check"
                  style={styles.actionButton}
                  buttonColor="#22c55e"
                >
                  Complete
                </Button>
              </>
            )}

            {job.status === 'waiting_parts' && (
              <>
                <Button
                  mode="outlined"
                  onPress={() =>
                    handleStatusChange(
                      'in_progress',
                      'Resume work on this job?'
                    )
                  }
                  loading={statusMutation.isPending}
                  disabled={statusMutation.isPending}
                  icon="play"
                  style={styles.actionButton}
                  textColor="#3b82f6"
                >
                  Resume
                </Button>
                <Button
                  mode="contained"
                  onPress={() =>
                    handleStatusChange('completed', 'Mark this job as complete?')
                  }
                  loading={statusMutation.isPending}
                  disabled={statusMutation.isPending}
                  icon="check"
                  style={styles.actionButton}
                  buttonColor="#22c55e"
                >
                  Complete
                </Button>
              </>
            )}

            {job.status === 'completed' && (
              <Button
                mode="contained"
                onPress={handleCreateInvoice}
                icon="receipt"
                style={styles.actionButton}
                buttonColor={theme.colors.primary}
              >
                Create Invoice
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>

      {/* Customer Card */}
      {job.customer && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Customer</Text>
            <Text style={styles.customerName}>{customerName}</Text>

            {job.customer.phone && (
              <TouchableOpacity
                onPress={() => handleCall(job.customer!.phone)}
                style={styles.contactRow}
              >
                <IconButton
                  icon="phone"
                  size={18}
                  iconColor={theme.colors.primary}
                  style={styles.contactIcon}
                />
                <Text style={styles.contactText}>{job.customer.phone}</Text>
              </TouchableOpacity>
            )}

            {job.customer.email && (
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(`mailto:${job.customer!.email}`)
                }
                style={styles.contactRow}
              >
                <IconButton
                  icon="email-outline"
                  size={18}
                  iconColor={theme.colors.primary}
                  style={styles.contactIcon}
                />
                <Text style={styles.contactText}>{job.customer.email}</Text>
              </TouchableOpacity>
            )}

            {job.customer.address && (
              <TouchableOpacity onPress={handleNavigate} style={styles.contactRow}>
                <IconButton
                  icon="map-marker-outline"
                  size={18}
                  iconColor={theme.colors.primary}
                  style={styles.contactIcon}
                />
                <Text style={styles.contactText}>
                  {job.customer.address}
                </Text>
              </TouchableOpacity>
            )}

            {/* Quick Actions: Navigate + On My Way */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {job.customer.address && (
                <Button
                  mode="contained"
                  onPress={handleNavigate}
                  icon="navigation-variant"
                  compact
                  style={{ flex: 1, borderRadius: 8 }}
                  buttonColor="#3b82f6"
                >
                  Navigate
                </Button>
              )}
              {job.customer.phone && (
                <Button
                  mode="contained"
                  onPress={handleOnMyWay}
                  icon="car"
                  compact
                  loading={isSendingOmw}
                  disabled={isSendingOmw}
                  style={{ flex: 1, borderRadius: 8 }}
                  buttonColor="#22c55e"
                >
                  On My Way
                </Button>
              )}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Line Items */}
      {job.lineItems && job.lineItems.length > 0 && (
        <Card style={styles.sectionCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Line Items</Text>
            {job.lineItems.map((item, index) => (
              <View key={item.id}>
                <View style={styles.lineItemRow}>
                  <View style={styles.lineItemDetails}>
                    <Text style={styles.lineItemDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={styles.lineItemQty}>
                      {item.quantity} x {formatCurrency(item.unitPrice / 100)}
                    </Text>
                  </View>
                  <Text style={styles.lineItemTotal}>
                    {formatCurrency((item.quantity * item.unitPrice) / 100)}
                  </Text>
                </View>
                {index < job.lineItems!.length - 1 && (
                  <Divider style={styles.lineItemDivider} />
                )}
              </View>
            ))}
            <Divider style={styles.totalDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>
                {formatCurrency(lineItemTotal / 100)}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Photos */}
      <Card style={styles.sectionCard} mode="elevated">
        <Card.Content>
          <View style={styles.photoHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <View style={styles.photoActions}>
              <Button
                mode="outlined"
                onPress={handlePickPhoto}
                icon="image"
                compact
                loading={isUploadingPhoto}
                disabled={isUploadingPhoto}
                style={styles.photoButton}
              >
                Gallery
              </Button>
              <Button
                mode="contained"
                onPress={handleTakePhoto}
                icon="camera"
                compact
                loading={isUploadingPhoto}
                disabled={isUploadingPhoto}
                style={styles.photoButton}
                buttonColor={theme.colors.primary}
              >
                Camera
              </Button>
            </View>
          </View>

          {job.photos && job.photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {job.photos.map((photo, index) => (
                <View key={index} style={styles.photoWrapper}>
                  <Image
                    source={{ uri: photo.url }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noPhotos}>
              <Text style={styles.noPhotosText}>
                No photos yet. Take a photo to document the job.
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Voice Notes */}
      <VoiceNotes
        jobId={job.id}
        existingNotes={job.notes || undefined}
        onNotesSaved={() => queryClient.invalidateQueries({ queryKey: ['job', jobId] })}
      />

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
    marginBottom: 8,
    gap: 12,
  },
  jobTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onBackground,
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
    lineHeight: 20,
  },
  dateText: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 16,
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
  sectionCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
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
  contactTextMuted: {
    fontSize: 14,
    color: '#6b7280',
  },
  lineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  lineItemDetails: {
    flex: 1,
    paddingRight: 16,
  },
  lineItemDesc: {
    fontSize: 14,
    color: theme.colors.onBackground,
    fontWeight: '500',
  },
  lineItemQty: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  lineItemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onBackground,
  },
  lineItemDivider: {
    backgroundColor: '#f3f4f6',
  },
  totalDivider: {
    backgroundColor: '#e5e7eb',
    marginTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onBackground,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  photoButton: {
    borderRadius: 8,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  photoWrapper: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  noPhotos: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noPhotosText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  notesText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  // AI Briefing styles
  briefingCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#7c3aed',
  },
  briefingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  briefingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  briefingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7c3aed',
  },
  briefingLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  briefingLoadingText: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
    fontStyle: 'italic',
  },
  briefingErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  briefingErrorText: {
    fontSize: 13,
    color: '#ef4444',
    flex: 1,
  },
  briefingSummary: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.onBackground,
    lineHeight: 20,
    marginTop: 8,
  },
  briefingSections: {
    marginTop: 12,
    gap: 12,
  },
  briefingSection: {
    backgroundColor: '#f8f5ff',
    borderRadius: 8,
    padding: 10,
  },
  briefingSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  briefingSectionText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    flex: 1,
  },
  briefingBulletRow: {
    flexDirection: 'row',
    paddingLeft: 4,
    gap: 6,
    marginTop: 2,
  },
  briefingBullet: {
    fontSize: 13,
    color: '#7c3aed',
    lineHeight: 18,
  },
  briefingTimestamp: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
