import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreVpaEffortResult } from '@/services/vpa/effort-result.service';
import { VPA_EFFORT, VPA_COMPONENT_FLAGS } from '@/config/vpa.config';

describe('scoreVpaEffortResult (Tier 2)', () => {
  it('returns zero points when flags are disabled', () => {
    const orig = VPA_COMPONENT_FLAGS.effortResult;
    try {
      (VPA_COMPONENT_FLAGS as { effortResult: boolean }).effortResult = false;
      const res = scoreVpaEffortResult(200000, 100000, 105, 95, 100);
      assert.equal(res.points, 0);
      assert.equal(res.flag, null);
      assert.equal(res.rangePct, null);
    } finally {
      (VPA_COMPONENT_FLAGS as { effortResult: boolean }).effortResult = orig;
    }
  });

  it('returns zero when volume or avgVolume is zero or invalid', () => {
    const res = scoreVpaEffortResult(0, 100000, 105, 95, 100);
    assert.equal(res.points, 0);
    assert.equal(res.flag, null);

    const res2 = scoreVpaEffortResult(100000, 0, 105, 95, 100);
    assert.equal(res2.points, 0);
    assert.equal(res2.flag, null);
  });

  it('returns zero when rvol is below HIGH_EFFORT_RVOL threshold', () => {
    // rvol = 1.2 < 1.8
    const res = scoreVpaEffortResult(120000, 100000, 102, 98, 100);
    assert.equal(res.points, 0);
    assert.equal(res.flag, null);
    assert.ok(res.rangePct != null);
  });

  it('detects ABSORPTION when high volume is paired with tiny price range', () => {
    // rvol = 2.5 >= 1.8, range = 100.2 - 99.8 = 0.4 on 100 -> 0.4% <= 0.8%
    const res = scoreVpaEffortResult(250000, 100000, 100.2, 99.8, 100.0);
    assert.equal(res.points, VPA_EFFORT.ABSORPTION_PENALTY);
    assert.equal(res.flag, 'VPA_ABSORPTION');
  });

  it('detects CONFIRMATION when high volume is paired with large price expansion', () => {
    // rvol = 2.5 >= 1.8, range = 105 - 95 = 10 on 100 -> 10% >= 2.5%
    const res = scoreVpaEffortResult(250000, 100000, 105.0, 95.0, 100.0);
    assert.equal(res.points, VPA_EFFORT.CONFIRMATION_BONUS);
    assert.equal(res.flag, 'VPA_EFFORT_CONFIRMED');
  });

  it('returns zero when high volume is in the normal middle range', () => {
    // rvol = 2.5 >= 2.0, range = 100.5 - 99.5 = 1.0 on 100 -> 0.010 (between 0.005 and 0.015)
    const res = scoreVpaEffortResult(250000, 100000, 100.5, 99.5, 100.0);
    assert.equal(res.points, 0);
    assert.equal(res.flag, null);
  });
});
