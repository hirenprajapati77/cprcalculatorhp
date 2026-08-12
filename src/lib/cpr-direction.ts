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
