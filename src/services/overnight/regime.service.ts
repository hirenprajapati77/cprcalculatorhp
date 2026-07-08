import { MarketService } from '../market.service';

export interface MarketRegime {
  trend: 'BULL' | 'BEAR' | 'CHOPPY';
  volatility: 'HIGH' | 'LOW';
  score: number; // 0 to 100 representing trend strength
}

export class RegimeService {
  private static cachedRegime: { date: string; regime: MarketRegime } | null = null;

  /**
   * Fetches the broad market regime based on NIFTY 50 (^NSEI) history.
   * Caches the result per day to avoid redundant network calls.
   */
  static async getMarketRegime(date: string): Promise<MarketRegime> {
    if (this.cachedRegime && this.cachedRegime.date === date) {
      return this.cachedRegime.regime;
    }

    try {
      // Use ^NSEI for Nifty 50
      const history = await MarketService.getHistoricalData('^NSEI', '1d', '3mo');
      
      if (!history || history.length < 20) {
        // Fallback if data is missing
        return this.getDefaultRegime();
      }

      const latest = history[history.length - 1];
      
      // Calculate 20 EMA
      const closePrices = history.map(h => h.close);
      const ema20 = this.calculateEMA(closePrices, 20);
      const currentEma20 = ema20[ema20.length - 1];
      const prevEma20 = ema20[ema20.length - 2];
      
      // Trend calculation
      let trend: 'BULL' | 'BEAR' | 'CHOPPY' = 'CHOPPY';
      let score = 50;

      if (latest.close > currentEma20 && currentEma20 > prevEma20) {
        trend = 'BULL';
        score = 80;
      } else if (latest.close < currentEma20 && currentEma20 < prevEma20) {
        trend = 'BEAR';
        score = 20;
      }

      // Volatility calculation (ATR % over 14 days)
      const atr = this.calculateATR(history, 14);
      const atrPct = (atr / latest.close) * 100;
      // Nifty typically ranges 0.5% to 1.5% daily. > 1.2% is high volatility.
      const volatility: 'HIGH' | 'LOW' = atrPct > 1.2 ? 'HIGH' : 'LOW';

      const regime = { trend, volatility, score };
      
      // Cache it
      this.cachedRegime = { date, regime };
      
      console.log(`[RegimeService] NIFTY 50 Regime for ${date}: ${trend} / ${volatility} (ATR%: ${atrPct.toFixed(2)}%)`);
      return regime;
    } catch (error) {
      console.error(`[RegimeService] Error fetching NIFTY 50 regime:`, error);
      return this.getDefaultRegime();
    }
  }

  private static getDefaultRegime(): MarketRegime {
    return { trend: 'CHOPPY', volatility: 'LOW', score: 50 };
  }

  private static calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  private static calculateATR(history: any[], period: number): number {
    if (history.length <= period) return 0;
    
    let trSum = 0;
    const trValues = [];
    
    for (let i = 1; i < history.length; i++) {
      const high = history[i].high;
      const low = history[i].low;
      const prevClose = history[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trValues.push(tr);
    }
    
    // Simple average of True Range for ATR
    const recentTr = trValues.slice(-period);
    return recentTr.reduce((a, b) => a + b, 0) / period;
  }
}
