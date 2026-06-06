import { ScannerSignalResult } from './scanner.service';

export class RankingService {
  /**
   * Calculates a score out of 100 for a stock based on active signals.
   *
   * Weights:
   * - Narrow CPR: +30
   * - Breakout: +25
   * - Bullish: +20
   * - Volume Spike (or Vol ratio >= 1.5): +15
   * - Momentum: +10
   * - Inside CPR: +5
   *
   * The total score is capped at 100.
   */
  static calculateScore(result: Omit<ScannerSignalResult, 'score'>): number {
    let score = 0;
    const { signals, volume, avgVolume } = result;
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    if (signals.includes('NARROW')) {
      score += 30;
    }
    if (signals.includes('BREAKOUT')) {
      score += 25;
    }
    if (signals.includes('BULLISH')) {
      score += 20;
    }
    if (signals.includes('VOLUME_SPIKE') || volumeRatio >= 1.5) {
      score += 15;
    }
    if (signals.includes('MOMENTUM')) {
      score += 10;
    }
    if (signals.includes('INSIDE')) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Returns the qualitative classification label based on the numerical score.
   */
  static getClassification(score: number): 'Strong Buy' | 'Opportunity' | 'Watch' | 'Ignore' | 'Avoid' {
    if (score >= 90) return 'Strong Buy';
    if (score >= 70) return 'Opportunity';
    if (score >= 40) return 'Watch';
    if (score >= 20) return 'Ignore';
    return 'Avoid';
  }

  /**
   * Rates and sorts scanned stocks by score descending.
   */
  static rankStocks(stocks: Omit<ScannerSignalResult, 'score'>[]): Array<ScannerSignalResult & { score: number }> {
    const scored = stocks.map((stock) => {
      const score = this.calculateScore(stock);
      return {
        ...stock,
        score,
      };
    });

    // Sort descending by score
    return scored.sort((a, b) => b.score - a.score);
  }
}
