export interface BtstScoringInputs {
  volume: number;
  avgVolume: number;
  tomorrowCprWidth: number;
  tomorrowBc: number;
  todayTc: number;
  close: number;
  high: number;
  low: number;
  vwap: number | null | undefined;
  intradayVolume: number | null | undefined;
  last15mHigh: number | null | undefined;
  hasConfirmationCandles: boolean;
}

export class BtstRankingService {
  /**
   * Calculates the quantitative BTST score (max 130).
   * Returns null if score is INVALID due to missing inputs.
   */
  static calculateScore(inputs: BtstScoringInputs): number | null {
    // Score Safety: If required inputs are missing, return null (INVALID)
    if (
      inputs.vwap === undefined || inputs.vwap === null ||
      inputs.intradayVolume === undefined || inputs.intradayVolume === null || inputs.intradayVolume <= 0 ||
      inputs.last15mHigh === undefined || inputs.last15mHigh === null ||
      !inputs.hasConfirmationCandles
    ) {
      return null;
    }

    let score = 0;

    // Rule 1: VDU (Volume > 1.5x 20D Avg)
    if (inputs.volume > 1.5 * inputs.avgVolume) {
      score += 25;
    }

    // Rule 2: CPR Narrow (Tomorrow Width < 0.35%)
    if (inputs.tomorrowCprWidth < 0.35) {
      score += 30;
    }

    // Rule 3: Higher Value (Tomorrow BC > Today TC)
    if (inputs.tomorrowBc > inputs.todayTc) {
      score += 20;
    }

    // Rule 4: Price Confirmation (Close > TC AND Close > VWAP)
    if (inputs.close > inputs.todayTc && inputs.close > inputs.vwap) {
      score += 20;
    }

    // Rule 5: 3:20-3:25 Confirmation (Price > Last 15m High)
    if (inputs.close > inputs.last15mHigh) {
      score += 20;
    }

    // Rule 6: Closing Strength ((Close - Low) / (High - Low) > 0.70)
    const range = inputs.high - inputs.low;
    if (range > 0) {
      const closingStrength = (inputs.close - inputs.low) / range;
      if (closingStrength > 0.70) {
        score += 15;
      }
    }

    return score;
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
