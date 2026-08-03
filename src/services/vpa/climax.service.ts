import { VPA_CLIMAX, VPA_COMPONENT_FLAGS } from '@/config/vpa.config';
import {
  computeRvol,
  computeWickRatios,
  isBearishCandle,
  isBullishCandle,
} from './vpa.math';
import type { VpaDirection, VpaMarketInputs } from './vpa.types';

export function scoreVpaClimax(inputs: VpaMarketInputs): {
  buyingClimax: number;
  sellingClimax: number;
  flags: string[];
  upperWickRatio: number | null;
  lowerWickRatio: number | null;
} {
  if (!VPA_COMPONENT_FLAGS.climax) {
    return { buyingClimax: 0, sellingClimax: 0, flags: [], upperWickRatio: null, lowerWickRatio: null };
  }

  const { open, high, low, close, volume, avgVolume, todayBc, todayTc } = inputs;
  const rvol = computeRvol(volume, avgVolume);
  const wicks = computeWickRatios(open, high, low, close);
  const flags: string[] = [];
  let buyingClimax = 0;
  let sellingClimax = 0;

  if (rvol === null) {
    return { buyingClimax, sellingClimax, flags, upperWickRatio: wicks.upper, lowerWickRatio: wicks.lower };
  }

  const nearResistance = close >= todayTc * 0.995;

  if (
    rvol >= VPA_CLIMAX.EXTREME_RVOL &&
    isBullishCandle(open, close) &&
    wicks.upper !== null &&
    wicks.upper >= VPA_CLIMAX.WICK_RATIO &&
    nearResistance
  ) {
    buyingClimax = VPA_CLIMAX.BUYING_PENALTY;
    flags.push('VPA_BUYING_CLIMAX');
  }

  if (
    rvol >= VPA_CLIMAX.EXTREME_RVOL &&
    isBearishCandle(open, close) &&
    wicks.lower !== null &&
    wicks.lower >= VPA_CLIMAX.WICK_RATIO &&
    close <= todayBc * 1.005
  ) {
    // Selling climax = seller exhaustion near support.
    // For LONG: reversal opportunity → bonus.
    // For SHORT: sellers are exhausted → bad for bearish thesis → penalty.
    sellingClimax = inputs.direction === 'LONG'
      ? VPA_CLIMAX.SELLING_REVERSAL_BONUS
      : VPA_CLIMAX.BUYING_PENALTY; // reuse same penalty magnitude as buying climax
    flags.push('VPA_SELLING_CLIMAX');
  }

  return {
    buyingClimax,
    sellingClimax,
    flags,
    upperWickRatio: wicks.upper,
    lowerWickRatio: wicks.lower,
  };
}

/** Severe buying climax on a LONG setup → recommend reject when live gates enabled. */
export function shouldRejectBuyingClimax(direction: VpaDirection, flags: string[]): boolean {
  return direction === 'LONG' && flags.includes('VPA_BUYING_CLIMAX');
}
