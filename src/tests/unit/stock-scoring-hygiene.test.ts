import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOvernightConflict } from '../../services/overnight/overnight-conflict';
import { BtstRankingService } from '../../services/overnight/btst-ranking.service';
import { StbtRankingService } from '../../services/overnight/stbt-ranking.service';
import { VOLUME_THRESHOLDS } from '../../config/trading-constants';

function side(score: number | null, cls = 'BTST_READY') {
  return { score, cls, sl: 95, target: 110, scoreBreakdown: null };
}

describe('resolveOvernightConflict — null scores ineligible', () => {
  it('picks higher non-null side and marks NEUTRAL_CONFLICT when diff < 10', () => {
    const r = resolveOvernightConflict(side(80), side(71));
    assert.equal(r.finalDir, 'LONG');
    assert.equal(r.finalCls, 'NEUTRAL_CONFLICT');
  });

  it('does not mark conflict when diff >= 10', () => {
    const r = resolveOvernightConflict(side(80), side(70));
    assert.equal(r.finalDir, 'LONG');
    assert.equal(r.finalCls, 'IGNORE'); // caller overwrites with winner cls
  });

  it('ignores LONG when score is null — SHORT wins', () => {
    const r = resolveOvernightConflict(side(null), side(85, 'STBT_READY'));
    assert.equal(r.finalDir, 'SHORT');
    assert.equal(r.finalSig?.score, 85);
    assert.notEqual(r.finalCls, 'NEUTRAL_CONFLICT');
  });

  it('ignores SHORT when score is null — LONG wins', () => {
    const r = resolveOvernightConflict(side(90), side(null));
    assert.equal(r.finalDir, 'LONG');
    assert.equal(r.finalSig?.score, 90);
  });

  it('returns null direction when both scores are null', () => {
    const r = resolveOvernightConflict(side(null), side(null));
    assert.equal(r.finalDir, null);
    assert.equal(r.finalSig, null);
  });

  it('does not coerce null to 0 (null LONG vs SHORT 5 must not create conflict)', () => {
    // Old bug: (null||0) vs 5 → diff 5 → NEUTRAL_CONFLICT with LONG "winning"
    const r = resolveOvernightConflict(side(null), side(5, 'WATCH'));
    assert.equal(r.finalDir, 'SHORT');
    assert.notEqual(r.finalCls, 'NEUTRAL_CONFLICT');
  });
});

describe('VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5×', () => {
  const baseBtst = {
    tomorrowCprNarrow: false,
    tomorrowBc: 100,
    tomorrowTc: 101,
    todayBc: 99,
    todayTc: 100,
    close: 100,
    high: 102,
    low: 98,
    vwap: 100,
    intradayVolume: 50000,
    last15mHigh: 101,
    hasConfirmationCandles: true,
    avgVolume: 800_000,
  };

  it('does not award VDU at eligibility floor (1.5×)', () => {
    const details = BtstRankingService.calculateScoreDetails({
      ...baseBtst,
      volume: VOLUME_THRESHOLDS.BREAKOUT_RATIO * 800_000, // exactly 1.5×
    });
    assert.equal(details.breakdown?.vdu, 0);
  });

  it('awards VDU at SPIKE_RATIO (2.0×)', () => {
    const details = BtstRankingService.calculateScoreDetails({
      ...baseBtst,
      volume: VOLUME_THRESHOLDS.SPIKE_RATIO * 800_000,
    });
    assert.equal(details.breakdown?.vdu, 25);
  });

  it('STBT mirrors the same VDU scoring threshold', () => {
    const baseStbt = {
      tomorrowCprNarrow: false,
      tomorrowTc: 99,
      tomorrowBc: 98,
      todayBc: 100,
      todayTc: 101,
      close: 99,
      high: 102,
      low: 98,
      vwap: 100,
      intradayVolume: 50000,
      last15mLow: 99.5,
      hasConfirmationCandles: true,
      avgVolume: 800_000,
    };
    const atGate = StbtRankingService.calculateScoreDetails({
      ...baseStbt,
      volume: VOLUME_THRESHOLDS.BREAKOUT_RATIO * 800_000,
    });
    const atSpike = StbtRankingService.calculateScoreDetails({
      ...baseStbt,
      volume: VOLUME_THRESHOLDS.SPIKE_RATIO * 800_000,
    });
    assert.equal(atGate.breakdown?.vdu, 0);
    assert.equal(atSpike.breakdown?.vdu, 25);
  });
});
