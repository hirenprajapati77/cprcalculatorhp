import { expectedVolumeFraction } from '@/lib/market-hours';
import { VOLUME_THRESHOLDS } from '@/config/trading-constants';
import type { RangeProvenance } from '@/lib/range-provenance';

export interface PaceShadowInput {
  rawVolumeRatio: number;
  avgVolume: number;
  minuteOfDay: number;
  rangeProvenance?: RangeProvenance | undefined;
  /** True when replaying history (asOfDate present). Shadow is live-only. */
  isReplay: boolean;
  minVolumeRatio?: number;
}

export interface PaceShadowResult {
  paceVolumeRatio: number;
  expectedFraction: number;
  /**
   * True when the pace-normalised ratio would clear the breakout volume bar but the
   * raw ratio (what production uses while FEATURE_PACE_VOLUME is off) does not.
   * These are exactly the signals the flag-off setting suppresses.
   */
  divergent: boolean;
}

/**
 * Computes what the pace-normalised volume ratio WOULD be, without changing any live
 * decision. Returns null when pace normalisation would not apply (replay, stale
 * provenance, missing avgVolume, or outside the session).
 */
export function evaluatePaceShadow(input: PaceShadowInput): PaceShadowResult | null {
  const { rawVolumeRatio, avgVolume, minuteOfDay, rangeProvenance, isReplay } = input;
  const minVolumeRatio = input.minVolumeRatio ?? VOLUME_THRESHOLDS.BREAKOUT_RATIO;

  if (isReplay) return null;
  if (!(avgVolume > 0)) return null;
  if (rangeProvenance === 'STALE_PREV_DAY') return null;
  if (!Number.isFinite(rawVolumeRatio) || rawVolumeRatio < 0) return null;

  const expectedFraction = expectedVolumeFraction(minuteOfDay);
  // Outside 09:15-15:30 the curve returns 1.0, so there is nothing to compare.
  if (!(expectedFraction > 0) || expectedFraction >= 1) return null;

  const paceVolumeRatio = rawVolumeRatio / expectedFraction;
  return {
    paceVolumeRatio,
    expectedFraction,
    divergent: paceVolumeRatio >= minVolumeRatio && rawVolumeRatio < minVolumeRatio,
  };
}

/**
 * Per-key log throttle so a stock hovering past a level does not emit on every scan.
 * State is in-memory per process and resets on a new trading date.
 */
export function createShadowLogThrottle(cooldownMinutes = 15, maxKeys = 2000) {
  let currentDate = '';
  const last = new Map<string, number>();
  return function shouldLog(key: string, dateString: string, minuteOfDay: number): boolean {
    if (dateString !== currentDate) {
      currentDate = dateString;
      last.clear();
    }
    const prev = last.get(key);
    if (prev !== undefined && minuteOfDay - prev < cooldownMinutes) return false;
    if (last.size >= maxKeys) last.clear();
    last.set(key, minuteOfDay);
    return true;
  };
}

/** Returns the signals present in `shadow` but not in `live`, limited to `watch`. */
export function gainedSignals(live: string[], shadow: string[], watch: string[]): string[] {
  return shadow.filter((s) => watch.includes(s) && !live.includes(s));
}
