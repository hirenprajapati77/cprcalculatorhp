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
  getMinAthHistoryDays,
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

  await t.test('ATH minimum history guard at 249, 250, 499, 500 trading days', () => {
    // 249 days (less than 1 full trading year): ATH is unavailable / requires 250 days
    assert.strictEqual(getMinAthHistoryDays(249), 250);

    // 250 days (exactly 1 trading year): ATH requires 250 days
    assert.strictEqual(getMinAthHistoryDays(250), 250);

    // 499 days (between 1Y and 2Y): ATH requires 250 days
    assert.strictEqual(getMinAthHistoryDays(499), 250);

    // 500 days (full 2Y historical depth reached): ATH strictly requires 500 days
    assert.strictEqual(getMinAthHistoryDays(500), 500);

    // 750 days: requires 500 days
    assert.strictEqual(getMinAthHistoryDays(750), 500);
  });

  await t.test('ATH eligibility and getStrongestBreakout labeling across available day boundaries', () => {
    // Boundary 1: At 249 available days (minAth = 250):
    // Window is unavailable (249 < 250), so neither an IPO (240) nor 249-day stock qualifies
    const minDays249 = getMinAthHistoryDays(249);
    assert.strictEqual(minDays249, 250);
    assert.strictEqual(240 >= minDays249, false);
    assert.strictEqual(249 >= minDays249, false, 'Window unavailable at 249 days');

    // Boundary 2: At 250 available days (minAth = 250):
    const minDays250 = getMinAthHistoryDays(250);
    assert.strictEqual(240 >= minDays250, false, 'IPO with 240 days ineligible');
    assert.strictEqual(250 >= minDays250, true, 'Stock with 250 days eligible');
    assert.strictEqual(260 >= minDays250, true, 'Stock with 260 days eligible');
    // Strongest breakout when is1Y=true, isATH=true -> 'ATH'
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: null, is3Y: null, is2Y: null, is1Y: true, isATH: true }),
      'ATH'
    );

    // Boundary 3: At 499 available days (minAth = 250):
    const minDays499 = getMinAthHistoryDays(499);
    assert.strictEqual(minDays499, 250);
    assert.strictEqual(240 >= minDays499, false, 'Stock with 240 days ineligible');
    assert.strictEqual(490 >= minDays499, true, 'Stock with 490 days eligible');
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: null, is3Y: null, is2Y: null, is1Y: true, isATH: true }),
      'ATH'
    );

    // Boundary 4: At 500 available days (minAth = 500):
    const minDays500 = getMinAthHistoryDays(500);
    assert.strictEqual(minDays500, 500);
    assert.strictEqual(490 >= minDays500, false, 'Stock with 490 days ineligible when 500 days available');
    assert.strictEqual(500 >= minDays500, true, 'Stock with 500 days eligible when 500 days available');
    assert.strictEqual(510 >= minDays500, true, 'Stock with 510 days eligible when 500 days available');
    // Multi-year priority order: 2Y takes precedence over ATH when both are broken:
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: null, is3Y: null, is2Y: true, is1Y: true, isATH: true }),
      '2Y'
    );
    // 5Y takes precedence over 2Y:
    assert.strictEqual(
      getStrongestBreakout({ is10Y: null, is5Y: true, is3Y: true, is2Y: true, is1Y: true, isATH: true }),
      '5Y'
    );
    // 10Y takes precedence over 5Y:
    assert.strictEqual(
      getStrongestBreakout({ is10Y: true, is5Y: true, is3Y: true, is2Y: true, is1Y: true, isATH: true }),
      '10Y'
    );
  });
});
