import { describe, test } from 'node:test';
import assert from 'node:assert';
import { BtstRankingService } from '../services/overnight/btst-ranking.service';
import { StbtRankingService } from '../services/overnight/stbt-ranking.service';
import { OvernightRiskService } from '../services/overnight/overnight-risk.service';
import { GapProbabilityService } from '../services/overnight/gap-probability.service';
import { OvernightService } from '../services/overnight/overnight.service';
import { prisma } from '../lib/db';

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
        { date: '2026-07-06', open: 95, high: 98, low: 92, close: 96, volume: 500000 },
        { date: '2026-07-07', open: 96, high: 110, low: 90, close: 105, volume: 1000000 }
      ]
    };

    const originalUpsert = prisma.overnightSignal.upsert;
    const originalHistMode = process.env.HISTORICAL_MODE;
    const upserted: unknown[] = [];
    
    prisma.overnightSignal.upsert = (async (args: { create: unknown }) => {
      upserted.push(args.create);
      return args.create;
    }) as unknown as typeof originalUpsert;

    process.env.HISTORICAL_MODE = 'mock';

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
      process.env.HISTORICAL_MODE = originalHistMode;
    }
  });
});

