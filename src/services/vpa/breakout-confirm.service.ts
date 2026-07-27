import { VPA_BREAKOUT, VPA_COMPONENT_FLAGS, VPA_RVOL } from '@/config/vpa.config';
import { computeClv, computeRvol } from './vpa.math';
import type { VpaDirection, VpaMarketInputs } from './vpa.types';

export function scoreVpaBreakoutConfirm(
  inputs: VpaMarketInputs
): { points: number; flag: string | null } {
  if (!VPA_COMPONENT_FLAGS.breakoutConfirm) return { points: 0, flag: null };

  const { direction, close, high, low, volume, avgVolume, todayBc, todayTc } = inputs;
  const rvol = computeRvol(volume, avgVolume);
  const clv = computeClv(close, high, low);
  if (rvol === null || clv === null) return { points: 0, flag: null };

  if (direction === 'LONG') {
    const aboveCpr = close > todayTc;
    const breakout = close > todayTc && close > todayBc;
    const volumeOk = rvol >= VPA_RVOL.GOOD;
    const closeNearHigh = clv >= VPA_BREAKOUT.CLV_MIN_BULL;
    if (aboveCpr && breakout && volumeOk && closeNearHigh) {
      return { points: VPA_BREAKOUT.CONFIRMED_ADJ, flag: 'VPA_BREAKOUT_CONFIRMED' };
    }
    if (!volumeOk || !closeNearHigh) {
      return { points: VPA_BREAKOUT.WEAK_PENALTY, flag: 'VPA_WEAK_BREAKOUT' };
    }
    return { points: 0, flag: null };
  }

  const belowCpr = close < todayBc;
  const breakdown = close < todayBc && close < todayTc;
  const volumeOk = rvol >= VPA_RVOL.GOOD;
  const closeNearLow = clv <= VPA_BREAKOUT.CLV_MAX_BEAR;
  if (belowCpr && breakdown && volumeOk && closeNearLow) {
    return { points: VPA_BREAKOUT.CONFIRMED_ADJ, flag: 'VPA_BREAKDOWN_CONFIRMED' };
  }
  if (!volumeOk || !closeNearLow) {
    return { points: VPA_BREAKOUT.WEAK_PENALTY, flag: 'VPA_WEAK_BREAKDOWN' };
  }
  return { points: 0, flag: null };
}
