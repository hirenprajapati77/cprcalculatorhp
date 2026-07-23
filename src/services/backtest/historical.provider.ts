import { env } from '@/config/env';
import { CacheService } from '../cache.service';
import { getISTTime } from '../../lib/market-hours';

export interface OHLC {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalMetadata {
  symbol: string;
  startDate: string;
  endDate: string;
  source: string;
}

export class HistoricalProvider {
  static getMode(): string {
    return env.HISTORICAL_MODE || 'mock'; // mock | cached | live
  }

  static async getHistory(symbol: string, startDate: Date, endDate: Date): Promise<OHLC[]> {
    const mode = this.getMode();
    let data: OHLC[] = [];

    try {
      if (mode === 'mock') {
        data = this.generateDeterministicMock(symbol, startDate, endDate);
      } else if (mode === 'cached') {
        data = await this.getCachedHistory(symbol, startDate, endDate);
      } else if (mode === 'live') {
        data = await this.getLiveHistory(symbol, startDate, endDate);
      } else {
        throw new Error(`Invalid provider mode: ${mode}`);
      }

      const validData = data.filter((candle, idx) => {
        if (!candle.date || candle.open === null || candle.high === null || candle.low === null || candle.close === null || candle.volume === null) {
          console.warn(`[HistoricalProvider] Validation failed for ${symbol} at index ${idx}: Missing date or OHLC values. Skipping candle.`);
          return false;
        }
        if (candle.open < 0 || candle.high < 0 || candle.low < 0 || candle.close < 0 || candle.volume < 0) {
          console.warn(`[HistoricalProvider] Validation failed for ${symbol} at ${candle.date}: Negative price or volume. Skipping candle.`);
          return false;
        }
        if (candle.high < candle.low || candle.close > candle.high || candle.close < candle.low) {
          console.warn(`[HistoricalProvider] Validation failed for ${symbol} at ${candle.date}: Invalid OHLC structure (High < Low, or Close outside High/Low). Skipping candle.`);
          return false;
        }
        return true;
      });

      this.validateOHLC(validData);
      return validData;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Unknown history error');
      console.error(`[HistoricalProvider] Failed to fetch history for ${symbol}:`, err.message);
      // Failure Rule: record error but throw so orchestrator can catch and isolate this symbol
      throw err;
    }
  }

  static async getOHLC(symbol: string, date: string): Promise<OHLC | null> {
    const d = new Date(date);
    const history = await this.getHistory(symbol, d, d);
    return history.length > 0 ? history[0] : null;
  }

  static async getVolume(symbol: string, date: string): Promise<number> {
    const ohlc = await this.getOHLC(symbol, date);
    return ohlc ? ohlc.volume : 0;
  }

  static async getMetadata(symbol: string, startDate: Date, endDate: Date): Promise<HistoricalMetadata> {
    return {
      symbol,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      source: this.getMode()
    };
  }

