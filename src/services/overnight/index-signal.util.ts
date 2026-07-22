/**
 * Index signal presentation helpers — CALL BUY / PUT BUY mapping, reasons, R:R.
 */
import { IndexClassification, IndexScoreBreakdown } from './index-ranking.service';
import { IndexRegimeContext } from './index-regime.service';

export type IndexSignalType = 'CALL_BUY' | 'PUT_BUY' | 'NO_TRADE';

const INTRA_SIGNAL_REASONS: Record<string, string> = {
  BULLISH: 'Price above CPR (bullish bias)',
  BEARISH: 'Price below CPR (bearish bias)',
  NARROW: 'Narrow CPR',
  WIDE: 'Wide CPR',
  HIGHER_VALUE: 'Higher value CPR',
  LOWER_VALUE: 'Lower value CPR',
  GAP_UP: 'Gap up open',
  GAP_DOWN: 'Gap down open',
  HOT_ZONE: 'Hot zone near pivot',
  BREAKOUT: 'Volume breakout above TC',
  BREAKDOWN: 'Breakdown below BC',
  MOMENTUM: 'Momentum beyond R1/S1',
  VIRGIN: 'Virgin CPR (untouched band)',
  VOLUME_SPIKE: 'Volume spike',
  LONG_BUILD: 'Long build-up',
  SHORT_BUILD: 'Short build-up',
};

export function resolveSignalType(
  direction: 'LONG' | 'SHORT',
  classification: IndexClassification
): IndexSignalType {
  if (classification === 'IGNORE') return 'NO_TRADE';
  return direction === 'LONG' ? 'CALL_BUY' : 'PUT_BUY';
}

export function computeRiskReward(
  entry: number | null,
  stopLoss: number | null,
  target: number | null
): string | null {
  if (entry == null || stopLoss == null || target == null) return null;
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return null;
  return `1:${(reward / risk).toFixed(1)}`;
}

export function buildBtstReasons(
  breakdown: IndexScoreBreakdown | null,
  vixElevated: boolean,
  regime?: IndexRegimeContext | null
): string[] {
  const reasons: string[] = [];

  if (vixElevated) {
    reasons.push('India VIX elevated (≥25) — overnight CALL blocked');
    return reasons;
  }

  if (!breakdown) {
    reasons.push('Missing live VWAP, 15:15–15:30 high, or India VIX — score invalid');
    return reasons;
  }

  if (breakdown.vixCalm > 0) reasons.push('India VIX calm (<20)');
  if (breakdown.cprNarrow > 0) reasons.push('Tomorrow CPR narrow');
  if (breakdown.higherValue > 0) reasons.push('Higher value CPR (tomorrow above today)');
  if (breakdown.vwap > 0) reasons.push('Close above TC and VWAP');
  if (breakdown.liquidity > 0) reasons.push('Close above 15:15–15:30 IST high');
  if (breakdown.closeStrength > 0) reasons.push('Strong close strength (CLV > 0.70)');

  if (reasons.length === 0) {
    reasons.push('No bullish confirmation rules met');
  }

  if (regime?.reason) {
    reasons.push(regime.reason);
  }

  return reasons;
}

export function buildIntraReasons(
  signalTags: string[],
  direction: 'LONG' | 'SHORT',
  vixElevated: boolean,
  regime?: IndexRegimeContext | null
): string[] {
  const reasons: string[] = [];

  if (vixElevated) {
    reasons.push('India VIX elevated (≥25) — intraday option signal blocked');
    return reasons;
  }

  reasons.push(direction === 'LONG' ? 'Bullish CPR directional bias' : 'Bearish CPR directional bias');

  for (const tag of signalTags) {
    if (tag === 'BULLISH' || tag === 'BEARISH' || tag === 'INSIDE') continue;
    const mapped = INTRA_SIGNAL_REASONS[tag];
    if (mapped) reasons.push(mapped);
  }

  if (regime?.reason) {
    reasons.push(regime.reason);
  }

  return reasons;
}
