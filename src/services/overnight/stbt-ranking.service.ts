export interface StbtScoringInputs {
  volume: number;
  avgVolume: number;
  tomorrowCprWidth: number;
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

export class StbtRankingService {
  /**
   * Calculates the quantitative STBT score (max 130).
   * Returns null if score is INVALID due to missing inputs.
   */
  static calculateScore(inputs: StbtScoringInputs): number | null {
    if (
      inputs.vwap === undefined || inputs.vwap === null ||
      inputs.intradayVolume === undefined || inputs.intradayVolume === null || inputs.intradayVolume <= 0 ||
      inputs.last15mLow === undefined || inputs.last15mLow === null ||
      !inputs.hasConfirmationCandles
    ) {
      return null;
    }

    let score = 0;
    const range = inputs.high - inputs.low;

    // Rule 1: VDU — Volume Expansion (> 1.5x 20D avg) [mirrors BTST Rule 1: +25]
    if (inputs.volume > 1.5 * inputs.avgVolume) {
      score += 25;
    }

    // Rule 2: Lower Value — tomorrowCpr BC and TC both below todayCpr BC and TC
    // (aligned with Simple Engine: partial overlap is OK, both edges must move down)
    if (inputs.tomorrowBc < inputs.todayBc && inputs.tomorrowTc < inputs.todayTc) {
      score += 20;
    }

    // Rule 3: Narrow CPR (Tomorrow Width < 0.35%) [mirrors BTST Rule 2: +30]
    if (inputs.tomorrowCprWidth < 0.35) {
      score += 30;
    }

    // Rule 4: Close < Today's BC AND Close < VWAP — bearish confirmation
    // [true mirror of BTST Rule 4: close > todayTc && close > vwap]
    if (inputs.close < inputs.todayBc && inputs.close < inputs.vwap) {
      score += 20;
    }

    // Rule 5: Break Last 15m Low (3:20-3:25 weakness confirmed) [mirrors BTST Rule 5: +20]
    if (inputs.close < inputs.last15mLow) {
      score += 20;
    }

    // Rule 6: Closing Weakness — close in bottom 30% of day range [mirrors BTST Rule 6: +15]
    // Symmetric with BTST closing-strength (top 70%) but for the bear side.
    if (range > 0) {
      const closingWeakness = (inputs.close - inputs.low) / range;
      if (closingWeakness < 0.30) {
        score += 15;
      }
    }

    return score;
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
