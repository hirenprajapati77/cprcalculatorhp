export interface BtstScoringInputs {
  volume: number;
  avgVolume: number;
  tomorrowCprWidth: number;
  tomorrowBc: number;
  tomorrowTc: number;   // needed for aligned higherValue condition
  todayBc: number;      // needed for aligned higherValue condition
  todayTc: number;
  close: number;
  high: number;
  low: number;
  vwap: number | null | undefined;
  intradayVolume: number | null | undefined;
  last15mHigh: number | null | undefined;
  hasConfirmationCandles: boolean;
}

/** Per-rule points for Advanced BTST (max 130) — keys match Scanner explainability UI. */
export interface AdvancedScoreBreakdown {
  vdu: number;
  cprNarrow: number;
  higherValue: number;
  vwap: number;
  /** Rule 5: close vs last-15m extreme (UI label remains "Liquidity"). */
  liquidity: number;
  closeStrength: number;
}

export interface BtstScoreDetails {
  score: number | null;
  breakdown: AdvancedScoreBreakdown | null;
}

export class BtstRankingService {
  /**
   * Calculates the quantitative BTST score (max 130) with per-rule breakdown.
   * Returns null score if INVALID due to missing inputs.
   */
  static calculateScoreDetails(inputs: BtstScoringInputs): BtstScoreDetails {
    // Score Safety: If required inputs are missing, return null (INVALID)
    if (
      inputs.vwap === undefined || inputs.vwap === null ||
      inputs.intradayVolume === undefined || inputs.intradayVolume === null || inputs.intradayVolume <= 0 ||
      inputs.last15mHigh === undefined || inputs.last15mHigh === null ||
      !inputs.hasConfirmationCandles
    ) {
      return { score: null, breakdown: null };
    }

    const breakdown: AdvancedScoreBreakdown = {
      vdu: 0,
      cprNarrow: 0,
      higherValue: 0,
      vwap: 0,
      liquidity: 0,
      closeStrength: 0,
    };

    // Rule 1: VDU (Volume > 1.5x 20D Avg)
    if (inputs.volume > 1.5 * inputs.avgVolume) {
      breakdown.vdu = 25;
    }

    // Rule 2: CPR Narrow (Tomorrow Width < 0.35%)
    if (inputs.tomorrowCprWidth < 0.35) {
      breakdown.cprNarrow = 30;
    }

    // Rule 3: Higher Value — tomorrowCpr BC and TC both above todayCpr BC and TC
    // (aligned with Simple Engine: partial overlap is OK, both edges must move up)
    if (inputs.tomorrowBc > inputs.todayBc && inputs.tomorrowTc > inputs.todayTc) {
      breakdown.higherValue = 20;
    }

    // Rule 4: Price Confirmation (Close > TC AND Close > VWAP)
    if (inputs.close > inputs.todayTc && inputs.close > inputs.vwap) {
      breakdown.vwap = 20;
    }

    // Rule 5: 3:20-3:25 Confirmation (Price > Last 15m High)
    if (inputs.close > inputs.last15mHigh) {
      breakdown.liquidity = 20;
    }

    // Rule 6: Closing Strength ((Close - Low) / (High - Low) > 0.70)
    const range = inputs.high - inputs.low;
    if (range > 0) {
      const closingStrength = (inputs.close - inputs.low) / range;
      if (closingStrength > 0.70) {
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
   * Calculates the quantitative BTST score (max 130).
   * Returns null if score is INVALID due to missing inputs.
   */
  static calculateScore(inputs: BtstScoringInputs): number | null {
    return this.calculateScoreDetails(inputs).score;
  }

  /**
   * Categorizes the signal based on the calculated score.
   */
  static getClassification(score: number | null): 'STRONG_BTST' | 'BTST_READY' | 'WATCH' | 'IGNORE' {
    if (score === null) return 'IGNORE';
    if (score >= 100) return 'STRONG_BTST';
    if (score >= 85) return 'BTST_READY';
    if (score >= 70) return 'WATCH';
    return 'IGNORE';
  }
}
