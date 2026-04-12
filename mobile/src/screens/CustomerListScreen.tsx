import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Text, Searchbar, Divider } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getCustomers, Customer } from '../api/customers';
import { CustomersStackParamList } from '../navigation/types';
import { theme } from '../theme';

type NavigationProp = NativeStackNavigationProp<CustomersStackParamList, 'CustomersList'>;

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// Color palette for avatar backgrounds based on name
const AVATAR_COLORS = [
  '#663399', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function CustomerListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const {
    data: customers,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: () => getCustomers(debouncedSearch || undefined),
  });

  const sortedCustomers = useMemo(() => {
    if (!customers) return [];
    return [...customers].sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [customers]);

  const handleCustomerPress = useCallback(
    (customerId: number) => {
      navigation.navigate('CustomerDetail', { customerId });
    },
    [navigation]
  );

  const renderCustomer = useCallback(
    ({ item }: { item: Customer }) => {
      const fullName = `${item.firstName} ${item.lastName}`;
      const initials = getInitials(item.firstName, item.lastName);
      const avatarColor = getAvatarColor(fullName);

      return (
        <TouchableOpacity
          onPress={() => handleCustomerPress(item.id)}
          activeOpacity={0.6}
        >
          <View style={styles.customerRow}>
            <View
              style={[styles.avatar, { backgroundColor: avatarColor + '20' }]}
            >
              <Text style={[styles.avatarText, { color: avatarColor }]}>
                {initials}
              </Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName} numberOfLines={1}>
                {fullName}
              </Text>
              {item.phone ? (
                <Text style={styles.customerDetail} numberOfLines={1}>
                  {item.phone}
                </Text>
              ) : item.email ? (
                <Text style={styles.customerDetail} numberOfLines={1}>
                  {item.email}
                </Text>
              ) : null}
            </View>
            <Text style={styles.chevron}>{'\u203A'}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleCustomerPress]
  );

  const keyExtractor = useCallback((item: Customer) => String(item.id), []);

  const ItemSeparator = useCallback(
    () => <Divider style={styles.divider} />,
    []
  );

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search customers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor="#9ca3af"
        />
      </View>

      {/* Customer Count */}
      {sortedCustomers.length > 0 && (
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {sortedCustomers.length} customer{sortedCustomers.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Customer List */}
      <FlatList
        data={sortedCustomers}
        renderItem={renderCustomer}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={ItemSeparator}
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
              <Text style={styles.emptyIcon}>{'\uD83D\uDC65'}</Text>
              <Text style={styles.emptyTitle}>No customers found</Text>
              <Text style={styles.emptySubtitle}>
                {debouncedSearch
                  ? `No results for "${debouncedSearch}"`
                  : 'Customers will appear here when added'}
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
    paddingBottom: 8,
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
  countContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  countText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  listContent: {
    paddingBottom: 16,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onBackground,
  },
  customerDetail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: '#d1d5db',
    marginLeft: 8,
  },
  divider: {
    backgroundColor: '#f3f4f6',
    marginLeft: 74,
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
