import test from 'node:test';
import assert from 'node:assert';
import { TradeEngineService } from '../services/backtest/trade-engine.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOhlc(dates: string[], basePrice = 100, trend: 'flat' | 'up' | 'down' = 'flat') {
  return dates.map((date, i) => {
    const drift = trend === 'up' ? i * 0.5 : trend === 'down' ? -i * 0.5 : 0;
    const p = basePrice + drift;
    return { date, open: p, high: p + 1, low: p - 1, close: p };
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
      { date: '2024-01-02', open: 100, high: 101, low: 98, close: 99 },
      { date: '2024-01-03', open: 99, high: 100, low: 98, close: 99 },
      { date: '2024-01-04', open: 99, high: 100, low: 98, close: 99 },
    ];
    const result = TradeEngineService.simulateTrade('LONG', 100, 99, 108, ohlc, baseConfig);

    assert.strictEqual(result.status, 'CLOSED_SL', 'SL should be hit on day 1');
    assert.strictEqual(result.durationDays, 1, 'trade should last 1 day, not run to window end');
  });

  await t.test('exits CLOSED_TARGET before window boundary if Target is hit', () => {
    // Target at 105, candle high goes to 106 — target hit on day 2
    const ohlc = [
      { date: '2024-01-02', open: 100, high: 102, low: 99, close: 101 }, // no hit
      { date: '2024-01-03', open: 101, high: 106, low: 100, close: 104 }, // target hit
      { date: '2024-01-04', open: 104, high: 107, low: 103, close: 106 }, // should not reach
    ];
    const result = TradeEngineService.simulateTrade('LONG', 100, 98, 105, ohlc, baseConfig);

    assert.strictEqual(result.status, 'CLOSED_TARGET', 'Target should be hit on day 2');
    assert.strictEqual(result.durationDays, 2, 'trade should last 2 days');
  });

  await t.test('CLOSED_TIME_EXIT — exit price is close of LAST candle in bounded window', () => {
    const ohlc = [
      { date: '2024-01-02', open: 100, high: 101, low: 99, close: 100.5 },
      { date: '2024-01-03', open: 100.5, high: 101.5, low: 99.5, close: 101 },
      { date: '2024-01-04', open: 101, high: 102, low: 100, close: 101.8 }, // last candle
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
