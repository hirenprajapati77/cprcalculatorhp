/**
 * Index CPR scoring — Phase 1.
 * Deliberately narrower than BtstRankingService/StbtRankingService: no
 * volume/VDU rule (indices don't have a meaningful single "volume" figure
 * the way a stock does) and no last-15m-high liquidity rule (that rule
 * exists to confirm real trade-able liquidity into the close, which is a
 * stock-specific concern — index breadth/OI would be the equivalent, and
 * those are explicitly out of scope for Phase 1).
 *
 * Max score = 100, matching ADVANCED_SCORE.STRONG in trading-constants.ts,
 * so index and stock classifications sit on comparable scales even though
 * the rule sets differ.
 */

export interface IndexScoringInputs {
  /** True when tomorrow CPR is NARROW per classifyCprWidth (single source of truth). */
  tomorrowCprNarrow: boolean;
  tomorrowBc: number;
  tomorrowTc: number;
  todayBc: number;
  todayTc: number;
  close: number;
  vwap: number | null | undefined;
  hasConfirmationCandles: boolean;
}

/** Per-rule points for Index LONG scoring (max 100) — mirrors Scanner explainability UI shape. */
export interface IndexScoreBreakdown {
  cprNarrow: number;
  higherValue: number;
  vwap: number;
}

export interface IndexScoreDetails {
  score: number | null;
  breakdown: IndexScoreBreakdown | null;
}

/**
 * Index classification values are deliberately distinct string literals from
 * the stock classifications (STRONG_BTST/BTST_READY/WATCH/IGNORE) so an index
 * row can never accidentally pass a stock-only classification filter
 * downstream (e.g. selectTradableOvernightPicks' LONG_READY/SHORT_READY sets).
 */
export type IndexClassification = 'INDEX_STRONG' | 'INDEX_READY' | 'INDEX_WATCH' | 'IGNORE';

export class IndexRankingService {
  /**
   * Calculates the quantitative Index LONG score (max 100) with per-rule breakdown.
   * Returns null score if INVALID due to missing inputs — never guesses from
   * partial data (same score-safety contract as BtstRankingService).
   */
  static calculateScoreDetails(inputs: IndexScoringInputs): IndexScoreDetails {
    if (
      inputs.vwap === undefined || inputs.vwap === null ||
      !inputs.hasConfirmationCandles
    ) {
      return { score: null, breakdown: null };
    }

    const breakdown: IndexScoreBreakdown = {
      cprNarrow: 0,
      higherValue: 0,
      vwap: 0,
    };

    // Rule 1: CPR Narrow — uses calculateCPR → classifyCprWidth (ATR-aware), same
    // single source of truth as the stock BTST/STBT rules.
    if (inputs.tomorrowCprNarrow) {
      breakdown.cprNarrow = 40;
    }

    // Rule 2: Higher Value — tomorrowCpr BC and TC both above todayCpr BC and TC.
    if (inputs.tomorrowBc > inputs.todayBc && inputs.tomorrowTc > inputs.todayTc) {
      breakdown.higherValue = 30;
    }

    // Rule 3: Price Confirmation (Close > TC AND Close > VWAP).
    if (inputs.close > inputs.todayTc && inputs.close > inputs.vwap) {
      breakdown.vwap = 30;
    }

    const score = breakdown.cprNarrow + breakdown.higherValue + breakdown.vwap;

    return { score, breakdown };
  }

  static calculateScore(inputs: IndexScoringInputs): number | null {
    return this.calculateScoreDetails(inputs).score;
  }

  /**
   * Categorizes the signal based on the calculated score.
   *
   * Index scoring is three binary rules (40 + 30 + 30) → discrete totals
   * {0, 30, 40, 60, 70, 100}. Stock ADVANCED_SCORE.READY=85 is unreachable
   * on this scale, so tiers map to the achievable buckets:
   *   100 → STRONG (all three rules)
   *   ≥70 → READY  (narrow + one confirmation)
   *   ≥40 → WATCH  (narrow alone, or both 30-pt confirms without narrow)
   *   else IGNORE
   */
  static getClassification(score: number | null): IndexClassification {
    if (score === null) return 'IGNORE';
    if (score >= 100) return 'INDEX_STRONG';
    if (score >= 70) return 'INDEX_READY';
    if (score >= 40) return 'INDEX_WATCH';
    return 'IGNORE';
  }
}
