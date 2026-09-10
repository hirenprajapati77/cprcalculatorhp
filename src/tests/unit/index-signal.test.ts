import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSignalType,
  computeRiskReward,
  buildBtstReasons,
  buildStbtReasons,
  buildIntraReasons,
} from '../../services/overnight/index-signal.util';
import { IndexScoreBreakdown } from '../../services/overnight/index-ranking.service';

describe('index-signal.util', () => {
  it('maps LONG READY to CALL_BUY', () => {
    assert.equal(resolveSignalType('LONG', 'INDEX_READY'), 'CALL_BUY');
  });

  it('maps SHORT READY to PUT_BUY', () => {
    assert.equal(resolveSignalType('SHORT', 'INDEX_READY'), 'PUT_BUY');
  });

  it('maps IGNORE to NO_TRADE', () => {
    assert.equal(resolveSignalType('LONG', 'IGNORE'), 'NO_TRADE');
  });

  it('computes risk/reward string', () => {
    assert.equal(computeRiskReward(100, 95, 110), '1:2.0');
    assert.equal(computeRiskReward(null, 95, 110), null);
    assert.equal(computeRiskReward(100, null, 110), null);
    assert.equal(computeRiskReward(100, 95, null), null);
    assert.equal(computeRiskReward(100, 100, 110), null); // risk <= 0
  });

  it('builds BTST reasons from breakdown', () => {
    const breakdown: IndexScoreBreakdown = {
      vixCalm: 25,
      cprNarrow: 30,
      higherValue: 20,
      vwap: 20,
      liquidity: 15,
      closeStrength: 10,
    };
    const reasons = buildBtstReasons(breakdown, false, { reason: 'Bullish macro regime' } as any);
    assert.ok(reasons.some((r) => r.includes('VIX calm')));
    assert.ok(reasons.some((r) => r.includes('CPR narrow')));
    assert.ok(reasons.some((r) => r.includes('Higher value CPR')));
    assert.ok(reasons.some((r) => r.includes('VWAP')));
    assert.ok(reasons.some((r) => r.includes('liquidity') || r.includes('IST high')));
    assert.ok(reasons.some((r) => r.includes('CLV > 0.70')));
    assert.ok(reasons.some((r) => r.includes('Bullish macro regime')));

    // VIX elevated
    const blocked = buildBtstReasons(breakdown, true);
    assert.ok(blocked[0].includes('overnight CALL blocked'));

    // Missing breakdown
    const missing = buildBtstReasons(null, false);
    assert.ok(missing[0].includes('Missing live VWAP'));

    // Empty rules met
    const emptyRules = buildBtstReasons({ vixCalm: 0, cprNarrow: 0, higherValue: 0, vwap: 0, liquidity: 0, closeStrength: 0 }, false);
    assert.ok(emptyRules[0].includes('No bullish confirmation rules met'));
  });

  it('builds STBT reasons from short breakdown', () => {
    const breakdown = {
      vixElevated: 25,
      cprNarrow: 30,
      higherValue: 20,
      vwap: 20,
      liquidity: 15,
      closeStrength: 10,
    };
    const reasons = buildStbtReasons(breakdown, { reason: 'Bearish macro regime' } as any);
    assert.ok(reasons.some((r: string) => r.includes('VIX elevated')));
    assert.ok(reasons.some((r: string) => r.includes('CPR narrow')));
    assert.ok(reasons.some((r: string) => r.includes('Lower value CPR')));
    assert.ok(reasons.some((r: string) => r.includes('VWAP')));
    assert.ok(reasons.some((r: string) => r.includes('15:15–15:30 IST low')));
    assert.ok(reasons.some((r: string) => r.includes('CLV < 0.30')));
    assert.ok(reasons.some((r: string) => r.includes('Bearish macro regime')));

    // Null breakdown
    const missing = buildStbtReasons(null);
    assert.ok(missing[0].includes('Missing live VWAP'));

    // Empty rules met
    const empty = buildStbtReasons({ vixElevated: 0, cprNarrow: 0, higherValue: 0, vwap: 0, liquidity: 0, closeStrength: 0 });
    assert.ok(empty[0].includes('No bearish confirmation rules met'));
  });

  it('builds INTRA reasons from signal tags', () => {
    const reasons = buildIntraReasons(['BULLISH', 'GAP_UP', 'NARROW', 'BREAKOUT', 'VIRGIN'], 'LONG', false, { reason: 'Regime trend' } as any);
    assert.ok(reasons.some((r) => /bullish/i.test(r)));
    assert.ok(reasons.some((r) => r.includes('Gap up')));
    assert.ok(reasons.some((r) => r.includes('Volume breakout')));
    assert.ok(reasons.some((r) => r.includes('Virgin CPR')));
    assert.ok(reasons.some((r) => r.includes('Regime trend')));

    // SHORT direction
    const shortReasons = buildIntraReasons(['BEARISH', 'BREAKDOWN', 'HOT_ZONE', 'MOMENTUM'], 'SHORT', false);
    assert.ok(shortReasons.some((r) => /bearish/i.test(r)));
    assert.ok(shortReasons.some((r) => r.includes('Breakdown below BC')));
    assert.ok(shortReasons.some((r) => r.includes('Hot zone')));
    assert.ok(shortReasons.some((r) => r.includes('Momentum beyond')));
  });

  it('blocks reasons when VIX elevated', () => {
    const reasons = buildIntraReasons([], 'LONG', true);
    assert.ok(reasons[0].includes('VIX elevated'));
  });
});
