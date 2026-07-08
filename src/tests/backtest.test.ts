import test from 'node:test';
import assert from 'node:assert';
import { TradeEngineService } from '../services/backtest/trade-engine.service';
import { BacktestService } from '../services/backtest/backtest.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOhlc(dates: string[], basePrice = 100, trend: 'flat' | 'up' | 'down' = 'flat') {
  return dates.map((date, i) => {
    const drift = trend === 'up' ? i * 0.5 : trend === 'down' ? -i * 0.5 : 0;
    const p = basePrice + drift;
    return { date, open: p, high: p + 1, low: p - 1, close: p, volume: 1000 };
  });
}

function makeDates(n: number, startDate = '2024-01-02') {
  const dates: string[] = [];
  const d = new Date(startDate);
  for (let i = 0; i < n; i++) {
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

const baseConfig = {
  capital: 100000,
  riskModel: 'Risk%',
  riskValue: 1,
  executionMode: 'conservative'
};

// ─── Test Suite: Trade Engine Holding Period ──────────────────────────────────

test('TradeEngine — CLOSED_TIME_EXIT at exact window boundary', async (t) => {

  await t.test('exits CLOSED_TIME_EXIT when SL/Target not hit within 3-day window', () => {
    // Entry: LONG at 100, SL=98, Target=108 — impossible to hit in 3 flat days
    const ohlc = makeOhlc(makeDates(3), 100, 'flat');
    // flat candles: high=101, low=99 — never reaches SL=98 or Target=108
    const result = TradeEngineService.simulateTrade('LONG', 100, 98, 108, ohlc, baseConfig);

    assert.strictEqual(result.status, 'CLOSED_TIME_EXIT', 'should exit via time, not SL/Target');
    assert.strictEqual(result.durationDays, 3, 'duration should be exactly 3 (the window size)');
    assert.ok(result.exitDate !== null, 'exitDate must be set');
    assert.ok(result.exitReason!.includes('3 days'), `exitReason should mention 3 days, got: ${result.exitReason}`);
  });

  await t.test('exits CLOSED_TIME_EXIT at day 1 when window is 1 candle', () => {
    const ohlc = makeOhlc(makeDates(1), 100, 'flat');
    const result = TradeEngineService.simulateTrade('LONG', 100, 98, 108, ohlc, baseConfig);

    assert.strictEqual(result.status, 'CLOSED_TIME_EXIT');
    assert.strictEqual(result.durationDays, 1, 'single candle window exits on day 1');
  });

  await t.test('exits CLOSED_SL before window boundary if SL is hit', () => {
    // SL at 99, candle low goes to 98 — SL hit on day 1
    const ohlc = [
      { date: '2024-01-02', open: 100, high: 101, low: 98, close: 99, volume: 1000 },
      { date: '2024-01-03', open: 99, high: 100, low: 98, close: 99, volume: 1000 },
      { date: '2024-01-04', open: 99, high: 100, low: 98, close: 99, volume: 1000 },
    ];
    const result = TradeEngineService.simulateTrade('LONG', 100, 99, 108, ohlc, baseConfig);

    assert.strictEqual(result.status, 'CLOSED_SL', 'SL should be hit on day 1');
    assert.strictEqual(result.durationDays, 1, 'trade should last 1 day, not run to window end');
  });

  await t.test('exits CLOSED_TARGET before window boundary if Target is hit', () => {
    // Target at 105, candle high goes to 106 — target hit on day 2
    const ohlc = [
      { date: '2024-01-02', open: 100, high: 102, low: 99, close: 101, volume: 1000 }, // no hit
      { date: '2024-01-03', open: 101, high: 106, low: 100, close: 104, volume: 1000 }, // target hit
      { date: '2024-01-04', open: 104, high: 107, low: 103, close: 106, volume: 1000 }, // should not reach
    ];
    const result = TradeEngineService.simulateTrade('LONG', 100, 98, 105, ohlc, baseConfig);

    assert.strictEqual(result.status, 'CLOSED_TARGET', 'Target should be hit on day 2');
    assert.strictEqual(result.durationDays, 2, 'trade should last 2 days');
  });

  await t.test('CLOSED_TIME_EXIT — exit price is close of LAST candle in bounded window', () => {
    const ohlc = [
      { date: '2024-01-02', open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      { date: '2024-01-03', open: 100.5, high: 101.5, low: 99.5, close: 101, volume: 1000 },
      { date: '2024-01-04', open: 101, high: 102, low: 100, close: 101.8, volume: 1000 }, // last candle
    ];
    const result = TradeEngineService.simulateTrade('LONG', 100, 97, 110, ohlc, baseConfig);

    assert.strictEqual(result.status, 'CLOSED_TIME_EXIT');
    assert.strictEqual(result.exitPrice, 101.8, 'exit price should be close of last window candle');
    assert.strictEqual(result.exitDate, '2024-01-04');
  });
});

// ─── Test Suite: No overlapping trades from backtest outer loop ───────────────

test('Backtest — no overlapping same-symbol trades within holding window', async (t) => {

  await t.test('blockedUntilIndex correctly prevents entries during cooldown window', () => {
    // Simulate the backtest inner loop logic in isolation
    let blockedUntilIndex = -1;
    const MAX_HOLDING_DAYS = 3;
    const tradeEntryDays: number[] = [];

    // Simulate 10 trading days, entry signal fires every day
    for (let i = 1; i <= 10; i++) {
      if (i <= blockedUntilIndex) continue; // blocked

      // "Create trade" — signal fires
      tradeEntryDays.push(i);

      // Block for MAX_HOLDING_DAYS
      const tradeWindowSize = Math.min(MAX_HOLDING_DAYS, 10 - i + 1);
      blockedUntilIndex = i + (tradeWindowSize - 1);
    }

    // With MAX_HOLDING_DAYS=3 and 10 days: entries at day 1, 4, 7, 10
    assert.deepStrictEqual(tradeEntryDays, [1, 4, 7, 10],
      `Expected entries at days [1,4,7,10] with 3-day cooldown, got: [${tradeEntryDays}]`);

    // No two consecutive entries should be within 3 days of each other
    for (let j = 1; j < tradeEntryDays.length; j++) {
      const gap = tradeEntryDays[j] - tradeEntryDays[j - 1];
      assert.ok(gap >= MAX_HOLDING_DAYS,
        `Entry gap between day ${tradeEntryDays[j - 1]} and day ${tradeEntryDays[j]} is ${gap} — must be >= ${MAX_HOLDING_DAYS}`);
    }
  });

  await t.test('cooldown resets correctly for each new symbol (independent trackers)', () => {
    // Each symbol should have its own independent blockedUntilIndex
    const symbols = ['RELIANCE', 'TCS', 'INFY'];
    const results: Record<string, number[]> = {};

    for (const symbol of symbols) {
      let blockedUntilIndex = -1;
      const MAX_HOLDING_DAYS = 3;
      const entries: number[] = [];

      for (let i = 1; i <= 7; i++) {
        if (i <= blockedUntilIndex) continue;
        entries.push(i);
        const windowSize = Math.min(MAX_HOLDING_DAYS, 7 - i + 1);
        blockedUntilIndex = i + (windowSize - 1);
      }
      results[symbol] = entries;
    }

    // All 3 symbols should have identical entry patterns (each starts fresh)
    assert.deepStrictEqual(results['RELIANCE'], results['TCS']);
    assert.deepStrictEqual(results['TCS'], results['INFY']);

    // Each should have entries at days 1, 4, 7
    for (const symbol of symbols) {
      assert.deepStrictEqual(results[symbol], [1, 4, 7],
        `${symbol}: expected entries at [1,4,7], got [${results[symbol]}]`);
    }
  });
});

import { MetricsService } from '../services/backtest/metrics.service';

test('Metrics Service — Signal Bucketing', async (t) => {
  await t.test('groups trades with the same stable signal key into a single signalSuccess bucket', () => {
    // Two trades, same NARROW_CPR_BULLISH signal, different widths (simulated via cprWidth).
    // Prior to fix, trade.signal embedded the width, causing n=1 buckets.
    const trades = [
      {
        pnl: 500,
        signal: 'NARROW_CPR_BULLISH',
        status: 'CLOSED_TARGET',
        exitPrice: 110,
        entryPrice: 100,
        rr: 2,
        cprWidth: 0.25,
        exitDate: '2024-01-02T10:00:00Z',
        durationDays: 1
      },
      {
        pnl: -200,
        signal: 'NARROW_CPR_BULLISH',
        status: 'CLOSED_SL',
        exitPrice: 98,
        entryPrice: 100,
        rr: -1,
        cprWidth: 0.15,
        exitDate: '2024-01-03T10:00:00Z',
        durationDays: 1
      }
    ];

    const { signalSuccess } = MetricsService.computeMetricsFromTrades(trades, 100000);

    // Should only have 1 bucket key: NARROW_CPR_BULLISH
    const keys = Object.keys(signalSuccess);
    assert.strictEqual(keys.length, 1, 'Trades should group into exactly one signal bucket');
    assert.strictEqual(keys[0], 'NARROW_CPR_BULLISH');
    
    const stats = signalSuccess['NARROW_CPR_BULLISH'];
    assert.strictEqual(stats.total, 2, 'Bucket should contain both trades');
    assert.strictEqual(stats.win, 1, 'Bucket should correctly count 1 winner');
  });

  await t.test('excludes breakeven trades (pnl === 0) from losingTrades denominator', () => {
    // 3 trades: 1 win (+500), 1 breakeven (0), 1 loss (-200)
    const trades = [
      {
        pnl: 500,
        signal: 'NARROW_CPR_BULLISH',
        status: 'CLOSED_TARGET',
        exitPrice: 105,
        entryPrice: 100,
        rr: 2,
        durationDays: 1
      },
      {
        pnl: 0,
        signal: 'NARROW_CPR_BULLISH',
        status: 'CLOSED_TIME_EXIT',
        exitPrice: 100,
        entryPrice: 100,
        rr: 0,
        durationDays: 3
      },
      {
        pnl: -200,
        signal: 'NARROW_CPR_BULLISH',
        status: 'CLOSED_SL',
        exitPrice: 98,
        entryPrice: 100,
        rr: -1,
        durationDays: 1
      }
    ];

    const { metrics } = MetricsService.computeMetricsFromTrades(trades, 100000);

    // winRate should be 1 / 3 = 33.333% (approx 33.3)
    assert.ok(Math.abs(metrics.winRate - 33.33) < 0.1, `Expected winRate ~33.33%, got ${metrics.winRate}%`);

    // expectancy should be (1/3 * 500) - (1/3 * 200) = 100 (which is exactly net PnL 300 / 3)
    // If avgLoss was diluted to 100, expectancy would be 133.33. If avgLoss is correct (200), expectancy is 100.
    assert.ok(Math.abs(metrics.expectancy - 100) < 0.01, `Expected expectancy to be 100, got ${metrics.expectancy}`);
  });

  await t.test('computes drawdown relative to initialCapital parameter', () => {
    // Single loss trade of -25000
    const trades = [
      {
        pnl: -25000,
        signal: 'NARROW_CPR_BULLISH',
        status: 'CLOSED_SL',
        exitPrice: 90,
        entryPrice: 100,
        rr: -1,
        durationDays: 1
      }
    ];

    // Compute metrics with capital = 250000. Expected drawdown = 25000 / 250000 * 100 = 10%.
    // If it fallback/hardcoded to 100000, drawdown would be 25000 / 100000 * 100 = 25%.
    const { metrics } = MetricsService.computeMetricsFromTrades(trades, 250000);

    assert.strictEqual(metrics.maxDrawdown, 10, `Expected drawdown to be 10%, got ${metrics.maxDrawdown}%`);
  });
});

test('BacktestService — evaluateTrigger Breakout Trigger Tests', async (t) => {
  // Setup day is index 0
  const baseOhlc = [
    { date: '2026-06-01', open: 100, high: 102, low: 98, close: 100, volume: 1000 }, // Setup Day (i=0)
    { date: '2026-06-02', open: 100, high: 102, low: 98, close: 100, volume: 1000 }, // Day i+1 (no fill)
    { date: '2026-06-03', open: 100, high: 102, low: 98, close: 100, volume: 1000 }, // Day i+2
    { date: '2026-06-04', open: 100, high: 102, low: 98, close: 100, volume: 1000 }, // Day i+3
    { date: '2026-06-05', open: 100, high: 102, low: 98, close: 100, volume: 1000 }, // Day i+4
    { date: '2026-06-08', open: 100, high: 102, low: 98, close: 100, volume: 1000 }, // Day i+5
    { date: '2026-06-09', open: 100, high: 102, low: 98, close: 100, volume: 1000 }  // Out of trigger window
  ];

  await t.test('triggers on day i+2 via gap-open (gap-fill case)', () => {
    // entry = 105. Day i+2 gaps open to 110.
    const ohlc = baseOhlc.map((d, index) => {
      if (index === 2) {
        return { ...d, open: 110, high: 112, low: 109, close: 110 };
      }
      return d;
    });

    const result = BacktestService.evaluateTrigger('BULLISH', 105, ohlc, 0, 5);
    assert.ok(result !== null);
    assert.strictEqual(result.triggeredIndex, 2);
    assert.strictEqual(result.triggeredPrice, 110, 'Should trigger at open price because it gapped past entry');
  });

  await t.test('triggers on day i+3 via intraday touch (normal-fill case)', () => {
    // entry = 105. Day i+3 open is 100, but high goes to 107.
    const ohlc = baseOhlc.map((d, index) => {
      if (index === 3) {
        return { ...d, open: 100, high: 107, low: 98, close: 101 };
      }
      return d;
    });

    const result = BacktestService.evaluateTrigger('BULLISH', 105, ohlc, 0, 5);
    assert.ok(result !== null);
    assert.strictEqual(result.triggeredIndex, 3);
    assert.strictEqual(result.triggeredPrice, 105, 'Should trigger exactly at entry price level for intraday touch');
  });

  await t.test('never triggers within trigger window (NEVER_TRIGGERED case)', () => {
    // entry = 105. No day goes above high of 102.
    const result = BacktestService.evaluateTrigger('BULLISH', 105, baseOhlc, 0, 5);
    assert.strictEqual(result, null, 'Should return null when entry level is never reached within trigger window');
  });
});

test('TradeEngineService — SCANNER_DRIVEN holding period and safety valve', async (t) => {
  const ohlc = [
    { date: '2026-06-01', open: 100, high: 102, low: 98, close: 100, volume: 1000 },  // Day 1 (Entry day, close 100)
    { date: '2026-06-02', open: 100, high: 102, low: 98, close: 101, volume: 1000 },  // Day 2 (close 101)
    { date: '2026-06-03', open: 101, high: 103, low: 99, close: 102, volume: 1000 },  // Day 3 (close 102 - legacy exits here)
    { date: '2026-06-04', open: 102, high: 104, low: 100, close: 103, volume: 1000 }, // Day 4 (close 103)
    { date: '2026-06-05', open: 103, high: 105, low: 101, close: 104, volume: 1000 }, // Day 5 (close 104)
    { date: '2026-06-08', open: 104, high: 112, low: 102, close: 110, volume: 1000 }, // Day 6 (hits target 110!)
    { date: '2026-06-09', open: 110, high: 112, low: 109, close: 111, volume: 1000 }  // Day 7
  ];

  await t.test('legacy 2-day cap force-closes trade on time', () => {
    // Legacy mode slice is length 2
    const tradeResult = TradeEngineService.simulateTrade(
      'LONG',
      100,  // entryPrice
      95,   // stopLoss
      110,  // target
      ohlc.slice(0, 2), // legacy 2 days slice
      { capital: 100000, riskModel: 'Risk%', riskValue: 1.0, executionMode: 'conservative' }
    );

    assert.strictEqual(tradeResult.status, 'CLOSED_TIME_EXIT');
    assert.strictEqual(tradeResult.exitReason, 'Max holding period (2 days) reached');
    assert.strictEqual(tradeResult.exitPrice, 101); // exit at close of day 2
  });

  await t.test('scanner-driven 20-day safety valve allows target hit on day 6', () => {
    // Scanner-driven mode slice is up to 20 days
    const tradeResult = TradeEngineService.simulateTrade(
      'LONG',
      100,  // entryPrice
      95,   // stopLoss
      110,  // target
      ohlc.slice(0, 7), // 7 days of data available (fits in 20-day safety valve)
      { capital: 100000, riskModel: 'Risk%', riskValue: 1.0, executionMode: 'conservative' }
    );

    assert.strictEqual(tradeResult.status, 'CLOSED_TARGET');
    assert.strictEqual(tradeResult.exitReason, 'Target Hit (Slippage: 0.15%)');
    assert.strictEqual(tradeResult.exitPrice, 109.83500000000001);
    assert.strictEqual(tradeResult.durationDays, 6); // entered day 0, exited day 5 (6th element, inclusive day-count = 6)
  });
});


