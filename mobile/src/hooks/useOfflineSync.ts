import { useEffect, useRef, useState, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import {
  getPendingMutations,
  getPendingMutationCount,
  removeMutation,
  cacheAppointments,
  cacheJobs,
  cacheCustomers,
} from '../db/offlineDb';
import { apiRequest } from '../api/client';

export interface OfflineSyncState {
  /** True when the device has no internet connectivity. */
  isOffline: boolean;
  /** Number of mutations waiting to be replayed. */
  pendingMutationCount: number;
  /** True while replay / refetch is in progress. */
  isSyncing: boolean;
  /** Manually trigger a sync (replay mutations + refetch caches). */
  syncNow: () => Promise<void>;
}

/**
 * Hook that monitors network connectivity, replays queued mutations
 * when the device comes back online, and refreshes local caches.
 *
 * Mount this once near the top of the component tree (e.g. inside App.tsx
 * or a provider that wraps the authenticated screens).
 */
export function useOfflineSync(): OfflineSyncState {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingMutationCount, setPendingMutationCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasOffline = useRef(false);

  // Refresh the pending count from SQLite (cheap — just a COUNT query).
  const refreshPendingCount = useCallback(() => {
    try {
      setPendingMutationCount(getPendingMutationCount());
    } catch {
      // SQLite not ready yet — ignore
    }
  }, []);

  // ------------------------------------------------------------------
  // Core sync: replay mutations then refetch caches
  // ------------------------------------------------------------------
  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      // 1. Replay queued mutations in order
      const mutations = getPendingMutations();
      for (const mutation of mutations) {
        try {
          await apiRequest(
            mutation.method as any,
            mutation.path,
            mutation.body ?? undefined,
          );
          // Success — remove from queue
          removeMutation(mutation.id);
        } catch (err: any) {
          // If the server explicitly rejects (4xx), drop the mutation
          // so we don't keep retrying a permanently invalid request.
          if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
            console.warn(
              `[OfflineSync] Dropping mutation ${mutation.method} ${mutation.path}: ${err.message}`
            );
            removeMutation(mutation.id);
          } else {
            // Transient error (5xx, network) — stop replaying, try again later
            console.warn(
              `[OfflineSync] Transient error replaying mutation, will retry: ${err.message}`
            );
            break;
          }
        }
      }

      // 2. Refetch & re-cache key datasets
      try {
        const [appointments, jobs, customers] = await Promise.all([
          apiRequest<any[]>('GET', '/api/appointments'),
          apiRequest<any[]>('GET', '/api/jobs'),
          apiRequest<any[]>('GET', '/api/customers'),
        ]);

        if (appointments && Array.isArray(appointments)) {
          cacheAppointments(appointments);
        }
        if (jobs && Array.isArray(jobs)) {
          cacheJobs(jobs);
        }
        if (customers && Array.isArray(customers)) {
          cacheCustomers(customers);
        }
      } catch (err: any) {
        console.warn(`[OfflineSync] Error refetching caches: ${err.message}`);
      }
    } finally {
      refreshPendingCount();
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  // ------------------------------------------------------------------
  // Network listener
  // ------------------------------------------------------------------
  useEffect(() => {
    // Get initial count
    refreshPendingCount();

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);

      if (wasOffline.current && !offline) {
        // Transitioned from offline -> online: auto-sync
        syncNow();
      }

      wasOffline.current = offline;
    });

    return () => {
      unsubscribe();
    };
  }, [syncNow, refreshPendingCount]);

  // Poll pending count while offline so the badge updates after new queued mutations
  useEffect(() => {
    if (!isOffline) return;
    const interval = setInterval(refreshPendingCount, 2000);
    return () => clearInterval(interval);
  }, [isOffline, refreshPendingCount]);

  return {
    isOffline,
    pendingMutationCount,
    isSyncing,
    syncNow,
  };
}
