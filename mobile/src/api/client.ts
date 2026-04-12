import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { API_BASE_URL } from '../config';
import {
  getCachedAppointments,
  getCachedJobs,
  getCachedCustomers,
  cacheAppointments,
  cacheJobs,
  cacheCustomers,
  queueMutation,
} from '../db/offlineDb';

const TOKEN_KEY = 'auth_token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Offline-aware path matching
// ---------------------------------------------------------------------------

/**
 * Map of GET paths to their SQLite cache reader functions.
 * Supports both exact matches and prefix matches for parameterized routes.
 */
function getOfflineCacheForPath(path: string): any[] | null {
  // /api/appointments or /api/appointments?date=YYYY-MM-DD
  if (path.startsWith('/api/appointments')) {
    const dateMatch = path.match(/[?&]date=(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : undefined;
    return getCachedAppointments(date);
  }

  // /api/jobs or /api/jobs?status=...
  if (path.startsWith('/api/jobs')) {
    const cached = getCachedJobs();
    // Apply status filter client-side if present
    const statusMatch = path.match(/[?&]status=([^&]+)/);
    if (statusMatch) {
      return cached.filter((j: any) => j.status === statusMatch[1]);
    }
    return cached;
  }

  // /api/customers or /api/customers?search=...
  if (path.startsWith('/api/customers')) {
    const cached = getCachedCustomers();
    // Apply search filter client-side if present
    const searchMatch = path.match(/[?&]search=([^&]+)/);
    if (searchMatch) {
      const q = decodeURIComponent(searchMatch[1]).toLowerCase();
      return cached.filter((c: any) => {
        const full = `${c.firstName || ''} ${c.lastName || ''} ${c.phone || ''} ${c.email || ''}`.toLowerCase();
        return full.includes(q);
      });
    }
    return cached;
  }

  return null;
}

/**
 * After a successful online GET, cache the response if it's a cacheable path.
 */
function maybeCacheResponse(path: string, data: any): void {
  try {
    if (!data || !Array.isArray(data)) return;

    if (path.startsWith('/api/appointments')) {
      cacheAppointments(data);
    } else if (path.startsWith('/api/jobs')) {
      cacheJobs(data);
    } else if (path.startsWith('/api/customers')) {
      cacheCustomers(data);
    }
  } catch (err) {
    // Caching is best-effort — never break the primary flow
    console.warn('[OfflineCache] Error caching response:', err);
  }
}

// ---------------------------------------------------------------------------
// Main API request function (offline-aware)
// ---------------------------------------------------------------------------

export async function apiRequest<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown> | FormData,
): Promise<T> {
  // Check connectivity
  const netState = await NetInfo.fetch();
  const isOnline = netState.isConnected && netState.isInternetReachable !== false;

  // ---- OFFLINE PATH ----
  if (!isOnline) {
    if (method === 'GET') {
      // Try to serve from cache
      const cached = getOfflineCacheForPath(path);
      if (cached !== null) {
        return cached as unknown as T;
      }
      // No cache available for this path
      throw new OfflineError('No internet connection and no cached data available');
    }

    // Mutation while offline — queue it for later replay
    // (FormData mutations like photo uploads can't be serialized — skip queue)
    if (body instanceof FormData) {
      throw new OfflineError('Cannot upload files while offline. Please try again when connected.');
    }

    queueMutation(method, path, body as Record<string, unknown> | null);

    // Return an optimistic response so the UI doesn't break
    return { _queued: true, _method: method, _path: path } as unknown as T;
  }

  // ---- ONLINE PATH ----
  const token = await getToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    await clearToken();
    throw new AuthError('Session expired');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(errorBody.error || errorBody.message || `HTTP ${response.status}`, response.status);
  }

  const data = await response.json();

  // Cache GET responses for offline use
  if (method === 'GET') {
    maybeCacheResponse(path, data);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineError';
  }
}
