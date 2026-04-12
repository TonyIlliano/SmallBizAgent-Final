import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Text, Card, Chip } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiRequest } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { MoreStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Navigation = NativeStackNavigationProp<MoreStackParamList>;

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerId: number;
  amount: number;
  total: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  customer?: { id: number; firstName: string; lastName: string };
}

const FILTERS = ['all', 'pending', 'paid', 'overdue'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
};

function formatCurrency(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function InvoiceListScreen() {
  const navigation = useNavigation<Navigation>();
  const [filter, setFilter] = useState<Filter>('all');

  const {
    data: invoices,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => apiRequest<Invoice[]>('GET', '/api/invoices'),
  });

  const filtered = useMemo(() => {
    if (!invoices) return [];
    if (filter === 'all') return invoices;
    return invoices.filter((inv) => inv.status === filter);
  }, [invoices, filter]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: Invoice }) => {
      const customerName = item.customer
        ? `${item.customer.firstName} ${item.customer.lastName}`
        : 'Unknown Customer';

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            navigation.navigate('InvoiceDetail', { invoiceId: item.id })
          }
        >
          <Card style={styles.invoiceCard} mode="elevated">
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
                <Text style={styles.customerName} numberOfLines={1}>
                  {customerName}
                </Text>
                <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.totalAmount}>
                  {formatCurrency(item.total || item.amount || 0)}
                </Text>
                <StatusChip status={item.status} size="small" />
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      );
    },
    [navigation]
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
              <Text style={styles.emptyIcon}>{'\uD83D\uDCCB'}</Text>
              <Text style={styles.emptyTitle}>No invoices yet</Text>
              <Text style={styles.emptySubtitle}>
                Invoices will appear here once created
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
  invoiceCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  cardLeft: {
    flex: 1,
    paddingRight: 12,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  invoiceNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onBackground,
  },
  customerName: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onBackground,
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
