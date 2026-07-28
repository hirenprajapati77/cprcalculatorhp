import { VPA_COMPONENT_FLAGS, VPA_NO_DEMAND_SUPPLY } from '@/config/vpa.config';
import { computeRangePct, computeRvol, isBearishCandle, isBullishCandle } from './vpa.math';
import type { VpaDirection, VpaMarketInputs } from './vpa.types';

export function scoreVpaNoDemandSupply(inputs: VpaMarketInputs): {
  noDemand: number;
  noSupply: number;
  flags: string[];
} {
  if (!VPA_COMPONENT_FLAGS.noDemandSupply) {
    return { noDemand: 0, noSupply: 0, flags: [] };
  }

  const { direction, open, high, low, close, volume, avgVolume } = inputs;
  const rvol = computeRvol(volume, avgVolume);
  const rangePct = computeRangePct(high, low, close);
  if (rvol === null || rangePct === null) {
    return { noDemand: 0, noSupply: 0, flags: [] };
  }

  const narrow = rangePct <= VPA_NO_DEMAND_SUPPLY.NARROW_SPREAD_PCT;
  const lowVol = rvol <= VPA_NO_DEMAND_SUPPLY.LOW_RVOL;
  const flags: string[] = [];
  let noDemand = 0;
  let noSupply = 0;

  if (lowVol && narrow && (isBullishCandle(open, close) || close === open)) {
    noDemand = VPA_NO_DEMAND_SUPPLY.NO_DEMAND_PENALTY;
    flags.push('VPA_NO_DEMAND');
  }

  if (lowVol && narrow && isBearishCandle(open, close)) {
    if (direction === 'LONG') {
      noSupply = VPA_NO_DEMAND_SUPPLY.NO_SUPPLY_BULL_BONUS;
      flags.push('VPA_NO_SUPPLY');
    } else {
      noSupply = VPA_NO_DEMAND_SUPPLY.NO_SUPPLY_SHORT_PENALTY;
      flags.push('VPA_NO_SUPPLY');
    }
  }

  return { noDemand, noSupply, flags };
}

/** No demand on a LONG breakout attempt → recommend reject when live gates enabled. */
export function shouldRejectNoDemand(direction: VpaDirection, flags: string[]): boolean {
  return direction === 'LONG' && flags.includes('VPA_NO_DEMAND');
}