  /**
   * Historical 5m Yahoo chart for one IST session day (09:15–15:30).
   * Used by INDEX_BTST_DRIVEN backtest for VWAP + closing-window liquidity.
   */
  static async getIntraday5mChartForDate(
    yahooSymbol: string,
    dateStr: string
  ): Promise<unknown | null> {
    const mode = this.getMode();
    if (mode === 'mock') {
      return null;
    }

    const cacheKey = `history:5m:${yahooSymbol}:${dateStr}`;
    if (mode === 'cached') {
      const cached = await CacheService.get<unknown>(cacheKey);
      if (cached) return cached;
    }

    // 09:15 IST = 03:45 UTC; 15:30 IST = 10:00 UTC
    const period1 = Math.floor(new Date(`${dateStr}T03:45:00.000Z`).getTime() / 1000);
    const period2 = Math.floor(new Date(`${dateStr}T10:00:00.000Z`).getTime() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=5m`;

    let attempts = 0;
    while (attempts < 3) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`5m fetch HTTP ${response.status}`);
        const json = await response.json();
        const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0];
        if (!result) throw new Error('5m fetch returned empty data');
        if (mode === 'cached') {
          await CacheService.set(cacheKey, json, 86400 * 7);
        }
        return json;
      } catch (err) {
        attempts++;
        if (attempts >= 3) {
          console.warn(
            `[HistoricalProvider] 5m fetch failed for ${yahooSymbol} ${dateStr}:`,
            err instanceof Error ? err.message : err
          );
          return null;
        }
        await new Promise((r) => setTimeout(r, 500 * attempts));
      }
    }
    return null;
  }

  private static validateOHLC(data: OHLC[]) {
    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      if (!candle.date) throw new Error('Validation failed: Missing date');
      if (candle.open < 0 || candle.high < 0 || candle.low < 0 || candle.close < 0) {
        throw new Error(`Validation failed: Negative prices at ${candle.date}`);
      }
      if (candle.high < candle.low || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) {
         throw new Error(`Validation failed: Invalid OHLC structure at ${candle.date}`);
      }
      // Check gaps
      if (i > 0) {
        const prev = new Date(data[i-1].date);
        const curr = new Date(candle.date);
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24));
        // Over 4 days gap implies missing data even over long weekends
        if (diffDays > 5) {
          throw new Error(`Validation failed: Unacceptable gap between ${data[i-1].date} and ${candle.date}`);
        }
      }
    }
  }

  private static async getCachedHistory(symbol: string, startDate: Date, endDate: Date): Promise<OHLC[]> {
    const cacheKey = `history:${symbol}:${startDate.toISOString().split('T')[0]}:${endDate.toISOString().split('T')[0]}`;
    const cached = await CacheService.get<OHLC[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Fallback to live if cache misses
    const liveData = await this.getLiveHistory(symbol, startDate, endDate);
    // Cache for 24h (86400 seconds)
    await CacheService.set(cacheKey, liveData, 86400);
    return liveData;
  }

  private static async getLiveHistory(symbol: string, startDate: Date, endDate: Date): Promise<OHLC[]> {
    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);
    const yahooSymbol = symbol.startsWith('^') ? symbol : `${symbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${period1}&period2=${period2}&interval=1d`;

    // Retry and Timeout mechanism
    let attempts = 0;
    while (attempts < 3) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`Live fetch HTTP ${response.status}`);
        
        const json: unknown = await response.json();
        const result = (json as { chart?: { result?: { timestamp?: number[], indicators?: { quote?: { open: number[], high: number[], low: number[], close: number[], volume: number[] }[] } }[] } })?.chart?.result?.[0];
        if (!result || !result.timestamp) throw new Error('Live fetch returned empty data');

        const timestamps = result.timestamp;
        const quotes = result.indicators?.quote?.[0];
        if (!quotes) throw new Error('Live fetch returned empty data');

        const ohlc: OHLC[] = [];
        const { dateString: todayIST } = getISTTime();

        for (let i = 0; i < timestamps.length; i++) {
          if (quotes.open[i] !== null) {
            // Yahoo returns dates anchored to 00:00 UTC or 03:45 UTC.
            // Using getISTTime ensures we safely map any timestamp into its correct local trading day,
            // avoiding silent breakage if Yahoo ever changes its anchor time or timezone.
            const candleDate = getISTTime(new Date(timestamps[i] * 1000)).dateString;
            
            // Exclude live/in-progress bars. Confirmed via check_yahoo_partial_bar.ts on 2026-07-13:
            // Yahoo's v8 chart interval=1d endpoint returns a bar for the current session whose close/volume 
            // actively update intraday, tracking meta.regularMarketPrice — it is NOT a finalized candle.
            if (candleDate === todayIST) {
              continue;
            }

            ohlc.push({
              date: candleDate,
              open: quotes.open[i],
              high: quotes.high[i],
              low: quotes.low[i],
              close: quotes.close[i],
              volume: quotes.volume[i] || 0
            });
          }
        }
        return ohlc;
      } catch (err) {
        attempts++;
        if (attempts >= 3) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempts)); // exponential backoff
      }
    }
    return [];
  }

  private static generateDeterministicMock(symbol: string, start: Date, end: Date): OHLC[] {
    const data: OHLC[] = [];
    
    // Deterministic seed based on symbol string
    let seed = 0;
    for(let i=0; i<symbol.length; i++) seed += symbol.charCodeAt(i);
    
    const seededRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const current = new Date(start);
    let price = 100 + (seededRandom() * 900); // Base price 100-1000
    
    while (current <= end) {
      if (current.getDay() !== 0 && current.getDay() !== 6) { // Skip weekends
        const change = (seededRandom() - 0.5) * (price * 0.05); // Max 5% daily move
        const open = price + change;
        const high = open * (1 + (seededRandom() * 0.02));
        const low = open * (1 - (seededRandom() * 0.02));
        const close = low + ((high - low) * seededRandom());
        
        data.push({
          date: current.toISOString().split('T')[0],
          open, high, low, close,
          volume: Math.floor(seededRandom() * 1000000)
        });
        price = close;
      }
      current.setDate(current.getDate() + 1);
    }
    return data;
  }
}
