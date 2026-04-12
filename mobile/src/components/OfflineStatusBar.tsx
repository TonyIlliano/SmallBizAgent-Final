import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OfflineSyncState } from '../hooks/useOfflineSync';

interface OfflineStatusBarProps {
  syncState: OfflineSyncState;
}

/**
 * Global status bar that shows connectivity and sync state.
 *
 * - Yellow bar when offline: "Offline -- X pending changes" + Sync Now button
 * - Green bar briefly when syncing: "Syncing..."
 * - Hidden when online and no sync in progress
 */
export function OfflineStatusBar({ syncState }: OfflineStatusBarProps) {
  const { isOffline, pendingMutationCount, isSyncing, syncNow } = syncState;
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const showBar = isOffline || isSyncing;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: showBar ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showBar, slideAnim]);

  // Don't render anything when fully hidden (avoids blocking touches)
  if (!showBar) {
    return null;
  }

  const backgroundColor = isSyncing ? '#22c55e' : '#f59e0b';
  const textColor = isSyncing ? '#ffffff' : '#78350f';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor,
          paddingTop: insets.top > 0 ? insets.top : 4,
          opacity: slideAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-60, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.content}>
        {isSyncing ? (
          <Text style={[styles.text, { color: textColor }]}>
            Syncing...
          </Text>
        ) : (
          <>
            <Text style={[styles.text, { color: textColor }]}>
              Offline
              {pendingMutationCount > 0
                ? ` \u2014 ${pendingMutationCount} pending change${pendingMutationCount !== 1 ? 's' : ''}`
                : ''}
            </Text>
            {pendingMutationCount > 0 && (
              <TouchableOpacity
                style={styles.syncButton}
                onPress={syncNow}
                activeOpacity={0.7}
              >
                <Text style={styles.syncButtonText}>Sync Now</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  syncButton: {
    backgroundColor: '#ffffff40',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350f',
  },
});
