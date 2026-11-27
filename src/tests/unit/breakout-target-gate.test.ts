import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterBreakoutsForPriceActionability } from '@/services/alert/breakout-price-gate';
import { evaluateTargetExhaustion, targetProgress } from '@/lib/cpr-setup-staleness';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';

// ADANIPORTS-style SHORT: entry (CPR BC) 1927.37, target 1897.63 (only ~1.54% away), SL 1945.30.
function adani(ltp: number, overrides: Partial<BreakoutScanResult> = {}): BreakoutScanResult {
  return {
    symbol: 'ADANIPORTS',
    signals: ['BREAKDOWN'],
    alertKind: 'BREAKDOWN',
    ltp,
    entry: 1927.37,
    sl: 1945.3,
    target: 1897.63,
    rr: '1:1.7',
    score: 85,
    sector: 'Infra',
    high: 1935,
    low: Math.min(ltp, 1900),
    open: 1930,
    previousClose: 1932,
    ...overrides,
  };
}

function quiet<T>(fn: () => T): T {
  const w = console.warn;
  const i = console.info;
  console.warn = () => {};
  console.info = () => {};
  try {
    return fn();
  } finally {
    console.warn = w;
    console.info = i;
  }
}

describe('targetProgress / evaluateTargetExhaustion', () => {
  it('SHORT: 0 at entry, 1 at target, matches the ADANIPORTS numbers', () => {
    const p = targetProgress({ entry: 1927.37, ltp: 1903.1, target: 1897.63, direction: 'SHORT' })!;
    assert.ok(Math.abs(p - 0.816) < 0.001);
    assert.equal(targetProgress({ entry: 100, ltp: 100, target: 98, direction: 'SHORT' }), 0);
    assert.equal(targetProgress({ entry: 100, ltp: 98, target: 98, direction: 'SHORT' }), 1);
  });

  it('LONG mirrors SHORT; wrong-side or invalid targets return null (no gating on bad data)', () => {
    assert.equal(targetProgress({ entry: 100, ltp: 101, target: 102, direction: 'LONG' }), 0.5);
    assert.equal(targetProgress({ entry: 100, ltp: 101, target: 99, direction: 'LONG' }), null);
    assert.equal(targetProgress({ entry: 100, ltp: 99, target: 101, direction: 'SHORT' }), null);
    assert.equal(targetProgress({ entry: 0, ltp: 99, target: 98, direction: 'SHORT' }), null);
  });

  it('classifies OK / TARGET_NEAR / TARGET_REACHED', () => {
    const args = { entry: 100, target: 102, direction: 'LONG' as const };
    assert.equal(evaluateTargetExhaustion({ ...args, ltp: 100.4 }).kind, 'OK');
    assert.equal(evaluateTargetExhaustion({ ...args, ltp: 101 }).kind, 'TARGET_NEAR'); // exactly 50%
    assert.equal(evaluateTargetExhaustion({ ...args, ltp: 102 }).kind, 'TARGET_REACHED');
    assert.equal(evaluateTargetExhaustion({ ...args, ltp: 103 }).kind, 'TARGET_REACHED');
    assert.equal(evaluateTargetExhaustion({ ...args, ltp: 101, maxProgress: 0.6 }).kind, 'OK');
  });
});

describe('breakout price gate — target exhaustion (ADANIPORTS 27 Nov 2026 scenario)', () => {
  it('shadow (default): 10:45 alert at 1903.10 (82% done) still passes but is logged; TARGET_REACHED is suppressed', () => {
    const logs: string[] = [];
    const orig = console.info;
    console.info = (...a: unknown[]) => void logs.push(a.map(String).join(' '));
    const w = console.warn;
    console.warn = () => {};
    try {
      const r = filterBreakoutsForPriceActionability([adani(1903.1)], { targetGateMode: 'shadow' });
      assert.equal(r.actionable.length, 1);
      assert.equal(r.suppressed.length, 0);
      const line = logs.find((l) => l.startsWith('[TargetGateShadow]'));
      assert.ok(line, 'would-be suppression is logged');
      const p = JSON.parse(line!.replace('[TargetGateShadow] ', ''));
      assert.equal(p.symbol, 'ADANIPORTS');
      assert.equal(p.wouldSuppress, 'TARGET_NEAR');
      assert.ok(p.progressPct > 80 && p.progressPct < 83);
    } finally {
      console.info = orig;
      console.warn = w;
    }
    const reached = quiet(() => filterBreakoutsForPriceActionability([adani(1895)], { targetGateMode: 'shadow' }));
    assert.equal(reached.suppressed[0]?.gateReason, 'TARGET_REACHED');
  });

  it('enforce: both the 10:45 (82%) and the 09:40 (59%) alerts are suppressed as TARGET_NEAR', () => {
    const late = quiet(() => filterBreakoutsForPriceActionability([adani(1903.1)], { targetGateMode: 'enforce' }));
    assert.equal(late.suppressed[0]?.gateReason, 'TARGET_NEAR');
    const first = quiet(() => filterBreakoutsForPriceActionability([adani(1909.8)], { targetGateMode: 'enforce' }));
    assert.equal(first.suppressed[0]?.gateReason, 'TARGET_NEAR', 'documented side effect: the first alert was already 59% done');
  });

  it('a fresh setup near entry passes in every mode', () => {
    for (const mode of ['off', 'shadow', 'enforce'] as const) {
      const r = quiet(() => filterBreakoutsForPriceActionability([adani(1925)], { targetGateMode: mode }));
      assert.equal(r.actionable.length, 1, mode);
    }
  });

  it("'off' disables the gate entirely, including TARGET_REACHED", () => {
    const r = quiet(() => filterBreakoutsForPriceActionability([adani(1895)], { targetGateMode: 'off' }));
    assert.equal(r.actionable.length, 1);
  });

  it('LONG mirror: price through target is suppressed; ORB-style rows use the same entry/target semantics', () => {
    const long: BreakoutScanResult = {
      symbol: 'LONGTEST',
      signals: ['BREAKOUT'],
      alertKind: 'BREAKOUT',
      ltp: 101.2, // 1.2% from entry: inside the 2.5% extension cap, yet past target 1 (101)
      entry: 100,
      sl: 99,
      target: 101,
      rr: '1:2',
      score: 80,
      sector: 'IT',
      high: 101.3,
      low: 99.5,
      open: 100,
      previousClose: 99.5,
    };
    const r = quiet(() => filterBreakoutsForPriceActionability([long], { targetGateMode: 'shadow' }));
    assert.equal(r.suppressed[0]?.gateReason, 'TARGET_REACHED');
  });

  it('default mode honours env BREAKOUT_TARGET_GATE_MODE (shadow when unset or invalid)', () => {
    const orig = process.env.BREAKOUT_TARGET_GATE_MODE;
    try {
      delete process.env.BREAKOUT_TARGET_GATE_MODE;
      assert.equal(quiet(() => filterBreakoutsForPriceActionability([adani(1903.1)])).actionable.length, 1);
      process.env.BREAKOUT_TARGET_GATE_MODE = 'bogus';
      assert.equal(quiet(() => filterBreakoutsForPriceActionability([adani(1903.1)])).actionable.length, 1);
      process.env.BREAKOUT_TARGET_GATE_MODE = 'enforce';
      assert.equal(quiet(() => filterBreakoutsForPriceActionability([adani(1903.1)])).suppressed.length, 1);
    } finally {
      if (orig === undefined) delete process.env.BREAKOUT_TARGET_GATE_MODE;
      else process.env.BREAKOUT_TARGET_GATE_MODE = orig;
    }
  });
});
