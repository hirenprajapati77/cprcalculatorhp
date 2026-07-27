/**
 * BTST GET discover gate (outside enrichment).
 * - Outside window, no bypass → never discover (cache/empty handled by caller)
 * - Bypass with cache → serve cache (caller returns early)
 * - Window open OR bypass without cache → fresh discover
 */
export function shouldFreshDiscoverBtst(opts: {
  executionWindowOpen: boolean;
  bypassQuery: boolean;
  hasCache: boolean;
}): boolean {
  const { executionWindowOpen, bypassQuery, hasCache } = opts;
  if (!executionWindowOpen && !bypassQuery) return false;
  if (bypassQuery && hasCache) return false;
  return true;
}
