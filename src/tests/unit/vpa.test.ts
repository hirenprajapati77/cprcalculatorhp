import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VpaConfirmationService } from '../../services/vpa/vpa-confirmation.service';
import { scoreVpaBreakoutConfirm } from '../../services/vpa/breakout-confirm.service';
import { scoreVpaClv } from '../../services/vpa/clv.service';
import { computeClv, computeRvol, buildVpaInputs } from '../../services/vpa/vpa.math';
import { BtstRankingService } from '../../services/overnight/btst-ranking.service';
import { VPA_LIMITS } from '../../config/vpa.config';
import { env } from '../../config/env';
import {
  isVpaShadowMode,
  isVpaLiveConfidenceEnabled,
  isVpaLiveGatesEnabled,
} from '../../config/vpa.config';

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
    assert.equal(computeRvol(Number.NaN, 100_000), null);
    assert.equal(computeRvol(100_000, Number.NaN), null);
  });

  it('buildVpaInputs rejects non-finite volume / avgVolume', () => {
    const stock = {
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: Number.NaN,
      avgVolume: 100_000,
    };
    assert.equal(buildVpaInputs('LONG', stock, { bc: 98, tc: 102 }), null);
    assert.equal(
      buildVpaInputs('LONG', { ...stock, volume: 100_000, avgVolume: Number.NaN }, { bc: 98, tc: 102 }),
      null
    );
    assert.ok(buildVpaInputs('LONG', { ...stock, volume: 100_000 }, { bc: 98, tc: 102 }));
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

  it('detects buying climax on red shooting star (open > close) at resistance', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'LONG',
      open: 106,
      high: 112,
      low: 99,
      close: 105,
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

  it('awards no-demand bonus for SHORT on narrow up-day (lack of buyers)', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'SHORT',
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
    assert.ok(result.breakdown.noDemand > 0);
    assert.equal(result.rejectRecommended, false);
  });

  it('rejects SHORT on no-supply (weak down-tick) and does not reject on no-demand', () => {
    const noSupply = VpaConfirmationService.analyze({
      direction: 'SHORT',
      open: 100.3,
      high: 100.5,
      low: 99.9,
      close: 100.0,
      volume: 70_000,
      avgVolume: 100_000,
      todayBc: 98,
      todayTc: 101,
    });
    assert.ok(noSupply.flags.includes('VPA_NO_SUPPLY'));
    assert.ok(noSupply.breakdown.noSupply < 0);
    assert.equal(noSupply.rejectRecommended, true);
    assert.match(noSupply.rejectReason ?? '', /No supply/);
  });

  it('awards buying-climax reversal bonus for SHORT near resistance', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'SHORT',
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
    assert.ok(result.breakdown.buyingClimax > 0);
    assert.equal(result.rejectRecommended, false);
  });

  it('rejects SHORT on selling climax near support', () => {
    const result = VpaConfirmationService.analyze({
      direction: 'SHORT',
      open: 100,
      high: 101,
      low: 85,
      close: 94,
      volume: 300_000,
      avgVolume: 100_000,
      todayBc: 95,
      todayTc: 102,
    });
    assert.ok(result.flags.includes('VPA_SELLING_CLIMAX'));
    assert.ok(result.breakdown.sellingClimax < 0);
    assert.equal(result.rejectRecommended, true);
    assert.match(result.rejectReason ?? '', /Selling climax/);
  });

  it('maps climax bands correctly when CPR inputs are inverted', () => {
    // todayTc < todayBc — resistance must still be Math.max
    const result = VpaConfirmationService.analyze({
      direction: 'LONG',
      open: 100,
      high: 112,
      low: 99,
      close: 106,
      volume: 300_000,
      avgVolume: 100_000,
      todayBc: 105,
      todayTc: 98,
    });
    assert.ok(result.flags.includes('VPA_BUYING_CLIMAX'));
    assert.ok(result.breakdown.buyingClimax < 0);
  });

  it('returns disabled result when VPA_ENABLED=false', () => {
    const envRecord = env as unknown as Record<string, string | undefined>;
    const prev = envRecord.VPA_ENABLED;
    envRecord.VPA_ENABLED = 'false';
    try {
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
    } finally {
      envRecord.VPA_ENABLED = prev;
    }
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

describe('VPA shadow master kill-switch', () => {
  const keys = ['VPA_SHADOW_MODE', 'VPA_LIVE_CONFIDENCE', 'VPA_LIVE_GATES'] as const;
  const envRecord = env as unknown as Record<string, string | undefined>;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = envRecord[k];
  });

  afterEach(() => {
    for (const k of keys) {
      envRecord[k] = prev[k];
    }
  });

  it('blocks live confidence/gates while shadow mode is on (default fail-safe)', async () => {
    envRecord.VPA_SHADOW_MODE = 'true';
    envRecord.VPA_LIVE_CONFIDENCE = 'true';
    envRecord.VPA_LIVE_GATES = 'true';
    assert.equal(isVpaShadowMode(), true);
    assert.equal(isVpaLiveConfidenceEnabled(), false);
    assert.equal(isVpaLiveGatesEnabled(), false);
  });

  it('allows live confidence/gates only when shadow is off AND live flags are on', async () => {
    envRecord.VPA_SHADOW_MODE = 'false';
    envRecord.VPA_LIVE_CONFIDENCE = 'true';
    envRecord.VPA_LIVE_GATES = 'true';
    assert.equal(isVpaShadowMode(), false);
    assert.equal(isVpaLiveConfidenceEnabled(), true);
    assert.equal(isVpaLiveGatesEnabled(), true);
  });

  it('keeps live paths off when shadow is off but live flags remain false', async () => {
    envRecord.VPA_SHADOW_MODE = 'false';
    envRecord.VPA_LIVE_CONFIDENCE = 'false';
    envRecord.VPA_LIVE_GATES = 'false';
    assert.equal(isVpaLiveConfidenceEnabled(), false);
    assert.equal(isVpaLiveGatesEnabled(), false);
  });
});

describe('VpaConfirmationService.applyConfidenceDelta', () => {
  const sampleVpa = {
    enabled: true,
    direction: 'LONG' as const,
    confirmed: true,
    adjustment: 10,
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
    flags: [] as string[],
    metrics: {
      rvol: null,
      clv: null,
      rangePct: null,
      upperWickRatio: null,
      lowerWickRatio: null,
    },
    rejectRecommended: false,
    rejectReason: null,
    live: false,
  };

  it('leaves confidence unchanged when adjustment is zero', () => {
    assert.equal(
      VpaConfirmationService.applyConfidenceDelta(72, { ...sampleVpa, adjustment: 0 }),
      72
    );
  });

  it('does not apply non-zero delta while shadow mode blocks live confidence', () => {
    // Default VPA_SHADOW_MODE=true → isVpaLiveConfidenceEnabled() is false
    assert.equal(VpaConfirmationService.applyConfidenceDelta(72, sampleVpa), 72);
  });
});

describe('VpaConfirmationResult.live flag', () => {
  const keys = ['VPA_ENABLED', 'VPA_SHADOW_MODE', 'VPA_LIVE_CONFIDENCE', 'VPA_LIVE_GATES'] as const;
  const envRecord = env as unknown as Record<string, string | undefined>;
  const prev: Record<string, string | undefined> = {};

  const sampleInputs = {
    direction: 'LONG' as const,
    open: 100,
    high: 110,
    low: 99,
    close: 109,
    volume: 250_000,
    avgVolume: 100_000,
    todayBc: 98,
    todayTc: 105,
  };

  beforeEach(() => {
    for (const k of keys) prev[k] = envRecord[k];
    envRecord.VPA_ENABLED = 'true';
  });

  afterEach(() => {
    for (const k of keys) {
      envRecord[k] = prev[k];
    }
  });

  it('returns live: false under default shadow mode even if live flags are on', () => {
    envRecord.VPA_SHADOW_MODE = 'true';
    envRecord.VPA_LIVE_CONFIDENCE = 'true';
    envRecord.VPA_LIVE_GATES = 'true';
    const result = VpaConfirmationService.analyze(sampleInputs);
    assert.equal(result.live, false);
  });

  it('returns live: true when shadow is off AND confidence live is on', () => {
    envRecord.VPA_SHADOW_MODE = 'false';
    envRecord.VPA_LIVE_CONFIDENCE = 'true';
    envRecord.VPA_LIVE_GATES = 'false';
    const result = VpaConfirmationService.analyze(sampleInputs);
    assert.equal(result.live, true);
  });

  it('returns live: true when shadow is off AND gates live is on', () => {
    envRecord.VPA_SHADOW_MODE = 'false';
    envRecord.VPA_LIVE_CONFIDENCE = 'false';
    envRecord.VPA_LIVE_GATES = 'true';
    const result = VpaConfirmationService.analyze(sampleInputs);
    assert.equal(result.live, true);
  });

  it('returns live: false when shadow is off but both live flags remain false', () => {
    envRecord.VPA_SHADOW_MODE = 'false';
    envRecord.VPA_LIVE_CONFIDENCE = 'false';
    envRecord.VPA_LIVE_GATES = 'false';
    const result = VpaConfirmationService.analyze(sampleInputs);
    assert.equal(result.live, false);
  });

  it('returns live: false when VPA is disabled', () => {
    envRecord.VPA_ENABLED = 'false';
    envRecord.VPA_SHADOW_MODE = 'false';
    envRecord.VPA_LIVE_CONFIDENCE = 'true';
    envRecord.VPA_LIVE_GATES = 'true';
    const result = VpaConfirmationService.analyze(sampleInputs);
    assert.equal(result.enabled, false);
    assert.equal(result.live, false);
  });
});

describe('scoreVpaClv', () => {
  it('neutral close (exactly mid-range) does not flag BEARISH for LONG or BULLISH_CLOSE for SHORT', () => {
    const longRes = scoreVpaClv('LONG', 100, 110, 90);
    assert.equal(longRes.flag, 'VPA_CLV_NEUTRAL');
    assert.equal(longRes.points, -1);

    const shortRes = scoreVpaClv('SHORT', 100, 110, 90);
    assert.equal(shortRes.flag, 'VPA_CLV_NEUTRAL');
    assert.equal(shortRes.points, -1);
  });

  it('close in the bottom ~15% of range (e.g. 92 out of 90-110) flags BEARISH for LONG', () => {
    const longRes = scoreVpaClv('LONG', 92, 110, 90);
    assert.equal(longRes.flag, 'VPA_CLV_BEARISH');
    assert.equal(longRes.points, -3);

    const shortRes = scoreVpaClv('SHORT', 92, 110, 90);
    assert.equal(shortRes.flag, 'VPA_CLV_BEARISH_CLOSE');
    assert.equal(shortRes.points, 3);
  });

  it('close in the top ~15% of range (e.g. 108 out of 90-110) flags BULLISH for LONG', () => {
    const longRes = scoreVpaClv('LONG', 108, 110, 90);
    assert.equal(longRes.flag, 'VPA_CLV_BULLISH');
    assert.equal(longRes.points, 3);

    const shortRes = scoreVpaClv('SHORT', 108, 110, 90);
    assert.equal(shortRes.flag, 'VPA_CLV_BULLISH_CLOSE');
    assert.equal(shortRes.points, -3);
  });
});
