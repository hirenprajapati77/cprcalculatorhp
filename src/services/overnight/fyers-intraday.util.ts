import {
  isInClosingLiquidityWindow,
  istMinuteOfDayFromUnixSec,
} from '@/lib/market-hours';
import type { StockIntradayMetrics } from './stock-intraday.util';

/** Fyers history candle: [epochSec, open, high, low, close, volume] */
export type FyersHistoryCandle = [number, number, number, number, number, number];

/**
 * Parse stock VWAP / closing-liquidity extremes from Fyers 5m history candles.
 * Same IST closing window rules as the Yahoo chart parser.
 */
export function parseStockIntradayMetricsFromFyersCandles(
  candles: FyersHistoryCandle[] | null | undefined,
  asOfTime: Date
): StockIntradayMetrics {
  const empty: StockIntradayMetrics = {
    vwap: null,
    intradayVolume: null,
    last15mHigh: null,
    last15mLow: null,
    hasIntraday: false,
  };
  if (!candles || candles.length === 0) return empty;

  const currentTimestampSec = Math.floor(asOfTime.getTime() / 1000);
  let sumPriceVol = 0;
  let sumVol = 0;
  let hasIntraday = false;
  let closingHigh = 0;
  let closingLow = Infinity;
  let closingBarCount = 0;

  const lastTs = candles[candles.length - 1]?.[0] ?? 0;
  const isLastCandleForming = currentTimestampSec - lastTs < 300;

  for (const row of candles) {
    const [ts, , high, low, close, volume] = row;
    if (ts > currentTimestampSec) continue;
    if (![high, low, close].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;

    const vol = typeof volume === 'number' && Number.isFinite(volume) ? volume : 0;
    const typicalPrice = (high + low + close) / 3;
    sumPriceVol += typicalPrice * vol;
    sumVol += vol;
    hasIntraday = true;

    const barOpenMin = istMinuteOfDayFromUnixSec(ts);
    const inClosingWindow = isInClosingLiquidityWindow(barOpenMin);
    const isFormingBar = isLastCandleForming && ts === lastTs;
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
    for (const row of candles) {
      const [ts, , , , close] = row;
      if (ts > currentTimestampSec) continue;
      if (typeof close !== 'number' || !Number.isFinite(close)) continue;
      sumClose += close;
      count++;
    }
    return {
      vwap: count > 0 ? sumClose / count : null,
      intradayVolume: 0,
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
}
