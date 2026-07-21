import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IndexRegimeService } from '../../services/overnight/index-regime.service';
import { INDEX_REGIME } from '../../config/trading-constants';

describe('IndexRegimeService.computeAdjustment', () => {
  const bullLow = { trend: 'BULL' as const, volatility: 'LOW' as const, score: 80 };
  const bearHigh = { trend: 'BEAR' as const, volatility: 'HIGH' as const, score: 20 };
  const choppyLow = { trend: 'CHOPPY' as const, volatility: 'LOW' as const, score: 50 };

  it('boosts LONG in bullish low-vol regime', () => {
    const ctx = IndexRegimeService.computeAdjustment('LONG', bullLow);
    assert.equal(ctx.adjustment, INDEX_REGIME.ALIGNED_BOOST);
    assert.match(ctx.reason, /bullish trend/i);
  });

  it('penalizes LONG in bearish high-vol regime', () => {
    const ctx = IndexRegimeService.computeAdjustment('LONG', bearHigh);
    assert.equal(ctx.adjustment, INDEX_REGIME.COUNTER_PENALTY + INDEX_REGIME.HIGH_VOL_PENALTY);
  });

  it('boosts SHORT in bearish regime', () => {
    const ctx = IndexRegimeService.computeAdjustment('SHORT', bearHigh);
    assert.equal(ctx.adjustment, INDEX_REGIME.ALIGNED_BOOST + INDEX_REGIME.HIGH_VOL_PENALTY);
  });

  it('returns neutral adjustment in choppy low-vol regime', () => {
    const ctx = IndexRegimeService.computeAdjustment('LONG', choppyLow);
    assert.equal(ctx.adjustment, 0);
  });
});

describe('IndexRegimeService.applyConfidence', () => {
  it('clamps confidence to max score', () => {
    assert.equal(IndexRegimeService.applyConfidence(125, 10, 130), 130);
  });

  it('returns null when base score is null', () => {
    assert.equal(IndexRegimeService.applyConfidence(null, 10, 130), null);
  });

  it('floors confidence at zero', () => {
    assert.equal(IndexRegimeService.applyConfidence(5, -15, 130), 0);
  });
});
