import {
  isInClosingLiquidityWindow,
  istMinuteOfDayFromUnixSec,
} from '@/lib/market-hours';
import type { YahooFinanceChartResponse } from './index-intraday.util';

export interface StockIntradayMetrics {
  vwap: number | null;
  intradayVolume: number | null;
  last15mHigh: number | null;
  last15mLow: number | null;
  hasIntraday: boolean;
}

/**
 * Parse stock VWAP, intraday volume, and 15:15–15:30 IST extremes from Yahoo 5m chart JSON.
 * Shared by live OvernightService and STOCK BTST backtest.
 */
export function parseStockIntradayMetricsFromChart(
  chartJson: YahooFinanceChartResponse | null | undefined,
  asOfTime: Date
): StockIntradayMetrics {
  const empty: StockIntradayMetrics = {
    vwap: null,
    intradayVolume: null,
    last15mHigh: null,
    last15mLow: null,
    hasIntraday: false,
  };
  if (!chartJson) return empty;

  try {
    const result = chartJson?.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const quotes = result?.indicators?.quote?.[0];
    if (!result || !timestamps || !quotes || !quotes.high || !quotes.low || !quotes.close) {
      return empty;
    }

    const currentTimestampSec = Math.floor(asOfTime.getTime() / 1000);
    let sumPriceVol = 0;
    let sumVol = 0;
    let hasIntraday = false;
    let closingHigh = 0;
    let closingLow = Infinity;
    let closingBarCount = 0;

    const lastTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
    const isLastCandleForming = currentTimestampSec - lastTimestamp < 300;

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      if (ts > currentTimestampSec) continue;

      const high = quotes.high[i];
      const low = quotes.low[i];
      const close = quotes.close[i];
      const volume = quotes.volume?.[i] || 0;
      if (high == null || low == null || close == null) continue;

      const typicalPrice = (high + low + close) / 3;
      sumPriceVol += typicalPrice * volume;
      sumVol += volume;
      hasIntraday = true;

      const barOpenMin = istMinuteOfDayFromUnixSec(ts);
      const inClosingWindow = isInClosingLiquidityWindow(barOpenMin);
      const isFormingBar = isLastCandleForming && ts === lastTimestamp;
      if (inClosingWindow && !isFormingBar) {
        closingHigh = Math.max(closingHigh, high);
        closingLow = Math.min(closingLow, low);
        closingBarCount++;
      }
    }

    const last15mHigh = closingBarCount > 0 && closingHigh > 0 ? closingHigh : null;
    const last15mLow = closingBarCount > 0 && closingLow !== Infinity ? closingLow : null;

    if (hasIntraday && sumVol === 0) {
      let sumClose = 0;
      let count = 0;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] > currentTimestampSec) continue;
        const close = quotes.close[i];
        if (close == null) continue;
        sumClose += close;
        count++;
      }
      return {
        vwap: count > 0 ? sumClose / count : null,
        intradayVolume: count > 0 ? count : null,
        last15mHigh,
        last15mLow,
        hasIntraday: count > 0,
      };
    }

    return {
      vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
      intradayVolume: sumVol > 0 ? sumVol : null,
      last15mHigh,
      last15mLow,
      hasIntraday,
    };
  } catch {
    return empty;
  }
}

/** Yahoo symbol for NSE equities in historical fetches. */
export function toYahooNseSymbol(symbol: string): string {
  if (symbol.startsWith('^')) return symbol;
  return symbol.endsWith('.NS') ? symbol : `${symbol}.NS`;
}
