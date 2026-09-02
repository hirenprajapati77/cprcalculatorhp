import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MomentumLeadersService,
  OhlcvCandleWithPrevClose,
} from '@/services/market-tools/momentum-leaders.service';
import { classifyBreakoutVpa } from '@/services/vpa/vpa.math';

describe('MomentumLeadersService - Unit Tests', () => {
  describe('Compounded Daily Return Calculation', () => {
    it('computes accurate 1-day return using close and prevClose', () => {
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-08-28', open: 100, high: 102, low: 99, close: 100, prevClose: 98, volume: 100000 },
        { date: '2026-09-01', open: 101, high: 106, low: 100, close: 105, prevClose: 100, volume: 150000 },
      ];
      const r1 = MomentumLeadersService.computeCompoundedReturn(candles, 1);
      // (105 - 100) / 100 = +5.0%
      assert.equal(r1, 5.0);
    });

    it('compounds multi-day returns across k trading sessions', () => {
      // Day 1: 100 -> 102 (+2%)
      // Day 2: 102 -> 104.04 (+2%)
      // Day 3: 104.04 -> 107.1612 (+3%)
      // Cumulative: (1.02 * 1.02 * 1.03) - 1 = 1.071612 - 1 = +7.16%
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-08-27', open: 98, high: 102, low: 98, close: 100, prevClose: 99, volume: 100000 },
        { date: '2026-08-28', open: 100, high: 103, low: 100, close: 102, prevClose: 100, volume: 100000 },
        { date: '2026-08-29', open: 102, high: 105, low: 101, close: 104.04, prevClose: 102, volume: 100000 },
        { date: '2026-09-01', open: 104, high: 108, low: 103, close: 107.1612, prevClose: 104.04, volume: 100000 },
      ];
      const r3 = MomentumLeadersService.computeCompoundedReturn(candles, 3);
      assert.equal(r3, 7.16);
    });

    it('immunizes return against stock splits via exchange-adjusted prevClose', () => {
      // 1:1 bonus / 2:1 stock split on Day 2:
      // Day 1: close = 1000, prevClose = 980 (+2.04%)
      // Day 2 (Ex-Date): NSE adjusts prevClose to 500. Stock closes at 510 (+2.0%)
      // Total return across the 2 days should be (1 + 0.0204) * (1 + 0.02) - 1 = +4.08%
      // A naive unadjusted close comparison (510 - 980)/980 would show a fake -47.96% crash!
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-08-28', open: 980, high: 1010, low: 975, close: 1000, prevClose: 980, volume: 100000 },
        { date: '2026-09-01', open: 505, high: 520, low: 495, close: 510, prevClose: 500, volume: 200000 },
      ];
      const r2 = MomentumLeadersService.computeCompoundedReturn(candles, 2);
      assert.ok(r2 > 4.0 && r2 < 4.2, `Split-adjusted return must be ~+4.08%, received ${r2}%`);
    });

    it('returns 0 when candles length is less than requested window k', () => {
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-09-01', open: 100, high: 105, low: 99, close: 102, prevClose: 100, volume: 50000 },
      ];
      const r5 = MomentumLeadersService.computeCompoundedReturn(candles, 5);
      assert.equal(r5, 0);
    });
  });

  describe('Bounded Additive Composite Scoring Formula', () => {
    it('scores Stock A (Persistent 4-window leader) at ~95 with CONFIRMED and ~90 with NEUTRAL', () => {
      // Percentiles: 95, 92, 96, 94
      // Base: 0.85 * (0.15*95 + 0.25*92 + 0.30*96 + 0.30*94) = 0.85 * 94.25 = 80.1125
      // Consistency: 4 windows >= 85 => 4 * 2.5 = +10.0
      // Dispersion: sample std = 1.7078 => penalty = 0.1708
      // Subtotal = 80.11 + 10.0 - 0.17 = 89.94
      // With CONFIRMED (+5): 89.94 + 5 = 94.94 => 95 (Tier A+)
      // With NEUTRAL (0): 89.94 => 90 (Tier A+)
      const resConfirmed = MomentumLeadersService.calculateCompositeScore({
        p1d: 95,
        p5d: 92,
        p10d: 96,
        p21d: 94,
        vpaModifier: 5,
      });

      assert.equal(resConfirmed.leaderWindowCount, 4);
      assert.equal(resConfirmed.compositeScore, 95);
      assert.equal(resConfirmed.tier, 'A+');

      const resNeutral = MomentumLeadersService.calculateCompositeScore({
        p1d: 95,
        p5d: 92,
        p10d: 96,
        p21d: 94,
        vpaModifier: 0,
      });
      assert.equal(resNeutral.compositeScore, 90);
      assert.equal(resNeutral.tier, 'A+');
    });

    it('penalizes Stock B (Single-day spike / dead-cat bounce) to Tier C', () => {
      // Percentiles: 98 (1D), 40 (5D), 25 (10D), 10 (21D)
      // Base: 0.85 * (0.15*98 + 0.25*40 + 0.30*25 + 0.30*10) = 0.85 * 35.2 = 29.92
      // Consistency: only 1 window >= 85 => 1 * 2.5 = +2.5
      // Dispersion penalty: sample std ~ 38.5 => 0.10 * 38.5 = 3.85
      // Pre-VPA subtotal = 29.92 + 2.5 - 3.85 = 28.57
      // With CONFIRMED (+5): 33.57 => 34 (Tier C)
      // With NO_DEMAND (-3): 25.57 => 26 (Tier C)
      const resConfirmed = MomentumLeadersService.calculateCompositeScore({
        p1d: 98,
        p5d: 40,
        p10d: 25,
        p21d: 10,
        vpaModifier: 5,
      });
      assert.equal(resConfirmed.leaderWindowCount, 1);
      assert.equal(resConfirmed.compositeScore, 34);
      assert.equal(resConfirmed.tier, 'C');

      const resNoDemand = MomentumLeadersService.calculateCompositeScore({
        p1d: 98,
        p5d: 40,
        p10d: 25,
        p21d: 10,
        vpaModifier: -3,
      });
      assert.equal(resNoDemand.compositeScore, 26);
      assert.equal(resNoDemand.tier, 'C');
    });

    it('scores Stock C (Steady 3-window leader) at Tier A (~87 with CONFIRMED)', () => {
      // Percentiles: 70 (1D), 92 (5D), 90 (10D), 94 (21D)
      const res = MomentumLeadersService.calculateCompositeScore({
        p1d: 70,
        p5d: 92,
        p10d: 90,
        p21d: 94,
        vpaModifier: 5,
      });
      assert.equal(res.leaderWindowCount, 3);
      assert.equal(res.compositeScore, 87);
      assert.equal(res.tier, 'A');
    });

    it('reaches exactly 100 for undisputed #1 leader without ceiling saturation', () => {
      // Rank 1 in every window (100th percentile) with CONFIRMED volume (+5)
      // Base: 0.85 * 100 = 85.0
      // Consistency: 4 * 2.5 = 10.0
      // Dispersion: 0
      // VPA: +5
      // Total = 85 + 10 + 5 = 100.0
      const res = MomentumLeadersService.calculateCompositeScore({
        p1d: 100,
        p5d: 100,
        p10d: 100,
        p21d: 100,
        vpaModifier: 5,
      });
      assert.equal(res.compositeScore, 100);
      assert.equal(res.tier, 'A+');

      // Crucial verification: a modest 4-window leader does NOT get clamped to 100!
      const modestLeader = MomentumLeadersService.calculateCompositeScore({
        p1d: 86,
        p5d: 86,
        p10d: 86,
        p21d: 86,
        vpaModifier: 5,
      });
      // Base: 0.85 * 86 = 73.1
      // Consistency: 4 * 2.5 = 10.0
      // Dispersion: 0
      // VPA: +5
      // Total = 73.1 + 10 + 5 = 88.1 => 88 (Tier A)
      assert.equal(modestLeader.compositeScore, 88);
      assert.ok(modestLeader.compositeScore < 100, 'Modest leader must not saturate to 100');
    });
  });

  describe('VPA Modifier Integration', () => {
    it('uses exact scoreModifiers from classifyBreakoutVpa', () => {
      // RVOL >= 1.5 and CLV >= 0.3 => CONFIRMED (+5)
      const confirmed = classifyBreakoutVpa(1.8, 0.4);
      assert.equal(confirmed.status, 'CONFIRMED');
      assert.equal(confirmed.scoreModifier, 5);

      // RVOL >= 1.2 and tight range <= 0.025 => ABSORPTION (+5)
      const absorption = classifyBreakoutVpa(1.3, 0.1, 0.02);
      assert.equal(absorption.status, 'ABSORPTION');
      assert.equal(absorption.scoreModifier, 5);

      // RVOL < 0.8 => NO_DEMAND (-3)
      const noDemand = classifyBreakoutVpa(0.5, 0.2);
      assert.equal(noDemand.status, 'NO_DEMAND');
      assert.equal(noDemand.scoreModifier, -3);

      // RVOL >= 1.5 and CLV <= -0.2 => CLIMAX_REJECT (-10)
      const climaxReject = classifyBreakoutVpa(2.0, -0.4);
      assert.equal(climaxReject.status, 'CLIMAX_REJECT');
      assert.equal(climaxReject.scoreModifier, -10);

      // Neutral
      const neutral = classifyBreakoutVpa(1.0, 0.0);
      assert.equal(neutral.status, 'NEUTRAL');
      assert.equal(neutral.scoreModifier, 0);
    });
  });
});
