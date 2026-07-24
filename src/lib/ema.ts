/**
 * EMA (Exponential Moving Average) calculation utilities.
 *
 * Used for detecting EMA 9 / EMA 21 daily cross signals on stock history.
 * Cross detection uses the standard two-bar comparison:
 *   bullish cross = ema9[prev] <= ema21[prev] AND ema9[today] > ema21[today]
 *   bearish cross = ema9[prev] >= ema21[prev] AND ema9[today] < ema21[today]
 *
 * Note: These operate on DAILY closes (the `history` field on MarketStockData).
 * They are NOT computed on 15m intraday bars — see Phase 2 roadmap for that.
 */

export interface EmaCandle {
  close: number;
}

/**
 * Computes a full EMA series for `prices` using the standard formula:
 *   EMA[i] = price[i] * k + EMA[i-1] * (1 - k),  where k = 2 / (period + 1)
 *
 * Seeds the first EMA value as a simple average of the first `period` prices.
 * Returns an empty array if `prices.length < period`.
 */
export function calculateEMASeries(prices: number[], period: number): number[] {
  if (prices.length < period) return [];

  const ema: number[] = new Array(prices.length).fill(0);

  // Seed: SMA of first `period` closes
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  ema[period - 1] = sum / period;

  const k = 2 / (period + 1);
  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }

  // Return only the meaningful tail (from index period-1 onward)
  return ema.slice(period - 1);
}

/**
 * Computes the last two EMA values for a given period.
 * Returns null if history is insufficient.
 */
export function getLastTwoEMA(
  history: EmaCandle[],
  period: number
): { prev: number; current: number } | null {
  if (history.length < period + 1) return null; // need period+1 closes for 2 valid EMA values
  const closes = history.map((c) => c.close);
  const series = calculateEMASeries(closes, period);
  if (series.length < 2) return null;
  return {
    prev: series[series.length - 2],
    current: series[series.length - 1],
  };
}

export type EmaCrossResult = {
  ema9: number;
  ema21: number;
  /** 'BULLISH' = 9 just crossed above 21, 'BEARISH' = 9 just crossed below 21, 'NONE' = no cross */
  cross: 'BULLISH' | 'BEARISH' | 'NONE';
  /** True when ema9 > ema21 (bullish alignment, even without a fresh cross) */
  isBullishAlignment: boolean;
};

/**
 * Detects EMA 9/21 cross on the last two bars of daily history.
 *
 * Returns null if there is insufficient history (need at least 22 daily candles).
 *
 * Cross signals:
 *   BULLISH cross: ema9 crossed FROM below TO above ema21 on the latest bar
 *   BEARISH cross: ema9 crossed FROM above TO below ema21 on the latest bar
 *   NONE:          no cross occurred (may still be in alignment)
 */
export function detectEmaCross(history: EmaCandle[]): EmaCrossResult | null {
  const ema9Data  = getLastTwoEMA(history, 9);
  const ema21Data = getLastTwoEMA(history, 21);

  if (!ema9Data || !ema21Data) return null;

  const { prev: ema9Prev, current: ema9Now }   = ema9Data;
  const { prev: ema21Prev, current: ema21Now } = ema21Data;

  const bullishCross = ema9Prev <= ema21Prev && ema9Now > ema21Now;
  const bearishCross = ema9Prev >= ema21Prev && ema9Now < ema21Now;

  return {
    ema9: ema9Now,
    ema21: ema21Now,
    cross: bullishCross ? 'BULLISH' : bearishCross ? 'BEARISH' : 'NONE',
    isBullishAlignment: ema9Now > ema21Now,
  };
}
