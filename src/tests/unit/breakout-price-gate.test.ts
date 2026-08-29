import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterBreakoutsForPriceActionability,
  isBreakoutEntryExtended,
  isBreakoutEntryGapInvalidated,
} from '@/services/alert/breakout-price-gate';
import { atrScaledExtensionCap } from '@/lib/cpr-setup-staleness';
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
    // SHORT setup: entry above range (gapped down) -> true
    assert.equal(
      isBreakoutEntryGapInvalidated({
        entry: 1034.2,
        todayHigh: 951.8,
        todayLow: 922.5,
        direction: 'SHORT',
      }),
      true
    );
    // LONG setup: entry above range (untriggered/not-yet-reached) -> false
    assert.equal(
      isBreakoutEntryGapInvalidated({
        entry: 1034.2,
        todayHigh: 951.8,
        todayLow: 922.5,
        direction: 'LONG',
      }),
      false
    );
    // LONG setup: entry below range (gapped up) -> true
    assert.equal(
      isBreakoutEntryGapInvalidated({
        entry: 900,
        todayHigh: 951.8,
        todayLow: 922.5,
        direction: 'LONG',
      }),
      true
    );
    // SHORT setup: entry below range (untriggered/not-yet-reached) -> false
    assert.equal(
      isBreakoutEntryGapInvalidated({
        entry: 900,
        todayHigh: 951.8,
        todayLow: 922.5,
        direction: 'SHORT',
      }),
      false
    );
    // Normal inside range -> false
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
  it('CPR/Telegram gate uses its own tighter 1.5% cap, independent of shared BTST EXTENSION_LIMITS (3.5%)', () => {
    // BTST's shared cap is unchanged (still 3.5%) -- the CPR/Telegram path
    // just no longer defaults to it (see breakout-price-gate.ts chaseCap fix).
    assert.equal(EXTENSION_LIMITS.MAX_DAY_RETURN_PCT, 3.5);
    assert.equal(
      isBreakoutEntryExtended({ entry: 389.1, ltp: 416.65, direction: 'LONG' }),
      true
    );
    // 1.2% chase — under the new 1.5% CPR cap, not extended.
    assert.equal(
      isBreakoutEntryExtended({ entry: 100, ltp: 101.2, direction: 'LONG' }),
      false
    );
    // 3.4% chase — was allowed under the old 3.5% cap (AMBER-style case,
    // 27 Aug 2026: 2.66% chase slipped through). Now correctly suppressed
    // under the tightened 1.5% cap.
    assert.equal(
      isBreakoutEntryExtended({ entry: 100, ltp: 103.4, direction: 'LONG' }),
      true
    );
  });

  it('AMBER-style case: 2.66% chase distance now suppressed (was previously allowed under 3.5%)', () => {
    const result = filterBreakoutsForPriceActionability([
      base({
        symbol: 'AMBER',
        alertKind: 'BREAKOUT',
        signals: ['BREAKOUT'],
        ltp: 7701.0,
        entry: 7501.25,
        sl: 7463.74,
        target: 7575.0,
        high: 7750,
        low: 7501,
        previousClose: 7501.25,
        open: 7750,
      }),
    ]);
    assert.equal(result.actionable.length, 0);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0].gateReason, 'EXTENDED');
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
        // entry-chase distance (~7%) still trips the CPR-specific chase cap
        // (previously the shared BTST EXTENSION_LIMITS -- see breakout-price-gate.ts).
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

describe('breakout price gate — against prior close', () => {
  it('LICI-style LONG: LTP still below previous close is suppressed', () => {
    const result = filterBreakoutsForPriceActionability([
      base({
        symbol: 'LICI',
        alertKind: 'BREAKOUT',
        signals: ['BREAKOUT', 'NARROW', 'VOLUME_SPIKE'],
        ltp: 415.35,
        entry: 414.95,
        sl: 410.1,
        target: 425.2,
        high: 416.35,
        low: 414.0,
        open: 415.35,
        previousClose: 417,
      }),
    ]);
    assert.equal(result.actionable.length, 0);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0].gateReason, 'AGAINST_PRIOR_CLOSE');
  });

  it('SHORT still green vs previous close is suppressed', () => {
    const result = filterBreakoutsForPriceActionability([
      base({
        symbol: 'GREENSHORT',
        alertKind: 'BREAKDOWN',
        signals: ['BREAKDOWN'],
        ltp: 100.5,
        entry: 100.2,
        sl: 101.5,
        target: 97,
        high: 101,
        low: 99.8,
        open: 100.3,
        previousClose: 100,
      }),
    ]);
    assert.equal(result.actionable.length, 0);
    assert.equal(result.suppressed[0].gateReason, 'AGAINST_PRIOR_CLOSE');
  });

  it('fails open when previousClose is missing', () => {
    const row = base({
      symbol: 'NOPC',
      alertKind: 'BREAKOUT',
      ltp: 100.2,
      entry: 100,
      high: 101,
      low: 99.5,
      open: 100,
    });
    delete row.previousClose;
    const result = filterBreakoutsForPriceActionability([row]);
    assert.equal(result.suppressed.length, 0);
    assert.equal(result.actionable.length, 1);
  });

  it('allows LONG when LTP equals previous close', () => {
    const result = filterBreakoutsForPriceActionability([
      base({
        ltp: 100,
        entry: 99.8,
        high: 101,
        low: 99.5,
        previousClose: 100,
        open: 99.9,
      }),
    ]);
    assert.equal(result.suppressed.length, 0);
    assert.equal(result.actionable.length, 1);
  });
});

describe('atrScaledExtensionCap', () => {
  it('defaults to 1.5% (CPR_ENTRY_EXTENSION_PCT) when ATR is missing', () => {
    assert.equal(atrScaledExtensionCap(undefined), 1.5);
    assert.equal(atrScaledExtensionCap(0), 1.5);
  });

  it('scales 1.5x ATR and clamps to 1-3% (tightened from 2-6%)', () => {
    assert.equal(atrScaledExtensionCap(2.5), 3.0);
    assert.equal(atrScaledExtensionCap(1.0), 1.5);
    assert.equal(atrScaledExtensionCap(5.0), 3.0);
  });
});
