/**
 * Overnight LONG/SHORT conflict resolution.
 * Null scores are ineligible — never coerced to 0.
 */

export interface OvernightConflictSide {
  score: number | null;
  cls: string;
  sl: number;
  target: number;
  scoreBreakdown?: unknown;
}

export interface OvernightConflictResult {
  finalDir: 'LONG' | 'SHORT' | null;
  finalSig: OvernightConflictSide | null;
  /** 'NEUTRAL_CONFLICT' when both sides score and |diff| < threshold; winner's cls when clear; 'IGNORE' when no signal. */
  finalCls: string;
}

export const OVERNIGHT_CONFLICT_DIFF = 10;

/**
 * Resolve direction when both LONG and SHORT are scored.
 * Directions with score === null are treated as missing (not zero).
 */
export function resolveOvernightConflict(
  longSig: OvernightConflictSide | null,
  shortSig: OvernightConflictSide | null,
  conflictDiffThreshold: number = OVERNIGHT_CONFLICT_DIFF
): OvernightConflictResult {
  const longOk = longSig !== null && longSig.score !== null ? longSig : null;
  const shortOk = shortSig !== null && shortSig.score !== null ? shortSig : null;

  if (longOk && shortOk) {
    const longScore = longOk.score as number;
    const shortScore = shortOk.score as number;
    const diff = Math.abs(longScore - shortScore);
    const finalDir: 'LONG' | 'SHORT' = longScore >= shortScore ? 'LONG' : 'SHORT';
    const finalSig = finalDir === 'LONG' ? longOk : shortOk;
    const finalCls = diff < conflictDiffThreshold ? 'NEUTRAL_CONFLICT' : finalSig.cls;
    return { finalDir, finalSig, finalCls };
  }

  if (longOk) {
    return { finalDir: 'LONG', finalSig: longOk, finalCls: longOk.cls };
  }

  if (shortOk) {
    return { finalDir: 'SHORT', finalSig: shortOk, finalCls: shortOk.cls };
  }

  return { finalDir: null, finalSig: null, finalCls: 'IGNORE' };
}
