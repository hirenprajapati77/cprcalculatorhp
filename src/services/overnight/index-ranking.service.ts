/**
 * Index overnight/BTST LONG scoring — mirrors BtstRankingService (max 130)
 * with India VIX calm replacing the stock VDU volume rule.
 */
import { ADVANCED_SCORE } from '@/config/trading-constants';

export interface IndexScoringInputs {
  /** True when tomorrow CPR is NARROW per classifyCprWidth (single source of truth). */
  tomorrowCprNarrow: boolean;
  tomorrowBc: number;
  tomorrowTc: number;
  todayBc: number;
  todayTc: number;
  close: number;
  high: number;
  low: number;
  vwap: number | null | undefined;
  last15mHigh: number | null | undefined;
  /**
   * India VIX calm flag from IndexDiscoverService.getIndiaVixState.
   * null/undefined → score safety INVALID (same contract as missing VWAP).
   */
  vixCalm: boolean | null | undefined;
  hasConfirmationCandles: boolean;
}

/** Per-rule points for Index LONG scoring (max 130) — mirrors Scanner explainability UI shape. */
export interface IndexScoreBreakdown {
  /** Rule 1: India VIX calm (replaces stock VDU). */
  vixCalm: number;
  cprNarrow: number;
  higherValue: number;
  vwap: number;
  /** Rule 5: close vs last-15m extreme (UI label remains "Liquidity"). */
  liquidity: number;
  closeStrength: number;
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

/**
 * Score floors — identical to ADVANCED_SCORE so index and stock BTST share
 * the same READY/WATCH/STRONG gates (option suggestions use READY+).
 */
export const INDEX_SCORE = {
  STRONG: ADVANCED_SCORE.STRONG,
  READY: ADVANCED_SCORE.READY,
  WATCH: ADVANCED_SCORE.WATCH,
  MAX: ADVANCED_SCORE.MAX,
} as const;

/** Award Rule 1 calm points when latest India VIX close is strictly below this. */
export const INDIA_VIX_CALM_MAX = 20;

/**
 * Discover treats latest India VIX close at or above this as elevated —
 * overnight LONG is forced to IGNORE (score-invalid; no invented setups).
 */
export const INDIA_VIX_ELEVATED_MIN = 25;

export class IndexRankingService {
  /**
   * Calculates the quantitative Index LONG score (max 130) with per-rule breakdown.
   * Returns null score if INVALID due to missing inputs — never guesses from
   * partial data (same score-safety contract as BtstRankingService).
   */
  static calculateScoreDetails(inputs: IndexScoringInputs): IndexScoreDetails {
    if (
      inputs.vwap === undefined || inputs.vwap === null ||
      inputs.last15mHigh === undefined || inputs.last15mHigh === null ||
      inputs.vixCalm === undefined || inputs.vixCalm === null ||
      !inputs.hasConfirmationCandles
    ) {
      return { score: null, breakdown: null };
    }

    const breakdown: IndexScoreBreakdown = {
      vixCalm: 0,
      cprNarrow: 0,
      higherValue: 0,
      vwap: 0,
      liquidity: 0,
      closeStrength: 0,
    };

    // Rule 1: India VIX calm (replaces stock VDU) — 25 pts
    if (inputs.vixCalm) {
      breakdown.vixCalm = 25;
    }

    // Rule 2: CPR Narrow — uses calculateCPR → classifyCprWidth (ATR-aware)
    if (inputs.tomorrowCprNarrow) {
      breakdown.cprNarrow = 30;
    }

    // Rule 3: Higher Value — tomorrowCpr BC and TC both above todayCpr BC and TC
    if (inputs.tomorrowBc > inputs.todayBc && inputs.tomorrowTc > inputs.todayTc) {
      breakdown.higherValue = 20;
    }

    // Rule 4: Price Confirmation (Close > TC AND Close > VWAP)
    if (inputs.close > inputs.todayTc && inputs.close > inputs.vwap) {
      breakdown.vwap = 20;
    }

    // Rule 5: EOD Liquidity — close > highest price in 15:15–15:30 IST window
    if (inputs.close > inputs.last15mHigh) {
      breakdown.liquidity = 20;
    }

    // Rule 6: Closing Strength / CLV ((Close - Low) / (High - Low) > 0.70)
    const range = inputs.high - inputs.low;
    if (range > 0) {
      const closingStrength = (inputs.close - inputs.low) / range;
      if (closingStrength > 0.70) {
        breakdown.closeStrength = 15;
      }
    }

    const score =
      breakdown.vixCalm +
      breakdown.cprNarrow +
      breakdown.higherValue +
      breakdown.vwap +
      breakdown.liquidity +
      breakdown.closeStrength;

    return { score, breakdown };
  }

  static calculateScore(inputs: IndexScoringInputs): number | null {
    return this.calculateScoreDetails(inputs).score;
  }

  /**
   * Categorizes the signal based on the calculated score.
   * Floors match ADVANCED_SCORE / stock BTST (100 / 85 / 70).
   */
  static getClassification(score: number | null): IndexClassification {
    if (score === null) return 'IGNORE';
    if (score >= INDEX_SCORE.STRONG) return 'INDEX_STRONG';
    if (score >= INDEX_SCORE.READY) return 'INDEX_READY';
    if (score >= INDEX_SCORE.WATCH) return 'INDEX_WATCH';
    return 'IGNORE';
  }
}
