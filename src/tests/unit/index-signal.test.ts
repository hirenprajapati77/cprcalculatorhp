import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSignalType,
  computeRiskReward,
  buildBtstReasons,
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
  });

  it('builds BTST reasons from breakdown', () => {
    const breakdown: IndexScoreBreakdown = {
      vixCalm: 25,
      cprNarrow: 30,
      higherValue: 0,
      vwap: 20,
      liquidity: 0,
      closeStrength: 0,
    };
    const reasons = buildBtstReasons(breakdown, false);
    assert.ok(reasons.some((r) => r.includes('VIX calm')));
    assert.ok(reasons.some((r) => r.includes('CPR narrow')));
    assert.ok(reasons.some((r) => r.includes('VWAP')));
  });

  it('builds INTRA reasons from signal tags', () => {
    const reasons = buildIntraReasons(['BULLISH', 'GAP_UP', 'NARROW'], 'LONG', false);
    assert.ok(reasons.some((r) => /bullish/i.test(r)));
    assert.ok(reasons.some((r) => r.includes('Gap up')));
  });

  it('blocks reasons when VIX elevated', () => {
    const reasons = buildIntraReasons([], 'LONG', true);
    assert.ok(reasons[0].includes('VIX elevated'));
  });
});
