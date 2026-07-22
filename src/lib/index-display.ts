/**
 * INDEX table display filters — hide midday noise without changing API payloads.
 */

export interface IndexDisplayRow {
  scanType?: string;
  score: number | null;
  classification: string;
}

/**
 * Hide null-score BTST rows outside the BTST discovery window (15:10–15:25 IST).
 * Those rows are score-safety INVALID until closing liquidity exists — showing
 * four NO TRADE / IGNORE lines mid-session confuses operators.
 * INTRA rows always remain visible.
 */
export function filterIndexRowsForDisplay<T extends IndexDisplayRow>(
  rows: T[],
  btstDiscoveryOpen: boolean
): T[] {
  return rows.filter((r) => {
    if (r.scanType === 'BTST' && r.score === null && !btstDiscoveryOpen) {
      return false;
    }
    return true;
  });
}

/** Primary reason line for the INDEX table (first non-empty reason). */
export function primaryIndexReason(reasons?: string[] | null): string | null {
  if (!reasons?.length) return null;
  const first = reasons.find((r) => typeof r === 'string' && r.trim().length > 0);
  return first ?? null;
}
