import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Text, Card, Chip, Searchbar } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getJobs, Job } from '../api/jobs';
import { StatusChip } from '../components/StatusChip';
import { JobsStackParamList } from '../navigation/types';
import { theme } from '../theme';

type NavigationProp = NativeStackNavigationProp<JobsStackParamList, 'JobsList'>;

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'pending', label: 'Pending' },
  { key: 'waiting_parts', label: 'Waiting Parts' },
  { key: 'completed', label: 'Completed' },
] as const;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not scheduled';
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function JobsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: jobs,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => getJobs(),
  });

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    let result = jobs;

    // Apply status filter
    if (activeFilter !== 'all') {
      result = result.filter((job) => job.status === activeFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (job) =>
          job.title.toLowerCase().includes(q) ||
          (job.customer &&
            `${job.customer.firstName} ${job.customer.lastName}`
              .toLowerCase()
              .includes(q))
      );
    }

    return result;
  }, [jobs, activeFilter, searchQuery]);

  const handleJobPress = useCallback(
    (jobId: number) => {
      navigation.navigate('JobDetail', { jobId });
    },
    [navigation]
  );

  const renderJob = useCallback(
    ({ item }: { item: Job }) => {
      const customerName = item.customer
        ? `${item.customer.firstName} ${item.customer.lastName}`
        : 'Unknown Customer';

      return (
        <TouchableOpacity
          onPress={() => handleJobPress(item.id)}
          activeOpacity={0.7}
        >
          <Card style={styles.jobCard} mode="elevated">
            <Card.Content style={styles.jobCardContent}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <StatusChip status={item.status} size="small" />
              </View>
              <Text style={styles.customerName} numberOfLines={1}>
                {customerName}
              </Text>
              <View style={styles.jobFooter}>
                <Text style={styles.dateText}>
                  {formatDate(item.scheduledDate)}
                </Text>
                {item.lineItems && item.lineItems.length > 0 && (
                  <Text style={styles.itemCount}>
                    {item.lineItems.length} item{item.lineItems.length !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            </Card.Content>
          </Card>
        </TouchableOpacity>
      );
    },
    [handleJobPress]
  );

  const keyExtractor = useCallback((item: Job) => String(item.id), []);

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search jobs..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor="#9ca3af"
        />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={FILTER_OPTIONS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <Chip
              selected={activeFilter === item.key}
              onPress={() => setActiveFilter(item.key)}
              style={[
                styles.filterChip,
                activeFilter === item.key && styles.filterChipActive,
              ]}
              textStyle={[
                styles.filterChipText,
                activeFilter === item.key && styles.filterChipTextActive,
              ]}
              showSelectedOverlay={false}
            >
              {item.label}
            </Chip>
          )}
        />
      </View>

      {/* Jobs List */}
      <FlatList
        data={filteredJobs}
        renderItem={renderJob}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{'\uD83D\uDD27'}</Text>
              <Text style={styles.emptyTitle}>No jobs found</Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter !== 'all'
                  ? 'Try a different filter'
                  : searchQuery
                  ? 'Try a different search'
                  : 'Jobs will appear here once created'}
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#ffffff',
  },
  searchbar: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    elevation: 0,
  },
  searchInput: {
    fontSize: 15,
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    paddingBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: theme.colors.background,
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primaryContainer,
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
    paddingTop: 8,
  },
  jobCard: {
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  jobCardContent: {
    paddingVertical: 14,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onBackground,
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 6,
  },
  jobFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dateText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  itemCount: {
    fontSize: 13,
    color: '#9ca3af',
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
