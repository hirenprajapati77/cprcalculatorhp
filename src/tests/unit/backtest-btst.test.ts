/**
 * Task I — BTST_STBT_DRIVEN backtest: TradeEngineService exit simulation tests.
 *
 * Tests confirm that the single-day EOD-forced-exit model works correctly
 * for the three cases that will occur in the BTST backtest:
 *   1. Target hit intraday on day i+1
 *   2. SL hit intraday on day i+1
 *   3. Neither hit → EOD forced exit at day[i+1].close (CLOSED_TIME_EXIT)
 *
 * We test TradeEngineService.simulateTrade directly with a single-element
 * ohlcSeries, which is exactly how the BTST_STBT_DRIVEN branch calls it.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { TradeEngineService } from '../../services/backtest/trade-engine.service';

const BASE_CONFIG = {
  capital: 100000,
  riskModel: 'Risk%',
  riskValue: 1,
  executionMode: 'conservative' as const,
  avgVolume: 1000000,
  volatility: 'LOW' as const,
};

describe('BTST backtest — single-day EOD-forced-exit simulation (Task I)', () => {

  // ─── Case 1: Target hit intraday ──────────────────────────────────────────
  // LONG trade: entry=100, sl=97, target=106
  // Next-day candle: low=99 (above sl), high=107 (above target) → TARGET HIT
  test('Case 1: LONG — target hit intraday on next day', () => {
    const result = TradeEngineService.simulateTrade(
      'LONG',
      100,   // entry
      97,    // sl
      106,   // target
      [{ date: '2023-06-01', open: 101, high: 107, low: 99, close: 104, volume: 500000 }],
      BASE_CONFIG
    );

    assert.strictEqual(result.status, 'CLOSED_TARGET', `Expected CLOSED_TARGET, got ${result.status}`);
    const slip = TradeEngineService.calculateSlippage(1000000, 'LOW', false);
    assert.strictEqual(result.exitPrice, 106 * (1 - slip), 'Exit price should equal slippage-adjusted target');
    assert.strictEqual(result.durationDays, 1, 'Should exit in 1 day');
    assert.ok(result.pnl > 0, 'LONG target exit must be profitable');
  });

  // ─── Case 2: SL hit intraday ──────────────────────────────────────────────
  // LONG trade: entry=100, sl=97, target=106
  // Next-day candle: high=103 (below target), low=96 (below sl) → SL HIT
  test('Case 2: LONG — SL hit intraday on next day', () => {
    const result = TradeEngineService.simulateTrade(
      'LONG',
      100,   // entry
      97,    // sl
      106,   // target
      [{ date: '2023-06-01', open: 99, high: 103, low: 96, close: 98, volume: 500000 }],
      BASE_CONFIG
    );

    assert.strictEqual(result.status, 'CLOSED_SL', `Expected CLOSED_SL, got ${result.status}`);
    const slip = TradeEngineService.calculateSlippage(1000000, 'LOW', false);
    assert.strictEqual(result.exitPrice, 97 * (1 - slip), 'Exit price should equal slippage-adjusted SL');
    assert.strictEqual(result.durationDays, 1, 'Should exit in 1 day');
    assert.ok(result.pnl < 0, 'SL exit must be a loss');
  });

  // ─── Case 3: Neither hit → EOD close exit ─────────────────────────────────
  // LONG trade: entry=100, sl=97, target=106
  // Next-day candle: high=104 (below target), low=98 (above sl) → TIME EXIT
  // Exit price must be the candle's close (= 102), status = CLOSED_TIME_EXIT
  test('Case 3: LONG — neither SL nor target hit → EOD forced exit at close', () => {
    const result = TradeEngineService.simulateTrade(
      'LONG',
      100,   // entry
      97,    // sl
      106,   // target
      [{ date: '2023-06-01', open: 101, high: 104, low: 98, close: 102, volume: 500000 }],
      BASE_CONFIG
    );

    assert.strictEqual(result.status, 'CLOSED_TIME_EXIT', `Expected CLOSED_TIME_EXIT, got ${result.status}`);
    assert.strictEqual(result.exitPrice, 102, 'Exit price must equal next-day close');
    assert.strictEqual(result.durationDays, 1, 'Should exit in 1 day');
    assert.strictEqual(result.exitReason, 'Max holding period (1 days) reached',
      'Exit reason must indicate EOD forced exit');
  });

  // ─── Case 4: SHORT — target hit intraday ──────────────────────────────────
  test('Case 4: SHORT — target hit intraday on next day', () => {
    const result = TradeEngineService.simulateTrade(
      'SHORT',
      100,  // entry
      103,  // sl (above entry)
      94,   // target (below entry)
      [{ date: '2023-06-01', open: 99, high: 102, low: 93, close: 95, volume: 500000 }],
      BASE_CONFIG
    );

    assert.strictEqual(result.status, 'CLOSED_TARGET', `Expected CLOSED_TARGET, got ${result.status}`);
    const slip = TradeEngineService.calculateSlippage(1000000, 'LOW', false);
    assert.strictEqual(result.exitPrice, 94 * (1 + slip), 'Exit price should equal slippage-adjusted target');
    assert.ok(result.pnl > 0, 'SHORT target exit must be profitable');
  });

  // ─── Case 5: SHORT — neither hit → EOD close exit ─────────────────────────
  test('Case 5: SHORT — neither SL nor target hit → EOD forced exit at close', () => {
    const result = TradeEngineService.simulateTrade(
      'SHORT',
      100,  // entry
      103,  // sl
      94,   // target
      [{ date: '2023-06-01', open: 99, high: 102, low: 96, close: 97, volume: 500000 }],
      BASE_CONFIG
    );

    assert.strictEqual(result.status, 'CLOSED_TIME_EXIT', `Expected CLOSED_TIME_EXIT, got ${result.status}`);
    assert.strictEqual(result.exitPrice, 97, 'Exit price must equal next-day close');
    assert.strictEqual(result.durationDays, 1);
  });
});
