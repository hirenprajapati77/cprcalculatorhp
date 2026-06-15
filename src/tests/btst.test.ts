import test from 'node:test';
import assert from 'node:assert';
import { BtstRankingService } from '../services/btst/btst-ranking.service';
import { EntryManagerService } from '../services/btst/entry-manager.service';
import { OvernightRiskService } from '../services/btst/overnight-risk.service';
import { GapProbabilityService } from '../services/btst/gap-probability.service';
import { BtstService } from '../services/btst/btst.service';
import { MarketStockData } from '../services/market.service';

test('BTST Ranking Service Tests', async (t) => {
  await t.test('Score Safety: returns null if required inputs are missing', () => {
    // Missing VWAP
    const res1 = BtstRankingService.calculateScore({
      volume: 2000000,
      avgVolume: 1000000,
      tomorrowCprWidth: 0.002,
      tomorrowBc: 101,
      todayTc: 100,
      close: 105,
      high: 106,
      low: 104,
      vwap: null,
      intradayVolume: 500000,
      last15mHigh: 104,
      hasConfirmationCandles: true
    });
    assert.strictEqual(res1, null);

    // Missing Intraday Volume
    const res2 = BtstRankingService.calculateScore({
      volume: 2000000,
      avgVolume: 1000000,
      tomorrowCprWidth: 0.002,
      tomorrowBc: 101,
      todayTc: 100,
      close: 105,
      high: 106,
      low: 104,
      vwap: 104.5,
      intradayVolume: null,
      last15mHigh: 104,
      hasConfirmationCandles: true
    });
    assert.strictEqual(res2, null);
  });

  await t.test('Rule Calculations: computes score correctly', () => {
    // Bullish case satisfying all Rules 1-6:
    // Rule 1: Volume (2M) > 1.5 * avgVolume (1M) => +25
    // Rule 2: Tomorrow CPR Width (0.002 < 0.0035) => +30
    // Rule 3: Tomorrow BC (101) > Today TC (100) => +20
    // Rule 4: Close (105) > Today TC (100) && Close (105) > VWAP (104) => +20
    // Rule 5: Close (105) > Last 15m High (104) => +20
    // Rule 6: Closing strength (105-101)/(106-101) = 4/5 = 80% (>70%) => +15
    // Total expected score = 25 + 30 + 20 + 20 + 20 + 15 = 130
    const score = BtstRankingService.calculateScore({
      volume: 2000000,
      avgVolume: 1000000,
      tomorrowCprWidth: 0.002,
      tomorrowBc: 101,
      todayTc: 100,
      close: 105,
      high: 106,
      low: 101,
      vwap: 104,
      intradayVolume: 500000,
      last15mHigh: 104,
      hasConfirmationCandles: true
    });
    assert.strictEqual(score, 130);
  });

  await t.test('Classifications: maps scores correctly', () => {
    assert.strictEqual(BtstRankingService.getClassification(110), 'STRONG_BTST');
    assert.strictEqual(BtstRankingService.getClassification(90), 'BTST_READY');
    assert.strictEqual(BtstRankingService.getClassification(75), 'WATCH');
    assert.strictEqual(BtstRankingService.getClassification(50), 'IGNORE');
    assert.strictEqual(BtstRankingService.getClassification(null), 'IGNORE');
  });
});

