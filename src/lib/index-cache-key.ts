/**
 * Index scan cache key — must include every query param that changes results.
 * Isolated from BTST scans.
 */
export function indexScanCacheKey(todayIstKey: string): string {
  return `index_last_scan_${todayIstKey}`;
}
