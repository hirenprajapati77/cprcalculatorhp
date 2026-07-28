import { VPA_BREAKOUT, VPA_COMPONENT_FLAGS, VPA_RVOL } from '@/config/vpa.config';
import { computeClv, computeRvol } from './vpa.math';
import type { VpaMarketInputs } from './vpa.types';

export function scoreVpaBreakoutConfirm(
  inputs: VpaMarketInputs
): { points: number; flag: string | null } {
  if (!VPA_COMPONENT_FLAGS.breakoutConfirm) return { points: 0, flag: null };

  const { direction, close, high, low, volume, avgVolume, todayBc, todayTc } = inputs;
  const rvol = computeRvol(volume, avgVolume);
  const clv = computeClv(close, high, low);
  if (rvol === null || clv === null) return { points: 0, flag: null };

  if (direction === 'LONG') {
    // Weak penalty only applies when price actually attempted a breakout of CPR.
    const breakoutAttempt = close > todayTc && close > todayBc;
    if (!breakoutAttempt) return { points: 0, flag: null };

    const volumeOk = rvol >= VPA_RVOL.GOOD;
    const closeNearHigh = clv >= VPA_BREAKOUT.CLV_MIN_BULL;
    if (volumeOk && closeNearHigh) {
      return { points: VPA_BREAKOUT.CONFIRMED_ADJ, flag: 'VPA_BREAKOUT_CONFIRMED' };
    }
    return { points: VPA_BREAKOUT.WEAK_PENALTY, flag: 'VPA_WEAK_BREAKOUT' };
  }

  // SHORT — mirrored: only score when price actually broke below CPR.
  const breakdownAttempt = close < todayBc && close < todayTc;
  if (!breakdownAttempt) return { points: 0, flag: null };

  const volumeOk = rvol >= VPA_RVOL.GOOD;
  const closeNearLow = clv <= VPA_BREAKOUT.CLV_MAX_BEAR;
  if (volumeOk && closeNearLow) {
    return { points: VPA_BREAKOUT.CONFIRMED_ADJ, flag: 'VPA_BREAKDOWN_CONFIRMED' };
  }
  return { points: VPA_BREAKOUT.WEAK_PENALTY, flag: 'VPA_WEAK_BREAKDOWN' };
}
