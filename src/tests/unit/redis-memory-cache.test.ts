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

  it('setNX sets only if key does not exist or has expired', async () => {
    await cache.del('test:setnx:key');
    const first = await cache.setNX('test:setnx:key', 'v1', 60);
    assert.equal(first, true);

    const second = await cache.setNX('test:setnx:key', 'v2', 60);
    assert.equal(second, false);
    assert.equal(await cache.get('test:setnx:key'), 'v1');

    // With expired key
    const originalDateNow = Date.now;
    try {
      Date.now = () => originalDateNow() + 70_000;
      const third = await cache.setNX('test:setnx:key', 'v3', 60);
      assert.equal(third, true);
      assert.equal(await cache.get('test:setnx:key'), 'v3');
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('del removes specific key and clear empties the entire memory cache', async () => {
    await cache.set('test:del:1', 'val1', 60);
    await cache.set('test:del:2', 'val2', 60);

    await cache.del('test:del:1');
    assert.equal(await cache.get('test:del:1'), null);
    assert.equal(await cache.get('test:del:2'), 'val2');

    await cache.clear();
    assert.equal(await cache.get('test:del:2'), null);
  });

  it('incr increments counters with TTL in memory fallback mode', async () => {
    await cache.del('test:incr:counter');
    const c1 = await cache.incr('test:incr:counter', 60);
    assert.equal(c1, 1);

    const c2 = await cache.incr('test:incr:counter', 60);
    assert.equal(c2, 2);

    const c3 = await cache.incr('test:incr:counter', 60);
    assert.equal(c3, 3);
  });

  it('throws error on incr when failClosed is true and Redis is not ready', async () => {
    await assert.rejects(
      async () => {
        await cache.incr('test:failclosed', 60, true);
      },
      /Redis is unavailable/
    );
  });
});
