import { safeRatio } from './math';

export interface OptionPnl {
  pnl: number;
  pnlPct: number;
}

/**
 * Computes per-unit option P&L for a long-premium position (both CE and PE journal
 * entries are recorded as premium buys, so exit - entry is the raw premium delta).
 *
 * Robustness guarantees for a real-money journal:
 *  - Never divides by zero / produces NaN or Infinity (guarded via safeRatio).
 *  - Rounds to sane precision (2 dp for absolute premium, 2 dp for percent) so stored
 *    values don't accumulate floating-point noise across analytics aggregations.
 *
 * NOTE: This is per-unit option premium P&L, NOT rupees-at-risk. Lot size / quantity
 * is intentionally not modelled here (see AGENTS.md follow-ups).
 */
export function computeOptionPnl(entryCmp: number, exitCmp: number): OptionPnl {
  const pnl = exitCmp - entryCmp;
  const pnlPct = safeRatio(pnl, entryCmp, 0) * 100;
  return {
    pnl: round2(pnl),
    pnlPct: round2(pnlPct),
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
