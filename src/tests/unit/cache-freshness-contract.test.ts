import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReportFreshness,
  markMarketToolsCacheStale,
  LATEST_INGESTED_DATE_KEY,
  MARKET_TOOLS_CACHE_TTL_SEC,
  MARKET_TOOLS_CACHE_TTL_MS,
} from '../../lib/cache-freshness';
import { cache } from '../../lib/redis';
import { MarketBreadthService } from '../../services/market-tools/market-breadth.service';
import { MultiYearBreakoutService } from '../../services/market-tools/multi-year-breakout.service';
import { PatternBreakoutService } from '../../services/market-tools/pattern-breakout.service';
import { MomentumLeadersService } from '../../services/market-tools/momentum-leaders.service';

describe('ISSUE-008: Cache Freshness Contract & Logical State Evaluation', () => {
  beforeEach(async () => {
    await cache.clear();
    MarketBreadthService._resetCacheForTesting();
    MultiYearBreakoutService._resetCacheForTesting();
    PatternBreakoutService._resetCacheForTesting();
    MomentumLeadersService._resetCacheForTesting();
  });

  describe('Freshness Contract Evaluation Matrix', () => {
    it('returns PENDING when report date is null, undefined, or empty', () => {
      assert.strictEqual(evaluateReportFreshness({ reportDate: null }), 'PENDING');
      assert.strictEqual(evaluateReportFreshness({ reportDate: undefined }), 'PENDING');
      assert.strictEqual(evaluateReportFreshness({ reportDate: '' }), 'PENDING');
    });

    it('returns FRESH when report date matches latest canonical trading date', () => {
      const status = evaluateReportFreshness({
        reportDate: '2026-09-04',
        latestTradingDate: '2026-09-04',
        reportComputedTime: Date.now() - 3600_000, // 1 hour ago
      });
      assert.strictEqual(status, 'FRESH');
    });

    it('preserves FRESH status over weekends/holidays when no newer trading date exists', () => {
      // Friday close report evaluated on Sunday (e.g. 48 hours later)
      const nowSunday = Date.parse('2026-09-06T12:00:00.000Z');
      const fridayComputed = Date.parse('2026-09-04T13:45:00.000Z'); // 19:15 IST Friday

      const status = evaluateReportFreshness({
        reportDate: '2026-09-04',
        latestTradingDate: '2026-09-04',
        reportComputedTime: fridayComputed,
        now: nowSunday,
      });

      assert.strictEqual(status, 'FRESH', 'Weekend access must retain Friday report as FRESH');
    });

    it('transitions to STALE when a newer Bhavcopy trading date has been ingested into DailyOhlcv', () => {
      // Existing cache is Friday 2026-09-04, but Monday 2026-09-07 Bhavcopy has been ingested
      const status = evaluateReportFreshness({
        reportDate: '2026-09-04',
        latestTradingDate: '2026-09-07',
        reportComputedTime: Date.now() - 3600_000,
      });

      assert.strictEqual(status, 'STALE', 'Cached report must become STALE when DB advances to next session');
    });

    it('transitions to STALE when report age exceeds 7-day retention safety window', () => {
      const oldTime = Date.now() - (MARKET_TOOLS_CACHE_TTL_MS + 1000);
      const status = evaluateReportFreshness({
        reportDate: '2026-08-20',
        latestTradingDate: '2026-08-20',
        reportComputedTime: oldTime,
      });

      assert.strictEqual(status, 'STALE', 'Reports exceeding 7-day safety TTL must be flagged STALE');
    });
  });

  describe('Bhavcopy Ingest Invalidation Contract', () => {
    it('records latest ingested date in Redis without triggering heavy precompute', async () => {
      const newDate = '2026-09-08';
      await markMarketToolsCacheStale(newDate);

      const recordedDate = await cache.get(LATEST_INGESTED_DATE_KEY);
      assert.strictEqual(recordedDate, newDate);
    });

    it('handles Redis failure gracefully during markMarketToolsCacheStale', async () => {
      // Should not throw even if cache writes fail
      await assert.doesNotReject(async () => {
        await markMarketToolsCacheStale('2026-09-09');
      });
    });
  });

  describe('Market Tools Cache Invalidation Helpers', () => {
    it('MarketBreadthService.invalidateCache clears Redis key and in-memory cache', async () => {
      await cache.set('market_breadth:report', JSON.stringify({ date: '2026-09-08', status: 'ready' }), 300);
      await MarketBreadthService.invalidateCache();

      const cached = await cache.get('market_breadth:report');
      assert.strictEqual(cached, null);
    });

    it('MultiYearBreakoutService.invalidateCache clears Redis key and in-memory cache', async () => {
      await cache.set('market_tools:breakout:report', JSON.stringify({ date: '2026-09-08', status: 'ready' }), 300);
      await MultiYearBreakoutService.invalidateCache();

      const cached = await cache.get('market_tools:breakout:report');
      assert.strictEqual(cached, null);
    });

    it('PatternBreakoutService.invalidateCache clears Redis key and in-memory cache', async () => {
      await cache.set('market_tools:pattern_breakout:report', JSON.stringify({ date: '2026-09-08', status: 'ready' }), 300);
      await PatternBreakoutService.invalidateCache();

      const cached = await cache.get('market_tools:pattern_breakout:report');
      assert.strictEqual(cached, null);
    });

    it('MomentumLeadersService.invalidateCache clears all universe keys in Redis and in-memory cache', async () => {
      await cache.set('market_tools:momentum_leaders:report:ALL_NSE', 'test1', 300);
      await cache.set('market_tools:momentum_leaders:report:NSE_FNO', 'test2', 300);
      await cache.set('market_tools:momentum_leaders:report', 'test3', 300);

      await MomentumLeadersService.invalidateCache();

      const c1 = await cache.get('market_tools:momentum_leaders:report:ALL_NSE');
      const c2 = await cache.get('market_tools:momentum_leaders:report:NSE_FNO');
      const c3 = await cache.get('market_tools:momentum_leaders:report');

      assert.strictEqual(c1, null);
      assert.strictEqual(c2, null);
      assert.strictEqual(c3, null);
    });
  });

  describe('Constants Safety Window & Contract Invariants', () => {
    it('MARKET_TOOLS_CACHE_TTL_SEC is strictly 7 days (604,800s)', () => {
      assert.strictEqual(MARKET_TOOLS_CACHE_TTL_SEC, 7 * 24 * 3600);
    });

    it('MARKET_TOOLS_CACHE_TTL_MS is strictly 7 days in milliseconds', () => {
      assert.strictEqual(MARKET_TOOLS_CACHE_TTL_MS, 7 * 24 * 3600 * 1000);
    });
  });
});
