import type { AdvancedScoreBreakdown } from './btst-ranking.service';

export interface StbtScoringInputs {
  volume: number;
  avgVolume: number;
  /** True when tomorrow CPR is NARROW per classifyCprWidth (single source of truth). */
  tomorrowCprNarrow: boolean;
  tomorrowTc: number;
  tomorrowBc: number;   // needed for aligned lowerValue condition
  todayBc: number;
  todayTc: number;      // needed for aligned lowerValue condition
  close: number;
  high: number;
  low: number;
  vwap: number | null | undefined;
  intradayVolume: number | null | undefined;
  last15mLow: number | null | undefined;
  hasConfirmationCandles: boolean;
}

export interface StbtScoreDetails {
  score: number | null;
  breakdown: AdvancedScoreBreakdown | null;
}

export class StbtRankingService {
  /**
   * Calculates the quantitative STBT score (max 130) with per-rule breakdown.
   * Returns null score if INVALID due to missing inputs.
   */
  static calculateScoreDetails(inputs: StbtScoringInputs): StbtScoreDetails {
    if (
      inputs.vwap === undefined || inputs.vwap === null ||
      inputs.intradayVolume === undefined || inputs.intradayVolume === null || inputs.intradayVolume <= 0 ||
      inputs.last15mLow === undefined || inputs.last15mLow === null ||
      !inputs.hasConfirmationCandles
    ) {
      return { score: null, breakdown: null };
    }

    const breakdown: AdvancedScoreBreakdown = {
      vdu: 0,
      cprNarrow: 0,
      higherValue: 0, // Lower Value points land in the same UI slot
      vwap: 0,
      liquidity: 0,
      closeStrength: 0,
    };
    const range = inputs.high - inputs.low;

    // Rule 1: VDU — Volume Expansion (> 1.5x 20D avg) [mirrors BTST Rule 1: +25]
    if (inputs.volume > 1.5 * inputs.avgVolume) {
      breakdown.vdu = 25;
    }

    // Rule 2: Lower Value — tomorrowCpr BC and TC both below todayCpr BC and TC
    // (aligned with Simple Engine: partial overlap is OK, both edges must move down)
    if (inputs.tomorrowBc < inputs.todayBc && inputs.tomorrowTc < inputs.todayTc) {
      breakdown.higherValue = 20;
    }

    // Rule 3: Narrow CPR — uses calculateCPR → classifyCprWidth (ATR-aware)
    if (inputs.tomorrowCprNarrow) {
      breakdown.cprNarrow = 30;
    }

    // Rule 4: Close < Today's BC AND Close < VWAP — bearish confirmation
    // [true mirror of BTST Rule 4: close > todayTc && close > vwap]
    if (inputs.close < inputs.todayBc && inputs.close < inputs.vwap) {
      breakdown.vwap = 20;
    }

    // Rule 5: EOD Weakness — close < lowest price in 15:15–15:30 IST window
    if (inputs.close < inputs.last15mLow) {
      breakdown.liquidity = 20;
    }

    // Rule 6: Closing Weakness — close in bottom 30% of day range [mirrors BTST Rule 6: +15]
    // Symmetric with BTST closing-strength (top 70%) but for the bear side.
    if (range > 0) {
      const closingWeakness = (inputs.close - inputs.low) / range;
      if (closingWeakness < 0.30) {
        breakdown.closeStrength = 15;
      }
    }

    const score =
      breakdown.vdu +
      breakdown.cprNarrow +
      breakdown.higherValue +
      breakdown.vwap +
      breakdown.liquidity +
      breakdown.closeStrength;

    return { score, breakdown };
  }

  /**
   * Calculates the quantitative STBT score (max 130).
   * Returns null if score is INVALID due to missing inputs.
   */
  static calculateScore(inputs: StbtScoringInputs): number | null {
    return this.calculateScoreDetails(inputs).score;
  }

  /**
   * Categorizes the signal based on the calculated score.
   */
  static getClassification(score: number | null): 'STRONG_STBT' | 'STBT_READY' | 'WATCH' | 'IGNORE' {
    if (score === null) return 'IGNORE';
    if (score >= 100) return 'STRONG_STBT';
    if (score >= 85) return 'STBT_READY';
    if (score >= 70) return 'WATCH';
    return 'IGNORE';
  }
}
