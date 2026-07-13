import { describe, test } from 'node:test';
import assert from 'node:assert';
import { BtstService } from '../services/backtest/btst.service';
import { MarketService, MarketStockData } from '../services/market.service';

describe('BTST Scoring Engine Tests', () => {
  const baseHistory = [
    { date: '2023-01-01', open: 100, high: 105, low: 95, close: 100, volume: 500000 },
    { date: '2023-01-02', open: 100, high: 105, low: 95, close: 100, volume: 500000 } // yesterday
  ];

  const baseStock = {
    symbol: 'MOCK',
    market: 'NSE' as const,
    sector: 'Test',
    open: 100,
    high: 105,
    low: 95,
    close: 100,
    volume: 1000000,
    avgVolume: 500000,
    marketCap: 10000,
    ltp: 102,
    history: baseHistory,
    vwap: 100,
    candle15m: { open: 101, high: 102.5, low: 100.5, close: 102.1, volume: 50000 }
  };

  test('Stock A: LONG setup (Score >= 80, Gap >= 20)', () => {
    // We want higherValue to be true -> tomorrowCpr > todayCpr
    // todayCpr (yesterday's data): H=105, L=95, C=100 -> P=100, BC=100, TC=100
    // tomorrowCpr (today's data): H=110, L=105, C=108 -> P=107.6, BC=107.5, TC=107.8
    const stockA = {
      ...baseStock,
      high: 110,
      low: 105,
      ltp: 108,
      volume: 1500000, // Volume Spike (+20)
      vwap: 105, // ltp 108 > vwap 105 * 1.002 (+20)
      candle15m: { open: 107, high: 108, low: 107, close: 107.9, volume: 50000 } // Closing Strength (+15)
      // Liquidity (+10)
      // Width = 0 -> NARROW (+15)
      // Total LONG = 20 + 20 + 20 + 15 + 15 + 10 = 100
      // SHORT = 10 (Liquidity) + 20 (Volume) + 15 (Narrow) = 45
    };
    
    const result = BtstService.evaluateOvernight(stockA);
    assert.strictEqual(result.tag, 'LONG');
    assert.ok(result.longScore >= 85);
    assert.ok(result.longScore - result.shortScore >= 20);
  });

  test('Stock B: SHORT setup (Score >= 80, Gap >= 20)', () => {
    // We want lowerValue to be true -> tomorrowCpr < todayCpr
    // tomorrowCpr (today's data): H=95, L=90, C=92 -> P=92.3, BC=92.5, TC=92.1 -> < 100
    const stockB = {
      ...baseStock,
      high: 95,
      low: 90,
      ltp: 92,
      volume: 1500000, // Volume Spike (+20)
      vwap: 95, // ltp 92 < vwap 95 * 0.998 (+20)
      candle15m: { open: 93, high: 93, low: 91, close: 91.1, volume: 50000 } // Closing Weakness (+15)
      // Liquidity (+10)
      // Width = NARROW (+15)
      // Total SHORT = 20 + 20 + 20 + 15 + 15 + 10 = 100
    };

    const result = BtstService.evaluateOvernight(stockB);
    assert.strictEqual(result.tag, 'SHORT');
    assert.ok(result.shortScore >= 85);
    assert.ok(result.shortScore - result.longScore >= 20);
  });

  test('Stock C: NEUTRAL_CONFLICT (Scores close to each other)', () => {
    // Both scores high but difference < 20
    const stockC = {
      ...baseStock,
      high: 105,
      low: 95,
      ltp: 100, // Same value as yesterday -> no higherValue, no lowerValue
      volume: 1500000, // (+20 L, +20 S)
      vwap: 100, // neutral vwap
      candle15m: { open: 100, high: 101, low: 99, close: 100, volume: 50000 }
      // Liquidity (+10 L, +10 S)
      // NARROW (+15 L, +15 S)
      // Total = 45 vs 45
    };

    const result = BtstService.evaluateOvernight(stockC);
    assert.strictEqual(result.tag, 'NEUTRAL_CONFLICT');
  });

  test('Stock D: WEAK (Max score < 10)', () => {
    // Tomorrow CPR identical to today -> no higher/lower value (+0)
    // volume = avgVolume = 100,000 -> volumeRatio = 1.0 -> no volume spike (+0)
    // ltp = vwap -> no price vs vwap (+0)
    // CPR width is normal -> no narrow CPR (+0)
    // 15m candle close is neutral -> no closing strength/weakness (+0)
    // avgVolume = 200,000 (< 500,000) -> no liquidity (+0)
    // Total score = 0
    const stockD = {
      ...baseStock,
      high: 120,
      low: 80,
      ltp: 120, // close = 120 makes Pivot = 106.66, BC = 100 -> Wide CPR
      volume: 200000,
      avgVolume: 200000, // < 500k -> no liquidity
      vwap: 120, // ltp == vwap -> no vwap bonus
      candle15m: { open: 110, high: 120, low: 100, close: 110, volume: 5000 } // neutral close
    };

    const result = BtstService.evaluateOvernight(stockD);
    assert.strictEqual(result.tag, 'WEAK');
    assert.ok(Math.max(result.longScore, result.shortScore) < 10);
  });

  test('Stock E: NEUTRAL_CONFLICT (Max score between 10 and 30)', () => {
    const stockE = {
      ...baseStock,
      high: 105,
      low: 95,
      ltp: 100, // Same value as yesterday
      volume: 10000, // No expansion (+0)
      avgVolume: 500000, // Liquid enough (+10 L, +10 S) -> score is 10
      vwap: 100, 
      candle15m: { open: 100, high: 101, low: 99, close: 100, volume: 5000 }
    };

    const result = BtstService.evaluateOvernight(stockE);
    assert.strictEqual(result.tag, 'NEUTRAL_CONFLICT');
    assert.ok(Math.max(result.longScore, result.shortScore) >= 10);
    assert.ok(Math.max(result.longScore, result.shortScore) < 30);
  });

  // ─── Task H: asOfDate override tests ───────────────────────────────────────
  // The fixture history has dates 2023-01-01 and 2023-01-02.
  // When asOfDate = '2023-01-02', the last candle IS today → isLastToday = true
  //   → todayCandle = history[-1], yesterdayCandle = history[-2].
  // When asOfDate = '2023-01-03' (one day ahead), the last candle is NOT today
  //   → isLastToday = false → todayCandle comes from stock fields (ltp/high/low)
  //   → different CPR calculation → different scores.
  // No asOfDate at all must produce the same result as calling with today's real date.

  test('asOfDate override changes candle selection vs. different date', () => {
    const stock = {
      ...baseStock,
      high: 110,
      low: 105,
      ltp: 108,
      volume: 1500000,
      vwap: 105,
      candle15m: { open: 107, high: 108, low: 107, close: 107.9, volume: 50000 },
    };

    // With asOfDate matching the last history candle: isLastToday = true
    const resultAsLastDay = BtstService.evaluateOvernight(stock, '2023-01-02');
    // With asOfDate one day later: isLastToday = false → different todayCandle
    const resultAsNextDay = BtstService.evaluateOvernight(stock, '2023-01-03');

    // Scores or tag must differ because todayCandle differs between the two calls
    const sameResult =
      resultAsLastDay.longScore === resultAsNextDay.longScore &&
      resultAsLastDay.shortScore === resultAsNextDay.shortScore;
    assert.strictEqual(sameResult, false, 'Expected different results for different asOfDate values');
  });

  test('asOfDate override is deterministic: same date always produces same output', () => {
    const stock = {
      ...baseStock,
      high: 110,
      low: 105,
      ltp: 108,
      volume: 1500000,
      vwap: 105,
      candle15m: { open: 107, high: 108, low: 107, close: 107.9, volume: 50000 },
    };

    const r1 = BtstService.evaluateOvernight(stock, '2023-01-02');
    const r2 = BtstService.evaluateOvernight(stock, '2023-01-02');
    assert.strictEqual(r1.tag, r2.tag);
    assert.strictEqual(r1.longScore, r2.longScore);
    assert.strictEqual(r1.shortScore, r2.shortScore);
  });

  test('no asOfDate produces same result as calling with real today date', () => {
    // In backtest mode this fixture's dates are always in the past so
    // isLastToday will be false either way; both paths use the live stock fields.
    const stock = {
      ...baseStock,
      high: 110,
      low: 105,
      ltp: 108,
      volume: 1500000,
      vwap: 105,
      candle15m: { open: 107, high: 108, low: 107, close: 107.9, volume: 50000 },
    };
    const todayStr = new Date().toISOString().split('T')[0];
    const withOverride = BtstService.evaluateOvernight(stock, todayStr);
    const withoutOverride = BtstService.evaluateOvernight(stock);
    assert.strictEqual(withOverride.tag, withoutOverride.tag);
    assert.strictEqual(withOverride.longScore, withoutOverride.longScore);
    assert.strictEqual(withOverride.shortScore, withoutOverride.shortScore);
  });

  test('discover() filters out illiquid stocks via the hard liquidity gate', async () => {
    const originalGetUniverse = MarketService.getUniverse;
    const originalGetStockData = MarketService.getStockData;

    try {
      // Mock universe with 3 test stocks:
      // 1. LIQUID: avgVolume=500000, volume=600000 (ratio = 1.2) -> should pass
      // 2. ILLIQUID (avgVolume < 100k): avgVolume=50000, volume=100000 -> should be skipped
      // 3. ILLIQUID (volumeRatio < 1.2): avgVolume=200000, volume=210000 (ratio = 1.05) -> should be skipped
      MarketService.getUniverse = (_universe: string) => {
        return [
          { symbol: 'LIQUID', name: 'Liquid Stock', sector: 'Test', marketCap: 1000, isNifty50: false, isNifty200: false, isFnO: false },
          { symbol: 'ILLIQUID_AV', name: 'Low Avg Volume', sector: 'Test', marketCap: 1000, isNifty50: false, isNifty200: false, isFnO: false },
          { symbol: 'ILLIQUID_VR', name: 'Low Volume Ratio', sector: 'Test', marketCap: 1000, isNifty50: false, isNifty200: false, isFnO: false }
        ] as unknown as ReturnType<typeof MarketService.getUniverse>;
      };

      MarketService.getStockData = async (symbol: string) => {
        if (symbol === 'LIQUID') {
          return {
            ...baseStock,
            symbol: 'LIQUID',
            avgVolume: 500000,
            volume: 600000, // Ratio = 1.2
            high: 110, low: 105, ltp: 108 // Valid LONG setup
          } as unknown as MarketStockData;
        }
        if (symbol === 'ILLIQUID_AV') {
          return {
            ...baseStock,
            symbol: 'ILLIQUID_AV',
            avgVolume: 50000, // < 100k
            volume: 100000,
            high: 110, low: 105, ltp: 108
          } as unknown as MarketStockData;
        }
        if (symbol === 'ILLIQUID_VR') {
          return {
            ...baseStock,
            symbol: 'ILLIQUID_VR',
            avgVolume: 200000,
            volume: 210000, // Ratio = 1.05 < 1.2
            high: 110, low: 105, ltp: 108
          } as unknown as MarketStockData;
        }
        return null;
      };

      const result = await BtstService.discover('TEST_UNIVERSE');
      
      // Verification: Only 'LIQUID' should be in the results
      assert.strictEqual(result.results.length, 1);
      assert.strictEqual(result.results[0].symbol, 'LIQUID');

      // Rejected stocks should not count toward insights
      assert.strictEqual(result.insights.totalLong, 1);
      assert.strictEqual(result.insights.avoid, 0); // No illiquid stocks counted as avoid/conflict/etc
    } finally {
      MarketService.getUniverse = originalGetUniverse;
      MarketService.getStockData = originalGetStockData;
    }
  });

  test('isExecutionWindowOpen() enforces 15:10 - 15:25 IST window', () => {
    // Generate dates on a Wednesday to avoid weekend logic overriding times
    const createDate = (h: number, m: number) => {
      // 2026-07-08 is a Wednesday
      const d = new Date('2026-07-08T00:00:00Z');
      d.setUTCHours(h - 5);
      d.setUTCMinutes(m - 30);
      return d;
    };

    assert.strictEqual(BtstService.isExecutionWindowOpen(false, createDate(15, 9)), false, '15:09 should be closed');
    assert.strictEqual(BtstService.isExecutionWindowOpen(false, createDate(15, 10)), true, '15:10 should be open');
    assert.strictEqual(BtstService.isExecutionWindowOpen(false, createDate(15, 25)), true, '15:25 should be open');
    assert.strictEqual(BtstService.isExecutionWindowOpen(false, createDate(15, 26)), false, '15:26 should be closed');
    assert.strictEqual(BtstService.isExecutionWindowOpen(false, createDate(16, 0)), false, '16:00 should be closed');
    assert.strictEqual(BtstService.isExecutionWindowOpen(false, createDate(23, 0)), false, '23:00 should be closed');
    
    // Weekend test: 2026-07-11 is a Saturday
    const weekendDate = new Date('2026-07-11T00:00:00Z');
    weekendDate.setUTCHours(15 - 5);
    weekendDate.setUTCMinutes(15 - 30);
    assert.strictEqual(BtstService.isExecutionWindowOpen(false, weekendDate), false, 'Weekends should be closed');

    // Bypass check
    assert.strictEqual(BtstService.isExecutionWindowOpen(true, createDate(15, 9)), true, 'bypassQuery=true should be open');
  });

  test('isExecutionWindowOpen() returns false on an NSE holiday even on a weekday, in-window', () => {
    // 2026-03-03 is Holi — a Tuesday, and a confirmed entry in NSE_HOLIDAYS_BY_YEAR['2026'].
    // Old bug: this returned true, because the function only checked Sat/Sun.
    const holidayInWindow = new Date('2026-03-03T15:15:00+05:30');
    assert.strictEqual(
      BtstService.isExecutionWindowOpen(false, holidayInWindow),
      false,
      'NSE holiday during 15:10-15:25 IST should report window closed'
    );
  });

  test('isExecutionWindowOpen() still returns true on an ordinary weekday in-window', () => {
    // 2026-03-04 (day after the Holi holiday above) is a normal Wednesday trading day.
    const ordinaryDayInWindow = new Date('2026-03-04T15:15:00+05:30');
    assert.strictEqual(
      BtstService.isExecutionWindowOpen(false, ordinaryDayInWindow),
      true,
      'Ordinary trading day during 15:10-15:25 IST should report window open'
    );
  });
});

