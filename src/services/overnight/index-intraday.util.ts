import {
  BTST_WINDOW_MINUTES,
  isInClosingLiquidityWindow,
  istMinuteOfDayFromUnixSec,
} from '@/lib/market-hours';

/** Yahoo v8 finance chart payload (5m intraday). */
export interface YahooFinanceChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketOpen?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
}

export interface IndexIntradayMetrics {
  vwap: number | null;
  hasIntraday: boolean;
  last15mHigh: number | null;
}

/**
 * Parse index VWAP + 15:15–15:30 IST last15mHigh from Yahoo 5m chart JSON.
 * Shared by live IndexDiscoverService and INDEX_BTST_DRIVEN backtest.
 */
export function parseIndexIntradayMetricsFromChart(
  chartJson: YahooFinanceChartResponse | null | undefined,
  asOfTime: Date
): IndexIntradayMetrics {
  const empty: IndexIntradayMetrics = { vwap: null, hasIntraday: false, last15mHigh: null };
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
      if (
        inClosingWindow &&
        (!isFormingBar || barOpenMin >= BTST_WINDOW_MINUTES.CLOSING_WINDOW_START)
      ) {
        closingHigh = Math.max(closingHigh, high);
        closingBarCount++;
      }
    }

    const last15mHigh = closingBarCount > 0 && closingHigh > 0 ? closingHigh : null;

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
        hasIntraday: count > 0,
        last15mHigh,
      };
    }

    return {
      vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
      hasIntraday,
      last15mHigh,
    };
  } catch {
    return empty;
  }
}

/** 15:25 IST discovery cutoff for a YYYY-MM-DD IST calendar date. */
export function indexBtstDiscoveryAsOfUtc(dateStr: string): Date {
  // 15:25 IST = 09:55 UTC
  return new Date(`${dateStr}T09:55:00.000Z`);
}
