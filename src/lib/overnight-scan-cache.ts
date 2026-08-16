/**
 * Overnight GET cache — one BOTH-direction payload per IST day.
 * In-window polls must reuse this key so UI refresh does not re-run F&O discover.
 */
export function overnightScanCacheKey(todayIstKey: string): string {
  return `overnight_last_scan_${todayIstKey}`;
}

/**
 * Match GET /api/btst: bypass always discovers; otherwise serve cache if present.
 * Discover only when the window is open and there is no cache.
 */
export function shouldDiscoverOvernightScan(
  bypass: boolean,
  hasCache: boolean,
  windowOpen: boolean
): boolean {
  if (bypass) return true;
  if (hasCache) return false;
  return windowOpen;
}
