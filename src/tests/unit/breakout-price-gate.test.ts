import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterBreakoutsForPriceActionability,
  isBreakoutEntryExtended,
  isBreakoutEntryGapInvalidated,
} from '@/services/alert/breakout-price-gate';
import { EXTENSION_LIMITS } from '@/services/overnight/entry-manager.service';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';

function base(overrides: Partial<BreakoutScanResult> = {}): BreakoutScanResult {
  return {
    symbol: 'TEST',
    signals: ['BREAKOUT'],
    alertKind: 'BREAKOUT',
    ltp: 100,
    entry: 100,
    sl: 99,
    target: 103,
    rr: '1:2',
    score: 80,
    sector: 'IT',
    high: 101,
    low: 99,
    open: 100,
    previousClose: 99.5,
    ...overrides,
  };
}

describe('breakout price gate — gap invalidation', () => {
  it('detects entry outside today high/low as gap-invalidated', () => {
    assert.equal(
      isBreakoutEntryGapInvalidated({
        entry: 1034.2,
        todayHigh: 951.8,
        todayLow: 922.5,
        direction: 'SHORT',
      }),
      true
    );
    assert.equal(
      isBreakoutEntryGapInvalidated({
        entry: 100,
        todayHigh: 101,
        todayLow: 99,
        direction: 'LONG',
      }),
      false
    );
  });

  it('GODREJCP breakdown: entry above todayHigh is suppressed (not sent)', () => {
    // Entry 1034.20 vs day range 922.50–951.80 — unreachable without ~8% rally.
    const result = filterBreakoutsForPriceActionability([
      base({
        symbol: 'GODREJCP',
        alertKind: 'BREAKDOWN',
        signals: ['BREAKDOWN', 'BEARISH', 'NARROW'],
        ltp: 951.1,
        entry: 1034.2,
        sl: 1039.37,
        target: 1018.3,
        high: 951.8,
        low: 922.5,
        previousClose: 1025,
        open: 922.5,
      }),
    ]);
    assert.equal(result.actionable.length, 0);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0].gateReason, 'GAP_INVALIDATED');
  });
});

describe('breakout price gate — extension / chase', () => {
  it('reuses BTST EXTENSION_LIMITS (3.5%) for entry-chase distance', () => {
    assert.equal(EXTENSION_LIMITS.MAX_DAY_RETURN_PCT, 3.5);
    assert.equal(
      isBreakoutEntryExtended({ entry: 389.1, ltp: 416.65, direction: 'LONG' }),
      true
    );
    assert.equal(
      isBreakoutEntryExtended({ entry: 100, ltp: 103.4, direction: 'LONG' }),
      false
    );
  });

  it('NATIONALUM-style LONG: LTP far past entry is suppressed as EXTENDED', () => {
    const result = filterBreakoutsForPriceActionability([
      base({
        symbol: 'NATIONALUM',
        alertKind: 'BREAKOUT',
        signals: ['BREAKOUT'],
        ltp: 416.65,
        entry: 389.1,
        sl: 387.15,
        target: 392.97,
        // Day range still contains entry (not a gap) — pure chase after confirmation delay.
        high: 418,
        low: 388,
        // previousClose near entry so day-return gate alone is not the only path;
        // entry-chase distance (~7%) still trips EXTENSION_LIMITS.
        previousClose: 410,
        open: 391,
      }),
    ]);
    assert.equal(result.actionable.length, 0);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0].gateReason, 'EXTENDED');
  });
});

describe('breakout price gate — regression (normal alert)', () => {
  it('keeps actionable row unchanged when entry is inside range and LTP is near entry', () => {
    const row = base({
      symbol: 'NORMAL',
      alertKind: 'BREAKOUT',
      ltp: 100.5,
      entry: 100,
      high: 101,
      low: 99.5,
      previousClose: 99.8,
      open: 100,
    });
    const result = filterBreakoutsForPriceActionability([row]);
    assert.equal(result.suppressed.length, 0);
    assert.equal(result.actionable.length, 1);
    assert.deepEqual(result.actionable[0], row);
  });
});
