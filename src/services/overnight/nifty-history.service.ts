import { getISTDateString } from '@/lib/market-hours';
import { HistoricalProvider, OHLC } from '../backtest/historical.provider';

export class NiftyHistoryService {
  private static memoryCache = new Map<string, OHLC[]>();

  /**
   * Fetches NIFTY 50 (^NSEI) history for the given date range.
   * Utilizes a memory cache to avoid redundant hits to Redis/network in the same process.
   *
   * Cache keys use IST calendar dates (not UTC toISOString) so overnight IST sessions
   * do not shift the day key.
   */
  static async getNiftyHistory(startDate: Date, endDate: Date): Promise<OHLC[]> {
    const startStr = getISTDateString(startDate);
    const endStr = getISTDateString(endDate);
    const cacheKey = `${startStr}:${endStr}`;

    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    const history = await HistoricalProvider.getHistory('^NSEI', startDate, endDate);
    this.memoryCache.set(cacheKey, history);
    return history;
  }

  /**
   * Clears the in-memory cache. Useful for test suites.
   */
  static clearCache(): void {
    this.memoryCache.clear();
  }
}
