import test from 'node:test';
import assert from 'node:assert/strict';
import { VOLUME_CURVE_V2_KNOTS, expectedVolumeFractionV2 } from '@/lib/volume-curve-v2';
import { expectedVolumeFraction } from '@/lib/market-hours';

test('v2 knots are strictly increasing in minute, non-decreasing in fraction, and end at 1.0 at 15:30', () => {
  for (let i = 1; i < VOLUME_CURVE_V2_KNOTS.length; i++) {
    const [m0, f0] = VOLUME_CURVE_V2_KNOTS[i - 1]!;
    const [m1, f1] = VOLUME_CURVE_V2_KNOTS[i]!;
    assert.ok(m1 > m0, `minute increasing at index ${i}`);
    assert.ok(f1 >= f0, `fraction non-decreasing at index ${i}`);
  }
  const last = VOLUME_CURVE_V2_KNOTS[VOLUME_CURVE_V2_KNOTS.length - 1]!;
  assert.deepEqual([...last], [930, 1]);
  assert.ok(VOLUME_CURVE_V2_KNOTS.every(([, f]) => f > 0 && f <= 1));
});

test('expectedVolumeFractionV2 returns knot values at knots and interpolates between them', () => {
  assert.equal(expectedVolumeFractionV2(575), 0.1269);
  assert.equal(expectedVolumeFractionV2(930), 1);
  const mid = expectedVolumeFractionV2(582.5)!; // halfway 575 -> 590
  assert.ok(Math.abs(mid - (0.1269 + 0.1809) / 2) < 1e-9);
});

test('expectedVolumeFractionV2 is flat before the first knot and null outside the session', () => {
  assert.equal(expectedVolumeFractionV2(555), 0.0506);
  assert.equal(expectedVolumeFractionV2(558), 0.0506);
  assert.equal(expectedVolumeFractionV2(554), null);
  assert.equal(expectedVolumeFractionV2(931), null);
  assert.equal(expectedVolumeFractionV2(Number.NaN), null);
});

test('v2 is much higher than the current curve early and close to it late (documented finding)', () => {
  const ratioAt = (m: number) => expectedVolumeFractionV2(m)! / expectedVolumeFraction(m);
  assert.ok(ratioAt(575) > 2, 'about 2.4x higher at 09:35');
  assert.ok(ratioAt(600) > 1.6);
  assert.ok(Math.abs(ratioAt(840) - 1) < 0.1, 'within 10% by 14:00');
  assert.ok(Math.abs(ratioAt(900) - 1) < 0.1);
});
