import { ScannerSignalResult } from './scanner.service';

export class RankingService {
  /**
   * Calculates a score out of 100 for a stock based on active signals.
   *
   * Weights:
   * - Compression (Narrow CPR): +25
   * - Higher Value (or Inside Value): +20
   * - Breakout: +20
   * - Volume (Volume Spike): +10
   * - Momentum: +10
   * - Liquidity (High Market Cap / Volume Ratio): +10
   * - Hot Zone: +5
   *
   * The total score is normalized between 0-100.
   */
  static calculateScore(result: Omit<ScannerSignalResult, 'score' | 'confidence'>): number {
    let score = 0;
    const { signals, volume, avgVolume, marketCap } = result;
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    // 1. Compression (Narrow CPR)
    if (signals.includes('NARROW')) {
      score += 25;
    }
    
    // 2. Higher Value (or Inside Value)
    if (signals.includes('HIGHER_VALUE') || signals.includes('INSIDE_VALUE')) {
      score += 20;
    }
    
    // 3. Breakout
    if (signals.includes('BREAKOUT') || signals.includes('LONG_BUILD') || signals.includes('SHORT_BUILD')) {
      score += 20;
    }
    
    // 4. Volume
    if (signals.includes('VOLUME_SPIKE') || volumeRatio >= 1.5) {
      score += 10;
    }
    
    // 5. Momentum
    if (signals.includes('MOMENTUM')) {
      score += 10;
    }
    
    // 6. Liquidity
    if (marketCap >= 15000 || volumeRatio >= 1.0) {
      score += 10;
    }
    
    // 7. Hot Zone
    if (signals.includes('HOT_ZONE')) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Returns the qualitative classification label based on the numerical score.
   */
  static getClassification(score: number): 'A+' | 'A' | 'B' | 'Ignore' {
    if (score >= 90) return 'A+';
    if (score >= 70) return 'A';
    if (score >= 50) return 'B';
    return 'Ignore';
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

