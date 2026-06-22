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
      console.log(`[EligibilityGate] ${stock?.symbol || 'UNKNOWN'} rejected: Insufficient market data`);
      return { eligible: false, reason: 'Insufficient market data' };
    }

    const volume = stock.volume || 0;
    const avgVolume = stock.avgVolume || 0;
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    if (avgVolume < 100000) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: avgVolume ${avgVolume} < 100000`);
      return { eligible: false, reason: `avgVolume ${avgVolume} < 100000` };
    }

    if (volume < 100000) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: volume ${volume} < 100000`);
      return { eligible: false, reason: `volume ${volume} < 100000` };
    }

    if (volumeRatio < 1.2) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: volumeRatio ${volumeRatio.toFixed(2)} < 1.2`);
      return { eligible: false, reason: `volumeRatio ${volumeRatio.toFixed(2)} < 1.2` };
    }

    const intraVol = intradayVolume || 0;
    if (intraVol < 5000) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: intradayVolume ${intraVol} < 5000`);
      return { eligible: false, reason: `intradayVolume ${intraVol} < 5000` };
    }

    return { eligible: true, reason: null };
  }
}
