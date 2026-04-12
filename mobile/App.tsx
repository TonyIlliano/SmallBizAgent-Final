import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/hooks/useAuth';
import { RootNavigator } from './src/navigation/RootNavigator';
import { OfflineStatusBar } from './src/components/OfflineStatusBar';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { initDatabase } from './src/db/offlineDb';
import { theme } from './src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Inner shell that runs hooks (useOfflineSync) which require
 * SafeAreaProvider and QueryClientProvider to already be mounted.
 */
function AppShell() {
  const syncState = useOfflineSync();

  return (
    <View style={styles.root}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      <OfflineStatusBar syncState={syncState} />
    </View>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  // Initialize SQLite on app launch (synchronous but wrapped in useEffect)
  useEffect(() => {
    try {
      initDatabase();
    } catch (err) {
      console.warn('[OfflineDB] Failed to initialize database:', err);
    }
    setDbReady(true);
  }, []);

  if (!dbReady) {
    return null; // Extremely brief — initDatabase is synchronous
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </QueryClientProvider>
      </PaperProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
