import { HistoricalProvider } from '../backtest/historical.provider';
import { calculateATR } from '@/lib/atr';

// Requires 6 candles to compute a 5-day return.
export const RS_LOOKBACK = 5;

export interface MarketRegime {
  trend: 'BULL' | 'BEAR' | 'CHOPPY';
  volatility: 'HIGH' | 'LOW';
  score: number; // 0 to 100 representing trend strength
  niftyReturn5d: number; // % return over last 5 trading candles, for RS calculations
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
      const endDateObj = new Date(date);
      const startDateObj = new Date(date);
      startDateObj.setDate(startDateObj.getDate() - 90);

      const history = await HistoricalProvider.getHistory('^NSEI', startDateObj, endDateObj);
      
      if (!history || history.length < 21) {
        // Fallback if data is missing
        return this.getDefaultRegime();
      }

      const latest = history[history.length - 1];
      
      // Calculate 20 EMA
      const closePrices = history.map(h => h.close);
      const niftyReturn5d = closePrices.length > RS_LOOKBACK
        ? ((closePrices[closePrices.length - 1] - closePrices[closePrices.length - 1 - RS_LOOKBACK]) /
           closePrices[closePrices.length - 1 - RS_LOOKBACK]) * 100
        : 0;
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
      // Passing slice(-15) yields 14 TR calculations, matching the old 14-day behavior
      const atr = calculateATR(history.slice(-15), latest.close);
      const atrPct = latest.close > 0 ? (atr / latest.close) * 100 : 0;
      // Nifty typically ranges 0.5% to 1.5% daily. > 1.2% is high volatility.
      const volatility: 'HIGH' | 'LOW' = atrPct > 1.2 ? 'HIGH' : 'LOW';

      const regime = { trend, volatility, score, niftyReturn5d };
      
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
    return { trend: 'CHOPPY', volatility: 'LOW', score: 50, niftyReturn5d: 0 };
  }

  private static calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    
    const ema = new Array(prices.length).fill(0);
    
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    const sma = sum / period;
    
    ema[period - 1] = sma;
    
    const k = 2 / (period + 1);
    for (let i = period; i < prices.length; i++) {
      ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
  }
}
