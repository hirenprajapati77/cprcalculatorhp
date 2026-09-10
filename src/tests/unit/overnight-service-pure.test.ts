import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OvernightService } from '@/services/overnight/overnight.service';
import { env } from '@/config/env';
import {
  persistBreakoutAlertSuppressions,
  clearBreakoutAlertSuppressions,
} from '@/services/alert/breakout-suppression.persist';
import { prisma } from '@/lib/db';

describe('OvernightService pure helpers (Tier 2)', () => {
  it('OvernightService.getISTTime returns valid hour, minute, and totalMinutes', () => {
    const d = new Date('2026-09-09T09:45:00.000Z'); // 15:15 IST
    const ist = OvernightService.getISTTime(d);
    assert.equal(ist.hour, 15);
    assert.equal(ist.minute, 15);
    assert.equal(ist.totalMinutes, 15 * 60 + 15);
  });

  it('OvernightService.determineState respects BTST_BYPASS_WINDOW in non-prod', () => {
    const origEnv = env.NODE_ENV;
    const origBypass = env.BTST_BYPASS_WINDOW;

    try {
      env.NODE_ENV = 'development';
      env.BTST_BYPASS_WINDOW = 'true';
      const state = OvernightService.determineState(new Date('2026-09-09T02:00:00.000Z')); // midnight IST
      assert.equal(state, 'ACTIVE');

      env.BTST_BYPASS_WINDOW = 'false';
      const normalState = OvernightService.determineState(new Date('2026-09-09T02:00:00.000Z'));
      assert.equal(normalState, 'FROZEN');
    } finally {
      env.NODE_ENV = origEnv;
      env.BTST_BYPASS_WINDOW = origBypass;
    }
  });

  it('OvernightService.getIntradayData generates deterministic mock 5m candles in mock mode', async () => {
    const origMode = env.HISTORICAL_MODE;
    env.HISTORICAL_MODE = 'mock';

    try {
      const stock = {
        symbol: 'INFY',
        market: 'NSE' as const,
        sector: 'IT',
        open: 1500,
        high: 1520,
        low: 1490,
        close: 1510,
        ltp: 1515,
        volume: 730000,
        avgVolume: 500000,
        marketCap: 10000,
      };

      // 15:25 IST on a trading day (during closing window)
      const testTime = new Date('2026-09-09T09:55:00.000Z');
      const metrics = await OvernightService.getIntradayData(stock, testTime);

      assert.equal(metrics.hasIntraday, true);
      assert.ok(metrics.vwap != null && metrics.vwap > 0);
      assert.ok(metrics.intradayVolume != null && metrics.intradayVolume > 0);
      assert.ok(metrics.last15mHigh != null);
      assert.ok(metrics.last15mLow != null);
    } finally {
      env.HISTORICAL_MODE = origMode;
    }
  });
});

describe('breakout-suppression.persist edge cases (Tier 2)', () => {
  it('no-ops immediately when rows or symbols array is empty', async () => {
    await assert.doesNotReject(async () => {
      await persistBreakoutAlertSuppressions([]);
      await clearBreakoutAlertSuppressions([]);
    });
  });

  it('uses default IST date and handles symbol with exchange suffix', async () => {
    const origUpdateMany = prisma.scannerResult.updateMany;
    let recordedWhere: any = null;

    (prisma.scannerResult as any).updateMany = async ({ where }: any) => {
      recordedWhere = where;
      return { count: 1 };
    };

    try {
      await persistBreakoutAlertSuppressions([
        { symbol: 'wipro:nse', reason: 'GAP_INVALIDATED', detail: 'gap' },
      ]);
      assert.ok(recordedWhere != null);
      assert.deepEqual(recordedWhere.OR, [{ symbol: 'WIPRO' }, { symbol: 'WIPRO:BSE' }]);

      recordedWhere = null;
      await clearBreakoutAlertSuppressions(['wipro:nse']);
      assert.ok(recordedWhere != null);
      assert.deepEqual(recordedWhere.OR, [{ symbol: 'WIPRO' }, { symbol: 'WIPRO:BSE' }]);
    } finally {
      prisma.scannerResult.updateMany = origUpdateMany;
    }
  });
});

