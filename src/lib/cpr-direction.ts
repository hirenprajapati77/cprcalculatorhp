/** Map journal/scanner direction onto OptionSuggestionService.suggestOption bias. */
export function cprDirectionToOptionBias(
  direction: 'LONG' | 'SHORT'
): 'BULLISH' | 'BEARISH' {
  return direction === 'SHORT' ? 'BEARISH' : 'BULLISH';
}

/**
 * Infer CPR journal / setup direction from persisted ScannerResult levels.
 * TC entry → LONG, BC entry → SHORT, RANGE (pivot) → SL/target geometry
 * (sl > entry or target < entry → SHORT). Legacy entry≤0 → LONG.
 */
export function inferCprJournalDirection(signal: {
  entry: number | null;
  bc: number | null;
  tc: number | null;
  sl: number | null;
  target: number | null;
}): 'LONG' | 'SHORT' {
  const entry = signal.entry ?? 0;
  if (entry <= 0) return 'LONG';

  const bc = signal.bc ?? 0;
  const tc = signal.tc ?? 0;

  // Bias branch pins entry to today's TC (bullish) or BC (bearish).
  // tc/bc/entry are toFixed(2) from the same raw cprToday value.
  if (entry === bc && bc !== tc) return 'SHORT';
  if (entry === tc && bc !== tc) return 'LONG';

  // RANGE: entry = pivot. Short mean-revert has SL above entry / target below.
  const sl = signal.sl;
  if (sl != null && sl > entry) return 'SHORT';
  const target = signal.target;
  if (target != null && target < entry) return 'SHORT';
  return 'LONG';
}

/**
 * Directional confluence gate: validates that the signal's intraday tags do NOT
 * contradict the derived trade direction.
 *
 * Rationale: Overnight setups that gap against the trade direction at open have
 * poor statistical follow-through. A SHORT setup that opened with GAP_UP already
 * has the market proving the short thesis wrong before entry — skip it entirely.
 *
 * SHORT invalidators — these tags indicate bullish opening momentum:
 *   GAP_UP         → stock gapped above previous close at open (bearish thesis invalidated)
 *   HP_CAM_BULL_BIAS → CPR Camarilla levels show bullish bias (support holding)
 *   HP_DIRECT_UP   → CPR directional pivot bias is upward
 *
 * LONG invalidators — these tags indicate bearish opening momentum:
 *   GAP_DOWN       → stock gapped below previous close at open (bullish thesis invalidated)
 *   HP_CAM_BEAR_BIAS → CPR Camarilla levels show bearish bias (resistance holding)
 *   HP_DIRECT_DOWN → CPR directional pivot bias is downward
 *
 * @param signalSummary  Comma-separated tag string from ScannerResult.signalSummary
 * @param direction      Trade direction inferred by inferCprJournalDirection
 * @returns { valid: true } when no conflict found, or { valid: false, reason } to skip.
 */

const SHORT_INVALIDATORS = ['GAP_UP', 'HP_CAM_BULL_BIAS', 'HP_DIRECT_UP'] as const;
const LONG_INVALIDATORS  = ['GAP_DOWN', 'HP_CAM_BEAR_BIAS', 'HP_DIRECT_DOWN'] as const;

export function validateCprSignalConfluence(
  signalSummary: string | null | undefined,
  direction: 'LONG' | 'SHORT'
): { valid: boolean; reason?: string } {
  if (!signalSummary) return { valid: true };

  const tags = new Set(signalSummary.split(',').map((t) => t.trim()));
  const invalidators = direction === 'SHORT' ? SHORT_INVALIDATORS : LONG_INVALIDATORS;

  for (const inv of invalidators) {
    if (tags.has(inv)) {
      return { valid: false, reason: `DIRECTION_CONFLICT:${inv}` };
    }
  }
  return { valid: true };
}
