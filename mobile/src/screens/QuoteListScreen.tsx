import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Text, Card, Chip, Button, Divider, Portal, Modal } from 'react-native-paper';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { apiRequest } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { theme } from '../theme';

interface QuoteItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Quote {
  id: number;
  quoteNumber: string;
  customerId: number;
  total: number;
  status: string;
  createdAt: string;
  expiresAt?: string | null;
  customer?: { id: number; firstName: string; lastName: string; phone?: string; email?: string };
  items?: QuoteItem[];
}

const FILTERS = ['all', 'draft', 'sent', 'accepted'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
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

export default function QuoteListScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  const {
    data: quotes,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => apiRequest<Quote[]>('GET', '/api/quotes'),
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, channel }: { id: number; channel: 'sms' | 'email' }) =>
      apiRequest('POST', `/api/quotes/${id}/send`, { channel }),
    onSuccess: (_data, variables) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sent', `Quote sent via ${variables.channel === 'sms' ? 'SMS' : 'email'}`);
      setSelectedQuote(null);
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to send quote');
    },
  });

  const filtered = useMemo(() => {
    if (!quotes) return [];
    if (filter === 'all') return quotes;
    return quotes.filter((q) => q.status === filter);
  }, [quotes, filter]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: Quote }) => {
      const customerName = item.customer
        ? `${item.customer.firstName} ${item.customer.lastName}`
        : 'Unknown Customer';

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setSelectedQuote(item)}
        >
          <Card style={styles.quoteCard} mode="elevated">
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <Text style={styles.quoteNumber}>{item.quoteNumber}</Text>
                <Text style={styles.customerName} numberOfLines={1}>
                  {customerName}
                </Text>
                <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.totalAmount}>
                  {formatCurrency(item.total || 0)}
                </Text>
                <StatusChip status={item.status} size="small" />
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      );
    },
    []
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
              <Text style={styles.emptyIcon}>{'\uD83D\uDCDD'}</Text>
              <Text style={styles.emptyTitle}>No quotes yet</Text>
              <Text style={styles.emptySubtitle}>
                Quotes and estimates will appear here
              </Text>
            </View>
          ) : null
        }
      />

      {/* Quote Detail Modal */}
      <Portal>
        <Modal
          visible={selectedQuote !== null}
          onDismiss={() => setSelectedQuote(null)}
          contentContainerStyle={styles.modalContainer}
        >
          {selectedQuote && (
            <View>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedQuote.quoteNumber}</Text>
                <StatusChip status={selectedQuote.status} />
              </View>

              {/* Customer */}
              {selectedQuote.customer && (
                <Text style={styles.modalCustomer}>
                  {selectedQuote.customer.firstName} {selectedQuote.customer.lastName}
                </Text>
              )}

              <Text style={styles.modalDate}>
                Created: {formatDate(selectedQuote.createdAt)}
              </Text>

              <Divider style={styles.modalDivider} />

              {/* Items */}
              {selectedQuote.items && selectedQuote.items.length > 0 ? (
                <>
                  <Text style={styles.itemsTitle}>Items</Text>
                  {selectedQuote.items.map((item, index) => (
                    <View key={item.id}>
                      <View style={styles.lineItemRow}>
                        <View style={styles.lineItemLeft}>
                          <Text style={styles.lineItemDesc} numberOfLines={2}>
                            {item.description}
                          </Text>
                          <Text style={styles.lineItemQty}>
                            {item.quantity} x {formatCurrency(item.unitPrice)}
                          </Text>
                        </View>
                        <Text style={styles.lineItemTotal}>
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </Text>
                      </View>
                      {index < (selectedQuote.items?.length || 0) - 1 && (
                        <Divider style={styles.itemDivider} />
                      )}
                    </View>
                  ))}

                  <Divider style={styles.totalDivider} />
                </>
              ) : (
                <Text style={styles.noItemsText}>No line items</Text>
              )}

              {/* Total */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>
                  {formatCurrency(selectedQuote.total || 0)}
                </Text>
              </View>

              <Divider style={styles.modalDivider} />

              {/* Actions */}
              <View style={styles.modalActions}>
                <Button
                  mode="outlined"
                  onPress={() =>
                    sendMutation.mutate({ id: selectedQuote.id, channel: 'sms' })
                  }
                  loading={sendMutation.isPending}
                  disabled={sendMutation.isPending}
                  icon="message-text"
                  style={styles.modalButton}
                  textColor={theme.colors.primary}
                >
                  Send SMS
                </Button>
                <Button
                  mode="outlined"
                  onPress={() =>
                    sendMutation.mutate({ id: selectedQuote.id, channel: 'email' })
                  }
                  loading={sendMutation.isPending}
                  disabled={sendMutation.isPending}
                  icon="email-outline"
                  style={styles.modalButton}
                  textColor={theme.colors.primary}
                >
                  Send Email
                </Button>
              </View>

              <Button
                mode="text"
                onPress={() => setSelectedQuote(null)}
                style={styles.closeButton}
                textColor="#6b7280"
              >
                Close
              </Button>
            </View>
          )}
        </Modal>
      </Portal>
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
  quoteCard: {
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
  quoteNumber: {
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
  // Modal styles
  modalContainer: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onBackground,
  },
  modalCustomer: {
    fontSize: 15,
    color: '#4b5563',
    marginTop: 4,
  },
  modalDate: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
  },
  modalDivider: {
    backgroundColor: '#e5e7eb',
    marginVertical: 14,
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onBackground,
    marginBottom: 8,
  },
  lineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  lineItemLeft: {
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
  itemDivider: {
    backgroundColor: '#f3f4f6',
  },
  totalDivider: {
    backgroundColor: '#e5e7eb',
    marginTop: 4,
  },
  noItemsText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onBackground,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    borderRadius: 10,
    flex: 1,
  },
  closeButton: {
    marginTop: 8,
  },
});
