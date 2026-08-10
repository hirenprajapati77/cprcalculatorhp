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

  // No demand: up/doji candle on low volume + narrow spread.
  // LONG: lack of buyers invalidates bullish continuation → penalty.
  // SHORT: lack of buyers on an up-tick is bearish-friendly → bonus.
  if (lowVol && narrow && (isBullishCandle(open, close) || close === open)) {
    noDemand =
      direction === 'SHORT'
        ? VPA_NO_DEMAND_SUPPLY.NO_DEMAND_SHORT_BONUS
        : VPA_NO_DEMAND_SUPPLY.NO_DEMAND_PENALTY;
    flags.push('VPA_NO_DEMAND');
  }

  // No supply: down candle on low volume + narrow spread.
  // LONG: lack of sellers is bullish-friendly → bonus.
  // SHORT: lack of sellers invalidates bearish continuation → penalty.
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

/**
 * Live gate: reject when the setup's continuation thesis is invalidated.
 * - LONG + no demand (weak up-tick)
 * - SHORT + no supply (weak down-tick)
 */
export function shouldRejectNoDemand(direction: VpaDirection, flags: string[]): boolean {
  if (direction === 'LONG') return flags.includes('VPA_NO_DEMAND');
  return flags.includes('VPA_NO_SUPPLY');
}
