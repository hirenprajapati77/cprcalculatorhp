export interface HistoryCandle {
  high: number;
  low: number;
  close: number;
  open?: number;
}

/**
 * Calculates Average True Range (ATR) over the provided history.
 * Note: This computes a Simple Moving Average of the True Range, not Wilder's original exponential smoothing.
 * Defaults to 2% of current close if history is insufficient (< 2 candles).
 */
export function calculateATR(history: HistoryCandle[], currentClose: number): number {
  const len = history.length;
  // Default to 2% of close if history is insufficient
  let atr = currentClose * 0.02;
  
  if (len >= 2) {
    let trueRangeSum = 0;
    for (let i = 1; i < len; i++) {
      const high = history[i].high;
      const low = history[i].low;
      const prevClose = history[i - 1].close;
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRangeSum += tr;
    }
    atr = trueRangeSum / (len - 1);
  }
  
  return atr;
}
