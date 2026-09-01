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

test('PatternBreakoutService - Pre-computed Redis Cache Read Path', async (t) => {
  await t.test('computes report on cold cache and returns valid data without pending state', async () => {
    await cache.clear();

    const report = await PatternBreakoutService.getPatternBreakoutReport(false);
    assert.strictEqual(report.totalScanned, 2636);
    assert.strictEqual(report.qualifiedCount, 15);
  });

  await t.test('computes and caches report when forceRefresh is true', async () => {
    await cache.clear();

    const report = await PatternBreakoutService.getPatternBreakoutReport(true);
    assert.strictEqual(report.totalScanned, 2636);
    assert.strictEqual(report.qualifiedCount, 15);

    // Subsequent read without forceRefresh uses cached output
    const cachedReport = await PatternBreakoutService.getPatternBreakoutReport(false);
    assert.strictEqual(cachedReport.totalScanned, 2636);
    assert.strictEqual(cachedReport.qualifiedCount, 15);
  });
});
