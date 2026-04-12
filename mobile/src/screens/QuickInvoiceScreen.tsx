import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, Card, TextInput, Button, Divider, Switch, Snackbar } from 'react-native-paper';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { getJob, Job } from '../api/jobs';
import { getCustomer } from '../api/customers';
import { createInvoice, sendInvoice, CreateInvoiceData } from '../api/invoices';
import { JobsStackParamList } from '../navigation/types';
import { theme } from '../theme';

type InvoiceRoute = RouteProp<JobsStackParamList, 'QuickInvoice'>;

interface LineItemDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function generateKey(): string {
  return Math.random().toString(36).substring(2, 10);
}

function parseNumber(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export default function QuickInvoiceScreen() {
  const route = useRoute<InvoiceRoute>();
  const navigation = useNavigation();
  const { jobId, customerId } = route.params;

  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const [includeTax, setIncludeTax] = useState(false);
  const [taxRate] = useState(10); // 10% default
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Fetch job to pre-populate line items
  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    // Pre-populate line items from job
  });

  // Fetch customer for display
  const { data: customer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomer(customerId),
  });

  // Pre-populate from job line items (once)
  React.useEffect(() => {
    if (job?.lineItems && lineItems.length === 0) {
      const items = job.lineItems.map((item) => ({
        key: generateKey(),
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String((item.unitPrice / 100).toFixed(2)),
      }));
      setLineItems(items.length > 0 ? items : [createEmptyItem()]);
    } else if (lineItems.length === 0) {
      setLineItems([createEmptyItem()]);
    }
  }, [job]);

  function createEmptyItem(): LineItemDraft {
    return { key: generateKey(), description: '', quantity: '1', unitPrice: '' };
  }

  const updateItem = useCallback(
    (key: string, field: keyof LineItemDraft, value: string) => {
      setLineItems((prev) =>
        prev.map((item) =>
          item.key === key ? { ...item, [field]: value } : item
        )
      );
    },
    []
  );

  const removeItem = useCallback((key: string) => {
    setLineItems((prev) => {
      const next = prev.filter((item) => item.key !== key);
      return next.length > 0 ? next : [createEmptyItem()];
    });
  }, []);

  const addItem = useCallback(() => {
    setLineItems((prev) => [...prev, createEmptyItem()]);
  }, []);

  const subtotal = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      return sum + parseNumber(item.quantity) * parseNumber(item.unitPrice);
    }, 0);
  }, [lineItems]);

  const taxAmount = useMemo(() => {
    return includeTax ? subtotal * (taxRate / 100) : 0;
  }, [subtotal, includeTax, taxRate]);

  const total = subtotal + taxAmount;

  const createMutation = useMutation({
    mutationFn: (data: CreateInvoiceData) => createInvoice(data),
    onSuccess: async (invoice) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Ask to send via SMS
      Alert.alert(
        'Invoice Created',
        'Would you like to send this invoice to the customer via SMS?',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => {
              navigation.goBack();
            },
          },
          {
            text: 'Send SMS',
            onPress: async () => {
              setIsSending(true);
              try {
                await sendInvoice(invoice.id, 'sms');
                setSnackbarMessage('Invoice sent via SMS!');
                setSnackbarVisible(true);
                setTimeout(() => navigation.goBack(), 1500);
              } catch (err: any) {
                Alert.alert('Send Failed', err.message || 'Could not send invoice');
                navigation.goBack();
              } finally {
                setIsSending(false);
              }
            },
          },
        ]
      );
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to create invoice');
    },
  });

  const handleSubmit = useCallback(() => {
    // Validate
    const validItems = lineItems.filter(
      (item) =>
        item.description.trim() &&
        parseNumber(item.quantity) > 0 &&
        parseNumber(item.unitPrice) > 0
    );

    if (validItems.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one line item with description, quantity, and price.');
      return;
    }

    const data: CreateInvoiceData = {
      customerId,
      items: validItems.map((item) => ({
        description: item.description.trim(),
        quantity: parseNumber(item.quantity),
        unitPrice: Math.round(parseNumber(item.unitPrice) * 100), // Convert to cents
      })),
      tax: includeTax ? Math.round(taxAmount * 100) : undefined,
    };

    createMutation.mutate(data);
  }, [lineItems, customerId, includeTax, taxAmount, createMutation]);

  const customerName = customer
    ? `${customer.firstName} ${customer.lastName}`
    : 'Loading...';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer */}
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Customer</Text>
            <Text style={styles.customerName}>{customerName}</Text>
            {customer?.phone && (
              <Text style={styles.customerDetail}>{customer.phone}</Text>
            )}
          </Card.Content>
        </Card>

        {/* Line Items */}
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Line Items</Text>

            {lineItems.map((item, index) => (
              <View key={item.key} style={styles.lineItemContainer}>
                {index > 0 && <Divider style={styles.itemDivider} />}
                <View style={styles.lineItemHeader}>
                  <Text style={styles.lineItemNumber}>Item {index + 1}</Text>
                  {lineItems.length > 1 && (
                    <Button
                      mode="text"
                      compact
                      onPress={() => removeItem(item.key)}
                      textColor={theme.colors.error}
                      icon="close"
                    >
                      Remove
                    </Button>
                  )}
                </View>

                <TextInput
                  label="Description"
                  value={item.description}
                  onChangeText={(val) => updateItem(item.key, 'description', val)}
                  mode="outlined"
                  style={styles.itemInput}
                  outlineColor={theme.colors.outline}
                  activeOutlineColor={theme.colors.primary}
                  dense
                />

                <View style={styles.rowInputs}>
                  <TextInput
                    label="Qty"
                    value={item.quantity}
                    onChangeText={(val) => updateItem(item.key, 'quantity', val)}
                    mode="outlined"
                    keyboardType="numeric"
                    style={[styles.itemInput, styles.qtyInput]}
                    outlineColor={theme.colors.outline}
                    activeOutlineColor={theme.colors.primary}
                    dense
                  />
                  <TextInput
                    label="Unit Price ($)"
                    value={item.unitPrice}
                    onChangeText={(val) => updateItem(item.key, 'unitPrice', val)}
                    mode="outlined"
                    keyboardType="decimal-pad"
                    style={[styles.itemInput, styles.priceInput]}
                    outlineColor={theme.colors.outline}
                    activeOutlineColor={theme.colors.primary}
                    dense
                  />
                  <View style={styles.lineTotal}>
                    <Text style={styles.lineTotalLabel}>Total</Text>
                    <Text style={styles.lineTotalValue}>
                      ${(parseNumber(item.quantity) * parseNumber(item.unitPrice)).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            <Button
              mode="outlined"
              onPress={addItem}
              icon="plus"
              style={styles.addButton}
              compact
            >
              Add Item
            </Button>
          </Card.Content>
        </Card>

        {/* Totals */}
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
            </View>

            <View style={styles.taxRow}>
              <View style={styles.taxToggle}>
                <Text style={styles.totalLabel}>Tax ({taxRate}%)</Text>
                <Switch
                  value={includeTax}
                  onValueChange={setIncludeTax}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.totalValue}>
                {includeTax ? `$${taxAmount.toFixed(2)}` : '--'}
              </Text>
            </View>

            <Divider style={styles.totalDivider} />

            <View style={styles.totalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>${total.toFixed(2)}</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Submit */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={createMutation.isPending || isSending}
          disabled={createMutation.isPending || isSending}
          style={styles.submitButton}
          contentStyle={styles.submitContent}
          labelStyle={styles.submitLabel}
          icon="send"
        >
          {createMutation.isPending
            ? 'Creating...'
            : isSending
            ? 'Sending...'
            : 'Create & Send Invoice'}
        </Button>

        <View style={{ height: 32 }} />
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
  },
  card: {
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
  customerName: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.onBackground,
  },
  customerDetail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  lineItemContainer: {
    marginBottom: 8,
  },
  lineItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  lineItemNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  itemDivider: {
    marginBottom: 12,
    backgroundColor: '#f3f4f6',
  },
  itemInput: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  qtyInput: {
    flex: 1,
  },
  priceInput: {
    flex: 2,
  },
  lineTotal: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 12,
  },
  lineTotalLabel: {
    fontSize: 11,
    color: '#9ca3af',
  },
  lineTotalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onBackground,
    marginTop: 2,
  },
  addButton: {
    marginTop: 4,
    borderRadius: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  taxToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalLabel: {
    fontSize: 15,
    color: '#4b5563',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.onBackground,
  },
  totalDivider: {
    marginVertical: 8,
    backgroundColor: '#e5e7eb',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onBackground,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  submitButton: {
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    marginTop: 4,
  },
  submitContent: {
    paddingVertical: 6,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  snackbar: {
    backgroundColor: '#22c55e',
  },
});
