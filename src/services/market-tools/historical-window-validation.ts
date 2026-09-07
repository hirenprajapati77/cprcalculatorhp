export interface HistoricalCandleLike {
  date: string;
  close: number;
  prevClose: number;
}

export function hasConsecutiveTradingSessions(
  candles: HistoricalCandleLike[],
  expectedTradingDates: readonly string[],
  windowSize: number,
): boolean {
  if (!Number.isInteger(windowSize) || windowSize <= 0) return false;
  if (candles.length < windowSize || expectedTradingDates.length < windowSize) return false;

  const window = candles.slice(-windowSize);
  const expected = expectedTradingDates.slice(-windowSize);

  return window.every((candle, index) => candle.date === expected[index]);
}

export function isValidHistoricalOhlcvCandle(
  candle: HistoricalCandleLike,
): boolean {
  return (
    Number.isFinite(candle.close) &&
    candle.close > 0 &&
    Number.isFinite(candle.prevClose) &&
    candle.prevClose > 0 &&
    typeof candle.date === 'string' &&
    candle.date.length > 0
  );
}

export function isValidHistoricalWindow(
  candles: HistoricalCandleLike[],
  expectedTradingDates: readonly string[],
  windowSize: number,
): boolean {
  if (!hasConsecutiveTradingSessions(candles, expectedTradingDates, windowSize)) {
    return false;
  }

  return candles
    .slice(-windowSize)
    .every(isValidHistoricalOhlcvCandle);
}
