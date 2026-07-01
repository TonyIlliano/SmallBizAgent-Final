/**
 * BusinessDataCache tests — cross-instance invalidation wiring.
 *
 * Contracts:
 *  - invalidate() clears the local entry AND fans out via the injected
 *    publisher (so other instances drop their copies).
 *  - invalidateLocal() clears WITHOUT publishing (the path the bus uses when
 *    applying a NOTIFY from another instance — must not re-publish or
 *    instances would ping-pong).
 *  - a throwing publisher never breaks invalidation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage', () => ({ storage: {} }));

import { dataCache } from './cache';

beforeEach(() => {
  dataCache.clear();
  dataCache.setInvalidationPublisher(() => {});
});

describe('BusinessDataCache invalidation', () => {
  it('invalidate() clears the entry and publishes', () => {
    const publisher = vi.fn();
    dataCache.setInvalidationPublisher(publisher);
    dataCache.set('hours', 7, { open: '9' });
    expect(dataCache.get('hours', 7)).not.toBeNull();

    dataCache.invalidate(7, 'hours');

    expect(dataCache.get('hours', 7)).toBeNull();
    expect(publisher).toHaveBeenCalledWith(7, 'hours');
  });

  it('invalidateLocal() clears WITHOUT publishing', () => {
    const publisher = vi.fn();
    dataCache.setInvalidationPublisher(publisher);
    dataCache.set('services', 7, [{ id: 1 }]);

    dataCache.invalidateLocal(7, 'services');

    expect(dataCache.get('services', 7)).toBeNull();
    expect(publisher).not.toHaveBeenCalled();
  });

  it('whole-business invalidate clears every type for that business only', () => {
    dataCache.set('hours', 7, 'h');
    dataCache.set('services', 7, 's');
    dataCache.set('hours', 8, 'other');

    dataCache.invalidate(7);

    expect(dataCache.get('hours', 7)).toBeNull();
    expect(dataCache.get('services', 7)).toBeNull();
    expect(dataCache.get('hours', 8)).toBe('other'); // untouched
  });

  it('a throwing publisher never breaks local invalidation', () => {
    dataCache.setInvalidationPublisher(() => { throw new Error('bus down'); });
    dataCache.set('staff', 7, [{ id: 1 }]);

    expect(() => dataCache.invalidate(7, 'staff')).not.toThrow();
    expect(dataCache.get('staff', 7)).toBeNull();
  });
});
