import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePaceShadow, createShadowLogThrottle, gainedSignals } from '@/lib/pace-shadow';

// 09:35 IST = minute 575 (expected fraction ~0.0512); 12:22 IST ~ minute 742 (expected 0.48)
const base = { avgVolume: 1_000_000, isReplay: false } as const;

test('evaluatePaceShadow flags divergence when pace clears the bar but raw does not', () => {
  const r = evaluatePaceShadow({ ...base, rawVolumeRatio: 0.078, minuteOfDay: 575 });
  assert.ok(r);
  assert.ok(r!.paceVolumeRatio >= 1.5);
  assert.equal(r!.divergent, true);
});

test('evaluatePaceShadow is not divergent when raw already clears the bar', () => {
  const r = evaluatePaceShadow({ ...base, rawVolumeRatio: 1.6, minuteOfDay: 575 });
  assert.ok(r);
  assert.equal(r!.divergent, false);
});

test('evaluatePaceShadow is not divergent when pace itself is below the bar', () => {
  const r = evaluatePaceShadow({ ...base, rawVolumeRatio: 0.7, minuteOfDay: 742 });
  assert.ok(r);
  assert.ok(r!.paceVolumeRatio < 1.5);
  assert.equal(r!.divergent, false);
});

test('evaluatePaceShadow returns null for replay, stale provenance, missing avgVolume and off-session', () => {
  assert.equal(evaluatePaceShadow({ ...base, rawVolumeRatio: 0.08, minuteOfDay: 575, isReplay: true }), null);
  assert.equal(
    evaluatePaceShadow({ ...base, rawVolumeRatio: 0.08, minuteOfDay: 575, rangeProvenance: 'STALE_PREV_DAY' }),
    null
  );
  assert.equal(evaluatePaceShadow({ ...base, avgVolume: 0, rawVolumeRatio: 0.08, minuteOfDay: 575 }), null);
  assert.equal(evaluatePaceShadow({ ...base, rawVolumeRatio: 0.08, minuteOfDay: 500 }), null);
  assert.equal(evaluatePaceShadow({ ...base, rawVolumeRatio: Number.NaN, minuteOfDay: 575 }), null);
});

test('createShadowLogThrottle enforces cooldown per key and resets on a new date', () => {
  const shouldLog = createShadowLogThrottle(15);
  assert.equal(shouldLog('A:BREAKOUT', '2026-11-26', 575), true);
  assert.equal(shouldLog('A:BREAKOUT', '2026-11-26', 580), false);
  assert.equal(shouldLog('B:BREAKOUT', '2026-11-26', 580), true, 'other key is independent');
  assert.equal(shouldLog('A:BREAKOUT', '2026-11-26', 590), true, 'after cooldown');
  assert.equal(shouldLog('A:BREAKOUT', '2026-11-27', 575), true, 'new date resets');
});

test('gainedSignals returns only watched signals pace adds over live', () => {
  const out = gainedSignals(['VOLUME_SPIKE'], ['BREAKOUT', 'VOLUME_SPIKE', 'MOMENTUM'], ['BREAKOUT', 'BREAKDOWN']);
  assert.deepEqual(out, ['BREAKOUT']);
  assert.deepEqual(gainedSignals(['BREAKOUT'], ['BREAKOUT'], ['BREAKOUT']), []);
});
