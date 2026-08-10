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
    // Include forming closing-window bar — Rule 5 must be live from ~15:15 IST.
    if (inClosingWindow) {
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

export type Fyers15mCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * Session VWAP + last 15m OHLC from Fyers 15-minute history candles.
 * Used by MarketService Fyers primary so candle15m / VWAP match Yahoo fallback parity.
 */
export function parseFyers15mVwapAndCandle(
  candles: FyersHistoryCandle[] | null | undefined,
  asOfTime: Date = new Date()
): { vwap: number | null; candle15m: Fyers15mCandle | null } {
  if (!candles || candles.length === 0) {
    return { vwap: null, candle15m: null };
  }

  const currentTimestampSec = Math.floor(asOfTime.getTime() / 1000);
  let sumPriceVol = 0;
  let sumVol = 0;
  let lastValid: Fyers15mCandle | null = null;

  for (const row of candles) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [ts, open, high, low, close, volume] = row;
    if (typeof ts !== 'number' || ts > currentTimestampSec) continue;
    if (![open, high, low, close].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
      continue;
    }

    const vol = typeof volume === 'number' && Number.isFinite(volume) && volume > 0 ? volume : 0;
    const typical = (high + low + close) / 3;
    sumPriceVol += typical * vol;
    sumVol += vol;

    lastValid = {
      open,
      high,
      low,
      close,
      volume: typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 ? volume : 0,
    };
  }

  let vwap: number | null = sumVol > 0 ? sumPriceVol / sumVol : null;
  if (vwap == null && lastValid) {
    // Zero-volume session: unweighted close average of valid bars
    let sumClose = 0;
    let count = 0;
    for (const row of candles) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [ts, , , , close] = row;
      if (typeof ts !== 'number' || ts > currentTimestampSec) continue;
      if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
      sumClose += close;
      count++;
    }
    vwap = count > 0 ? sumClose / count : null;
  }

  return { vwap, candle15m: lastValid };
}
