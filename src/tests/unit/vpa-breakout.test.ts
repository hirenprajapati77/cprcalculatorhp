import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBreakoutVpa,
  computeClv,
  computeRvol,
  computeRangePct,
} from '@/services/vpa/vpa.math';
import { PatternBreakoutService } from '@/services/market-tools/pattern-breakout.service';

describe('VPA Breakout Footprint Math & Classification', () => {
  it('classifies strong close on high volume as CONFIRMED (+5 pts)', () => {
    const vpa = classifyBreakoutVpa(2.2, 0.75, 0.035);
    assert.equal(vpa.status, 'CONFIRMED');
    assert.equal(vpa.scoreModifier, 5);
    assert.equal(vpa.badgeVariant, 'success');
  });

  it('classifies high-volume upper-wick rejection as CLIMAX_REJECT (-10 pts)', () => {
    const vpa = classifyBreakoutVpa(2.5, -0.45, 0.04);
    assert.equal(vpa.status, 'CLIMAX_REJECT');
    assert.equal(vpa.scoreModifier, -10);
    assert.equal(vpa.badgeVariant, 'danger');
  });

  it('classifies tight accumulation on above-average volume as ABSORPTION (+5 pts)', () => {
    const vpa = classifyBreakoutVpa(1.4, 0.2, 0.018);
    assert.equal(vpa.status, 'ABSORPTION');
    assert.equal(vpa.scoreModifier, 5);
    assert.equal(vpa.badgeVariant, 'info');
  });

  it('classifies low volume breakout attempt as NO_DEMAND (-3 pts)', () => {
    const vpa = classifyBreakoutVpa(0.6, 0.5, 0.02);
    assert.equal(vpa.status, 'NO_DEMAND');
    assert.equal(vpa.scoreModifier, -3);
    assert.equal(vpa.badgeVariant, 'warning');
  });

  it('handles null / missing volume and CLV gracefully as NEUTRAL (0 pts)', () => {
    const vpa = classifyBreakoutVpa(null, null);
    assert.equal(vpa.status, 'NEUTRAL');
    assert.equal(vpa.scoreModifier, 0);
    assert.equal(vpa.badgeVariant, 'neutral');
  });

  it('penalizes CLIMAX_REJECT in PatternBreakoutService.computeScore', () => {
    const baselineScore = PatternBreakoutService.computeScore({
      status: 'BREAKOUT',
      distanceToHighPct: 0,
      rvol20d: 2.5,
      primaryPattern: 'VCP',
      patternDetails: null,
      candles: [],
      vpaFootprint: classifyBreakoutVpa(2.5, 0.8), // CONFIRMED (+5)
    });

    const trapScore = PatternBreakoutService.computeScore({
      status: 'BREAKOUT',
      distanceToHighPct: 0,
      rvol20d: 2.5,
      primaryPattern: 'VCP',
      patternDetails: null,
      candles: [],
      vpaFootprint: classifyBreakoutVpa(2.5, -0.6), // CLIMAX_REJECT (-10)
    });

    assert.ok(baselineScore.totalScore > trapScore.totalScore);
    assert.equal(baselineScore.vpaModifier, 5);
    assert.equal(trapScore.vpaModifier, -10);
  });
});
