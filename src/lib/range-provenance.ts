export type RangeProvenance = 'FYERS_QUOTE' | 'INTRADAY_TODAY_BAR' | 'STALE_PREV_DAY';

export interface RangeProvenanceInput {
  hasLiveQuotePrice?: boolean;
  isTodayBar?: boolean;
  hasAggregatedIntraday?: boolean;
}

export interface QuoteSessionFieldsInput {
  high_price?: unknown;
  low_price?: unknown;
  volume?: unknown;
}

export interface QuoteSessionFields {
  high: number | null;
  low: number | null;
  volume: number | null;
  hasLiveQuotePrice: boolean;
}

/**
 * Validates price is positive and finite.
 */
function isPositivePrice(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

/**
 * Validates volume is non-negative and finite (0 is valid for untraded session).
 */
function isValidSessionVolume(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

/**
 * Structurally extracts session range fields (high, low, volume) from a quote packet.
 * Guarantees that hasLiveQuotePrice is true ONLY when all 3 fields are valid live readings.
 */
export function quoteSessionFields(qv: QuoteSessionFieldsInput): QuoteSessionFields {
  const high = isPositivePrice(qv.high_price) ? qv.high_price : null;
  const low = isPositivePrice(qv.low_price) ? qv.low_price : null;
  const volume = isValidSessionVolume(qv.volume) ? qv.volume : null;

  return {
    high,
    low,
    volume,
    hasLiveQuotePrice: high !== null && low !== null && volume !== null,
  };
}

/**
 * Resolves the 3-state data provenance for high/low/volume.
 * - FYERS_QUOTE: Sourced from live quote packet (e.g. qv.high_price)
 * - INTRADAY_TODAY_BAR: Sourced from aggregated 15m bars or today-dated daily bar
 * - STALE_PREV_DAY: Sourced from yesterday's daily candle (untrustworthy for ORB)
 */
export function resolveRangeProvenance(input: RangeProvenanceInput): RangeProvenance {
  if (input.hasLiveQuotePrice === true) {
    return 'FYERS_QUOTE';
  }
  if (input.hasAggregatedIntraday === true || input.isTodayBar === true) {
    return 'INTRADAY_TODAY_BAR';
  }
  return 'STALE_PREV_DAY';
}
