import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import { Text, Card, Button, Divider, IconButton } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { apiRequest } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { MoreStackParamList } from '../navigation/types';
import { theme } from '../theme';

type DetailRoute = RouteProp<MoreStackParamList, 'InvoiceDetail'>;

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerId: number;
  amount: number;
  subtotal: number | null;
  tax: number | null;
  total: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  accessToken: string | null;
  customer?: { id: number; firstName: string; lastName: string; phone: string; email: string };
  items?: InvoiceItem[];
}

function formatCurrency(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function InvoiceDetailScreen() {
  const route = useRoute<DetailRoute>();
  const queryClient = useQueryClient();
  const { invoiceId } = route.params;

  const {
    data: invoice,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => apiRequest<Invoice>('GET', `/api/invoices/${invoiceId}`),
  });

  const sendMutation = useMutation({
    mutationFn: ({ channel }: { channel: 'sms' | 'email' }) =>
      apiRequest('POST', `/api/invoices/${invoiceId}/send`, { channel }),
    onSuccess: (_data, variables) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Sent',
        `Invoice sent via ${variables.channel === 'sms' ? 'SMS' : 'email'}`
      );
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to send invoice');
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: () =>
      apiRequest('PUT', `/api/invoices/${invoiceId}`, { status: 'paid' }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to update invoice');
    },
  });

  const handleMarkPaid = useCallback(() => {
    Alert.alert(
      'Mark as Paid',
      'Mark this invoice as paid? This is for cash/check payments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Paid',
          onPress: () => markPaidMutation.mutate(),
        },
      ]
    );
  }, [markPaidMutation]);

  const handleShare = useCallback(async () => {
    if (!invoice?.accessToken) {
      Alert.alert('Error', 'No payment link available for this invoice');
      return;
    }
    try {
      await Share.share({
        message: `Pay invoice ${invoice.invoiceNumber}: ${formatCurrency(invoice.total)} - View and pay online`,
        url: `https://smallbizagent.ai/portal/invoice/${invoice.accessToken}`,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // User cancelled
    }
  }, [invoice]);

  if (isLoading || !invoice) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading invoice...</Text>
      </View>
    );
  }

  const customerName = invoice.customer
    ? `${invoice.customer.firstName} ${invoice.customer.lastName}`
    : 'Unknown Customer';

  const subtotal = invoice.subtotal || invoice.total || 0;
  const tax = invoice.tax || 0;
  const total = invoice.total || 0;

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
        <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
        <StatusChip status={invoice.status} />
      </View>

      {/* Overview Card */}
      <Card style={styles.sectionCard} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer</Text>
            <Text style={styles.detailValue}>{customerName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{formatDate(invoice.createdAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Due Date</Text>
            <Text style={styles.detailValue}>{formatDate(invoice.dueDate)}</Text>
          </View>
        </Card.Content>
      </Card>

      {/* Line Items */}
      <Card style={styles.sectionCard} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionTitle}>Items</Text>
          {invoice.items && invoice.items.length > 0 ? (
            <>
              {/* Table header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Description</Text>
                <Text style={[styles.tableHeaderText, styles.tableColCenter]}>Qty</Text>
                <Text style={[styles.tableHeaderText, styles.tableColRight]}>Price</Text>
                <Text style={[styles.tableHeaderText, styles.tableColRight]}>Total</Text>
              </View>
              <Divider style={styles.tableDivider} />

              {invoice.items.map((item, index) => (
                <View key={item.id}>
                  <View style={styles.lineItemRow}>
                    <Text style={[styles.lineItemText, { flex: 1 }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={[styles.lineItemText, styles.tableColCenter]}>
                      {item.quantity}
                    </Text>
                    <Text style={[styles.lineItemText, styles.tableColRight]}>
                      {formatCurrency(item.unitPrice)}
                    </Text>
                    <Text style={[styles.lineItemTextBold, styles.tableColRight]}>
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </Text>
                  </View>
                  {index < (invoice.items?.length || 0) - 1 && (
                    <Divider style={styles.itemDivider} />
                  )}
                </View>
              ))}

              <Divider style={styles.totalDivider} />

              {/* Subtotal */}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
              </View>

              {/* Tax */}
              {tax > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(tax)}</Text>
                </View>
              )}

              {/* Total */}
              <Divider style={styles.totalDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.noItems}>
              <Text style={styles.noItemsText}>No line items</Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Actions */}
      <Card style={styles.actionCard} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionButtons}>
            <Button
              mode="outlined"
              onPress={() => sendMutation.mutate({ channel: 'sms' })}
              loading={sendMutation.isPending}
              disabled={sendMutation.isPending}
              icon="message-text"
              style={styles.actionButton}
              textColor={theme.colors.primary}
            >
              Send via SMS
            </Button>

            <Button
              mode="outlined"
              onPress={() => sendMutation.mutate({ channel: 'email' })}
              loading={sendMutation.isPending}
              disabled={sendMutation.isPending}
              icon="email-outline"
              style={styles.actionButton}
              textColor={theme.colors.primary}
            >
              Send via Email
            </Button>
          </View>

          <View style={[styles.actionButtons, { marginTop: 10 }]}>
            <Button
              mode="outlined"
              onPress={handleShare}
              icon="share-variant"
              style={styles.actionButton}
              textColor="#6b7280"
            >
              Share Link
            </Button>

            {invoice.status !== 'paid' && (
              <Button
                mode="contained"
                onPress={handleMarkPaid}
                loading={markPaidMutation.isPending}
                disabled={markPaidMutation.isPending}
                icon="cash"
                style={styles.actionButton}
                buttonColor="#22c55e"
              >
                Mark Paid
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>

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
  invoiceNumber: {
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.onBackground,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableColCenter: {
    width: 40,
    textAlign: 'center',
  },
  tableColRight: {
    width: 70,
    textAlign: 'right',
  },
  tableDivider: {
    backgroundColor: '#e5e7eb',
  },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  lineItemText: {
    fontSize: 14,
    color: theme.colors.onBackground,
  },
  lineItemTextBold: {
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.onBackground,
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
  noItems: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noItemsText: {
    fontSize: 14,
    color: '#9ca3af',
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
});
