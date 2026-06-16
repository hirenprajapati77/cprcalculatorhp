import { MarketStockData } from '../market.service';

export interface GapProbabilityResult {
  expectedGap: number;     // Expected gap size in percentage (e.g. 0.8%)
  gapConfidence: number;   // Confidence percentage (e.g. 72)
}

export class GapProbabilityService {
  /**
   * Calculates the expected opening gap percentage and prediction confidence.
   */
  static calculateGapProbability(
    stock: MarketStockData,
    direction: 'LONG' | 'SHORT' = 'LONG'
  ): GapProbabilityResult {
    const history = stock.history || [];
    const len = history.length;

    // Default values
    let expectedGap = 0.5; // default 0.5% gap-up expected
    let gapConfidence = 60; // default 60% confidence

    if (len >= 3) {
      let positiveGapCount = 0;
      let totalTradedDays = 0;
      let gapPercentageSum = 0;

      // Analyze days where the previous day's closing strength was strong (> 0.70)
      for (let i = 1; i < len; i++) {
        const prevDay = history[i - 1];
        const prevRange = prevDay.high - prevDay.low;
        if (prevRange <= 0) continue;

        const prevClosingStrength = (prevDay.close - prevDay.low) / prevRange;

        // If previous day closed strong (representing a potential BTST signal)
        if (prevClosingStrength > 0.70) {
          totalTradedDays++;
          const todayOpen = history[i].open;
          const prevClose = prevDay.close;
          const gapPct = ((todayOpen - prevClose) / prevClose) * 100;

          if (direction === 'LONG' && gapPct > 0) {
          positiveGapCount++;
        } else if (direction === 'SHORT' && gapPct < 0) {
          positiveGapCount++;
        }
          gapPercentageSum += gapPct;
        }
      }

      if (totalTradedDays > 0) {
        // Average size of gaps
        expectedGap = gapPercentageSum / totalTradedDays;
        // Frequency of successful gap-ups (capped between 40% and 95% for realistic output)
        const rawConfidence = (positiveGapCount / totalTradedDays) * 100;
        gapConfidence = Math.round(Math.max(40, Math.min(rawConfidence, 95)));
      }
    }

    // Adjust for today's price position relative to tomorrow's CPR
    // (If the close is strong, we expect positive gap size)
    if (expectedGap < 0.2) {
      expectedGap = 0.2; // Floor positive expectations for discovered signals
    }

    return {
      expectedGap: parseFloat(expectedGap.toFixed(2)),
      gapConfidence
    };
  }
}
