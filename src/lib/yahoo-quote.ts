/**
 * Yahoo Finance chart quote arrays must be length-aligned with timestamps
 * before indexing. Misaligned payloads (truncated volume, missing closes, etc.)
 * otherwise silently pair the wrong OHLC/volume bars.
 */

export interface YahooQuoteArrays {
  open?: Array<number | null | undefined>;
  high?: Array<number | null | undefined>;
  low?: Array<number | null | undefined>;
  close?: Array<number | null | undefined>;
  volume?: Array<number | null | undefined>;
}

/**
 * Returns the largest indexable length shared by timestamps and every
 * provided (non-undefined) quote series. Returns 0 if a required series
 * is missing or empty.
 */
export function alignedYahooSeriesLength(
  timestamps: number[] | undefined,
  quotes: YahooQuoteArrays | null | undefined,
  required: Array<keyof YahooQuoteArrays> = ['high', 'low', 'close']
): number {
  if (!timestamps?.length || !quotes) return 0;

  const expectedLen = timestamps.length;
  for (const key of required) {
    const series = quotes[key];
    if (!series || series.length !== expectedLen) {
      return 0;
    }
  }

  for (const key of ['open', 'high', 'low', 'close', 'volume'] as const) {
    if (required.includes(key)) continue;
    const series = quotes[key];
    if (series && series.length !== expectedLen) {
      return 0;
    }
  }

  return expectedLen;
}
