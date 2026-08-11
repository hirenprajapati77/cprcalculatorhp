import { CacheService, autoScanResultCacheKey } from '@/services/cache.service';

export type WarmScanCachePayload = {
  data: unknown[];
  timestamp?: string;
  source: 'auto_scan' | 'list';
};

/** Read the warmest scanner cache row without triggering a full scan. */
export async function loadWarmScanCache(
  universe: string,
  market: string
): Promise<WarmScanCachePayload | null> {
  const autoKey = autoScanResultCacheKey(universe, market);
  const autoCached = await CacheService.get<{ data: unknown[]; timestamp?: string }>(autoKey);
  if (autoCached && typeof autoCached === 'object' && Array.isArray(autoCached.data)) {
    return { data: autoCached.data, ...(autoCached.timestamp && { timestamp: autoCached.timestamp }), source: 'auto_scan' };
  }

  const listCached = await CacheService.get<unknown[]>(`list:${universe}:${market}`);
  if (Array.isArray(listCached) && listCached.length > 0) {
    return { data: listCached, source: 'list' };
  }

  return null;
}