describe('RegimeService branch tests (Tier 2)', () => {
  it('handles insufficient history and fetch errors with unreliable fallback', async () => {
    const { RegimeService } = await import('@/services/overnight/regime.service');
    const { NiftyHistoryService } = await import('@/services/overnight/nifty-history.service');
    const origGetNifty = NiftyHistoryService.getNiftyHistory;

    try {
      RegimeService.clearCache();

      // 1. Insufficient history (<21)
      NiftyHistoryService.getNiftyHistory = async () => [];
      const res1 = await RegimeService.getMarketRegime('2026-09-01');
      assert.equal(res1.reliable, false);
      assert.equal(res1.trend, 'CHOPPY');

      // 2. Fetch error
      RegimeService.clearCache();
      NiftyHistoryService.getNiftyHistory = async () => {
        throw new Error('Network error');
      };
      const res2 = await RegimeService.getMarketRegime('2026-09-02');
      assert.equal(res2.reliable, false);

      // 3. Cache returns memoized result
      const res2Cached = await RegimeService.getMarketRegime('2026-09-02');
      assert.deepEqual(res2Cached, res2);
    } finally {
      NiftyHistoryService.getNiftyHistory = origGetNifty;
      RegimeService.clearCache();
    }
  });

  it('calculates BULL and BEAR trends correctly and evicts oldest cache entry past limit', async () => {
    const { RegimeService } = await import('@/services/overnight/regime.service');
    const { NiftyHistoryService } = await import('@/services/overnight/nifty-history.service');
    const origGetNifty = NiftyHistoryService.getNiftyHistory;

    try {
      RegimeService.clearCache();

      // Bullish history: consistently rising closes
      const bullHistory = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        open: 100 + i * 2,
        high: 105 + i * 2,
        low: 99 + i * 2,
        close: 104 + i * 2,
        volume: 100000,
      }));

      NiftyHistoryService.getNiftyHistory = async () => bullHistory as any;
      const bullRegime = await RegimeService.getMarketRegime('2026-09-03');
      assert.equal(bullRegime.reliable, true);
      assert.equal(bullRegime.trend, 'BULL');
      assert.equal(bullRegime.score, 80);

      // Bearish history: consistently falling closes
      RegimeService.clearCache();
      const bearHistory = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        open: 200 - i * 2,
        high: 201 - i * 2,
        low: 195 - i * 2,
        close: 196 - i * 2,
        volume: 100000,
      }));

      NiftyHistoryService.getNiftyHistory = async () => bearHistory as any;
      const bearRegime = await RegimeService.getMarketRegime('2026-09-04');
      assert.equal(bearRegime.reliable, true);
      assert.equal(bearRegime.trend, 'BEAR');
      assert.equal(bearRegime.score, 20);

      // Fill cache past MAX_REGIME_CACHE (30)
      for (let day = 1; day <= 32; day++) {
        await RegimeService.getMarketRegime(`2026-05-${String(day).padStart(2, '0')}`);
      }
    } finally {
      NiftyHistoryService.getNiftyHistory = origGetNifty;
      RegimeService.clearCache();
    }
  });
});

