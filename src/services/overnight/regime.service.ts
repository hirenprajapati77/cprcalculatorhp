import { calculateATR } from '@/lib/atr';
import { safeRatio } from '@/lib/math';
import { NiftyHistoryService } from './nifty-history.service';

// Requires 6 candles to compute a 5-day return.
export const RS_LOOKBACK = 5;

export interface MarketRegime {
  trend: 'BULL' | 'BEAR' | 'CHOPPY';
  volatility: 'HIGH' | 'LOW';
  score: number; // 0 to 100 representing trend strength
  niftyReturn5d?: number; // % return over last 5 trading candles, for RS calculations
  /**
   * false when Nifty history was missing/failed. Callers must fail closed
   * (suppress both BTST and STBT alerts) — do not treat as neutral CHOPPY.
   * undefined/true = reliable.
   */
  reliable?: boolean;
}

export class RegimeService {
  /** Multi-date memo — backtests walk many dates and the previous single-entry cache thrashed every call. */
  private static regimeByDate = new Map<string, MarketRegime>();
  private static readonly MAX_REGIME_CACHE = 30;

  /**
   * Fetches the broad market regime based on NIFTY 50 (^NSEI) history.
   * Caches the result per day to avoid redundant network/CPU work.
   */
  static async getMarketRegime(date: string): Promise<MarketRegime> {
    const cached = this.regimeByDate.get(date);
    if (cached) return cached;

    try {
      // Use ^NSEI for Nifty 50. End = exclusive next UTC day so Yahoo includes `date`'s bar.
      const [y, m, d] = date.split('-').map(Number);
      const endDateObj = new Date(Date.UTC(y, m - 1, d + 1));
      const startDateObj = new Date(Date.UTC(y, m - 1, d - 90));

      const history = await NiftyHistoryService.getNiftyHistory(startDateObj, endDateObj);
      
      if (!history || history.length < 21) {
        // Insufficient data — fail closed (not "CHOPPY = allow both sides")
        console.warn(`[RegimeService] Insufficient NIFTY history (${history?.length ?? 0}) for ${date} — unreliable`);
        return this.getUnreliableRegime();
      }

      const latest = history[history.length - 1];
      
      // Calculate 20 EMA
      const closePrices = history.map(h => h.close);
      const niftyReturn5d = closePrices.length > RS_LOOKBACK
        ? safeRatio(
            closePrices[closePrices.length - 1] - closePrices[closePrices.length - 1 - RS_LOOKBACK],
            closePrices[closePrices.length - 1 - RS_LOOKBACK],
            0
          ) * 100
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
      const atrPct = safeRatio(atr, latest.close, 0) * 100;
      // Nifty typically ranges 0.5% to 1.5% daily. > 1.2% is high volatility.
      const volatility: 'HIGH' | 'LOW' = atrPct > 1.2 ? 'HIGH' : 'LOW';

      const regime: MarketRegime = { trend, volatility, score, niftyReturn5d, reliable: true };

      this.regimeByDate.set(date, regime);
      if (this.regimeByDate.size > this.MAX_REGIME_CACHE) {
        const oldest = this.regimeByDate.keys().next().value;
        if (oldest) this.regimeByDate.delete(oldest);
      }

      console.log(`[RegimeService] NIFTY 50 Regime for ${date}: ${trend} / ${volatility} (ATR%: ${atrPct.toFixed(2)}%)`);
      return regime;
    } catch (error) {
      console.error(`[RegimeService] Error fetching NIFTY 50 regime:`, error);
      return this.getUnreliableRegime();
    }
  }

  /** Fail-closed placeholder — trend label is CHOPPY but reliable=false suppresses both alert sides. */
  private static getUnreliableRegime(): MarketRegime {
    return { trend: 'CHOPPY', volatility: 'LOW', score: 50, niftyReturn5d: 0, reliable: false };
  }

  static clearCache(): void {
    this.regimeByDate.clear();
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
