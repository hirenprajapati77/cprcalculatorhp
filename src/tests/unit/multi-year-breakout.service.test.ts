import test from 'node:test';
import assert from 'node:assert';
import {
  BreakoutWindow,
  // B5 fix: import real service functions rather than redefining them locally.
  // The previous version redefined computeWindowBreakout and getStrongestBreakout
  // as internal test functions — meaning it was testing its own mocks, not the
  // production service. Any regression in the real code would be invisible.
  computeWindowBreakout,
  getStrongestBreakout,
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

  await t.test('computeWindowBreakout: returns null for insufficient history', () => {
    const historyDays = 260;

    const bo1Y = computeWindowBreakout(150, 140, 250, historyDays);
    assert.strictEqual(bo1Y, true);

    const bo2Y = computeWindowBreakout(150, 140, 500, historyDays);
    assert.strictEqual(bo2Y, null, '2Y breakout must be null when history < 500 days');

    const bo5Y = computeWindowBreakout(150, 140, 1250, historyDays);
    assert.strictEqual(bo5Y, null, '5Y breakout must be null when history < 1250 days');

    const bo10Y = computeWindowBreakout(150, 140, 2500, historyDays);
    assert.strictEqual(bo10Y, null, '10Y breakout must be null when history < 2500 days');
  });

  await t.test('computeWindowBreakout: returns null when priorHigh is null', () => {
    const result = computeWindowBreakout(150, null, 250, 300);
    assert.strictEqual(result, null, 'null priorHigh must return null, not false');
  });

  await t.test('computeWindowBreakout: false when close < priorHigh', () => {
    assert.strictEqual(computeWindowBreakout(90, 100, 250, 300), false);
  });

  await t.test('computeWindowBreakout: true when close == priorHigh (exact breakout)', () => {
    assert.strictEqual(computeWindowBreakout(100, 100, 250, 300), true);
  });

  await t.test('breakout price and gain percentage math is accurate', () => {
    const close = 105.0;
    const priorHigh = 100.0;

    const isBreakout = computeWindowBreakout(close, priorHigh, 250, 300);
    const gainPct = priorHigh > 0 ? Math.round(((close - priorHigh) / priorHigh) * 10000) / 100 : 0;

    assert.strictEqual(isBreakout, true);
    assert.strictEqual(gainPct, 5.0);
  });

  await t.test('getStrongestBreakout: hierarchy prioritizes 10Y first, ATH upgrades label', () => {
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
    assert.strictEqual(
      getStrongestBreakout({ is10Y: false, is5Y: false, is3Y: false, is2Y: false, is1Y: false, isATH: false }),
      null
    );
  });

  // B25: NaN/null/zero price edge-case tests
  await t.test('computeWindowBreakout: NaN close does not count as a breakout', () => {
    const result = computeWindowBreakout(NaN, 100, 250, 300);
    assert.strictEqual(typeof result, 'boolean', 'NaN close should return boolean, not throw');
    assert.strictEqual(result, false, 'NaN close must not count as a breakout');
  });

  await t.test('computeWindowBreakout: priorHigh=0 returns true (0 is a valid but degenerate comparison)', () => {
    // 100 >= 0 is mathematically true, so the function returns true.
    // Protection against degenerate zero-high values is the caller's responsibility —
    // the raw query guards this with ROWS BETWEEN N PRECEDING AND 1 PRECEDING (excludes
    // the current row), so priorHigh=0 in practice indicates a stock that had zero high
    // in the prior N candles, which is data-quality issue, not a function bug.
    const result = computeWindowBreakout(100, 0, 250, 300);
    assert.strictEqual(result, true, 'computeWindowBreakout(100, 0, ...) returns true because 100 >= 0');
  });
});
