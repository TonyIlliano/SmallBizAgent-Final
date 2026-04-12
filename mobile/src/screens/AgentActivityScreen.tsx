import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Text, Card, IconButton } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { theme } from '../theme';

interface ActivityEvent {
  id: number;
  businessId: number;
  agentType: string;
  eventType: string;
  customerName?: string;
  messagePreview?: string;
  status?: string;
  createdAt: string;
}

const AGENT_COLORS: Record<string, string> = {
  follow_up: '#22c55e',
  no_show: '#ef4444',
  rebooking: '#3b82f6',
  estimate_follow_up: '#f59e0b',
  invoice_collection: '#10b981',
  review_request: '#8b5cf6',
  conversational_booking: '#6366f1',
};

const AGENT_ICONS: Record<string, string> = {
  follow_up: 'message-check',
  no_show: 'account-alert',
  rebooking: 'account-reactivate',
  estimate_follow_up: 'file-document-outline',
  invoice_collection: 'cash',
  review_request: 'star-outline',
  conversational_booking: 'chat-processing',
};

const AGENT_LABELS: Record<string, string> = {
  follow_up: 'Follow-Up',
  no_show: 'No-Show',
  rebooking: 'Rebooking',
  estimate_follow_up: 'Estimate Follow-Up',
  invoice_collection: 'Invoice Collection',
  review_request: 'Review Request',
  conversational_booking: 'Booking',
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getStatusStyle(status?: string): { color: string; label: string } {
  switch (status) {
    case 'sent':
    case 'delivered':
      return { color: '#22c55e', label: 'Delivered' };
    case 'failed':
      return { color: '#ef4444', label: 'Failed' };
    case 'queued':
    case 'pending':
      return { color: '#f59e0b', label: 'Pending' };
    default:
      return { color: '#9ca3af', label: status || 'Sent' };
  }
}

export default function AgentActivityScreen() {
  const {
    data: activity,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['sms-activity-feed'],
    queryFn: () => apiRequest<ActivityEvent[]>('GET', '/api/sms-activity-feed'),
  });

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderItem = useCallback(({ item }: { item: ActivityEvent }) => {
    const agentColor = AGENT_COLORS[item.agentType] || '#6b7280';
    const agentIcon = AGENT_ICONS[item.agentType] || 'robot';
    const agentLabel = AGENT_LABELS[item.agentType] || item.agentType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    const statusInfo = getStatusStyle(item.status);

    return (
      <Card style={styles.activityCard} mode="elevated">
        <View style={styles.cardContent}>
          {/* Agent icon */}
          <View style={[styles.agentIcon, { backgroundColor: agentColor + '20' }]}>
            <IconButton
              icon={agentIcon}
              size={18}
              iconColor={agentColor}
              style={styles.agentIconBtn}
            />
          </View>

          {/* Details */}
          <View style={styles.details}>
            <View style={styles.detailHeader}>
              <Text style={[styles.agentLabel, { color: agentColor }]}>
                {agentLabel}
              </Text>
              <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
            </View>

            {item.customerName && (
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customerName}
              </Text>
            )}

            {item.messagePreview && (
              <Text style={styles.messagePreview} numberOfLines={2}>
                {item.messagePreview}
              </Text>
            )}

            {/* Status indicator */}
            <View style={styles.statusRow}>
              <View
                style={[styles.statusDot, { backgroundColor: statusInfo.color }]}
              />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    );
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={activity || []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{'\uD83E\uDD16'}</Text>
              <Text style={styles.emptyTitle}>No agent activity yet</Text>
              <Text style={styles.emptySubtitle}>
                SMS agent actions like follow-ups, no-show recovery, and rebooking will appear here
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  activityCard: {
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  agentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentIconBtn: {
    margin: 0,
  },
  details: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  agentLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onBackground,
    marginTop: 4,
  },
  messagePreview: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onBackground,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