test('Entry Manager Service Eligibility Tests', async (t) => {
  const mockStock: MarketStockData = {
    symbol: 'RELIANCE',
    market: 'NSE',
    sector: 'Energy',
    open: 2400,
    high: 2450,
    low: 2380,
    close: 2440,
    volume: 1500000,
    avgVolume: 1000000,
    marketCap: 1600000,
    ltp: 2440,
    history: []
  };

  const todayCpr = { tc: 2420, bc: 2400 };
  const tomorrowCprNarrow = { tc: 2430, bc: 2425, width: 0.2, classification: 'NARROW' };

  await t.test('Pass eligibility with valid parameters', () => {
    const result = EntryManagerService.evaluateEligibility(
      mockStock,
      tomorrowCprNarrow,
      todayCpr,
      2420, // VWAP
      500000, // Intraday volume
      true // Has intraday
    );
    assert.strictEqual(result.eligible, true);
  });

  await t.test('Rejects if price is extended (LTP > VWAP + 2%)', () => {
    const result = EntryManagerService.evaluateEligibility(
      mockStock,
      tomorrowCprNarrow,
      todayCpr,
      2300, // VWAP (LTP 2440 is > 2300 * 1.02 = 2346)
      500000,
      true
    );
    assert.strictEqual(result.eligible, false);
    assert.ok(result.reason?.includes('VWAP + 2%'));
  });

  await t.test('Rejects if close is inside tomorrow\'s CPR', () => {
    const stockInside = { ...mockStock, ltp: 2427, close: 2427 };
    const result = EntryManagerService.evaluateEligibility(
      stockInside,
      tomorrowCprNarrow,
      todayCpr,
      2420,
      500000,
      true
    );
    assert.strictEqual(result.eligible, false);
    assert.ok(result.reason?.includes('Close inside tomorrow\'s CPR'));
  });
});

test('Overnight Risk Service Tests', async (t) => {
  const stock: MarketStockData = {
    symbol: 'INFY',
    market: 'NSE',
    sector: 'IT',
    open: 1400,
    high: 1420,
    low: 1390,
    close: 1410,
    volume: 1200000,
    avgVolume: 1000000,
    marketCap: 600000,
    ltp: 1410,
    history: [
      { date: '2026-06-11', open: 1390, high: 1410, low: 1380, close: 1400, volume: 800000 },
      { date: '2026-06-12', open: 1400, high: 1420, low: 1390, close: 1410, volume: 1000000 }
    ]
  };

  await t.test('Calculates volatility metrics and risk level', () => {
    const risk = OvernightRiskService.calculateOvernightRisk(stock);
    assert.ok(risk.gapRisk >= 0);
    assert.ok(risk.atr > 0);
    assert.ok(risk.volatility >= 0);
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(risk.riskLevel));
  });
});

test('Gap Probability Service Tests', async (t) => {
  const stock: MarketStockData = {
    symbol: 'TCS',
    market: 'NSE',
    sector: 'IT',
    open: 3400,
    high: 3450,
    low: 3380,
    close: 3430,
    volume: 1200000,
    avgVolume: 1000000,
    marketCap: 1200000,
    ltp: 3430,
    history: [
      { date: '2026-06-11', open: 3350, high: 3400, low: 3340, close: 3390, volume: 800000 },
      { date: '2026-06-12', open: 3400, high: 3420, low: 3390, close: 3410, volume: 1000000 }
    ]
  };

  await t.test('Calculates expected gap and confidence', () => {
    const gapMetrics = GapProbabilityService.calculateGapProbability(stock);
    assert.ok(gapMetrics.expectedGap >= 0.2);
    assert.ok(gapMetrics.gapConfidence >= 40 && gapMetrics.gapConfidence <= 95);
  });
});

test('Btst Time Bounding State Logic Tests', async (t) => {
  await t.test('Checks active scanning windows correctly', () => {
    // 3:16 PM -> DISCOVERING
    const time1 = new Date();
    time1.setHours(15, 16, 0);
    assert.strictEqual(BtstService.determineState(time1), 'DISCOVERING');

    // 3:22 PM -> ACTIVE
    const time2 = new Date();
    time2.setHours(15, 22, 0);
    assert.strictEqual(BtstService.determineState(time2), 'ACTIVE');

    // 3:26 PM -> FROZEN
    const time3 = new Date();
    time3.setHours(15, 26, 0);
    assert.strictEqual(BtstService.determineState(time3), 'FROZEN');
  });
});
