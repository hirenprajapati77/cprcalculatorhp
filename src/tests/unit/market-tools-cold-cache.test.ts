import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { env } from '@/config/env';
import { cache } from '@/lib/redis';
import { MultiYearBreakoutService, MultiYearBreakoutReport } from '@/services/market-tools/multi-year-breakout.service';
import { PatternBreakoutService } from '@/services/market-tools/pattern-breakout.service';
import { MarketBreadthService } from '@/services/market-tools/market-breadth.service';
import { MomentumLeadersService, MomentumLeadersReport } from '@/services/market-tools/momentum-leaders.service';
import { GET as breakoutGet } from '@/app/api/market-tools/breakout/route';
import { GET as patternBreakoutGet } from '@/app/api/market-tools/pattern-breakout/route';
import { GET as breadthGet } from '@/app/api/market-tools/breadth/route';
import { GET as momentumLeadersGet } from '@/app/api/market-tools/momentum-leaders/route';

function createRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'GET',
    headers: { host: 'localhost:3000', ...headers },
  });
}

describe('ISSUE-001: Anonymous Market Tools Cold-Cache Protection', () => {
  beforeEach(async () => {
    await cache.clear();
    MultiYearBreakoutService._resetCacheForTesting();
    PatternBreakoutService._resetCacheForTesting();
    MarketBreadthService._resetCacheForTesting();
    MomentumLeadersService._resetCacheForTesting();
  });

  describe('Service Layer Cold-Cache Returns Pending (No Live Compute)', () => {
    it('MultiYearBreakoutService returns status=pending and 0 scanned on cold cache', async () => {
      // If computeBreakoutReport is called on cold cache, it would attempt DB access or throw
      const report = await MultiYearBreakoutService.getBreakoutReport(false);
      assert.strictEqual(report.status, 'pending');
      assert.strictEqual(report.totalScanned, 0);
      assert.strictEqual(report.stocks.length, 0);
      assert.strictEqual(report.tradingDaysAvailable, 0);
    });

    it('PatternBreakoutService returns status=pending and 0 scanned on cold cache', async () => {
      const report = await PatternBreakoutService.getPatternBreakoutReport(false);
      assert.strictEqual(report.status, 'pending');
      assert.strictEqual(report.totalScanned, 0);
      assert.strictEqual(report.stocks.length, 0);
      assert.strictEqual(report.qualifiedCount, 0);
    });

    it('MarketBreadthService returns status=pending and 0 scanned on cold cache', async () => {
      const report = await MarketBreadthService.getMarketBreadth(false);
      assert.strictEqual(report.status, 'pending');
      assert.strictEqual(report.allNse.totalCount, 0);
      assert.strictEqual(report.tradingDaysAvailable, 0);
      assert.strictEqual(report.sectors.allNse.length, 0);
    });

    it('MomentumLeadersService returns status=pending and 0 scanned on cold cache', async () => {
      const reportFno = await MomentumLeadersService.getMomentumLeadersReport(false, 'NSE_FNO');
      assert.strictEqual(reportFno.status, 'pending');
      assert.strictEqual(reportFno.totalScanned, 0);
      assert.strictEqual(reportFno.allStocks.length, 0);
      assert.strictEqual(reportFno.universe, 'NSE_FNO');

      const reportAll = await MomentumLeadersService.getMomentumLeadersReport(false, 'ALL_NSE');
      assert.strictEqual(reportAll.status, 'pending');
      assert.strictEqual(reportAll.totalScanned, 0);
      assert.strictEqual(reportAll.allStocks.length, 0);
      assert.strictEqual(reportAll.universe, 'ALL_NSE');
    });
  });

  describe('Service Layer Cache Hit (Redis & In-Memory Fallback)', () => {
    it('returns cached report from Redis on warm cache', async () => {
      const mockReport: MultiYearBreakoutReport = {
        date: '2026-09-08',
        tradingDaysAvailable: 250,
        totalScanned: 2636,
        breakoutCounts: { '1Y': 10, '2Y': 0, '3Y': 0, '5Y': 0, '10Y': 0, ATH: 2 },
        windowAvailability: {
          '1Y': { available: true, requiredDays: 250, availableDays: 250, label: 'Available' },
          '2Y': { available: false, requiredDays: 500, availableDays: 250, label: 'Insufficient' },
          '3Y': { available: false, requiredDays: 750, availableDays: 250, label: 'Insufficient' },
          '5Y': { available: false, requiredDays: 1250, availableDays: 250, label: 'Insufficient' },
          '10Y': { available: false, requiredDays: 2500, availableDays: 250, label: 'Insufficient' },
          'ATH': { available: true, requiredDays: 20, availableDays: 250, label: 'Available' },
        },
        stocks: [],
        computedAt: new Date().toISOString(),
        status: 'ready',
      };

      await cache.set('market_tools:breakout:report', JSON.stringify(mockReport), 300);

      const report = await MultiYearBreakoutService.getBreakoutReport(false);
      assert.strictEqual(report.status, 'ready');
      assert.strictEqual(report.totalScanned, 2636);
      assert.strictEqual(report.breakoutCounts['1Y'], 10);
    });

    it('returns cached report from Redis for Momentum Leaders', async () => {
      const mockReport: MomentumLeadersReport = {
        date: '2026-09-08',
        universe: 'NSE_FNO',
        totalScanned: 180,
        qualifiedCount: 25,
        countsByTier: { 'A+': 5, A: 10, B: 10, C: 0 },
        countsByLeaderWindows: { '4_windows': 3, '3_windows': 5, '2_windows': 7, '1_window': 10, '0_windows': 0 },
        topLeaders: [],
        allStocks: [],
        computedAt: new Date().toISOString(),
        status: 'ready',
      };

      await cache.set('market_tools:momentum_leaders:report:NSE_FNO', JSON.stringify(mockReport), 300);

      const report = await MomentumLeadersService.getMomentumLeadersReport(false, 'NSE_FNO');
      assert.strictEqual(report.status, 'ready');
      assert.strictEqual(report.totalScanned, 180);
      assert.strictEqual(report.qualifiedCount, 25);
    });
  });

  describe('API Route Layer Anonymous Access on Cold Cache', () => {
    it('GET /api/market-tools/breakout returns 200 with status=pending data on cold cache', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/breakout');
      const res = await breakoutGet(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'pending');
      assert.strictEqual(json.data.totalScanned, 0);
      assert.strictEqual(json.data.stocks.length, 0);
    });

    it('GET /api/market-tools/pattern-breakout returns 200 with status=pending data on cold cache', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/pattern-breakout');
      const res = await patternBreakoutGet(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'pending');
      assert.strictEqual(json.data.totalScanned, 0);
      assert.strictEqual(json.data.stocks.length, 0);
    });

    it('GET /api/market-tools/breadth returns 200 with status=pending data on cold cache', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/breadth');
      const res = await breadthGet(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'pending');
      assert.strictEqual(json.data.allNse.totalCount, 0);
    });

    it('GET /api/market-tools/momentum-leaders returns 200 with status=pending data on cold cache', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?universe=NSE_FNO');
      const res = await momentumLeadersGet(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'pending');
      assert.strictEqual(json.data.totalScanned, 0);
      assert.strictEqual(json.data.allStocks.length, 0);
    });
  });

  describe('API Route Layer Unauthorized Refresh Rejected', () => {
    let originalToken: string | undefined;

    beforeEach(() => {
      originalToken = env.APP_ACCESS_TOKEN;
      (env as any).APP_ACCESS_TOKEN = 'test-auth-token-issue-001';
    });

    afterEach(() => {
      (env as any).APP_ACCESS_TOKEN = originalToken;
    });

    it('rejects unauthenticated ?refresh=true on all 4 endpoints with 401', async () => {
      const breakoutReq = createRequest('http://localhost:3000/api/market-tools/breakout?refresh=true');
      const breakoutRes = await breakoutGet(breakoutReq);
      assert.strictEqual(breakoutRes.status, 401);

      const patternReq = createRequest('http://localhost:3000/api/market-tools/pattern-breakout?refresh=true');
      const patternRes = await patternBreakoutGet(patternReq);
      assert.strictEqual(patternRes.status, 401);

      const breadthReq = createRequest('http://localhost:3000/api/market-tools/breadth?refresh=true');
      const breadthRes = await breadthGet(breadthReq);
      assert.strictEqual(breadthRes.status, 401);

      const momentumReq = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?refresh=true');
      const momentumRes = await momentumLeadersGet(momentumReq);
      assert.strictEqual(momentumRes.status, 401);
    });
  });

  describe('Concurrent In-Flight Compute Deduplication', () => {
    it('shares in-flight promise when compute is actively running', async () => {
      let resolveCompute: (value: MultiYearBreakoutReport) => void;
      const computePromise = new Promise<MultiYearBreakoutReport>((resolve) => {
        resolveCompute = resolve;
      });

      const origCompute = (MultiYearBreakoutService as any).computeBreakoutReport;
      (MultiYearBreakoutService as any).computeBreakoutReport = () => computePromise;

      try {
        // Trigger forceRefresh to start in-flight compute
        const refreshPromise = MultiYearBreakoutService.getBreakoutReport(true);

        // While in-flight compute is running, a cold-cache reader should join and await it
        const readerPromise = MultiYearBreakoutService.getBreakoutReport(false);

        const mockReport: MultiYearBreakoutReport = {
          date: '2026-09-08',
          tradingDaysAvailable: 250,
          totalScanned: 2636,
          breakoutCounts: { '1Y': 5, '2Y': 0, '3Y': 0, '5Y': 0, '10Y': 0, ATH: 1 },
          windowAvailability: {} as any,
          stocks: [],
          computedAt: new Date().toISOString(),
          status: 'ready',
        };

        resolveCompute!(mockReport);

        const [refreshResult, readerResult] = await Promise.all([refreshPromise, readerPromise]);
        assert.strictEqual(refreshResult.status, 'ready');
        assert.strictEqual(readerResult.status, 'ready');
        assert.strictEqual(readerResult.totalScanned, 2636);
      } finally {
        (MultiYearBreakoutService as any).computeBreakoutReport = origCompute;
      }
    });
  });
});
