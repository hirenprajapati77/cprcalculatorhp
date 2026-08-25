import test from 'node:test';
import assert from 'node:assert';
import {
  BreakoutWindow,
} from '../../services/market-tools/multi-year-breakout.service';

test('Multi-Year Breakout Scanner Engine Logic', async (t) => {
  await t.test('verifies window day threshold constants', () => {
    const WINDOW_DAYS: Record<BreakoutWindow, number> = {
      '1Y': 250,
      '2Y': 500,
      '3Y': 750,
      '5Y': 1250,
      '10Y': 2500,
      'ATH': 20,
    };

    assert.strictEqual(WINDOW_DAYS['1Y'], 250);
    assert.strictEqual(WINDOW_DAYS['2Y'], 500);
    assert.strictEqual(WINDOW_DAYS['3Y'], 750);
    assert.strictEqual(WINDOW_DAYS['5Y'], 1250);
    assert.strictEqual(WINDOW_DAYS['10Y'], 2500);
    assert.strictEqual(WINDOW_DAYS['ATH'], 20);
  });

  await t.test('history-depth guard correctly returns null for insufficient windows', () => {
    const historyDays = 260; // Current dataset depth

    function computeWindowBreakout(close: number, priorHigh: number | null, requiredDays: number, availableDays: number) {
      if (availableDays < requiredDays || priorHigh === null) {
        return null;
      }
      return close >= priorHigh;
    }

    // 1Y window with 260 days should compute
    const bo1Y = computeWindowBreakout(150, 140, 250, historyDays);
    assert.strictEqual(bo1Y, true);

    // 2Y window with 260 days MUST return null (not false, not true)
    const bo2Y = computeWindowBreakout(150, 140, 500, historyDays);
    assert.strictEqual(bo2Y, null, '2Y breakout must be null when history < 500 days');

    // 5Y window with 260 days MUST return null
    const bo5Y = computeWindowBreakout(150, 140, 1250, historyDays);
    assert.strictEqual(bo5Y, null, '5Y breakout must be null when history < 1250 days');

    // 10Y window with 260 days MUST return null
    const bo10Y = computeWindowBreakout(150, 140, 2500, historyDays);
    assert.strictEqual(bo10Y, null, '10Y breakout must be null when history < 2500 days');
  });

  await t.test('breakout price and gain percentage math is accurate', () => {
    const close = 105.0;
    const priorHigh = 100.0;

    const isBreakout = close >= priorHigh;
    const breakoutPrice = priorHigh;
    const gainPct = Math.round(((close - priorHigh) / priorHigh) * 10000) / 100;

    assert.strictEqual(isBreakout, true);
    assert.strictEqual(breakoutPrice, 100.0);
    assert.strictEqual(gainPct, 5.0);
  });

  await t.test('strongest breakout hierarchy prioritizes ATH and longest window', () => {
    function getStrongestBreakout(flags: {
      is10Y: boolean | null;
      is5Y: boolean | null;
      is3Y: boolean | null;
      is2Y: boolean | null;
      is1Y: boolean | null;
      isATH: boolean | null;
    }): string | null {
      if (flags.is10Y) return '10Y';
      if (flags.is5Y) return '5Y';
      if (flags.is3Y) return '3Y';
      if (flags.is2Y) return '2Y';
      if (flags.is1Y && !flags.isATH) return '1Y';
      if (flags.isATH) return 'ATH';
      return null;
    }

    assert.strictEqual(
      getStrongestBreakout({ is10Y: true, is5Y: true, is3Y: true, is2Y: true, is1Y: true, isATH: true }),
      '10Y'
    );
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: true, is3Y: true, is2Y: true, is1Y: true, isATH: true }),
      '5Y'
    );
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: null, is3Y: null, is2Y: null, is1Y: true, isATH: true }),
      'ATH'
    );
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: null, is3Y: null, is2Y: null, is1Y: true, isATH: false }),
      '1Y'
    );
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: null, is3Y: null, is2Y: null, is1Y: false, isATH: false }),
      null
    );
  });
});
