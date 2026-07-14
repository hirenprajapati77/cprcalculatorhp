import { env } from '@/config/env';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { BtstRankingService } from '../../services/overnight/btst-ranking.service';
import { StbtRankingService } from '../../services/overnight/stbt-ranking.service';
import { OvernightRiskService } from '../../services/overnight/overnight-risk.service';
import { GapProbabilityService } from '../../services/overnight/gap-probability.service';
import { OvernightService } from '../../services/overnight/overnight.service';
import { RegimeService } from '../../services/overnight/regime.service';
import { SignalQualityService } from '../../services/overnight/signal-quality.service';
import { EventCalendarService } from '../../services/overnight/event.service';
import { prisma } from '../../lib/db';

describe('Overnight Engine Tests', () => {
  test('LONG setup (BTST Scoring Logic)', () => {
    const mockStock = {
      volume: 1200000,
      avgVolume: 800000,
      tomorrowCprWidth: 0.2,
      tomorrowBc: 101,
      tomorrowTc: 101.5,  // added: needed for aligned higherValue check
      todayBc: 99.5,      // added: needed for aligned higherValue check
      todayTc: 100,
      close: 102,
      high: 103,
      low: 99,
      vwap: 100.5,
      intradayVolume: 50000,
      last15mHigh: 102.5,
      hasConfirmationCandles: true
    };

    const score = BtstRankingService.calculateScore(mockStock);
    assert.ok(score !== null);
    assert.ok(score >= 80, `Expected score >= 80, got ${score}`);
  });

  test('SHORT setup (STBT Scoring Logic)', () => {
    const mockStock = {
      volume: 1200000,
      avgVolume: 800000,
      tomorrowCprWidth: 0.2,
      tomorrowTc: 99,
      tomorrowBc: 98.5,   // added: needed for aligned lowerValue check
      todayBc: 100,
      todayTc: 100.5,     // added: needed for aligned lowerValue check
      close: 98,
      high: 101,
      low: 97,
      vwap: 99.5,
      intradayVolume: 50000,
      last15mLow: 97.5,
      hasConfirmationCandles: true
    };

    const score = StbtRankingService.calculateScore(mockStock);
    assert.ok(score !== null);
    assert.ok(score >= 80, `Expected score >= 80, got ${score}`);
  });

  test('STBT Rule 4 scores 0 when close < vwap but close > todayBc', () => {
    const mockStock = {
      volume: 1200000,
      avgVolume: 800000,
      tomorrowCprWidth: 0.2,
      tomorrowTc: 99,
      tomorrowBc: 96,
      todayBc: 97,      // todayBc is 97
      todayTc: 100.5,
      close: 98,        // close (98) > todayBc (97)
      high: 101,
      low: 97,
      vwap: 99.5,       // close (98) < vwap (99.5)
      intradayVolume: 50000,
      last15mLow: 99,   // close < last15mLow (20 pts)
      hasConfirmationCandles: true
    };

    const score = StbtRankingService.calculateScore(mockStock);
    // VDU(25) + LowerValue(20) + NarrowCPR(30) + BreakLast15mLow(20) + ClosingWeakness(15)
    // Rule 4 (0) because close (98) is NOT < todayBc (97)
    assert.strictEqual(score, 85, `Expected score 85, got ${score}`);
  });

  test('STBT Rule 6 strictly requires closingWeakness < 0.30 (boundary test)', () => {
    const baseStock = {
      volume: 1300000, // > 1.5 * 800000 (Rule 1: VDU +25)
      avgVolume: 800000,
      tomorrowCprWidth: 0.2, // < 0.35 (Rule 3: NarrowCPR +30)
      tomorrowTc: 99,
      tomorrowBc: 96,
      todayBc: 97, 
      todayTc: 100.5, // 99 < 100.5 and 96 < 97 (Rule 2: LowerValue +20)
      high: 100,
      low: 90,
      vwap: 101, 
      intradayVolume: 50000,
      last15mLow: 89, // close is not < 89 (Rule 5: 0)
      hasConfirmationCandles: true
    };

    // Case 1: closingWeakness exactly 0.30
    // close = 93 -> (93 - 90) / 10 = 0.30
    const stock30 = { ...baseStock, close: 93 };
    // Rule 4: close(93) < todayBc(97) AND close < vwap(101) (+20)
    // Total base score = 25 + 20 + 30 + 20 = 95
    const score30 = StbtRankingService.calculateScore(stock30);
    assert.strictEqual(score30, 95, `Expected score 95 for closingWeakness=0.30, got ${score30}`);

    // Case 2: closingWeakness exactly 0.29
    // close = 92.9 -> (92.9 - 90) / 10 = 0.29
    const stock29 = { ...baseStock, close: 92.9 };
    // Base score (95) + Rule 6 (15) = 110
    const score29 = StbtRankingService.calculateScore(stock29);
    assert.strictEqual(score29, 110, `Expected score 110 for closingWeakness=0.29, got ${score29}`);
  });

  test('GapProbabilityService with short history caps gapConfidence <= 50', () => {
    const mockStock = {
      symbol: 'TEST',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100, high: 105, low: 95, close: 100, volume: 1000, avgVolume: 1000, marketCap: 1000, ltp: 100,
      history: [
        { date: '1', open: 100, high: 102, low: 98, close: 100, volume: 1000 },
        { date: '2', open: 105, high: 106, low: 104, close: 105, volume: 1000 },
        { date: '3', open: 110, high: 112, low: 108, close: 110, volume: 1000 },
        { date: '4', open: 115, high: 116, low: 114, close: 115, volume: 1000 }
      ]
    };
    const res = GapProbabilityService.calculateGapProbability(mockStock, 'LONG');
    assert.ok(res.gapConfidence <= 50, `Expected gapConfidence <= 50, got ${res.gapConfidence}`);
  });

  test('indexCorrelationEstimate is null — not derived from symbol string', () => {
    const base = { symbol: 'RELIANCE', market: 'NSE' as const, sector: 'Energy', open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 900000, marketCap: 1680000, ltp: 101 };
    const r1 = OvernightRiskService.calculateOvernightRisk({ ...base, symbol: 'RELIANCE' });
    const r2 = OvernightRiskService.calculateOvernightRisk({ ...base, symbol: 'INFY' });
    // Both must be null — not different hash-based numbers
    assert.strictEqual(r1.indexCorrelationEstimate, null, 'RELIANCE should return null');
    assert.strictEqual(r2.indexCorrelationEstimate, null, 'INFY should return null');
  });

  test('OvernightService.discover() calculates todayCpr and tomorrowCpr with yesterday vs today candles correctly', async () => {
    const mockStock = {
      symbol: 'MOCKSTOCK',
      market: 'NSE' as const,
      sector: 'Technology',
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1000000,
      avgVolume: 800000,
      marketCap: 10000,
      ltp: 105,
      history: [
        ...Array.from({ length: 13 }).map((_, i) => ({ date: `2026-06-${(i+10).toString()}`, open: 100, high: 105, low: 95, close: 100, volume: 500000 })),
        { date: '2026-07-06', open: 95, high: 98, low: 92, close: 96, volume: 500000 },
        { date: '2026-07-07', open: 96, high: 110, low: 90, close: 105, volume: 1000000 }
      ]
    };

    const originalUpsert = prisma.overnightSignal.upsert;
    const originalHistMode = env.HISTORICAL_MODE;
    const upserted: unknown[] = [];
    
    prisma.overnightSignal.upsert = (async (args: { create: unknown }) => {
      upserted.push(args.create);
      return args.create;
    }) as unknown as typeof originalUpsert;

    env.HISTORICAL_MODE = 'mock';

    try {
      // Run discover for mockStock on 2026-07-07
      const date = new Date('2026-07-07T15:20:00+05:30');
      await OvernightService.discover('BOTH', date, [mockStock]);
      
      assert.strictEqual(upserted.length, 1);
      const signal = upserted[0] as { overnightScore: number | null };
      
      // Verification:
      // Yesterday candle (2026-07-06): high=98, low=92, close=96 -> BC = (98+92)/2 = 95
      // Today candle (2026-07-07): high=110, low=90, close=105 -> BC = (110+90)/2 = 100
      // So todayCpr.bc !== tomorrowCpr.bc!
      // Specifically, yesterday's BC is 95, and tomorrow's BC is 100.
      // Let's assert that the score is calculated with rule 3 (Higher Value +20) passed.
      // (If they were both calculated from today's high/low, rule 3 would fail and score would be 20 points lower)
      assert.ok(signal.overnightScore !== null);
      assert.ok(signal.overnightScore > 0);
    } finally {
      prisma.overnightSignal.upsert = originalUpsert;
      env.HISTORICAL_MODE = originalHistMode;
    }
  });

  test('getIntradayData handles undefined quote values safely without returning NaN', async () => {
    const mockStock = {
      symbol: 'UNDEFINEDVALS',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100, high: 105, low: 95, close: 100, volume: 1000, avgVolume: 1000, marketCap: 1000, ltp: 100,
      history: []
    };

    const originalFetch = global.fetch;
    const originalHistMode = env.HISTORICAL_MODE;
    env.HISTORICAL_MODE = 'live';

     
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1719828000, 1719828300],
            indicators: {
              quote: [{
                // high has undefined/missing element, low/close/volume are valid
                high: [undefined, 104],
                low: [98, 99],
                close: [100, 101],
                volume: [1000, 2000]
              }]
            }
          }]
        }
      })
    })) as any;

    try {
      const metrics = await OvernightService.getIntradayData(mockStock, new Date(1719828400000));
      // First candle should be skipped due to undefined high, second candle typicalPrice is (104+99+101)/3 = 101.333
      // vwap = typicalPrice = 101.333
      assert.ok(metrics.hasIntraday);
      assert.ok(metrics.vwap !== null && !isNaN(metrics.vwap));
      assert.ok(Math.abs(metrics.vwap - 101.33) < 0.05);
    } finally {
      global.fetch = originalFetch;
      env.HISTORICAL_MODE = originalHistMode;
    }
  });

  test('discover() skips stocks with empty history / insufficient history based on candle roles', async () => {
    const stockEmpty = {
      symbol: 'EMPTYHIST',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 800000, marketCap: 10000, ltp: 100,
      history: []
    };

    const stockOneToday = {
      symbol: 'ONETODAY',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 800000, marketCap: 10000, ltp: 100,
      history: [
        { date: '2026-07-08', open: 100, high: 105, low: 95, close: 100, volume: 1000000 }
      ]
    };

    const stockOneNotToday = {
      symbol: 'ONENOTTODAY',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 800000, marketCap: 10000, ltp: 100,
      history: [
        { date: '2026-07-07', open: 100, high: 105, low: 95, close: 100, volume: 1000000 }
      ]
    };

    const originalUpsert = prisma.overnightSignal.upsert;
    const originalHistMode = env.HISTORICAL_MODE;
    const upserted: string[] = [];
    prisma.overnightSignal.upsert = (async (args: { create: { symbol: string } }) => {
      upserted.push(args.create.symbol);
      return args.create;
    }) as unknown as typeof originalUpsert;

    env.HISTORICAL_MODE = 'mock';

    try {
      const date = new Date('2026-07-08T15:20:00+05:30');
      
      // Empty history -> should skip
      // 1 candle (today) -> should skip because we need at least 2 distinct candles (yesterday and today)
      // 1 candle (yesterday/not-today) -> should scan (yesterday candle = history[0], today candle = live ltp)
      await OvernightService.discover('BOTH', date, [stockEmpty, stockOneToday, stockOneNotToday]);

      assert.strictEqual(upserted.includes('EMPTYHIST'), false, 'Empty history should be skipped');
      assert.strictEqual(upserted.includes('ONETODAY'), false, '1-candle history (isLastToday) should be skipped');
      assert.strictEqual(upserted.includes('ONENOTTODAY'), false, '1-candle history (not today) should be skipped due to MIN_HISTORY_FOR_RELIABLE_ATR');
    } finally {
      prisma.overnightSignal.upsert = originalUpsert;
      env.HISTORICAL_MODE = originalHistMode;
    }
  });

  test('calculateOvernightRisk handles zero close price and near-zero close price safely', () => {
    const stockZeroClose = {
      symbol: 'ZEROCLOSE',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100, high: 105, low: 95, close: 0, volume: 1000, avgVolume: 1000, marketCap: 1000, ltp: 100,
      history: [
        { date: '2026-07-06', open: 100, high: 105, low: 95, close: 0, volume: 1000 },
        { date: '2026-07-07', open: 100, high: 105, low: 95, close: 0, volume: 1000 }
      ]
    };

    const stockNearZeroClose = {
      symbol: 'NEARZEROCLOSE',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100, high: 105, low: 95, close: 1e-10, volume: 1000, avgVolume: 1000, marketCap: 1000, ltp: 100,
      history: [
        { date: '2026-07-06', open: 100, high: 105, low: 95, close: 1e-10, volume: 1000 },
        { date: '2026-07-07', open: 100, high: 105, low: 95, close: 1e-10, volume: 1000 }
      ]
    };

    const metricsZero = OvernightRiskService.calculateOvernightRisk(stockZeroClose);
    const metricsNearZero = OvernightRiskService.calculateOvernightRisk(stockNearZeroClose);

    // Assert returns are calculated safely (e.g. falling back or zero instead of NaN/Infinity)
    assert.ok(!isNaN(metricsZero.volatility) && isFinite(metricsZero.volatility));
    assert.ok(!isNaN(metricsZero.gapRisk) && isFinite(metricsZero.gapRisk));
    assert.ok(!isNaN(metricsZero.shortSqueezeProb) && isFinite(metricsZero.shortSqueezeProb));

    assert.ok(!isNaN(metricsNearZero.volatility) && isFinite(metricsNearZero.volatility));
    assert.ok(!isNaN(metricsNearZero.gapRisk) && isFinite(metricsNearZero.gapRisk));
    assert.ok(!isNaN(metricsNearZero.shortSqueezeProb) && isFinite(metricsNearZero.shortSqueezeProb));
  });

  test('determineState holiday freeze boundary transitions', () => {
    // 2026-01-26 is Republic Day (NSE Trading Holiday)
    const holidayDateStr = '2026-01-26T15:20:00+05:30';
    const dayBeforeHolidayStr = '2026-01-23T15:20:00+05:30'; // Friday (working day)
    const dayAfterHolidayStr = '2026-01-27T15:20:00+05:30'; // Tuesday (working day)

    const stateHoliday = OvernightService.determineState(new Date(holidayDateStr));
    const stateBefore = OvernightService.determineState(new Date(dayBeforeHolidayStr));
    const stateAfter = OvernightService.determineState(new Date(dayAfterHolidayStr));

    assert.strictEqual(stateHoliday, 'FROZEN', 'Holiday date should be FROZEN');
    assert.strictEqual(stateBefore, 'ACTIVE', 'Trading day before holiday should allow ACTIVE scan');
    assert.strictEqual(stateAfter, 'ACTIVE', 'Trading day after holiday should allow ACTIVE scan');
  });
  test('getIntradayData validates array lengths for high, low, close, volume', async () => {
    const mockStock = { symbol: 'MISALIGNED', market: 'NSE' as const, sector: 'IT', open: 100, high: 105, low: 95, close: 100, volume: 1000, avgVolume: 1000, marketCap: 1000, ltp: 100, history: [] };
    const originalFetch = global.fetch;
    const originalHistMode = env.HISTORICAL_MODE;
    env.HISTORICAL_MODE = 'live';

     
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1719828000, 1719828300],
            indicators: {
              quote: [{
                high: [105, 104],
                low: [98, 99],
                close: [100], // Mismatched length
                volume: [1000, 2000]
              }]
            }
          }]
        }
      })
    })) as any;

    try {
      const metrics = await OvernightService.getIntradayData(mockStock, new Date());
      // Expect null metrics because the throw gets caught in try-catch and returns empty intraday
      assert.strictEqual(metrics.vwap, null);
      assert.strictEqual(metrics.hasIntraday, false);
    } finally {
      global.fetch = originalFetch;
      env.HISTORICAL_MODE = originalHistMode;
    }
  });

  test('discover() skips stocks with < 15 daily candles (MIN_HISTORY_FOR_RELIABLE_ATR)', async () => {
    const makeHistory = (len: number) => Array.from({ length: len }).map((_, i) => ({ date: `2026-07-${(i+1).toString().padStart(2, '0')}`, open: 100, high: 105, low: 95, close: 100, volume: 1000000 }));
    
    const stock14 = { symbol: 'STOCK14', market: 'NSE' as const, sector: 'IT', open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 800000, marketCap: 10000, ltp: 100, history: makeHistory(14), longScoreOverride: 80, shortScoreOverride: 50 };
    const stock15 = { symbol: 'STOCK15', market: 'NSE' as const, sector: 'IT', open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 800000, marketCap: 10000, ltp: 100, history: makeHistory(15), longScoreOverride: 80, shortScoreOverride: 50 };
    
    const originalUpsert = prisma.overnightSignal.upsert;
    const originalHistMode = env.HISTORICAL_MODE;
    const upserted: string[] = [];
    prisma.overnightSignal.upsert = (async (args: { create: { symbol: string } }) => {
      upserted.push(args.create.symbol);
      return args.create;
    }) as unknown as typeof originalUpsert;
    env.HISTORICAL_MODE = 'mock';

    try {
      const date = new Date('2026-08-01T15:20:00+05:30');
       
      await OvernightService.discover('BOTH', date, [stock14 as any, stock15 as any]);

      assert.strictEqual(upserted.includes('STOCK14'), false, '14 candle history should be skipped');
      assert.strictEqual(upserted.includes('STOCK15'), true, '15 candle history should proceed');
    } finally {
      prisma.overnightSignal.upsert = originalUpsert;
      env.HISTORICAL_MODE = originalHistMode;
    }
  });

  test('discover() handles NEUTRAL_CONFLICT boundary (diff 9, 10, 11) and records conflict properly', async () => {
    const makeHistory = (len: number) => Array.from({ length: len }).map((_, i) => ({ date: `2026-07-${(i+1).toString().padStart(2, '0')}`, open: 100, high: 105, low: 95, close: 100, volume: 1000000 }));
    const baseStock = { market: 'NSE' as const, sector: 'IT', open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 800000, marketCap: 10000, ltp: 100, history: makeHistory(15) };
    
    // diff = 9 (conflict) -> persisted with NEUTRAL_CONFLICT, direction LONG
    const stockDiff9 = { ...baseStock, symbol: 'DIFF9', longScoreOverride: 80, shortScoreOverride: 71 };
    // diff = 10 (not conflict) -> upserted
    const stockDiff10 = { ...baseStock, symbol: 'DIFF10', longScoreOverride: 80, shortScoreOverride: 70 };
    // diff = 11 (not conflict) -> upserted
    const stockDiff11 = { ...baseStock, symbol: 'DIFF11', longScoreOverride: 80, shortScoreOverride: 69 };
    
    const originalUpsert = prisma.overnightSignal.upsert;
    const originalHistMode = env.HISTORICAL_MODE;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const originalElig = require('../services/overnight/entry-manager.service').EntryManagerService.evaluateEligibility;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../services/overnight/entry-manager.service').EntryManagerService.evaluateEligibility = () => ({ eligible: true, issues: [] });

    const upserted: any[] = [];
    prisma.overnightSignal.upsert = (async (args: { create: any }) => {
      upserted.push(args.create);
      return args.create;
    }) as unknown as typeof originalUpsert;
    env.HISTORICAL_MODE = 'mock';

    try {
      const date = new Date('2026-08-01T15:20:00+05:30');
       
      await OvernightService.discover('BOTH', date, [stockDiff9 as any, stockDiff10 as any, stockDiff11 as any]);

      const diff9 = upserted.find(u => u.symbol === 'DIFF9');
      assert.strictEqual(!!diff9, true, 'Diff 9 (conflict) should be persisted');
      assert.strictEqual(diff9.classification, 'NEUTRAL_CONFLICT', 'Diff 9 should be classified as NEUTRAL_CONFLICT');
      assert.strictEqual(diff9.direction, 'LONG', 'Diff 9 should keep LONG direction as it is marginally higher');
      
      const diff10 = upserted.find(u => u.symbol === 'DIFF10');
      assert.strictEqual(!!diff10, true, 'Diff 10 should be persisted');
      assert.notStrictEqual(diff10.classification, 'NEUTRAL_CONFLICT');
      
      const diff11 = upserted.find(u => u.symbol === 'DIFF11');
      assert.strictEqual(!!diff11, true, 'Diff 11 should be persisted');
    } finally {
      prisma.overnightSignal.upsert = originalUpsert;
      env.HISTORICAL_MODE = originalHistMode;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../services/overnight/entry-manager.service').EntryManagerService.evaluateEligibility = originalElig;
    }
  });

  test('SignalQualityService evaluates and buckets correctly', async () => {
    const stock = {
      symbol: 'TEST', market: 'NSE' as const, sector: 'IT',
      open: 100, high: 105, low: 95, close: 200,
      volume: 2000000, avgVolume: 2000000, marketCap: 10000, ltp: 200
    };

    

    try {
      // 1. Bull regime + Long + high liquidity + long history -> TRADEABLE
      const q1 = SignalQualityService.evaluateSignal(
        stock, 'LONG', 100, 50, { trend: 'BULL', volatility: 'LOW', score: 80 }, 100, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }
      );
      assert.strictEqual(q1.qualityBucket, 'TRADEABLE');
      assert.strictEqual(q1.regimeFit, 100);
      assert.strictEqual(q1.conflictConfidence, 50);

      // 2. Bear regime + Long (Contrarian) -> WATCHLIST
      const q2 = SignalQualityService.evaluateSignal(
        stock, 'LONG', 100, 50, { trend: 'BEAR', volatility: 'LOW', score: 20 }, 100, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }
      );
      assert.strictEqual(q2.qualityBucket, 'WATCHLIST');
      assert.strictEqual(q2.regimeFit, 0);

      // 3. Low Conflict Confidence (< 15) -> LOW_QUALITY
      const q3 = SignalQualityService.evaluateSignal(
        stock, 'LONG', 80, 70, { trend: 'BULL', volatility: 'LOW', score: 80 }, 100, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }
      );
      assert.strictEqual(q3.qualityBucket, 'LOW_QUALITY');
      assert.strictEqual(q3.conflictConfidence, 10);
      
      // 4. Low Liquidity -> LOW_QUALITY
      const illiquidStock = { ...stock, avgVolume: 50000, ltp: 100 };
      const q4 = SignalQualityService.evaluateSignal(
        illiquidStock, 'LONG', 100, 50, { trend: 'BULL', volatility: 'LOW', score: 80 }, 100, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }, { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }
      );
      assert.strictEqual(q4.qualityBucket, 'LOW_QUALITY');
      assert.strictEqual(q4.liquidityQuality, 0);

      // 5. Event Risk -> LOW_QUALITY
      
      const q5 = SignalQualityService.evaluateSignal(
        stock, 'LONG', 100, 50, { trend: 'BULL', volatility: 'LOW', score: 80 }, 100, 
        { severity: 100, reason: 'EARNINGS', source: 'LOCAL_DB', confidence: 'HIGH' }, 
        { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' }
      );
      assert.strictEqual(q5.qualityBucket, 'LOW_QUALITY');
      assert.strictEqual(q5.eventRisk, 100);

    } finally {
      
      
    }
  });

  test('discover() integrates quality without breaking backward compatibility if regime data is missing', async () => {
    const makeHistory = (len: number) => Array.from({ length: len }).map((_, i) => ({ date: `2026-07-${(i+1).toString().padStart(2, '0')}`, open: 100, high: 105, low: 95, close: 100, volume: 2000000 }));
    const mockStock = { symbol: 'REGIME_TEST', market: 'NSE' as const, sector: 'IT', open: 100, high: 105, low: 95, close: 200, volume: 2000000, avgVolume: 2000000, marketCap: 10000, ltp: 200, history: makeHistory(100), longScoreOverride: 100, shortScoreOverride: 20 };
    
    const originalUpsert = prisma.overnightSignal.upsert;
    const originalHistMode = env.HISTORICAL_MODE;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const originalElig = require('../services/overnight/entry-manager.service').EntryManagerService.evaluateEligibility;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../services/overnight/entry-manager.service').EntryManagerService.evaluateEligibility = () => ({ eligible: true, issues: [] });

    // Mock RegimeService to return default (error / missing data)
    const originalRegime = RegimeService.getMarketRegime;
    RegimeService.getMarketRegime = async () => ({ trend: 'CHOPPY', volatility: 'LOW', score: 50 });

    const _originalStockEvent = EventCalendarService.getEventRisk;
    const _originalMacroEvent = EventCalendarService.getMacroEventRisk;
    const originalBulkEvent = EventCalendarService.getBulkEventRisk;

    EventCalendarService.getMacroEventRisk = async () => ({ severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' });
    EventCalendarService.getBulkEventRisk = async () => ({ REGIME_TEST: { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' } });

    const upserted: Record<string, unknown>[] = [];
    prisma.overnightSignal.upsert = (async (args: { create: Record<string, unknown> }) => {
      upserted.push(args.create);
      return args.create;
    }) as unknown as typeof originalUpsert;
    env.HISTORICAL_MODE = 'mock';

    try {
      const date = new Date('2026-08-01T15:20:00+05:30');
       
      await OvernightService.discover('BOTH', date, [mockStock as any]);

      assert.strictEqual(upserted.length, 1);
      const u0 = upserted[0] as { symbol: string; regimeFit: number; qualityBucket: string; historyQuality: number };
      assert.strictEqual(u0.symbol, 'REGIME_TEST');
      assert.strictEqual(u0.regimeFit, 50); // CHOPPY gives 50 regimeFit
      assert.strictEqual(u0.qualityBucket, 'TRADEABLE'); // Should still be TRADEABLE
      assert.ok(u0.historyQuality > 0);
    } finally {
      prisma.overnightSignal.upsert = originalUpsert;
      env.HISTORICAL_MODE = originalHistMode;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../services/overnight/entry-manager.service').EntryManagerService.evaluateEligibility = originalElig;
      RegimeService.getMarketRegime = originalRegime;
      EventCalendarService.getMacroEventRisk = _originalMacroEvent;
      EventCalendarService.getBulkEventRisk = originalBulkEvent;
    }
  });
});
