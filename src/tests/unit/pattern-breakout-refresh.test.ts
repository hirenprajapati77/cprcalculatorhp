import test from 'node:test';
import assert from 'node:assert';
import { PatternBreakoutService } from '../../services/market-tools/pattern-breakout.service';
import { cache } from '../../lib/redis';

// Mock heavy functions globally for unit testing
PatternBreakoutService.computePatternBreakoutReport = async () => {
  return {
    date: '2026-08-26',
    tradingDaysAvailable: 250,
    totalScanned: 2636,
    qualifiedCount: 15,
    countsByStatus: { BREAKOUT: 10, NEAR_HIGH: 5 },
    countsByPattern: { VCP: 5, CUP_AND_HANDLE: 5, DOUBLE_BOTTOM: 2, FLAT_BASE: 3, NONE: 0 },
    countsByTier: { 'A+': 4, A: 6, B: 5, C: 0 },
    stocks: [],
    computedAt: new Date().toISOString(),
  };
};

test('PatternBreakoutService - Dedicated SETNX lock & status key isolation', async (t) => {
  // Prevent background job from mutating cache during sync test steps
  const origRunJob = PatternBreakoutService.runBackgroundRefreshJob;
  PatternBreakoutService.runBackgroundRefreshJob = async () => {
    return {} as unknown as Awaited<ReturnType<typeof origRunJob>>;
  };

  t.after(() => {
    PatternBreakoutService.runBackgroundRefreshJob = origRunJob;
  });

  await t.test('triggerBackgroundRefresh enqueues job and returns processing status in <200ms', async () => {
    await cache.clear();

    const start = Date.now();
    const res = await PatternBreakoutService.triggerBackgroundRefresh();
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 200, `Expected fast async response < 200ms, got ${elapsed}ms`);
    assert.strictEqual(res.status, 'processing');
    assert.strictEqual(res.message, 'Pattern breakout scan enqueued');
  });

  await t.test('detects active in-flight lock key and prevents duplicate scan enqueue', async () => {
    await cache.clear();
    await cache.set('market_tools:pattern_breakout:lock', 'locked', 120);

    const res = await PatternBreakoutService.triggerBackgroundRefresh();
    assert.strictEqual(res.status, 'processing');
    assert.strictEqual(res.message, 'Scan already in progress');

    await cache.clear();
  });

  await t.test('allows new scan trigger when previous status is completed but lock key is released', async () => {
    await cache.clear();
    const doneStatus = {
      status: 'completed',
      updatedAt: Date.now(),
    };
    await cache.set('market_tools:pattern_breakout:status', JSON.stringify(doneStatus), 300);

    const res = await PatternBreakoutService.triggerBackgroundRefresh();
    assert.strictEqual(res.status, 'processing');
    assert.strictEqual(res.message, 'Pattern breakout scan enqueued');
  });

  await t.test('surfaces job failure state when background scan errors out', async () => {
    await cache.clear();
    const failStatus = {
      status: 'failed',
      error: 'Simulated DB connection failure',
      updatedAt: Date.now(),
    };
    await cache.set('market_tools:pattern_breakout:status', JSON.stringify(failStatus), 300);

    const status = await PatternBreakoutService.getJobStatus();
    assert.strictEqual(status.status, 'failed');
    assert.strictEqual(status.error, 'Simulated DB connection failure');
  });
});
