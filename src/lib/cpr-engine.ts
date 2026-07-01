import { CPRInput, CPRResult, CPRClassification, CPRTrend } from '@/types/cpr.types';

/**
 * Calculates CPR and support/resistance levels.
 *
 * Pivot: P = (H + L + C) / 3
 * Bottom Central: BC = (H + L) / 2
 * Top Central: TC = (P - BC) + P
 * Normalization: If TC < BC, swap TC and BC.
 *
 * Width: ((TC - BC) / P) * 100
 * Classification: NARROW (< 0.3%), NORMAL (< 0.8%), WIDE (>= 0.8%)
 * Trend: Narrow -> Trending, Wide -> Ranging, Normal -> Balanced
 */
export function calculateCPR(input: CPRInput): CPRResult {
  const { high: H, low: L, close: C } = input;

  const pivot = (H + L + C) / 3;
  const bc = (H + L) / 2;
  const tc = (pivot - bc) + pivot;

  // Normalize: TC must always be >= BC
  const [tcFinal, bcFinal] = tc < bc ? [bc, tc] : [tc, bc];

  const r1 = (2 * pivot) - L;
  const r2 = pivot + (H - L);
  const r3 = H + 2 * (pivot - L);
  const r4 = r3 + (r2 - r1);

  const s1 = (2 * pivot) - H;
  const s2 = pivot - (H - L);
  const s3 = L - 2 * (H - pivot);
  const s4 = s3 - (s1 - s2);

  const width = ((tcFinal - bcFinal) / pivot) * 100;

  const classification: CPRClassification = classifyCprWidth(width);

  const trend: CPRTrend =
    classification === 'NARROW' ? 'Trending' :
    classification === 'WIDE'   ? 'Ranging'  : 'Balanced';

  return {
    pivot,
    bc: bcFinal,
    tc: tcFinal,
    r1,
    r2,
    r3,
    r4,
    s1,
    s2,
    s3,
    s4,
    width,
    classification,
    trend,
  };
}
export default calculateCPR;

/**
 * Shared helper: returns true when the session (sessionLow..sessionHigh)
 * never touched the CPR band (cprBc..cprTc).
 * Use with:
 *   - signal.service.ts: (yesterdayCandle.high, yesterdayCandle.low, cprYesterday.tc, cprYesterday.bc)
 *   - btst.service.ts: (stock.high, stock.low, todayCpr.tc, todayCpr.bc)
 */
export function isCprVirgin(
  sessionHigh: number,
  sessionLow: number,
  cprTc: number,
  cprBc: number
): boolean {
  return sessionLow > Math.max(cprTc, cprBc) || sessionHigh < Math.min(cprTc, cprBc);
}

/**
 * Shared CPR width classification — single source of truth.
 * NARROW < 0.3%, NORMAL < 0.8%, WIDE >= 0.8%
 */
export function classifyCprWidth(widthPct: number): 'NARROW' | 'NORMAL' | 'WIDE' {
  return widthPct < 0.3 ? 'NARROW' : widthPct < 0.8 ? 'NORMAL' : 'WIDE';
}
