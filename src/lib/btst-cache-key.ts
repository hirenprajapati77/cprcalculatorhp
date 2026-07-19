/**
 * BTST scan cache key — must include every query param that changes results.
 * Date alone caused NIFTY50 / FNO / ALL to share one frozen payload outside the window.
 */
export function btstScanCacheKey(todayIstKey: string, universe: string): string {
  const u = (universe || 'NIFTY50').trim() || 'NIFTY50';
  return `btst_last_scan_${todayIstKey}_${u}`;
}
