export interface HistoricalCandleLike {
  date: string;
  close: number;
  prevClose: number;
}

export interface OhlcvGeometryInput {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | bigint | null;
  prevClose?: number | null;
}

/**
 * Validates the physical geometric integrity of an OHLCV candle.
 * Enforces:
 * - open, high, low, close must be finite and positive (> 0)
 * - high >= low
 * - high >= open && high >= close
 * - low <= open && low <= close
 * - volume (if supplied) must be finite and non-negative (>= 0)
 * - prevClose (if supplied) must be finite and positive (> 0)
 */
export function isValidOhlcvGeometry(candle: OhlcvGeometryInput): boolean {
  if (
    !Number.isFinite(candle.open) || candle.open <= 0 ||
    !Number.isFinite(candle.high) || candle.high <= 0 ||
    !Number.isFinite(candle.low) || candle.low <= 0 ||
    !Number.isFinite(candle.close) || candle.close <= 0
  ) {
    return false;
  }

  if (candle.high < candle.low) return false;
  if (candle.high < candle.open || candle.high < candle.close) return false;
  if (candle.low > candle.open || candle.low > candle.close) return false;

  if (candle.volume !== undefined && candle.volume !== null) {
    const vol = typeof candle.volume === 'bigint' ? Number(candle.volume) : candle.volume;
    if (!Number.isFinite(vol) || vol < 0) return false;
  }

  if (candle.prevClose !== undefined && candle.prevClose !== null) {
    if (!Number.isFinite(candle.prevClose) || candle.prevClose <= 0) return false;
  }

  return true;
}

export function matchesExpectedTradingSessions(
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

export function isValidHistoricalReturnCandle(
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
  if (!matchesExpectedTradingSessions(candles, expectedTradingDates, windowSize)) {
    return false;
  }

  return candles
    .slice(-windowSize)
    .every(isValidHistoricalReturnCandle);
}
