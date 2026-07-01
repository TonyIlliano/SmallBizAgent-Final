/**
 * callTools/cache — shared in-memory TTL cache for the voice hot path.
 *
 * Extracted from callToolHandlers.ts (audit R1 split). The `dataCache`
 * singleton is part of the public surface: 5 route files call
 * `dataCache.invalidate(businessId, type)` after DB mutations so live calls
 * never quote stale hours/services/staff. Import it via the
 * callToolHandlers facade or directly from here.
 */

import { storage } from '../../storage';



/**
 * ===========================================
 * PERFORMANCE: In-Memory Cache with TTL
 * ===========================================
 * Caches frequently accessed data to reduce database queries
 * during phone calls. Data is cached per-business with a 5-minute TTL.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class BusinessDataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly SHORT_TTL = 2 * 60 * 1000;   // 2 minutes for appointments
  private readonly MAX_SIZE = 500; // Maximum cache entries to prevent unbounded growth

  private getCacheKey(type: string, businessId: number, extra?: string): string {
    return `${type}:${businessId}${extra ? `:${extra}` : ''}`;
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  get<T>(type: string, businessId: number, extra?: string): T | null {
    const key = this.getCacheKey(type, businessId, extra);
    const entry = this.cache.get(key);

    if (!entry || this.isExpired(entry)) {
      if (entry) this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(type: string, businessId: number, data: T, extra?: string, customTtl?: number): void {
    const key = this.getCacheKey(type, businessId, extra);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: customTtl || this.DEFAULT_TTL
    });

    // Evict oldest 10% of entries if cache exceeds MAX_SIZE
    if (this.cache.size > this.MAX_SIZE) {
      const entriesToEvict = Math.ceil(this.MAX_SIZE * 0.1);
      const iterator = this.cache.keys();
      for (let i = 0; i < entriesToEvict; i++) {
        const oldest = iterator.next();
        if (!oldest.done) {
          this.cache.delete(oldest.value);
        }
      }
      console.log(`[BusinessDataCache] Evicted ${entriesToEvict} oldest entries (size was ${this.cache.size + entriesToEvict})`);
    }
  }

  // Invalidate cache for a business (call after writes)
  // Keys are formatted as "type:businessId" or "type:businessId:extra"
  // Cross-instance invalidation publisher, injected by the cache-invalidation
  // bus at boot. On multi-instance deploys, invalidating here also NOTIFYs the
  // other instances so none keep serving stale hours/services to a live caller.
  private publisher: ((businessId: number, type?: string) => void) | null = null;

  setInvalidationPublisher(fn: (businessId: number, type?: string) => void): void {
    this.publisher = fn;
  }

  /** Local-only invalidation. Called directly by the bus on a NOTIFY from
   *  another instance (must NOT re-publish, or instances would ping-pong). */
  invalidateLocal(businessId: number, type?: string): void {
    if (type) {
      // Specific type: match "type:businessId" and "type:businessId:*"
      const prefix = `${type}:${businessId}`;
      for (const key of Array.from(this.cache.keys())) {
        if (key === prefix || key.startsWith(prefix + ':')) {
          this.cache.delete(key);
        }
      }
    } else {
      // All types: match any key containing ":businessId" as the businessId segment
      for (const key of Array.from(this.cache.keys())) {
        // Key format: "type:businessId" or "type:businessId:extra"
        const parts = key.split(':');
        if (parts.length >= 2 && parts[1] === String(businessId)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /** Public invalidation: clears this instance AND fans out to the others. */
  invalidate(businessId: number, type?: string): void {
    this.invalidateLocal(businessId, type);
    try {
      this.publisher?.(businessId, type);
    } catch (err) {
      console.error('[BusinessDataCache] invalidation publish failed:', err);
    }
  }

  // Remove all expired entries from cache
  cleanup(): void {
    let removed = 0;
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[BusinessDataCache] Cleanup removed ${removed} expired entries`);
    }
  }

  // Clear all cache (useful for testing)
  clear(): void {
    this.cache.clear();
  }

  // Get cache stats for debugging
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Singleton cache instance
const dataCache = new BusinessDataCache();

// Periodic cleanup of expired cache entries every 15 minutes
setInterval(() => {
  dataCache.cleanup();
}, 15 * 60 * 1000);

/**
 * Cached data fetchers - wrap storage calls with caching
 */
export async function getCachedBusinessHours(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('hours', businessId);
  if (cached) {
    return cached;
  }

  const hours = await storage.getBusinessHours(businessId);
  dataCache.set('hours', businessId, hours);
  return hours;
}

export async function getCachedServices(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('services', businessId);
  if (cached) {
    return cached;
  }

  const services = await storage.getServices(businessId);
  dataCache.set('services', businessId, services);
  return services;
}

export async function getCachedStaff(businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('staff', businessId);
  if (cached) {
    return cached;
  }

  const staff = await storage.getStaff(businessId);
  dataCache.set('staff', businessId, staff);
  return staff;
}

export async function getCachedStaffHours(staffId: number, businessId: number): Promise<any[]> {
  const cached = dataCache.get<any[]>('staffHours', businessId, `staff${staffId}`);
  if (cached) {
    return cached;
  }

  const hours = await storage.getStaffHours(staffId);
  dataCache.set('staffHours', businessId, hours, `staff${staffId}`);
  return hours;
}

export async function getCachedBusiness(businessId: number): Promise<any | undefined> {
  const cached = dataCache.get<any>('business', businessId);
  if (cached) {
    return cached;
  }

  const business = await storage.getBusiness(businessId);
  if (business) {
    dataCache.set('business', businessId, business);
  }
  return business;
}

/**
 * Batch-fetch staff-service mappings for all active staff in a business.
 * Returns a Map<staffId, serviceId[]>. Cached for 5 minutes.
 * Replaces the N+1 pattern of calling getStaffServices(s.id) in a loop.
 */
export async function getCachedStaffServiceMap(businessId: number): Promise<Map<number, number[]>> {
  const cached = dataCache.get<Map<number, number[]>>('staffServiceMap', businessId);
  if (cached) return cached;

  const staff = await getCachedStaff(businessId);
  const activeStaff = staff.filter((s: any) => s.active !== false);

  // Fetch all staff-service mappings in parallel (one query per staff, but all at once)
  const results = await Promise.all(
    activeStaff.map(async (s: any) => ({
      staffId: s.id,
      serviceIds: await storage.getStaffServices(s.id),
    }))
  );

  const map = new Map<number, number[]>();
  for (const { staffId, serviceIds } of results) {
    map.set(staffId, serviceIds);
  }

  dataCache.set('staffServiceMap', businessId, map);
  return map;
}

/**
 * Check if a staff member has time off on a specific date.
 * Returns true if they have an all-day time-off entry covering that date.
 */
export async function isStaffOffOnDate(staffId: number, date: Date): Promise<boolean> {
  const entries = await storage.getStaffTimeOffForDate(staffId, date);
  return entries.some(t => t.allDay !== false);
}

/**
 * Get all time-off entries for a staff member (for schedule display).
 * Returns upcoming entries only (from today forward).
 */
export async function getUpcomingTimeOff(staffId: number): Promise<any[]> {
  const allEntries = await storage.getStaffTimeOff(staffId);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return allEntries.filter(e => new Date(e.endDate) >= now);
}

/**
 * Group consecutive days into natural speech ranges.
 * ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] → "Monday through Friday"
 * ["Monday", "Tuesday", "Saturday"] → "Monday and Tuesday, Saturday"
 * ["Wednesday"] → "Wednesday"
 */
export function groupConsecutiveDays(days: string[]): string {
  if (days.length === 0) return '';
  if (days.length === 1) return days[0];

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const indices = days.map(d => dayOrder.indexOf(d)).filter(i => i !== -1).sort((a, b) => a - b);

  if (indices.length === 0) return days.join(', ');

  // Group consecutive indices
  const groups: number[][] = [];
  let current = [indices[0]];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === current[current.length - 1] + 1) {
      current.push(indices[i]);
    } else {
      groups.push(current);
      current = [indices[i]];
    }
  }
  groups.push(current);

  return groups.map(g => {
    if (g.length > 2) {
      return `${dayOrder[g[0]]} through ${dayOrder[g[g.length - 1]]}`;
    } else if (g.length === 2) {
      return `${dayOrder[g[0]]} and ${dayOrder[g[1]]}`;
    }
    return dayOrder[g[0]];
  }).join(', ');
}

/**
 * Get appointments with date range limit for performance
 * Only fetches appointments for the next 30 days by default
 */
export async function getAppointmentsOptimized(
  businessId: number,
  options?: {
    staffId?: number;
    daysAhead?: number;
    startDate?: Date;
  }
): Promise<any[]> {
  const daysAhead = options?.daysAhead || 30;
  const startDate = options?.startDate || new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysAhead);

  // Use shorter cache TTL for appointments since they change more frequently
  const cacheKey = options?.staffId ? `staff${options.staffId}` : 'all';
  const cached = dataCache.get<any[]>('appointments', businessId, cacheKey);

  if (cached) {
    // Filter cached data by date range (in case cache has wider range)
    return cached.filter(apt => {
      const aptDate = new Date(apt.startDate);
      return aptDate >= startDate && aptDate <= endDate;
    });
  }

  let appointments;
  if (options?.staffId) {
    appointments = await storage.getAppointments(businessId, {
      staffId: options.staffId,
      startDate,
      endDate
    });
  } else {
    appointments = await storage.getAppointments(businessId, {
      startDate,
      endDate
    });
  }

  // Cache with shorter TTL (2 minutes) since appointments change more often
  dataCache.set('appointments', businessId, appointments, cacheKey, 2 * 60 * 1000);
  return appointments;
}

// Export cache for invalidation from routes when data changes
export { dataCache };
