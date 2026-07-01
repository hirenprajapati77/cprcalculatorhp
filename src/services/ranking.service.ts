import { ScannerSignalResult } from './scanner.service';

export class RankingService {
  /**
   * Calculates a score out of 100 for a stock based on active signals.
   *
   * Category A — CPR Structure (max 45):
   *   NARROW: +15, HIGHER_VALUE/INSIDE_VALUE: +10, BREAKOUT/BUILD: +10,
   *   KGS_INSIDE_CPR: +10, VIRGIN: +5, ASC+BULLISH or DESC+BEARISH: +5
   *
   * Category B — Volume & Liquidity (max 25, Volume Ratio only):
   *   VOLUME_SPIKE or ratio >= 1.5: +15, ratio >= 1.2: +10
   *
   * Category C — Momentum & Trend (max 20):
   *   MOMENTUM: +10, NORMAL + directional: +10
   *
   * Category D — Hot Zone & RTP (max 10):
   *   HOT_ZONE: +5, NARROW + KGS_RTP: +5
   *
   * Conflict penalties: -10 each for ASC_CPR+BEARISH, DESC_CPR+BULLISH, KGS_OUTSIDE_CPR
   */
  static calculateScore(result: Omit<ScannerSignalResult, 'score' | 'confidence'>): number {
    const { signals, volume, avgVolume } = result;
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    // Category A: CPR Structure (Max 45)
    let catASum = 0;
    if (signals.includes('NARROW')) {
      catASum += 15;
    }
    if (signals.includes('HIGHER_VALUE') || signals.includes('INSIDE_VALUE')) {
      catASum += 10;
    }
    if (signals.includes('BREAKOUT') || signals.includes('LONG_BUILD') || signals.includes('SHORT_BUILD')) {
      catASum += 10;
    }
    if (signals.includes('KGS_INSIDE_CPR')) {
      catASum += 10;
    }
    if (signals.includes('VIRGIN')) {
      catASum += 5;
    }
    if (
      (signals.includes('KGS_ASC_CPR') && signals.includes('BULLISH')) ||
      (signals.includes('KGS_DESC_CPR') && signals.includes('BEARISH'))
    ) {
      catASum += 5;
    }
    const catA = Math.min(45, catASum);

    // Category B: Volume & Liquidity (Max 25, Additive)
    let catBSum = 0;
    if (signals.includes('VOLUME_SPIKE') || volumeRatio >= 1.5) {
      catBSum += 15;
    }
    if (volumeRatio >= 1.2) {
      catBSum += 10;
    }
    const catB = Math.min(25, catBSum);

    // Category C: Momentum & Trend Alignment (Max 20)
    let catCSum = 0;
    if (signals.includes('MOMENTUM')) {
      catCSum += 10;
    }
    if (signals.includes('NORMAL') && (signals.includes('BULLISH') || signals.includes('BEARISH'))) {
      catCSum += 10;
    }
    const catC = Math.min(20, catCSum);

    // Category D: Hot Zone & RTP (Max 10)
    let catDSum = 0;
    if (signals.includes('HOT_ZONE')) {
      catDSum += 5;
    }
    if (signals.includes('NARROW') && signals.includes('KGS_RTP')) {
      catDSum += 5;
    }
    const catD = Math.min(10, catDSum);

    // Base Score Sum
    let score = catA + catB + catC + catD;

    // Conflict Penalties (subtracted after weighted sum)
    if (signals.includes('KGS_ASC_CPR') && signals.includes('BEARISH')) {
      score -= 10;
    }
    if (signals.includes('KGS_DESC_CPR') && signals.includes('BULLISH')) {
      score -= 10;
    }
    if (signals.includes('KGS_OUTSIDE_CPR')) {
      score -= 10;
    }

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Returns the qualitative classification label based on the numerical score.
   */
  static getClassification(score: number): 'A+' | 'A' | 'B' | 'Ignore' {
    if (score >= 75) return 'A+';
    if (score >= 60) return 'A';
    if (score >= 40) return 'B';
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

