import test from 'node:test';
import assert from 'node:assert';
import redisClient, { cache } from '../lib/redis';

test('Redis Cache Client Tests', async (t) => {
  await t.test('Initial state or ready state check', async () => {
    if (!process.env.REDIS_URL) {
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
