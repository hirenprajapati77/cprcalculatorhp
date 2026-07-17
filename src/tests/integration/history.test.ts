import test from 'node:test';
import assert from 'node:assert';
import { HistoryService } from '../../services/history.service';
import { cache } from '../../lib/redis';
import redisClient from '../../lib/redis';
import { prisma } from '../../lib/db';

test('HistoryService Cache Scoped Eviction Tests', async (t) => {
  await t.test('deleteEntry() evicts only scoped calculation history keys and preserves unrelated cache keys', async () => {
    // 1. Populate cache with historical, share, and unrelated keys
    const historyKey = 'history:limit:50';
    const shareKey = 'calc:share:test_share_token';
    const unrelatedKey = 'unrelated_data_key';

    await cache.set(historyKey, JSON.stringify([{ id: 'test_id', value: 1 }]), 60);
    await cache.set(shareKey, JSON.stringify({ id: 'test_id', shareToken: 'test_share_token' }), 60);
    await cache.set(unrelatedKey, 'should_persist_value', 60);

    // 2. Mock Prisma methods to simulate DB operations
    const originalFindUnique = prisma.calculation.findUnique;
    const originalDelete = prisma.calculation.delete;

    prisma.calculation.findUnique = (async (args: { where: { id: string } }) => {
      if (args.where.id === 'test_id') {
        return { id: 'test_id', shareToken: 'test_share_token' };
      }
      return null;
    }) as unknown as typeof originalFindUnique;

    prisma.calculation.delete = (async () => {
      return { id: 'test_id' };
    }) as unknown as typeof originalDelete;

    try {
      // 3. Execute deleteEntry
      const result = await HistoryService.deleteEntry('test_id');
      assert.strictEqual(result, true);

      // 4. Verify scoped cache eviction:
      // - historyKey and shareKey must be deleted
      // - unrelatedKey must STILL exist
      const cachedHistory = await cache.get(historyKey);
      const cachedShare = await cache.get(shareKey);
      const cachedUnrelated = await cache.get(unrelatedKey);

      assert.strictEqual(cachedHistory, null, 'History cache key should be evicted');
      assert.strictEqual(cachedShare, null, 'Share calculation cache key should be evicted');
      assert.strictEqual(cachedUnrelated, 'should_persist_value', 'Unrelated cache key should be preserved');

    } finally {
      // Restore mocks
      prisma.calculation.findUnique = originalFindUnique;
      prisma.calculation.delete = originalDelete;

      // Cleanup
      await cache.del(unrelatedKey);
    }
  });

  await t.test('getHistory() propagates DB failures instead of returning []', async () => {
    const originalFindMany = prisma.calculation.findMany;
    const originalGet = cache.get;
    cache.get = (async () => null) as typeof cache.get;
    prisma.calculation.findMany = (async () => {
      throw new Error('simulated db down');
    }) as unknown as typeof originalFindMany;

    try {
      await assert.rejects(
        () => HistoryService.getHistory(10),
        /simulated db down/
      );
    } finally {
      prisma.calculation.findMany = originalFindMany;
      cache.get = originalGet;
    }
  });

  await t.test('deleteEntry() propagates DB delete failures instead of returning false', async () => {
    const originalFindUnique = prisma.calculation.findUnique;
    const originalDelete = prisma.calculation.delete;

    prisma.calculation.findUnique = (async () => ({
      id: 'boom',
      shareToken: 'tok',
    })) as unknown as typeof originalFindUnique;
    prisma.calculation.delete = (async () => {
      throw new Error('simulated delete failure');
    }) as unknown as typeof originalDelete;

    try {
      await assert.rejects(
        () => HistoryService.deleteEntry('boom'),
        /simulated delete failure/
      );
    } finally {
      prisma.calculation.findUnique = originalFindUnique;
      prisma.calculation.delete = originalDelete;
    }
  });
});

test.after(() => {
  redisClient?.disconnect();
});
