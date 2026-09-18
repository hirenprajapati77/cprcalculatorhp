import { safeRatio } from './math';

export interface OptionPnl {
  pnl: number;
  pnlPct: number;
}

/**
 * Computes direction-aware P&L for journal entries.
 * - Standard option positions (CE and PE premium buys) and Long underlying cash legs: exit - entry
 * - Short underlying cash positions (STBT fallback legs): entry - exit
 */
export function computeJournalPnl(
  entryCmp: number,
  exitCmp: number,
  opts?: { isShortUnderlying?: boolean }
): OptionPnl {
  const isShort = Boolean(opts?.isShortUnderlying);
  const pnl = isShort ? entryCmp - exitCmp : exitCmp - entryCmp;
  const pnlPct = safeRatio(pnl, entryCmp, 0) * 100;
  return {
    pnl: round2(pnl),
    pnlPct: round2(pnlPct),
  };
}

export function computeOptionPnl(entryCmp: number, exitCmp: number): OptionPnl {
  return computeJournalPnl(entryCmp, exitCmp, { isShortUnderlying: false });
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
