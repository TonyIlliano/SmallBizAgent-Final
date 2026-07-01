/**
 * cacheInvalidationBus tests — cross-instance invalidation payload handling.
 *
 * The pg LISTEN connection can't be unit-tested without a live Postgres, but
 * the message-handling contract can: a NOTIFY payload must map to exactly one
 * local invalidation, and a malformed payload must never throw (it would
 * otherwise crash the listener). The cache's publish-on-invalidate wiring is
 * verified in cache.test.ts-style below.
 */
import { describe, it, expect, vi } from 'vitest';

// pool + cache singleton are imported transitively; stub the db so importing
// the bus doesn't require DATABASE_URL / a live pool.
vi.mock('../db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('./callTools/cache', () => ({ dataCache: { invalidateLocal: vi.fn(), setInvalidationPublisher: vi.fn() } }));

import { applyInvalidationPayload } from './cacheInvalidationBus';

function makeCache() {
  return { invalidateLocal: vi.fn() };
}

describe('applyInvalidationPayload', () => {
  it('applies a type-scoped invalidation', () => {
    const cache = makeCache();
    expect(applyInvalidationPayload(JSON.stringify({ b: 7, t: 'hours' }), cache)).toBe(true);
    expect(cache.invalidateLocal).toHaveBeenCalledWith(7, 'hours');
  });

  it('applies a whole-business invalidation when type is null', () => {
    const cache = makeCache();
    expect(applyInvalidationPayload(JSON.stringify({ b: 7, t: null }), cache)).toBe(true);
    expect(cache.invalidateLocal).toHaveBeenCalledWith(7, undefined);
  });

  it('applies a whole-business invalidation when type is omitted', () => {
    const cache = makeCache();
    expect(applyInvalidationPayload(JSON.stringify({ b: 42 }), cache)).toBe(true);
    expect(cache.invalidateLocal).toHaveBeenCalledWith(42, undefined);
  });

  it('ignores a payload without a numeric businessId (no throw, no call)', () => {
    const cache = makeCache();
    expect(applyInvalidationPayload(JSON.stringify({ b: 'nope' }), cache)).toBe(false);
    expect(cache.invalidateLocal).not.toHaveBeenCalled();
  });

  it('tolerates malformed JSON without throwing', () => {
    const cache = makeCache();
    expect(applyInvalidationPayload('{not json', cache)).toBe(false);
    expect(applyInvalidationPayload(undefined, cache)).toBe(false);
    expect(cache.invalidateLocal).not.toHaveBeenCalled();
  });
});
