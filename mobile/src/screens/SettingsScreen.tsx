import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Button, Divider, List } from 'react-native-paper';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const { user, business, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setIsLoggingOut(true);
          try {
            await logout();
          } catch {
            // Logout should always succeed locally
          } finally {
            setIsLoggingOut(false);
          }
        },
      },
    ]);
  }, [logout]);

  const getRoleLabel = (role: string): string => {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'staff':
        return 'Staff Member';
      case 'user':
        return 'Business Owner';
      default:
        return role;
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Profile Section */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.sectionHeader}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>
                {user?.username?.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {user?.username || 'Unknown'}
              </Text>
              <Text style={styles.profileEmail}>
                {user?.email || 'No email'}
              </Text>
            </View>
          </View>
          <Divider style={styles.divider} />
          <List.Item
            title="Role"
            description={user ? getRoleLabel(user.role) : '--'}
            left={(props) => <List.Icon {...props} icon="shield-account" />}
            titleStyle={styles.listItemTitle}
            descriptionStyle={styles.listItemDesc}
          />
        </Card.Content>
      </Card>

      {/* Business Section */}
      {business && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionTitle}>Business</Text>
            <List.Item
              title="Name"
              description={business.name}
              left={(props) => <List.Icon {...props} icon="store" />}
              titleStyle={styles.listItemTitle}
              descriptionStyle={styles.listItemDesc}
            />
            <Divider style={styles.listDivider} />
            {business.industry && (
              <>
                <List.Item
                  title="Industry"
                  description={business.industry.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  left={(props) => <List.Icon {...props} icon="briefcase-outline" />}
                  titleStyle={styles.listItemTitle}
                  descriptionStyle={styles.listItemDesc}
                />
                <Divider style={styles.listDivider} />
              </>
            )}
            <List.Item
              title="Timezone"
              description={business.timezone}
              left={(props) => <List.Icon {...props} icon="clock-outline" />}
              titleStyle={styles.listItemTitle}
              descriptionStyle={styles.listItemDesc}
            />
            {business.phone && (
              <>
                <Divider style={styles.listDivider} />
                <List.Item
                  title="Phone"
                  description={business.phone}
                  left={(props) => <List.Icon {...props} icon="phone-outline" />}
                  titleStyle={styles.listItemTitle}
                  descriptionStyle={styles.listItemDesc}
                />
              </>
            )}
          </Card.Content>
        </Card>
      )}

      {/* App Info */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionTitle}>App</Text>
          <List.Item
            title="Version"
            description={APP_VERSION}
            left={(props) => <List.Icon {...props} icon="information-outline" />}
            titleStyle={styles.listItemTitle}
            descriptionStyle={styles.listItemDesc}
          />
          <Divider style={styles.listDivider} />
          <List.Item
            title="Platform"
            description="SmallBizAgent Mobile"
            left={(props) => <List.Icon {...props} icon="cellphone" />}
            titleStyle={styles.listItemTitle}
            descriptionStyle={styles.listItemDesc}
          />
        </Card.Content>
      </Card>

      {/* Sign Out */}
      <Button
        mode="outlined"
        onPress={handleLogout}
        loading={isLoggingOut}
        disabled={isLoggingOut}
        style={styles.logoutButton}
        contentStyle={styles.logoutContent}
        labelStyle={styles.logoutLabel}
        textColor={theme.colors.error}
        icon="logout"
      >
        Sign Out
      </Button>

      <Text style={styles.footerText}>
        SmallBizAgent v{APP_VERSION}
      </Text>

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
  card: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarSmall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarSmallText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onBackground,
  },
  profileEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  divider: {
    marginBottom: 4,
    backgroundColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onBackground,
    marginBottom: 4,
  },
  listItemTitle: {
    fontSize: 13,
    color: '#9ca3af',
  },
  listItemDesc: {
    fontSize: 15,
    color: theme.colors.onBackground,
    fontWeight: '500',
  },
  listDivider: {
    backgroundColor: '#f3f4f6',
  },
  logoutButton: {
    borderRadius: 12,
    borderColor: theme.colors.error,
    borderWidth: 1.5,
    marginTop: 8,
  },
  logoutContent: {
    paddingVertical: 6,
  },
  logoutLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    color: '#d1d5db',
    fontSize: 12,
    marginTop: 24,
  },
});
