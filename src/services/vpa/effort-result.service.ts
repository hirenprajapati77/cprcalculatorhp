import { VPA_EFFORT, VPA_COMPONENT_FLAGS } from '@/config/vpa.config';
import { computeRangePct, computeRvol } from './vpa.math';

/**
 * Effort (volume) vs result (price expansion).
 * Huge volume + tiny range → absorption penalty.
 * Huge volume + large range → confirmation bonus.
 */
export function scoreVpaEffortResult(
  volume: number,
  avgVolume: number,
  high: number,
  low: number,
  close: number
): { points: number; flag: string | null; rangePct: number | null } {
  if (!VPA_COMPONENT_FLAGS.effortResult) {
    return { points: 0, flag: null, rangePct: null };
  }

  const rvol = computeRvol(volume, avgVolume);
  const rangePct = computeRangePct(high, low, close);
  if (rvol === null || rangePct === null) {
    return { points: 0, flag: null, rangePct };
  }

  if (rvol < VPA_EFFORT.HIGH_EFFORT_RVOL) {
    return { points: 0, flag: null, rangePct };
  }

  if (rangePct <= VPA_EFFORT.TINY_RANGE_PCT) {
    return {
      points: VPA_EFFORT.ABSORPTION_PENALTY,
      flag: 'VPA_ABSORPTION',
      rangePct,
    };
  }

  if (rangePct >= VPA_EFFORT.LARGE_RANGE_PCT) {
    return {
      points: VPA_EFFORT.CONFIRMATION_BONUS,
      flag: 'VPA_EFFORT_CONFIRMED',
      rangePct,
    };
  }

  return { points: 0, flag: null, rangePct };
}
