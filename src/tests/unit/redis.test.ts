import { env } from '@/config/env';
import test from 'node:test';
import assert from 'node:assert';
import redisClient, { cache } from '../../lib/redis';

test('Redis Cache Client Tests', async (t) => {
  await t.test('Initial state or ready state check', async () => {
    if (!env.REDIS_URL) {
      assert.strictEqual(redisClient, null);
      await cache.set('test_key', 'test_value', 10);
      const val = await cache.get('test_key');
      assert.strictEqual(val, 'test_value');
      return;
    }

    assert.ok(redisClient !== null);

    if (redisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 3000);

        redisClient?.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        redisClient?.once('error', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    if (redisClient.status === 'ready') {
      const testKey = 'test_redis_conn_check';
      await cache.set(testKey, 'alive', 10);
      
      const rawVal = await redisClient.get(testKey);
      assert.strictEqual(rawVal, 'alive');
      
      await cache.del(testKey);
    } else {
      console.log(`[Test] Redis is unreachable (status: ${redisClient.status}), verifying fallback works`);
      await cache.set('fallback_check', 'ok', 10);
      const val = await cache.get('fallback_check');
      assert.strictEqual(val, 'ok');
    }
  });
});

test('cache.incr enforces a fixed window, not a sliding one', async (t) => {
  if (!env.REDIS_URL || !redisClient) {
    t.skip('No REDIS_URL configured; this regression only reproduces against a real Redis server');
    return;
  }

  if (redisClient.status !== 'ready') {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      redisClient?.once('ready', () => { clearTimeout(timeout); resolve(); });
      redisClient?.once('error', () => { clearTimeout(timeout); resolve(); });
    });
  }

  if (redisClient.status !== 'ready') {
    t.skip('Redis did not become ready in time');
    return;
  }

  const key = `test_fixed_window_${Date.now()}`;
  try {
    const first = await cache.incr(key, 5, false);
    assert.strictEqual(first, 1);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const second = await cache.incr(key, 5, false);
    assert.strictEqual(second, 2);

    // The TTL set on the first hit must NOT be reset by later increments —
    // a subsequent call resetting the TTL back toward 5 would silently turn
    // a fixed rate-limit window into one that never closes under sustained
    // traffic (see PR #201 regression: pipeline.expire() without NX/a guard
    // resets the TTL on every call).
    const ttl = await redisClient.ttl(key);
    assert.ok(ttl > 0 && ttl <= 4, `Expected TTL to have counted down from the first hit (~3s left), got ${ttl}s`);
  } finally {
    await redisClient.del(key);
  }
});

test.after(() => {
  redisClient?.disconnect();
});
