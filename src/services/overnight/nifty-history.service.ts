import { HistoricalProvider, OHLC } from '../backtest/historical.provider';

export class NiftyHistoryService {
  private static memoryCache = new Map<string, OHLC[]>();

  /**
   * Fetches NIFTY 50 (^NSEI) history for the given date range.
   * Utilizes a memory cache to avoid redundant hits to Redis/network in the same process.
   */
  static async getNiftyHistory(startDate: Date, endDate: Date): Promise<OHLC[]> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
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
