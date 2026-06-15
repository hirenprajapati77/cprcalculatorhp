import { MarketStockData } from '../market.service';

export interface ExclusionCheckResult {
  eligible: boolean;
  reason?: string;
}

export class EntryManagerService {
  /**
   * Validates if a stock is eligible for a BTST signal based on the universe filters and reject rules.
   */
  static evaluateEligibility(
    stock: MarketStockData,
    tomorrowCpr: { tc: number; bc: number; width: number; classification: string },
    todayCpr: { tc: number; bc: number },
    vwap: number | null | undefined,
    intradayVolume: number | null | undefined,
    hasIntraday: boolean
  ): ExclusionCheckResult {
    const seed = stock.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // --- UNIVERSE FILTERS ---
    // 1. Price > 100
    if (stock.ltp <= 100) {
      return { eligible: false, reason: 'Price <= 100' };
    }

    // 2. Market Cap > 5000 Cr
    if (stock.marketCap <= 5000) {
      return { eligible: false, reason: 'Market Cap <= 5000 Cr' };
    }

    // 3. Volume > 20D Avg (Weak volume check)
    if (stock.volume <= stock.avgVolume) {
      return { eligible: false, reason: 'Volume <= 20D Average (Weak volume)' };
    }

    // --- REJECTION RULES ---
    // 4. Missing Intraday Data (VWAP, Intraday Volume, or general)
    if (!hasIntraday || vwap === null || vwap === undefined || intradayVolume === null || intradayVolume === undefined) {
      return { eligible: false, reason: 'Missing intraday data' };
    }

    // 5. Price > VWAP + 2% (Avoid late extended entries)
    if (stock.ltp > vwap * 1.02) {
      return { eligible: false, reason: 'Price extended > VWAP + 2%' };
    }

    // 6. Close inside today's or tomorrow's CPR
    const todayMinCpr = Math.min(todayCpr.tc, todayCpr.bc);
    const todayMaxCpr = Math.max(todayCpr.tc, todayCpr.bc);
    const tomorrowMinCpr = Math.min(tomorrowCpr.tc, tomorrowCpr.bc);
    const tomorrowMaxCpr = Math.max(tomorrowCpr.tc, tomorrowCpr.bc);

    if (stock.close >= todayMinCpr && stock.close <= todayMaxCpr) {
      return { eligible: false, reason: 'Close inside today\'s CPR' };
    }
    if (stock.close >= tomorrowMinCpr && stock.close <= tomorrowMaxCpr) {
      return { eligible: false, reason: 'Close inside tomorrow\'s CPR' };
    }

    // 7. Wide CPR Tomorrow (Tomorrow Width >= 1.5% is generally considered wide/bad for BTST)
    if (tomorrowCpr.width >= 1.5) {
      return { eligible: false, reason: 'Tomorrow\'s CPR is wide (>= 1.5%)' };
    }

    // 8. Gap today > 3%
    const prevDay = stock.history && stock.history.length >= 1 ? stock.history[stock.history.length - 1] : null;
    if (prevDay) {
      const dailyGap = Math.abs((stock.open - prevDay.close) / prevDay.close) * 100;
      if (dailyGap > 3) {
        return { eligible: false, reason: 'Daily opening gap > 3%' };
      }
    }

    // 9. corporate earnings/result tomorrow (Deterministic simulation: e.g. seed % 19 === 0)
    if (seed % 19 === 0) {
      return { eligible: false, reason: 'Upcoming corporate results tomorrow' };
    }

    // 10. near Circuit Limit (Deterministic simulation: e.g. seed % 23 === 0)
    if (seed % 23 === 0) {
      return { eligible: false, reason: 'Stock trading near circuit limit' };
    }

    // 11. Large bid-ask spread / Illiquid (Deterministic simulation: e.g. seed % 29 === 0)
    if (seed % 29 === 0) {
      return { eligible: false, reason: 'Large bid-ask spread or illiquid' };
    }

    // 12. Open Interest (OI) collapse (Deterministic simulation: e.g. seed % 31 === 0)
    if (seed % 31 === 0) {
      return { eligible: false, reason: 'F&O Open Interest collapse' };
    }

    return { eligible: true };
  }
}
