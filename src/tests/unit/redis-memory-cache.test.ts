import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cache, sweepExpiredMemoryCache } from '../../lib/redis';

describe('In-Memory Cache Fallback & Sweeper', () => {
  it('stores and retrieves cached values', async () => {
    await cache.set('test:key1', 'value1', 60);
    const val = await cache.get('test:key1');
    assert.equal(val, 'value1');
  });

  it('evicts expired keys on read', async () => {
    await cache.set('test:expired', 'stale', 1);
    const originalDateNow = Date.now;
    try {
      Date.now = () => originalDateNow() + 2000;
      const val = await cache.get('test:expired');
      assert.equal(val, null);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('actively sweeps expired keys from memory without waiting for read', async () => {
    await cache.set('test:sweep:1', 'a', 5);
    await cache.set('test:sweep:2', 'b', 5);
    await cache.set('test:sweep:3', 'c', 600);

    const futureTime = Date.now() + 10_000;
    const purged = sweepExpiredMemoryCache(futureTime);
    assert.ok(purged >= 2, `Must purge at least 2 expired keys, purged ${purged}`);

    const valid = await cache.get('test:sweep:3');
    assert.equal(valid, 'c');
  });

  it('delPattern deletes matching glob patterns with * and ?', async () => {
    await cache.set('market:item:1', 'v1', 60);
    await cache.set('market:item:2', 'v2', 60);
    await cache.set('market:other:3', 'v3', 60);

    await cache.delPattern('market:item:?');
    assert.equal(await cache.get('market:item:1'), null);
    assert.equal(await cache.get('market:item:2'), null);
    assert.equal(await cache.get('market:other:3'), 'v3');

    await cache.delPattern('market:*');
    assert.equal(await cache.get('market:other:3'), null);
  });
});
