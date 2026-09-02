import { inferCprJournalDirection } from '@/lib/cpr-direction';

export type ScannerBadgeDirection = 'LONG' | 'SHORT' | null;

/**
 * Signals evaluated by SignalService that do not contribute to quantitative score
 * or confidence in RankingService / ScannerService (held at 0 weight / unvalidated).
 */
export const UNSCORED_SIGNALS = new Set<string>([
  'HP_REVERSAL_UP',
  'HP_REVERSAL_DOWN',
  'HP_DIRECT_UP',
  'HP_DIRECT_DOWN',
  'HP_CAM_BULL_BIAS',
  'HP_CAM_BEAR_BIAS',
  'HP_ASC_REVERSAL',
  'HP_DESC_REVERSAL',
  'HP_HP_RTP',
  'OVERLAPPING_VALUE',
  'OUTSIDE_VALUE',
]);

/**
 * Checks whether a signal tag is informational-only (contributes 0 pts to quant score & confidence).
 * Handles legacy KGS_ prefixes and dynamic OVERLAPPING prefixes.
 */
export function isUnscoredSignal(rawSig: string): boolean {
  const sig = rawSig.replace(/^KGS_/, 'HP_');
  return UNSCORED_SIGNALS.has(sig) || sig.startsWith('OVERLAPPING');
}

/**
 * Direction for CPR rating badges. Prefers explicit direction; otherwise reuses
 * inferCprJournalDirection's TC/BC entry pin. Returns null for RANGE/ambiguous
 * so UI can render "Strong" / "Opportunity" without inventing Buy/Sell.
 */
export function inferScannerBadgeDirection(signal: {
  entry?: number | null | undefined;
  bc?: number | null | undefined;
  tc?: number | null | undefined;
  sl?: number | null | undefined;
  target?: number | null | undefined;
  direction?: 'LONG' | 'SHORT' | null | undefined;
  signals?: string[] | null | undefined;
}): ScannerBadgeDirection {
  if (signal.direction === 'LONG' || signal.direction === 'SHORT') {
    return signal.direction;
  }

  const entry = signal.entry ?? 0;
  const bc = signal.bc ?? 0;
  const tc = signal.tc ?? 0;
  if (entry <= 0 || bc <= 0 || tc <= 0) return null;

  // Same pin as cpr-journal: TC → LONG, BC → SHORT. Do not guess on RANGE pivot.
  if (entry === bc && bc !== tc) return 'SHORT';
  if (entry === tc && bc !== tc) return 'LONG';

  // Ambiguous RANGE (entry ≈ pivot): optional geometry only when clearly short/long
  // via journal helper — but user asked not to invent Buy/Sell for RANGE.
  // If entry is neither TC nor BC, stay neutral.
  if (entry !== bc && entry !== tc) return null;

  // Degenerate tc===bc: fall through to journal helper (returns LONG by default).
  return inferCprJournalDirection({
    entry: signal.entry ?? null,
    bc: signal.bc ?? null,
    tc: signal.tc ?? null,
    sl: signal.sl ?? null,
    target: signal.target ?? null,
  });
}

export function cprRatingLabel(
  tier: 'strong' | 'ready' | 'watch' | 'ignore',
  direction: ScannerBadgeDirection,
  overnightMode: boolean
): string {
  if (overnightMode) {
    if (tier === 'strong') return 'Strong';
    if (tier === 'ready') return 'Ready';
    if (tier === 'watch') return 'Watch';
    return 'Ignore';
  }
  if (tier === 'strong') {
    if (direction === 'LONG') return 'Strong Buy';
    if (direction === 'SHORT') return 'Strong Sell';
    return 'Strong';
  }
  if (tier === 'ready') {
    if (direction === 'LONG') return 'Opportunity Buy';
    if (direction === 'SHORT') return 'Opportunity Sell';
    return 'Opportunity';
  }
  if (tier === 'watch') return 'Watch';
  return 'Ignore';
}

/** Row left-border / tint for overnight BTST/STBT classifications. */
export function btstRowHighlightClass(classification: string | undefined | null): string {
  if (!classification) return '';
  switch (classification) {
    case 'STRONG_BTST':
      return ' border-l-2 border-accent-green bg-accent-green/5';
    case 'STRONG_STBT':
      return ' border-l-2 border-accent-red bg-accent-red/5';
    case 'BTST_READY':
      return ' border-l-2 border-accent-blue bg-accent-blue/5';
    case 'STBT_READY':
      return ' border-l-2 border-accent-red/70 bg-accent-red/5';
    case 'WATCH':
      return ' border-l-2 border-accent-amber bg-accent-amber/5';
    case 'IGNORE':
      return ' border-l-2 border-text-tertiary bg-bg-tertiary/5';
    default:
      return '';
  }
}
