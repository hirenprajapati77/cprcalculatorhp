export interface HistoryCandle {
  high: number;
  low: number;
  close: number;
  open?: number;
}

/** Standard ATR lookback. Matches the "14-period ATR" comments already present at call sites
 *  (e.g. mtf-cpr.service.ts) — those comments described the intent but the implementation
 *  previously ignored `period` and averaged over the entire array passed in. */
export const DEFAULT_ATR_PERIOD = 14;

/**
 * Calculates Average True Range (ATR) over a trailing window of `period` candles.
 * Note: This computes a Simple Moving Average of the True Range, not Wilder's original exponential smoothing.
 * Uses the last `period + 1` candles in `history` (enough to derive `period` True Range values).
 * If `history` has fewer than `period + 1` candles, uses whatever is available (graceful degrade).
 * Defaults to 2% of current close if history has fewer than 2 candles.
 */
export function calculateATR(
  history: HistoryCandle[],
  currentClose: number,
  period: number = DEFAULT_ATR_PERIOD
): number {
  // Default to 2% of close if history is insufficient
  let atr = currentClose * 0.02;

  const window = history.slice(-(period + 1));
  const wlen = window.length;

  if (wlen >= 2) {
    let trueRangeSum = 0;
    for (let i = 1; i < wlen; i++) {
      const high = window[i].high;
      const low = window[i].low;
      const prevClose = window[i - 1].close;
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRangeSum += tr;
    }
    atr = trueRangeSum / (wlen - 1);
  }

  return atr;
}

/**
 * Convenience wrapper: returns ATR as a fraction of current close (e.g. 0.0174 = 1.74%).
 * Use this everywhere CPR width needs volatility-normalized classification, instead of
 * calling calculateATR() and dividing manually — keeps every call site in sync.
 */
export function getAtrPct(
  history: HistoryCandle[],
  currentClose: number,
  period: number = DEFAULT_ATR_PERIOD
): number {
  const atr = calculateATR(history, currentClose, period);
  return currentClose > 0 ? atr / currentClose : 0.02;
}
