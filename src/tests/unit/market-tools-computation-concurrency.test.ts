import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cache, _setRedisForTesting } from '@/lib/redis';
import {
  tryAcquireDistributedLock,
  releaseDistributedLock,
  withDistributedLock,
  _resetDistributedLocksForTesting,
  handleLockContentionWithStaleFallback,
} from '@/lib/distributed-lock';
import { MultiYearBreakoutService, MultiYearBreakoutReport } from '@/services/market-tools/multi-year-breakout.service';
import { PatternBreakoutService, PatternBreakoutReport } from '@/services/market-tools/pattern-breakout.service';
import { MarketBreadthService, MarketBreadthReport } from '@/services/market-tools/market-breadth.service';
import { MomentumLeadersService, MomentumLeadersReport } from '@/services/market-tools/momentum-leaders.service';

describe('ISSUE-002: Computation Resource & Concurrency Protection', () => {
  beforeEach(async () => {
    await cache.clear();
    _resetDistributedLocksForTesting();
    MultiYearBreakoutService._resetCacheForTesting();
    PatternBreakoutService._resetCacheForTesting();
    MarketBreadthService._resetCacheForTesting();
    MomentumLeadersService._resetCacheForTesting();
  });

  describe('Distributed Lock Primitives', () => {
    it('acquires lock atomically; second concurrent acquire fails', async () => {
      const lockKey = 'lock:test:atomic_acquire';
      const first = await tryAcquireDistributedLock(lockKey, 60);
      assert.strictEqual(first.acquired, true);
      assert.ok(first.token.length > 0);

      const second = await tryAcquireDistributedLock(lockKey, 60);
      assert.strictEqual(second.acquired, false);
      assert.strictEqual(second.token, '');

      // Release first lock
      const released = await releaseDistributedLock(lockKey, first.token);
      assert.strictEqual(released, true);

      // Now a new acquire can succeed
      const third = await tryAcquireDistributedLock(lockKey, 60);
      assert.strictEqual(third.acquired, true);
      await releaseDistributedLock(lockKey, third.token);
    });

    it('prevents lock release by wrong ownership token (anti-theft check)', async () => {
      const lockKey = 'lock:test:owner_token';
      const lock = await tryAcquireDistributedLock(lockKey, 60);
      assert.strictEqual(lock.acquired, true);

      // Attempt to release with a different token
      const wrongRelease = await releaseDistributedLock(lockKey, 'wrong-token-12345');
      assert.strictEqual(wrongRelease, false);

      // Lock should STILL be held
      const retryAcquire = await tryAcquireDistributedLock(lockKey, 60);
      assert.strictEqual(retryAcquire.acquired, false);

      // Release with correct token succeeds
      const validRelease = await releaseDistributedLock(lockKey, lock.token);
      assert.strictEqual(validRelease, true);
    });

    it('withDistributedLock executes task and releases lock in finally block', async () => {
      const lockKey = 'lock:test:with_lock_success';
      let taskExecuted = false;

      const result = await withDistributedLock(lockKey, 60, async () => {
        taskExecuted = true;
        return 'success_payload';
      });

      assert.strictEqual(result.acquired, true);
      assert.strictEqual((result as any).result, 'success_payload');
      assert.strictEqual(taskExecuted, true);

      // Lock must be released after completion
      const reacquire = await tryAcquireDistributedLock(lockKey, 60);
      assert.strictEqual(reacquire.acquired, true);
      await releaseDistributedLock(lockKey, reacquire.token);
    });

    it('withDistributedLock releases lock in finally block even when task throws', async () => {
      const lockKey = 'lock:test:with_lock_error';

      await assert.rejects(
        async () => {
          await withDistributedLock(lockKey, 60, async () => {
            throw new Error('Simulated computation failure');
          });
        },
        /Simulated computation failure/
      );

      // Lock must be freed despite error
      const reacquire = await tryAcquireDistributedLock(lockKey, 60);
      assert.strictEqual(reacquire.acquired, true);
      await releaseDistributedLock(lockKey, reacquire.token);
    });

    it('operates safely in process-local degraded mode when Redis client is disconnected', async () => {
      const lockKey = 'lock:test:process_local_fallback';
      _setRedisForTesting(null);

      try {
        const lock1 = await tryAcquireDistributedLock(lockKey, 60);
        assert.strictEqual(lock1.acquired, true);

        // In-memory fallback enforces single ownership
        const lock2 = await tryAcquireDistributedLock(lockKey, 60);
        assert.strictEqual(lock2.acquired, false);

        // Wrong token cannot release
        const wrongRelease = await releaseDistributedLock(lockKey, 'invalid-token');
        assert.strictEqual(wrongRelease, false);

        // Correct token releases
        const validRelease = await releaseDistributedLock(lockKey, lock1.token);
        assert.strictEqual(validRelease, true);

        // Can re-acquire after release
        const lock3 = await tryAcquireDistributedLock(lockKey, 60);
        assert.strictEqual(lock3.acquired, true);
        await releaseDistributedLock(lockKey, lock3.token);
      } finally {
        _setRedisForTesting(null);
      }
    });
  });

  describe('Stale-Cache Serving Contract under Lock Contention', () => {
    it('handleLockContentionWithStaleFallback serves warm Redis cache immediately', async () => {
      const mockReport = { id: 'cached_data', status: 'ready' };
      await cache.set('test:stale_cache_key', JSON.stringify(mockReport), 300);

      const start = Date.now();
      const report = await handleLockContentionWithStaleFallback<{ id: string; status: string }>({
        cacheKey: 'test:stale_cache_key',
        getCachedMemory: () => null,
        getPendingReport: () => ({ id: 'pending', status: 'pending' }),
        pollIntervalMs: 50,
        maxPollSeconds: 1,
      });

      const elapsed = Date.now() - start;
      assert.strictEqual(report.status, 'ready');
      assert.strictEqual(report.id, 'cached_data');
      assert.ok(elapsed < 200, `Expected immediate return without polling, took ${elapsed}ms`);
    });

    it('handleLockContentionWithStaleFallback returns pending after bounded poll on cold cache', async () => {
      const start = Date.now();
      const report = await handleLockContentionWithStaleFallback<{ status: string }>({
        cacheKey: 'test:non_existent_key',
        getCachedMemory: () => null,
        getPendingReport: () => ({ status: 'pending' }),
        pollIntervalMs: 20,
        maxPollSeconds: 0.1, // 100ms max poll for test speed
      });

      const elapsed = Date.now() - start;
      assert.strictEqual(report.status, 'pending');
      assert.ok(elapsed >= 80, `Expected bounded poll to execute, took ${elapsed}ms`);
    });

    it('handleLockContentionWithStaleFallback returns fresh report if populated during polling', async () => {
      // Simulate another worker writing the report after 50ms
      setTimeout(async () => {
        await cache.set('test:polling_write_key', JSON.stringify({ status: 'ready', freshlyWritten: true }), 300);
      }, 50);

      const report = await handleLockContentionWithStaleFallback<{ status: string; freshlyWritten?: boolean }>({
        cacheKey: 'test:polling_write_key',
        getCachedMemory: () => null,
        getPendingReport: () => ({ status: 'pending' }),
        pollIntervalMs: 25,
        maxPollSeconds: 1,
      });

      assert.strictEqual(report.status, 'ready');
      assert.strictEqual(report.freshlyWritten, true);
    });
  });

  describe('Multi-Worker Service Concurrency Protection', () => {
    it('MultiYearBreakoutService serves stale cache when lock is held by another worker', async () => {
      const existingReport: MultiYearBreakoutReport = {
        date: '2026-09-08',
        tradingDaysAvailable: 250,
        totalScanned: 2636,
        breakoutCounts: { '1Y': 3, '2Y': 0, '3Y': 0, '5Y': 0, '10Y': 0, ATH: 1 },
        windowAvailability: {} as any,
        stocks: [],
        computedAt: new Date().toISOString(),
        status: 'ready',
      };
      await cache.set('market_tools:breakout:report', JSON.stringify(existingReport), 300);

      // Simulate Worker A holding the distributed compute lock
      const workerALock = await tryAcquireDistributedLock('lock:market_tools:breakout', 180);
      assert.strictEqual(workerALock.acquired, true);

      let computeCalled = false;
      const origCompute = (MultiYearBreakoutService as any).computeBreakoutReport;
      (MultiYearBreakoutService as any).computeBreakoutReport = async () => {
        computeCalled = true;
        throw new Error('Duplicate computation should not have been called!');
      };

      try {
        // Worker B requests forceRefresh while Worker A holds the lock
        const report = await MultiYearBreakoutService.getBreakoutReport(true);
        assert.strictEqual(report.status, 'ready');
        assert.strictEqual(report.totalScanned, 2636);
        assert.strictEqual(computeCalled, false, 'computeBreakoutReport must NOT run when lock is held');
      } finally {
        (MultiYearBreakoutService as any).computeBreakoutReport = origCompute;
        await releaseDistributedLock('lock:market_tools:breakout', workerALock.token);
      }
    });

    it('PatternBreakoutService serves stale cache when lock is held by another worker', async () => {
      const existingReport: PatternBreakoutReport = {
        date: '2026-09-08',
        tradingDaysAvailable: 250,
        totalScanned: 2636,
        qualifiedCount: 12,
        countsByStatus: { BREAKOUT: 5, NEAR_HIGH: 7 },
        countsByPattern: { FLAG_POLE: 2, VCP: 4, CUP_AND_HANDLE: 3, DOUBLE_BOTTOM: 2, FLAT_BASE: 1, NONE: 0 },
        countsByTier: { 'A+': 3, A: 4, B: 5, C: 0 },
        stocks: [],
        computedAt: new Date().toISOString(),
        status: 'ready',
      };
      await cache.set('market_tools:pattern_breakout:report', JSON.stringify(existingReport), 300);

      // Simulate Worker A holding the lock
      const workerALock = await tryAcquireDistributedLock('lock:market_tools:pattern_breakout', 180);
      assert.strictEqual(workerALock.acquired, true);

      let computeCalled = false;
      const origCompute = (PatternBreakoutService as any).computePatternBreakoutReport;
      (PatternBreakoutService as any).computePatternBreakoutReport = async () => {
        computeCalled = true;
        throw new Error('Duplicate computePatternBreakoutReport should not have been called!');
      };

      try {
        // Worker B requests refresh while Worker A holds the lock
        const report = await PatternBreakoutService.getPatternBreakoutReport(true);
        assert.strictEqual(report.status, 'ready');
        assert.strictEqual(report.qualifiedCount, 12);
        assert.strictEqual(computeCalled, false);
      } finally {
        (PatternBreakoutService as any).computePatternBreakoutReport = origCompute;
        await releaseDistributedLock('lock:market_tools:pattern_breakout', workerALock.token);
      }
    });

    it('MarketBreadthService serves stale cache when lock is held by another worker', async () => {
      const existingReport: MarketBreadthReport = {
        date: '2026-09-08',
        tradingDaysAvailable: 250,
        overallScore: 68,
        marketRegime: 'BULLISH',
        allNse: { totalCount: 2636 } as any,
        nifty50: {} as any,
        nseFno: {} as any,
        sectors: { allNse: [], nifty50: [], nseFno: [] },
        computedAt: new Date().toISOString(),
        status: 'ready',
      };
      await cache.set('market_breadth:report', JSON.stringify(existingReport), 300);

      // Simulate Worker A holding the lock
      const workerALock = await tryAcquireDistributedLock('lock:market_tools:breadth', 180);
      assert.strictEqual(workerALock.acquired, true);

      let computeCalled = false;
      const origCompute = (MarketBreadthService as any).computeMarketBreadth;
      (MarketBreadthService as any).computeMarketBreadth = async () => {
        computeCalled = true;
        throw new Error('Duplicate computeMarketBreadth should not have been called!');
      };

      try {
        const report = await MarketBreadthService.getMarketBreadth(true);
        assert.strictEqual(report.status, 'ready');
        assert.strictEqual(report.overallScore, 68);
        assert.strictEqual(computeCalled, false);
      } finally {
        (MarketBreadthService as any).computeMarketBreadth = origCompute;
        await releaseDistributedLock('lock:market_tools:breadth', workerALock.token);
      }
    });

    it('MomentumLeadersService serves stale cache when lock is held by another worker', async () => {
      const existingReport: MomentumLeadersReport = {
        date: '2026-09-08',
        universe: 'NSE_FNO',
        totalScanned: 182,
        qualifiedCount: 30,
        countsByTier: { 'A+': 8, A: 12, B: 10, C: 0 },
        countsByLeaderWindows: { '4_windows': 5, '3_windows': 8, '2_windows': 9, '1_window': 8, '0_windows': 0 },
        topLeaders: [],
        allStocks: [],
        computedAt: new Date().toISOString(),
        status: 'ready',
      };
      await cache.set('market_tools:momentum_leaders:report:NSE_FNO', JSON.stringify(existingReport), 300);

      // Simulate Worker A holding the lock
      const workerALock = await tryAcquireDistributedLock('lock:market_tools:momentum_leaders', 180);
      assert.strictEqual(workerALock.acquired, true);

      let computeCalled = false;
      const origCompute = (MomentumLeadersService as any).computeAllMomentumLeadersReports;
      (MomentumLeadersService as any).computeAllMomentumLeadersReports = async () => {
        computeCalled = true;
        throw new Error('Duplicate computeAllMomentumLeadersReports should not have been called!');
      };

      try {
        const report = await MomentumLeadersService.getMomentumLeadersReport(true, 'NSE_FNO');
        assert.strictEqual(report.status, 'ready');
        assert.strictEqual(report.qualifiedCount, 30);
        assert.strictEqual(computeCalled, false);
      } finally {
        (MomentumLeadersService as any).computeAllMomentumLeadersReports = origCompute;
        await releaseDistributedLock('lock:market_tools:momentum_leaders', workerALock.token);
      }
    });
  });
});
