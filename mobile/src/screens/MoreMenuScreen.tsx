import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Divider, Avatar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';
import { MoreStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MoreStackParamList>;

interface MenuItem {
  icon: string;
  label: string;
  subtitle: string;
  screen: keyof MoreStackParamList;
  color: string;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: 'file-document-outline', label: 'Invoices', subtitle: 'View and send invoices', screen: 'Invoices', color: '#22c55e' },
  { icon: 'phone-log', label: 'Call Log', subtitle: 'AI receptionist call history', screen: 'CallLog', color: '#3b82f6' },
  { icon: 'robot-outline', label: 'Agent Activity', subtitle: 'SMS automation feed', screen: 'AgentActivity', color: '#8b5cf6' },
  { icon: 'file-sign', label: 'Quotes', subtitle: 'Estimates and proposals', screen: 'QuoteList', color: '#f59e0b' },
  { icon: 'cog-outline', label: 'Settings', subtitle: 'Account and preferences', screen: 'Settings', color: '#6b7280' },
];

export default function MoreMenuScreen() {
  const navigation = useNavigation<Nav>();
  const { user, business } = useAuth();

  const initials = user?.username ? user.username[0].toUpperCase() : '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Card */}
      <TouchableOpacity
        style={styles.profileCard}
        onPress={() => navigation.navigate('Settings')}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.username || 'User'}</Text>
          <Text style={styles.profileBusiness}>{business?.name || 'SmallBizAgent'}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color="#9ca3af" />
      </TouchableOpacity>

      <Divider style={styles.sectionDivider} />

      {/* Menu Items */}
      {MENU_ITEMS.map((item, index) => (
        <React.Fragment key={item.screen}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.screen as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
              <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#d1d5db" />
          </TouchableOpacity>
          {index < MENU_ITEMS.length - 1 && <Divider style={styles.itemDivider} />}
        </React.Fragment>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>SmallBizAgent Mobile v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 32 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  profileInfo: { flex: 1, marginLeft: 14 },
  profileName: { fontSize: 17, fontWeight: '600', color: theme.colors.onBackground },
  profileBusiness: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  sectionDivider: { height: 8, backgroundColor: theme.colors.background },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuText: { flex: 1, marginLeft: 14 },
  menuLabel: { fontSize: 16, fontWeight: '500', color: theme.colors.onBackground },
  menuSubtitle: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  itemDivider: { marginLeft: 74, backgroundColor: '#f3f4f6' },
  footer: { padding: 24, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#d1d5db' },
});
