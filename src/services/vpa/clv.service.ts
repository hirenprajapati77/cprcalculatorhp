import { VPA_CLV, VPA_COMPONENT_FLAGS } from '@/config/vpa.config';
import { computeClv } from './vpa.math';
import type { VpaDirection } from './vpa.types';

export function scoreVpaClv(
  direction: VpaDirection,
  close: number,
  high: number,
  low: number
): { points: number; clv: number | null; flag: string | null } {
  if (!VPA_COMPONENT_FLAGS.clv) return { points: 0, clv: null, flag: null };
  const clv = computeClv(close, high, low);
  if (clv === null) return { points: 0, clv: null, flag: null };

  if (direction === 'LONG') {
    if (clv >= VPA_CLV.BULLISH) return { points: VPA_CLV.BULLISH_ADJ, clv, flag: 'VPA_CLV_BULLISH' };
    if (clv <= VPA_CLV.BEARISH) return { points: VPA_CLV.BEARISH_ADJ, clv, flag: 'VPA_CLV_BEARISH' };
    return { points: VPA_CLV.NEUTRAL_PENALTY, clv, flag: 'VPA_CLV_NEUTRAL' };
  }

  // SHORT — mirror: close near low is bullish for bearish thesis
  if (clv <= -VPA_CLV.BULLISH) return { points: VPA_CLV.BULLISH_ADJ, clv, flag: 'VPA_CLV_BEARISH_CLOSE' };
  if (clv >= -VPA_CLV.BEARISH) return { points: VPA_CLV.BEARISH_ADJ, clv, flag: 'VPA_CLV_BULLISH_CLOSE' };
  return { points: VPA_CLV.NEUTRAL_PENALTY, clv, flag: 'VPA_CLV_NEUTRAL' };
}
