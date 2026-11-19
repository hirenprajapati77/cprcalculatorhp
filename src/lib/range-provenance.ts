export type RangeProvenance = 'FYERS_QUOTE' | 'INTRADAY_TODAY_BAR' | 'STALE_PREV_DAY';

export interface RangeProvenanceInput {
  hasLiveQuotePrice?: boolean;
  isTodayBar?: boolean;
  hasAggregatedIntraday?: boolean;
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
