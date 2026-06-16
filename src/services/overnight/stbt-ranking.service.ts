export interface StbtScoringInputs {
  volume: number;
  avgVolume: number;
  tomorrowCprWidth: number;
  tomorrowTc: number;
  todayBc: number;
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

    // Rule 1: Lower Value (Tomorrow TC < Today BC)
    if (inputs.tomorrowTc < inputs.todayBc) {
      score += 20;
    }

    // Rule 2: Volume Expansion + Lower 30% close
    if (inputs.volume > 1.5 * inputs.avgVolume) {
      if (range > 0) {
        const closePosition = (inputs.close - inputs.low) / range;
        if (closePosition <= 0.30) {
          score += 25;
        }
      }
    }

    // Rule 3: Narrow CPR (Tomorrow Width < 0.35%)
    if (inputs.tomorrowCprWidth < 0.35) {
      score += 25;
    }

    // Rule 4: Close < VWAP
    if (inputs.close < inputs.vwap) {
      score += 20;
    }

    // Rule 5: Break Last 15m Low
    if (inputs.close < inputs.last15mLow) {
      score += 20;
    }

    // Rule 6: Weak Close ((High - Close) / (High - Low) > 0.70)
    if (range > 0) {
      const closingWeakness = (inputs.high - inputs.close) / range;
      if (closingWeakness > 0.70) {
        score += 20;
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
