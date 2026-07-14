import { MarketStockData } from './market.service';
import { calculateCPR, calculateAtrCompressionRatio } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';

export interface CprCompressionStats {
  avg5: number;
  avg10: number;
  min20: number;
}

export class CprCompressionService {
  /**
   * Calculates rolling CPR width averages synchronously.
   * This operates in memory without I/O as the calculation is O(N) where N <= 20.
   */
  static getStats(stock: MarketStockData): CprCompressionStats | null {
    if (!stock.history || stock.history.length === 0) return null;

    const widths: number[] = [];
    const history = stock.history;

    // Iterating backwards from the last completed day (history.length - 1).
    // CPR for a given day is based on the previous day's OHLC.
    // So to get the CPR widths for the last 20 days, we loop up to 20 times.
    for (let i = history.length - 1; i > 0 && widths.length < 20; i--) {
      const prevCandle = history[i - 1];
      const atrPct = getAtrPct(history.slice(0, i), prevCandle.close); // Approximate ATR at that time
      const cpr = calculateCPR({
        high: prevCandle.high,
        low: prevCandle.low,
        close: prevCandle.close
      }, atrPct);

      // Using ATR Compression Ratio if available, else raw width
      const atrRatio = calculateAtrCompressionRatio(cpr.width, atrPct);
      widths.push(atrRatio !== undefined ? atrRatio : cpr.width);
    }

    if (widths.length === 0) return null;

    const slice5 = widths.slice(0, 5);
    const slice10 = widths.slice(0, 10);
    const slice20 = widths.slice(0, 20);

    const avg5 = slice5.reduce((a, b) => a + b, 0) / slice5.length;
    const avg10 = slice10.reduce((a, b) => a + b, 0) / slice10.length;
    const min20 = Math.min(...slice20);

    return { avg5, avg10, min20 };
  }
}
