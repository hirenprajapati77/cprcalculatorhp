import { describe, test } from 'node:test';
import assert from 'node:assert';
import { BtstRankingService } from '../services/overnight/btst-ranking.service';
import { StbtRankingService } from '../services/overnight/stbt-ranking.service';
import { OvernightRiskService } from '../services/overnight/overnight-risk.service';

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

  test('indexCorrelationEstimate is null — not derived from symbol string', () => {
    const base = { symbol: 'RELIANCE', market: 'NSE' as const, sector: 'Energy', open: 100, high: 105, low: 95, close: 100, volume: 1000000, avgVolume: 900000, marketCap: 1680000, ltp: 101 };
    const r1 = OvernightRiskService.calculateOvernightRisk({ ...base, symbol: 'RELIANCE' });
    const r2 = OvernightRiskService.calculateOvernightRisk({ ...base, symbol: 'INFY' });
    // Both must be null — not different hash-based numbers
    assert.strictEqual(r1.indexCorrelationEstimate, null, 'RELIANCE should return null');
    assert.strictEqual(r2.indexCorrelationEstimate, null, 'INFY should return null');
  });
});

