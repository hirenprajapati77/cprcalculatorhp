import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VpaConfirmationService } from '../../services/vpa/vpa-confirmation.service';
import { scoreVpaBreakoutConfirm } from '../../services/vpa/breakout-confirm.service';
import { computeClv, computeRvol } from '../../services/vpa/vpa.math';
import { BtstRankingService } from '../../services/overnight/btst-ranking.service';
import { VPA_LIMITS } from '../../config/vpa.config';

const BASE_BTST_INPUTS = {
  volume: 300_000,
  avgVolume: 100_000,
  open: 98,
  tomorrowCprNarrow: true,
  tomorrowBc: 96,
  tomorrowTc: 104,
  todayBc: 95,
  todayTc: 103,
  close: 105,
  high: 106,
  low: 97,
  vwap: 100,
  intradayVolume: 50_000,
  last15mHigh: 104,
  hasConfirmationCandles: true,
  rsi14: 55,
  emaCross: { cross: 'BULLISH' as const, isBullishAlignment: true },
};

describe('VPA math helpers', () => {
  it('computeClv returns +1 at close on high', () => {
    assert.equal(computeClv(100, 100, 90), 1);
  });

  it('computeClv returns null on zero range', () => {
    assert.equal(computeClv(100, 100, 100), null);
  });

  it('computeRvol uses avgVolume denominator safely', () => {
    assert.equal(computeRvol(200_000, 100_000), 2);
    assert.equal(computeRvol(100, 0), null);
  });
});

describe('scoreVpaBreakoutConfirm', () => {
  it('returns null when there is no breakout attempt (inside CPR)', () => {
    const result = scoreVpaBreakoutConfirm({
      direction: 'LONG',
      open: 100,
      high: 101,
      low: 99,
      close: 100.3,
      volume: 80_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 110,
    });
    assert.deepEqual(result, { points: 0, flag: null });
  });

  it('confirms a volume+CLV-backed breakout above CPR', () => {
    const result = scoreVpaBreakoutConfirm({
      direction: 'LONG',
      open: 100,
      high: 112,
      low: 99,
      close: 111,
      volume: 200_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 105,
    });
    assert.deepEqual(result, { points: 3, flag: 'VPA_BREAKOUT_CONFIRMED' });
  });

  it('penalizes a weak breakout attempt above CPR', () => {
    const result = scoreVpaBreakoutConfirm({
      direction: 'LONG',
      open: 100,
      high: 108,
      low: 99,
      close: 106,
      volume: 80_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 105,
    });
    assert.deepEqual(result, { points: -2, flag: 'VPA_WEAK_BREAKOUT' });
  });

  it('confirms a volume+CLV-backed breakdown below CPR', () => {
    const result = scoreVpaBreakoutConfirm({
      direction: 'SHORT',
      open: 100,
      high: 101,
      low: 88,
      close: 89,
      volume: 200_000,
      avgVolume: 100_000,
      todayBc: 95,
      todayTc: 102,
    });
    assert.deepEqual(result, { points: 3, flag: 'VPA_BREAKDOWN_CONFIRMED' });
  });

  it('returns null when SHORT has no breakdown attempt', () => {
    const result = scoreVpaBreakoutConfirm({
      direction: 'SHORT',
      open: 100,
      high: 101,
      low: 99,
      close: 100.2,
      volume: 80_000,
      avgVolume: 100_000,
      todayBc: 95,
      todayTc: 102,
    });
    assert.deepEqual(result, { points: 0, flag: null });
  });
});

