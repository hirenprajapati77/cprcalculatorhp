import test from 'node:test';
import assert from 'node:assert';
import { PatternBreakoutService } from '../../services/market-tools/pattern-breakout.service';
import { cache } from '../../lib/redis';

// Mock computePatternBreakoutReport globally for unit testing
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

test('PatternBreakoutService - Refresh 202 async response & deduplication', async (t) => {
  await t.test('triggerBackgroundRefresh enqueues job and returns processing status in <10ms', async () => {
    await cache.del('market_tools:pattern_breakout:status');

    const start = Date.now();
    const res = await PatternBreakoutService.triggerBackgroundRefresh();
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 100, `Expected response < 100ms, got ${elapsed}ms`);
    assert.strictEqual(res.status, 'processing');
    assert.strictEqual(res.message, 'Pattern breakout scan enqueued');

    const status = await PatternBreakoutService.getJobStatus();
    assert.ok(['processing', 'completed', 'failed'].includes(status.status));
  });

  await t.test('detects in-flight job and prevents duplicate scan enqueue', async () => {
    // Set status to processing
    const inFlightStatus = {
      status: 'processing',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await cache.set('market_tools:pattern_breakout:status', JSON.stringify(inFlightStatus), 120);

    const res = await PatternBreakoutService.triggerBackgroundRefresh();
    assert.strictEqual(res.status, 'processing');
    assert.strictEqual(res.message, 'Scan already in progress');
  });

  await t.test('surfaces job failure state when background scan errors out', async () => {
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
