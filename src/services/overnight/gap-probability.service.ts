import { MarketStockData } from '../market.service';

export interface GapProbabilityResult {
  expectedGap: number;     // Expected gap size in percentage (e.g. 0.8%)
  gapConfidence: number;   // Confidence percentage (e.g. 72)
  gapProbability?: number;
}

export class GapProbabilityService {
  /**
   * Calculates the expected opening gap percentage and prediction confidence.
   */
  static calculateGapProbability(
    stock: MarketStockData,
    direction: 'LONG' | 'SHORT' = 'LONG'
  ): GapProbabilityResult {
    const ROLLING_WINDOW = 60; // sessions — avoid stale gap stats from old market regimes
    const fullHistory = stock.history || [];
    const history = fullHistory.slice(-ROLLING_WINDOW);
    const candlesWithGap = [];
    
    for (let i = 1; i < history.length; i++) {
      const prevClose = history[i - 1].close;
      const todayOpen = history[i].open;
      const gapPct = prevClose > 0 ? ((todayOpen - prevClose) / prevClose) * 100 : 0;
      candlesWithGap.push({
        ...history[i],
        gapPct
      });
    }

    const relevantGaps = candlesWithGap.filter(
      candle => direction === 'LONG' 
        ? candle.gapPct > 0.2   // gap up > 0.2%
        : candle.gapPct < -0.2  // gap down > 0.2%
    );

    const gapCount = relevantGaps.length;
    // Denominator is candlesWithGap.length (history.length - 1),
    // not history.length — that would inflate the denominator by 1.
    const totalCandles = candlesWithGap.length || 1;
    const gapProbability = gapCount / totalCandles;

    // Expected gap = average of relevant gaps
    const expectedGap = relevantGaps.length > 0
      ? relevantGaps.reduce(
          (sum, c) => sum + Math.abs(c.gapPct), 0
        ) / relevantGaps.length
      : 0;

    return {
      gapProbability,
      expectedGap: direction === 'SHORT' 
        ? parseFloat((-expectedGap).toFixed(2))   // negative for SHORT
        : parseFloat(expectedGap.toFixed(2)),
      gapConfidence: totalCandles < 20
        ? Math.min(Math.round(gapProbability * 100), 50) // small sample — cap confidence, avoid false precision
        : Math.min(Math.round(gapProbability * 100), 95)
    };
  }
}