describe('VpaConfirmationService.analyze', () => {
  const prevVpaEnabled = process.env.VPA_ENABLED;

  beforeEach(() => {
    process.env.VPA_ENABLED = 'true';
  });

  afterEach(() => {
    if (prevVpaEnabled === undefined) delete process.env.VPA_ENABLED;
    else process.env.VPA_ENABLED = prevVpaEnabled;
  });

  it('rewards strong RVOL + close near high on LONG', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'LONG',
      open: 100,
      high: 110,
      low: 99,
      close: 109,
      volume: 250_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 105,
    });
    assert.ok(result.enabled);
    assert.ok(result.adjustment > 0);
    assert.ok(result.flags.includes('VPA_RVOL_STRONG'));
    assert.ok(Math.abs(result.adjustment) <= VPA_LIMITS.MAX_ADJUSTMENT);
  });

  it('penalizes weak RVOL on LONG without weak-breakout mislabel', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'LONG',
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 80_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 102,
    });
    assert.ok(result.flags.includes('VPA_RVOL_WEAK'));
    assert.ok(result.breakdown.rvol < 0);
    // Quiet day inside CPR must NOT be mislabeled as a weak breakout.
    assert.ok(!result.flags.includes('VPA_WEAK_BREAKOUT'));
    assert.equal(result.breakdown.breakoutConfirm, 0);
  });

  it('detects buying climax and recommends reject', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'LONG',
      open: 100,
      high: 112,
      low: 99,
      close: 106,
      volume: 300_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 105,
    });
    assert.ok(result.flags.includes('VPA_BUYING_CLIMAX'));
    assert.equal(result.rejectRecommended, true);
    assert.ok(result.breakdown.buyingClimax < 0);
  });

  it('detects absorption (high volume, tiny range)', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'LONG',
      open: 100,
      high: 100.04,
      low: 99.96,
      close: 100.01,
      volume: 250_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 101,
    });
    assert.ok(result.flags.includes('VPA_ABSORPTION'));
    assert.ok(result.breakdown.effortResult < 0);
  });

  it('detects no demand on narrow up-day', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'LONG',
      open: 100,
      high: 100.5,
      low: 99.9,
      close: 100.3,
      volume: 70_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 101,
    });
    assert.ok(result.flags.includes('VPA_NO_DEMAND'));
    assert.ok(result.breakdown.noDemand < 0);
  });

  it('returns disabled result when VPA_ENABLED=false', () => {
    process.env.VPA_ENABLED = 'false';
    const result = VpaConfirmationService.analyze({
      direction: 'SHORT',
      open: 100,
      high: 101,
      low: 90,
      close: 91,
      volume: 300_000,
      avgVolume: 100_000,
      todayBc: 92,
      todayTc: 98,
    });
    assert.equal(result.enabled, false);
    assert.equal(result.adjustment, 0);
  });
});

describe('BtstRankingService VPA shadow integration', () => {
  it('does not change the authoritative 130pt score', () => {
    const withoutOpen = BtstRankingService.calculateScoreDetails(BASE_BTST_INPUTS);
    const withOpen = BtstRankingService.calculateScoreDetails({
      ...BASE_BTST_INPUTS,
      open: 98,
    });
    assert.equal(withoutOpen.score, withOpen.score);
    assert.ok(withOpen.vpa?.enabled);
    assert.ok(typeof withOpen.vpa?.adjustment === 'number');
  });

  it('returns null score unchanged when inputs invalid', () => {
    const details = BtstRankingService.calculateScoreDetails({
      ...BASE_BTST_INPUTS,
      vwap: null,
    });
    assert.equal(details.score, null);
    assert.equal(details.vpa, undefined);
  });
});

describe('VpaConfirmationService.applyConfidenceDelta', () => {
  it('leaves confidence unchanged when adjustment is zero', () => {
    assert.equal(
      VpaConfirmationService.applyConfidenceDelta(72, {
        enabled: true,
        direction: 'LONG',
        confirmed: true,
        adjustment: 0,
        maxAdjustment: 19,
        breakdown: {
          rvol: 0,
          clv: 0,
          effortResult: 0,
          breakoutConfirm: 0,
          buyingClimax: 0,
          sellingClimax: 0,
          noDemand: 0,
          noSupply: 0,
        },
        flags: [],
        metrics: {
          rvol: null,
          clv: null,
          rangePct: null,
          upperWickRatio: null,
          lowerWickRatio: null,
        },
        rejectRecommended: false,
        rejectReason: null,
      }),
      72
    );
  });
});
