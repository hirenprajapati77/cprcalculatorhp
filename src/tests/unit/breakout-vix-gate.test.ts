import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BREAKOUT_VIX } from '@/config/trading-constants';
import {
  filterBreakoutsForVixRegime,
  resolveBreakoutVixPolicy,
} from '@/services/alert/breakout-vix-gate';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';
import type { IndiaVixState } from '@/services/overnight/index-discover.service';

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
    ...overrides,
  };
}

describe('resolveBreakoutVixPolicy', () => {
  it('pauses when VIX >= PAUSE_ALERTS_MIN', () => {
    const policy = resolveBreakoutVixPolicy({
      elevated: true,
      vixCalm: false,
      latestClose: 26.2,
    });
    assert.equal(policy.pauseAll, true);
    assert.equal(policy.regimeLabel, 'pause');
  });

  it('tightens when VIX is in 18–24 band', () => {
    const policy = resolveBreakoutVixPolicy({
      elevated: false,
      vixCalm: false,
      latestClose: 19.5,
    });
    assert.equal(policy.pauseAll, false);
    assert.equal(policy.regimeLabel, 'tighten');
    assert.equal(policy.entryExtensionPct, BREAKOUT_VIX.TIGHTENED_ENTRY_EXTENSION_PCT);
    assert.equal(policy.minScore, BREAKOUT_VIX.TIGHTEN_MIN_SCORE);
  });

  it('is calm below TIGHTEN_MIN', () => {
    const policy = resolveBreakoutVixPolicy({
      elevated: false,
      vixCalm: true,
      latestClose: 16,
    });
    assert.equal(policy.regimeLabel, 'calm');
    assert.equal(policy.entryExtensionPct, null);
    assert.equal(policy.minScore, null);
  });
});

describe('filterBreakoutsForVixRegime', () => {
  it('suppresses all alerts when VIX is elevated', () => {
    const vixState: IndiaVixState = {
      elevated: true,
      vixCalm: false,
      latestClose: 27,
    };
    const result = filterBreakoutsForVixRegime([base(), base({ symbol: 'AAA' })], vixState);
    assert.equal(result.actionable.length, 0);
    assert.equal(result.suppressed.length, 2);
    assert.equal(result.suppressed[0]!.gateReason, 'VIX_ELEVATED');
  });

  it('requires min score in tighten band', () => {
    const vixState: IndiaVixState = {
      elevated: false,
      vixCalm: false,
      latestClose: 20,
    };
    const result = filterBreakoutsForVixRegime(
      [
        base({ symbol: 'LOW', score: 70 }),
        base({ symbol: 'HIGH', score: 90 }),
      ],
      vixState
    );
    assert.equal(result.actionable.length, 1);
    assert.equal(result.actionable[0]!.symbol, 'HIGH');
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0]!.gateReason, 'VIX_TIGHTEN_SCORE');
  });

  it('passes through when VIX is calm', () => {
    const vixState: IndiaVixState = {
      elevated: false,
      vixCalm: true,
      latestClose: 15,
    };
    const rows = [base({ score: 50 })];
    const result = filterBreakoutsForVixRegime(rows, vixState);
    assert.deepEqual(result.actionable, rows);
    assert.equal(result.suppressed.length, 0);
  });
});
