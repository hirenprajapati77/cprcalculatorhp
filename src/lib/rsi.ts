/**
 * RSI (Relative Strength Index) — Wilder's smoothed method.
 *
 * Returns a value in [0, 100].
 * Requires at least `period + 1` candles; returns 50 (neutral) when data is insufficient.
 *
 * Period 14 is standard. Matches most charting platforms including TradingView.
 */

export const DEFAULT_RSI_PERIOD = 14;

export interface RsiCandle {
  close: number;
}

/**
 * Calculates RSI using Wilder's smoothing (EMA-based, not SMA).
 * Steps:
 *  1. Compute per-bar gains/losses from close-to-close changes.
 *  2. Seed the first average gain/loss as a simple average over `period` bars.
 *  3. Apply Wilder's smoothing: avgGain = (prevAvgGain * (period-1) + currentGain) / period.
 *  4. RSI = 100 - (100 / (1 + RS)), where RS = avgGain / avgLoss.
 */
export function calculateRSI(
  history: RsiCandle[],
  period: number = DEFAULT_RSI_PERIOD
): number {
  if (history.length < period + 1) return 50; // neutral fallback

  const closes = history.map((c) => c.close);

  // 1. Gains and losses
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Need at least `period` change values
  if (changes.length < period) return 50;

  // 2. Seed: simple average of first `period` gains/losses
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // 3. Wilder's smoothing over the remaining changes
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  // 4. RSI
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Classifies RSI into a label the scanner can use as a signal tag.
 *
 *  RSI_OVERSOLD    : < 30  — potential reversal zone, bullish cross here = strong
 *  RSI_BULLISH     : 30–50 — recovering momentum, fine entry zone
 *  RSI_NEUTRAL     : 50    — midpoint, directional bias not yet confirmed
 *  RSI_STRONG      : 50–70 — healthy trend momentum, ideal for continuation
 *  RSI_OVERBOUGHT  : > 70  — stretched, avoid fresh bullish entries
 */
export function classifyRSI(rsi: number): 'RSI_OVERSOLD' | 'RSI_BULLISH' | 'RSI_NEUTRAL' | 'RSI_STRONG' | 'RSI_OVERBOUGHT' {
  if (rsi < 30)  return 'RSI_OVERSOLD';
  if (rsi < 50)  return 'RSI_BULLISH';
  if (rsi === 50) return 'RSI_NEUTRAL';
  if (rsi < 70)  return 'RSI_STRONG';
  return 'RSI_OVERBOUGHT';
}
