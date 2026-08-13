import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPTION_PCR } from '@/config/trading-constants';
import {
  filterBreakoutsForPcrAlignment,
  optionPcrContradictsDirection,
} from '@/services/alert/breakout-pcr-gate';
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
    ...overrides,
  };
}

describe('optionPcrContradictsDirection', () => {
  it('blocks CE when PCR is bearish (< 0.8)', () => {
    assert.equal(optionPcrContradictsDirection('CE', 0.7291), true);
    assert.equal(optionPcrContradictsDirection('CE', OPTION_PCR.BEARISH_MAX - 0.001), true);
  });

  it('blocks PE when PCR is bullish (> 1.2)', () => {
    assert.equal(optionPcrContradictsDirection('PE', 1.35), true);
  });

  it('allows CE/PE in the neutral band and confirming PCR', () => {
    assert.equal(optionPcrContradictsDirection('CE', 1.0), false);
    assert.equal(optionPcrContradictsDirection('CE', 1.3), false);
    assert.equal(optionPcrContradictsDirection('PE', 0.7), false);
    assert.equal(optionPcrContradictsDirection('PE', 1.0), false);
  });

  it('fails open when type or PCR is missing', () => {
    assert.equal(optionPcrContradictsDirection(undefined, 0.5), false);
    assert.equal(optionPcrContradictsDirection('CE', undefined), false);
  });
});

describe('filterBreakoutsForPcrAlignment', () => {
  it('LICI-style: suppresses CE suggestion on bearish PCR 0.73', () => {
    const result = filterBreakoutsForPcrAlignment([
      base({
        symbol: 'LICI',
        optionSuggestion: {
          type: 'CE',
          pcr: 0.7291,
          formattedName: 'LICI AUG 2026 410 CE',
          ltp: 8.7,
        },
      }),
    ]);
    assert.equal(result.actionable.length, 0);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0].gateReason, 'PCR_CONTRADICTS');
  });

  it('keeps cash alert when option suggestion is missing', () => {
    const row = base({ symbol: 'NOSUGGEST' });
    const result = filterBreakoutsForPcrAlignment([row]);
    assert.equal(result.suppressed.length, 0);
    assert.deepEqual(result.actionable, [row]);
  });

  it('keeps CE when PCR is bullish', () => {
    const result = filterBreakoutsForPcrAlignment([
      base({
        optionSuggestion: { type: 'CE', pcr: 1.4, formattedName: 'AAA CE' },
      }),
    ]);
    assert.equal(result.actionable.length, 1);
    assert.equal(result.suppressed.length, 0);
  });
});
