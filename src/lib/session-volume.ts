/**
 * Resolve the volume figure that best represents today's activity.
 * Prefers the aggregated intraday session volume when it exceeds the (possibly
 * frozen) daily-candle snapshot. Single source of truth for the overnight gate,
 * the BTST/STBT VDU rule, and VPA RVOL — see PR #301.
 */
export function resolveSessionVolume(
  stockVolume: number | null | undefined,
  intradayVolume: number | null | undefined,
  hasIntraday: boolean
): number {
  const sv = typeof stockVolume === 'number' && Number.isFinite(stockVolume) && stockVolume > 0
    ? stockVolume
    : 0;
  if (
    hasIntraday &&
    typeof intradayVolume === 'number' &&
    Number.isFinite(intradayVolume) &&
    intradayVolume > sv
  ) {
    return intradayVolume;
  }
  return sv;
}