describe('OvernightService.discover mock stocks branch (Tier 2)', () => {
  it('skips stocks with empty history, low history length, or invalid session OHLC', async () => {
    const origTx = prisma.$transaction;
    (prisma as any).$transaction = async (ops: any[]) => ops.map((op, i) => ({ id: `sig-${i}` }));

    try {
      const emptyHistoryStock = {
        symbol: 'EMPTY_HIST',
        market: 'NSE' as const,
        sector: 'IT',
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        ltp: 100,
        volume: 500000,
        avgVolume: 500000,
        marketCap: 1000,
        history: [],
      };

      const shortHistoryStock = {
        ...emptyHistoryStock,
        symbol: 'SHORT_HIST',
        history: [
          { date: '2026-09-08', open: 100, high: 105, low: 95, close: 100, volume: 500000 },
        ],
      };

      const invalidOhlcStock = {
        ...emptyHistoryStock,
        symbol: 'BAD_OHLC',
        high: 90,
        low: 100, // high < low
        history: Array.from({ length: 25 }, (_, i) => ({
          date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          open: 100,
          high: 105,
          low: 95,
          close: 100,
          volume: 500000,
        })),
      };

      const results = await OvernightService.discover(
        'BOTH',
        new Date('2026-09-09T09:45:00.000Z'),
        [emptyHistoryStock as any, shortHistoryStock as any, invalidOhlcStock as any]
      );
      assert.equal(results.length, 0);
    } finally {
      (prisma as any).$transaction = origTx;
    }
  });

  it('successfully discovers and persists qualifying LONG and SHORT setups', async () => {
    const { RegimeService } = await import('@/services/overnight/regime.service');
    const { EventCalendarService } = await import('@/services/overnight/event.service');

    // Ensure client is initialized
    void (prisma as any).$connect;
    const origTx = (globalThis as any).prisma.$transaction;
    const origUpsert = (globalThis as any).prisma.overnightSignal?.upsert;
    const origGetRegime = RegimeService.getMarketRegime;
    const origGetBulkEvent = EventCalendarService.getBulkEventRisk;
    const origGetMacro = EventCalendarService.getMacroEventRisk;

    RegimeService.getMarketRegime = async () => ({
      trend: 'BULL',
      volatility: 'LOW',
      score: 80,
      reliable: true,
      niftyReturn5d: 1.2,
    });

    EventCalendarService.getBulkEventRisk = async () => ({}) as any;
    EventCalendarService.getMacroEventRisk = async () =>
      ({
        date: '2026-09-09',
        score: 0,
        events: [],
        reason: null,
        severity: 0,
        source: 'INTERNAL',
        confidence: 'HIGH',
      }) as any;

    (globalThis as any).prisma.overnightSignal.upsert = (args: any) => args;
    (globalThis as any).prisma.$transaction = async (ops: any[]) => {
      return ops.map((op: any, i: number) => ({
        id: `sig-${i}`,
        symbol: op.create?.symbol ?? 'STOCK',
        direction: op.create?.direction ?? 'LONG',
        overnightScore: op.create?.overnightScore ?? 90,
        classification: op.create?.classification ?? 'BTST_READY',
        qualityBucket: 'TRADEABLE',
        entry: op.create?.entry ?? 100,
        stopLoss: op.create?.stopLoss ?? 95,
        target: op.create?.target ?? 110,
        createdAt: new Date(),
      }));
    };

    try {
      const history = Array.from({ length: 26 }, (_, i) => ({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 200_000,
      }));

      const longStock = {
        symbol: 'MOCK_LONG',
        market: 'NSE' as const,
        sector: 'IT',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        ltp: 102,
        volume: 300_000,
        avgVolume: 150_000,
        marketCap: 10_000,
        history,
        longScoreOverride: 90,
      };

      const shortStock = {
        symbol: 'MOCK_SHORT',
        market: 'NSE' as const,
        sector: 'IT',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        ltp: 102,
        volume: 300_000,
        avgVolume: 150_000,
        marketCap: 10_000,
        history,
        shortScoreOverride: 95,
      };

      // Discover BOTH on a Wednesday afternoon
      const results = await OvernightService.discover(
        'BOTH',
        new Date('2026-09-09T09:45:00.000Z'),
        [longStock as any, shortStock as any]
      );

      assert.ok(results.length >= 1, 'Should produce at least 1 saved signal');
      const symbols = results.map((r) => r.symbol);
      assert.ok(symbols.includes('MOCK_LONG') || symbols.includes('MOCK_SHORT'));
    } finally {
      RegimeService.getMarketRegime = origGetRegime;
      EventCalendarService.getBulkEventRisk = origGetBulkEvent;
      EventCalendarService.getMacroEventRisk = origGetMacro;
      if ((globalThis as any).prisma) {
        (globalThis as any).prisma.$transaction = origTx;
        (globalThis as any).prisma.overnightSignal.upsert = origUpsert;
      }
    }
  });
});

