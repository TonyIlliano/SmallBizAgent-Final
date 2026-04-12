import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Text, Card, Chip, IconButton } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { theme } from '../theme';

interface CallLog {
  id: number;
  businessId: number;
  callerId: string;
  callerName?: string;
  transcript?: string;
  intentDetected?: string;
  callDuration: number | null;
  recordingUrl?: string | null;
  status: string;
  createdAt: string;
}

const FILTERS = ['all', 'today', 'week'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  today: 'Today',
  week: 'This Week',
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isThisWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return date >= weekAgo;
}

export default function CallLogScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const {
    data: callLogs,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['call-logs'],
    queryFn: () => apiRequest<CallLog[]>('GET', '/api/call-logs'),
  });

  const filtered = useMemo(() => {
    if (!callLogs) return [];
    switch (filter) {
      case 'today':
        return callLogs.filter((c) => isToday(c.createdAt));
      case 'week':
        return callLogs.filter((c) => isThisWeek(c.createdAt));
      default:
        return callLogs;
    }
  }, [callLogs, filter]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: CallLog }) => {
      const isExpanded = expandedId === item.id;
      const callerDisplay = item.callerName || item.callerId || 'Unknown Caller';
      const transcriptSnippet = item.transcript
        ? item.transcript.substring(0, 200) + (item.transcript.length > 200 ? '...' : '')
        : null;

      return (
        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(item.id)}>
          <Card style={styles.callCard} mode="elevated">
            <View style={styles.cardContent}>
              {/* Caller icon */}
              <View style={styles.callerIcon}>
                <IconButton
                  icon="phone-incoming"
                  size={18}
                  iconColor="#ffffff"
                  style={styles.callerIconBtn}
                />
              </View>

              {/* Main info */}
              <View style={styles.callDetails}>
                <View style={styles.callHeader}>
                  <Text style={styles.callerName} numberOfLines={1}>
                    {callerDisplay}
                  </Text>
                  <Text style={styles.callTime}>
                    {isToday(item.createdAt)
                      ? formatTime(item.createdAt)
                      : `${formatDate(item.createdAt)} ${formatTime(item.createdAt)}`}
                  </Text>
                </View>

                <View style={styles.callMeta}>
                  <Text style={styles.durationText}>
                    {formatDuration(item.callDuration)}
                  </Text>
                  {item.intentDetected && (
                    <Text style={styles.intentText} numberOfLines={1}>
                      {item.intentDetected}
                    </Text>
                  )}
                </View>

                <View style={styles.callFooter}>
                  <StatusChip status={item.status} size="small" />
                  {item.recordingUrl && (
                    <View style={styles.recordingBadge}>
                      <IconButton
                        icon="microphone"
                        size={12}
                        iconColor="#6366f1"
                        style={styles.recordingIcon}
                      />
                      <Text style={styles.recordingText}>Recording</Text>
                    </View>
                  )}
                </View>

                {/* Expanded transcript */}
                {isExpanded && transcriptSnippet && (
                  <View style={styles.transcriptWrap}>
                    <Text style={styles.transcriptLabel}>Transcript</Text>
                    <Text style={styles.transcriptText}>{transcriptSnippet}</Text>
                  </View>
                )}

                {isExpanded && !transcriptSnippet && (
                  <View style={styles.transcriptWrap}>
                    <Text style={styles.noTranscriptText}>
                      No transcript available
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      );
    },
    [expandedId, toggleExpand]
  );

  return (
    <View style={styles.container}>
      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            mode={filter === f ? 'flat' : 'outlined'}
            selected={filter === f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterChip,
              filter === f && styles.filterChipActive,
            ]}
            textStyle={[
              styles.filterChipText,
              filter === f && styles.filterChipTextActive,
            ]}
            showSelectedOverlay={false}
          >
            {FILTER_LABELS[f]}
          </Chip>
        ))}
      </View>

      <FlatList
        data={filtered}
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
              <Text style={styles.emptyIcon}>{'\uD83D\uDCDE'}</Text>
              <Text style={styles.emptyTitle}>No calls yet</Text>
              <Text style={styles.emptySubtitle}>
                Call logs from your AI receptionist will appear here
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  filterChip: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  filterChipActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: '#6b7280',
  },
  filterChipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  callCard: {
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  callerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerIconBtn: {
    margin: 0,
  },
  callDetails: {
    flex: 1,
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callerName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onBackground,
    flex: 1,
    marginRight: 8,
  },
  callTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  durationText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  intentText: {
    fontSize: 12,
    color: '#6b7280',
    flex: 1,
  },
  callFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f120',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recordingIcon: {
    margin: 0,
    width: 16,
    height: 16,
  },
  recordingText: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: '500',
  },
  transcriptWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  transcriptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  noTranscriptText: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
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
  },
});
