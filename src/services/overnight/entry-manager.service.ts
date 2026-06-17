import { MarketStockData } from '../market.service';

export interface ExclusionCheckResult {
  eligible: boolean;
  reason?: string | null;
}

export class EntryManagerService {
  /**
   * Validates if a stock is eligible for a BTST signal based on the universe filters and reject rules.
   */
  static evaluateEligibility(
    direction: 'LONG' | 'SHORT',
    stock: MarketStockData,
    tomorrowCpr: { tc: number; bc: number; width: number; classification: string },
    todayCpr: { tc: number; bc: number },
    vwap: number | null | undefined,
    intradayVolume: number | null | undefined,
    hasIntraday: boolean
  ): ExclusionCheckResult {
    if (!hasIntraday) {
      return { eligible: false, reason: 'No intraday data' };
    }

    if (!stock || !stock.high || !stock.low) {
      return { eligible: false, reason: 'Insufficient market data' };
    }

    return { eligible: true, reason: null };
  }
}
